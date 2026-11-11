import express from "express";
import { randomUUID } from "node:crypto";
import helmet from "helmet";
import path from "node:path";
import { toNodeHandler } from "better-auth/node";
import { migrate, closeDb, embedded, dataDirectory } from "./db.js";
import { readFile, unlink } from "node:fs/promises";
import { config } from "./config.js";
import { auth } from "./auth.js";
import { router } from "./routes.js";
import { mercadoPagoWebhook } from "./billing.js";
import { HttpError } from "./service.js";
import { ZodError } from "zod";
await migrate();
const app = express();
app.disable("x-powered-by");
if (process.env.TRUSTED_PROXIES)
  app.set(
    "trust proxy",
    process.env.TRUSTED_PROXIES.split(",").map((v) => v.trim()),
  );
app.use((req, _res, next) => {
  req.headers["x-impulsa-client-ip"] =
    req.ip ?? req.socket.remoteAddress ?? "unknown";
  next();
});
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          ...(!config.production ? ["'unsafe-inline'"] : []),
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com"],
        connectSrc: [
          "'self'",
          ...(!config.production
            ? ["ws://localhost:*", "ws://127.0.0.1:*"]
            : []),
        ],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.production ? [] : null,
      },
    },
    strictTransportSecurity: config.production,
  }),
);
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.post(
  "/api/billing/webhook",
  express.json({ limit: "64kb" }),
  (req, res, next) => {
    void mercadoPagoWebhook(req, res).catch(next);
  },
);
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json({ limit: "3mb" }));
app.use(
  "/api",
  (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin !== config.url)
        return res.status(403).json({ error: "Origem não autorizada" });
    }
    next();
  },
  router,
);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Recurso não encontrado" }),
);
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof ZodError)
      return res.status(400).json({
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        fieldErrors: Object.fromEntries(
          err.issues.map((i) => [i.path.join("."), i.message]),
        ),
      });
    if (err instanceof HttpError)
      return res
        .status(err.status)
        .json({ error: err.message, fieldErrors: err.fieldErrors });
    if (err.code === "LIMIT_FILE_SIZE")
      return res.status(400).json({ error: "O limite por arquivo é 5 MB" });
    if (err.type === "entity.too.large")
      return res.status(413).json({
        error: "Solicitação grande demais. Divida o arquivo em lotes menores.",
      });
    if (err.type === "entity.parse.failed")
      return res
        .status(400)
        .json({ error: "Conteúdo da solicitação inválido." });
    if (err.code === "23505")
      return res.status(409).json({
        error:
          "Registro ou código já em uso. Atualize a tela e revise a duplicidade.",
        ...(err.constraint === "records_company_sku_active"
          ? { fieldErrors: { sku: "SKU já utilizado nesta empresa." } }
          : {}),
      });
    if (err.statusCode >= 400 && err.statusCode < 500)
      return res.status(err.statusCode).json({
        error:
          err.statusCode === 429
            ? "Muitas tentativas. Aguarde antes de repetir."
            : "Não foi possível validar seu acesso. Confira sua senha e tente novamente.",
      });
    const reference = randomUUID();
    console.error("request_error", { reference, code: err.code ?? err.name });
    res.status(500).json({
      error:
        "Não foi possível concluir. Tente novamente ou registre a referência " +
        reference +
        " no suporte.",
    });
  },
);
app.use("/catalogo-publico", (_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});
let devServer: { close: () => Promise<void> } | null = null;
if (!config.production && process.env.SERVE_BUILD !== "true") {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
  devServer = vite;
} else {
  app.use(express.static(path.resolve("dist"), { index: false }));
  app.get("*splat", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve("dist/index.html"));
  });
}
const listener = app.listen(config.port, process.env.HOST ?? "127.0.0.1", () =>
  console.log(`Impulsa em ${config.url}`),
);
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(stopPoll);
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  await devServer?.close();
  await closeDb();
  console.log("Impulsa encerrado; banco fechado corretamente.");
  process.exit(0);
}
const stopPoll = setInterval(() => {
  if (!embedded || shuttingDown) return;
  void readFile(path.join(dataDirectory, ".impulsa-stop"), "utf8")
    .then(async (pid) => {
      if (Number(pid) !== process.pid) return;
      await unlink(path.join(dataDirectory, ".impulsa-stop"));
      await shutdown();
    })
    .catch(() => {});
}, 500);
stopPoll.unref();
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
listener.once("error", async (error: any) => {
  console.error("Falha ao abrir servidor", { code: error.code });
  clearInterval(stopPoll);
  await devServer?.close();
  await closeDb();
  process.exit(1);
});
