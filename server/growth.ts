import { authorize } from "./operation-service.js";
import { Router } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { randomUUID } from "node:crypto";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { auth } from "./auth.js";
import {
  tenant,
  subscriptionActive,
  assert,
  rate,
  audit,
  HttpError,
  type Context,
} from "./service.js";
import { transaction } from "./db.js";
import { config } from "./config.js";
import {
  instagramSchema,
  postSchema,
  metricSchema,
  promptSchema,
  designSchema,
  thirtyDays,
} from "../shared/growth.js";
export async function premium(c: Context) {
  const grant = (
    await c.tx.query(
      "SELECT expires_at FROM company_entitlements WHERE company_id=$1 AND expires_at>now()",
      [c.companyId],
    )
  ).rows[0];
  return {
    active:
      (c.company.plan === "completo" && subscriptionActive(c.company)) ||
      !!grant,
    source: grant
      ? "administrator"
      : c.company.plan === "completo" && subscriptionActive(c.company)
        ? "subscription"
        : null,
    expiresAt: grant?.expires_at ?? null,
  };
}
export async function requirePremium(c: Context) {
  assert(
    (await premium(c)).active,
    "Este recurso exige assinatura Premium ativa ou concessão administrativa válida.",
    403,
  );
}
const schemas = {
  instagram: instagramSchema,
  post: postSchema,
  metric: metricSchema,
  prompt: promptSchema,
  design: designSchema,
};
const kindSchema = z.enum(["instagram", "post", "metric", "prompt", "design"]);
export async function saveGrowth(
  c: Context,
  kind: keyof typeof schemas,
  input: unknown,
  id?: string,
  version?: number,
) {
  await requirePremium(c);
  const data = schemas[kind].parse(input);
  await rate(c.tx, "growth-write:" + c.companyId, 120, 3600);
  if (kind === "prompt" && "status" in data) {
    if (!id)
      assert(
        data.status === "prepared",
        "Um prompt novo começa como preparado",
      );
    else {
      const current = (
        await c.tx.query(
          "SELECT data FROM growth_documents WHERE id=$1 AND company_id=$2 AND kind=$3",
          [id, c.companyId, kind],
        )
      ).rows[0];
      assert(current, "Prompt não encontrado", 404);
      assert(
        data.status !== "imported" || current.data.status === "imported",
        "Importe um arquivo para registrar a arte.",
      );
    }
  }
  if (id) {
    assert(
      (
        await c.tx.query(
          "UPDATE growth_documents SET data=$3,version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2 AND kind=$4 AND version=$5 RETURNING id",
          [c.companyId, id, JSON.stringify(data), kind, version],
        )
      ).rows.length,
      "Documento não encontrado ou alterado em outra aba. Reabra a versão atual.",
      409,
    );
  } else {
    const count = (
      await c.tx.query(
        "SELECT count(*) AS n FROM growth_documents WHERE company_id=$1",
        [c.companyId],
      )
    ).rows[0];
    assert(
      Number(count.n) < 1500,
      "Limite de 1.500 documentos do programa atingido",
    );
    id = randomUUID();
    await c.tx.query(
      "INSERT INTO growth_documents(id,company_id,kind,data) VALUES($1,$2,$3,$4)",
      [id, c.companyId, kind, JSON.stringify(data)],
    );
  }
  await audit(c, "growth." + kind + ".save", id);
  return { id, version: version ? version + 1 : 1, data };
}
export const growthRouter = Router({ mergeParams: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5, fieldSize: 20000 },
}).single("photo");
async function access(
  req: any,
  permission: string,
  fn: (c: Context) => Promise<any>,
  write = false,
) {
  const s = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  assert(s, "Entre na sua conta", 401);
  return tenant(
    s.user,
    String(req.params.company),
    permission,
    (c) => {
      authorize(c, "growth", write);
      return fn(c);
    },
    write,
    false,
    true,
  );
}
const endpoint =
  (f: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) => {
    void f(req, res)
      .then((v) => {
        if (!res.headersSent) res.json(v);
      })
      .catch(next);
  };
growthRouter.get(
  "/status",
  endpoint((req) => access(req, "read", premium)),
);
growthRouter.get(
  "/",
  endpoint((req) =>
    access(req, "read", async (c) => {
      await requirePremium(c);
      return {
        documents: (
          await c.tx.query(
            "SELECT id,kind,data,version,updated_at FROM growth_documents WHERE company_id=$1 ORDER BY created_at",
            [c.companyId],
          )
        ).rows,
        files: (
          await c.tx.query(
            "SELECT id,document_id,name,mime FROM growth_files WHERE company_id=$1 ORDER BY created_at DESC",
            [c.companyId],
          )
        ).rows,
      };
    }),
  ),
);
growthRouter.post(
  "/documents/:kind",
  endpoint((req) =>
    access(
      req,
      "write",
      (c) => saveGrowth(c, kindSchema.parse(req.params.kind), req.body.data),
      true,
    ),
  ),
);
growthRouter.put(
  "/documents/:kind/:id",
  endpoint((req) =>
    access(
      req,
      "write",
      (c) =>
        saveGrowth(
          c,
          kindSchema.parse(req.params.kind),
          req.body.data,
          z.string().max(100).parse(req.params.id),
          z.number().int().positive().parse(req.body.version),
        ),
      true,
    ),
  ),
);
growthRouter.delete(
  "/documents/:id",
  endpoint((req) =>
    access(
      req,
      "write",
      async (c) => {
        await requirePremium(c);
        await c.tx.query(
          "DELETE FROM growth_files WHERE company_id=$1 AND document_id=$2",
          [c.companyId, req.params.id],
        );
        assert(
          (
            await c.tx.query(
              "DELETE FROM growth_documents WHERE company_id=$1 AND id=$2 RETURNING id",
              [c.companyId, req.params.id],
            )
          ).rows.length,
          "Documento não encontrado",
          404,
        );
        await audit(c, "growth.delete", req.params.id);
        return { ok: true };
      },
      true,
    ),
  ),
);
growthRouter.post(
  "/plan",
  endpoint((req) =>
    access(
      req,
      "write",
      async (c) => {
        await requirePremium(c);
        assert(
          !(
            await c.tx.query(
              "SELECT 1 FROM growth_documents WHERE company_id=$1 AND kind='post'",
              [c.companyId],
            )
          ).rows.length,
          "Você já tem um plano. Edite os dias existentes para preservar seu trabalho.",
          409,
        );
        const program = (
          await c.tx.query(
            "SELECT data FROM growth_documents WHERE company_id=$1 AND kind='instagram' ORDER BY created_at DESC LIMIT 1",
            [c.companyId],
          )
        ).rows[0];
        assert(program, "Salve o perfil do Instagram primeiro");
        for (const post of thirtyDays(
          program.data.offer,
          program.data.objective,
        ))
          await saveGrowth(c, "post", post);
        return { ok: true };
      },
      true,
    ),
  ),
);
growthRouter.get(
  "/export",
  endpoint((req, res) =>
    access(req, "export", async (c) => {
      await requirePremium(c);
      await rate(c.tx, "growth-export:" + c.companyId, 20, 3600);
      const rows = (
        await c.tx.query(
          "SELECT kind,data,updated_at FROM growth_documents WHERE company_id=$1 ORDER BY created_at",
          [c.companyId],
        )
      ).rows;
      await audit(c, "growth.export");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="instagram-impulsa.json"',
      );
      res
        .type("application/json")
        .send(
          JSON.stringify(
            { exportedAt: new Date().toISOString(), documents: rows },
            null,
            2,
          ),
        );
    }),
  ),
);
async function safeImage(file: Express.Multer.File) {
  assert(
    ["image/png", "image/jpeg"].includes(file.mimetype),
    "Envie somente PNG ou JPEG",
  );
  try {
    const image = sharp(file.buffer, {
      limitInputPixels: 20_000_000,
      failOn: "error",
    });
    const meta = await image.metadata();
    assert(
      meta.format === "png" || meta.format === "jpeg",
      "O conteúdo precisa ser PNG ou JPEG",
    );
    assert(!meta.pages || meta.pages === 1, "Envie uma imagem estática");
    return await image
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      400,
      "A imagem é inválida, está corrompida ou excede o limite de 20 milhões de pixels.",
    );
  }
}
async function quota(c: Context, size: number) {
  const total = (
    await c.tx.query(
      "SELECT coalesce(sum(octet_length(content)),0) AS bytes,count(*) AS n FROM growth_files WHERE company_id=$1",
      [c.companyId],
    )
  ).rows[0];
  assert(
    Number(total.bytes) + size <= 50 * 1024 * 1024 && Number(total.n) < 100,
    "Limite privado de artes: 50 MB e 100 arquivos. Remova itens antes de continuar.",
  );
}
growthRouter.post(
  "/import",
  upload,
  endpoint((req) =>
    access(
      req,
      "write",
      async (c) => {
        await requirePremium(c);
        await rate(c.tx, "growth-import:" + c.companyId, 20, 3600);
        assert(req.file, "Selecione a arte em PNG ou JPEG");
        const promptId = z.string().min(1).max(100).parse(req.body.promptId);
        const doc = (
          await c.tx.query(
            "SELECT id,version FROM growth_documents WHERE company_id=$1 AND id=$2 AND kind='prompt'",
            [c.companyId, promptId],
          )
        ).rows[0];
        assert(doc, "Prompt não encontrado nesta empresa", 404);
        const version = z.coerce
          .number()
          .int()
          .positive()
          .parse(req.body.version);
        assert(
          doc.version === version,
          "Prompt alterado em outra aba. Recarregue antes de importar.",
          409,
        );
        const buffer = await safeImage(req.file);
        await quota(c, buffer.length);
        const id = randomUUID(),
          documentId = randomUUID();
        await c.tx.query(
          "INSERT INTO growth_documents(id,company_id,kind,data) VALUES($1,$2,'artwork',$3)",
          [
            documentId,
            c.companyId,
            JSON.stringify({
              promptId,
              source: "Importação manual do usuário",
              status: "imported",
            }),
          ],
        );
        await c.tx.query(
          "INSERT INTO growth_files(id,company_id,document_id,name,mime,content) VALUES($1,$2,$3,$4,$5,$6)",
          [
            id,
            c.companyId,
            documentId,
            "arte-importada.png",
            "image/png",
            buffer,
          ],
        );
        await c.tx.query(
          "UPDATE growth_documents SET data=jsonb_set(data,'{status}','\"imported\"'),version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",
          [c.companyId, promptId],
        );
        await audit(c, "growth.artwork.import", documentId);
        return { id, documentId };
      },
      true,
    ),
  ),
);
const xml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function lines(value: string, max: number) {
  const rows: string[] = [];
  let row = "";
  for (const word of value
    .split(/\s+/)
    .flatMap((w) => w.match(new RegExp(`.{1,${max}}`, "gu")) ?? [])) {
    if ((row + " " + word).length > max && row) {
      rows.push(row);
      row = word;
    } else row += (row ? " " : "") + word;
  }
  if (row) rows.push(row);
  return rows;
}
export async function renderDesign(
  input: unknown,
  photo?: Buffer,
  format: "png" | "jpeg" = "png",
) {
  const d = designSchema.parse(input),
    w = 1080,
    h = d.format === "story" ? 1920 : 1080;
  const textY = photo ? Math.round(h * 0.48) : Math.round(h * 0.28);
  const head = lines(d.headline, 28),
    body = lines(d.body, 50);
  assert(
    textY + head.length * 56 + 25 + Math.max(0, body.length - 1) * 30 < h - 145,
    "O texto não cabe neste formato com a foto. Reduza o título ou o texto de apoio para manter a leitura.",
  );
  const bold = d.template === "bold";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${d.background}"/>${bold ? `<rect x="0" y="${textY - 85}" width="1080" height="${h - textY + 85}" fill="${d.accent}"/>` : `<rect x="65" y="${textY - 70}" width="110" height="8" fill="${d.accent}"/>`}${d.template === "editorial" ? `<rect x="20" y="20" width="1040" height="${h - 40}" fill="none" stroke="${d.accent}" stroke-width="12"/>` : ""}<g font-family="${d.template === "editorial" ? "Georgia, serif" : "Arial, sans-serif"}" fill="${d.foreground}"><text x="70" y="${photo ? 80 : textY - 110}" font-size="28">${xml(d.business)}</text>${head.map((t, i) => `<text x="70" y="${textY + i * 56}" font-size="48" font-weight="700">${xml(t)}</text>`).join("")}${body.map((t, i) => `<text x="70" y="${textY + head.length * 56 + 25 + i * 30}" font-size="25">${xml(t)}</text>`).join("")}<text x="70" y="${h - 95}" font-size="30" font-weight="700">${xml(d.cta)}</text></g></svg>`;
  let result = sharp(Buffer.from(svg), { limitInputPixels: 20_000_000 });
  if (photo) {
    const image = await sharp(photo, { limitInputPixels: 20_000_000 })
      .resize(940, Math.round(h * 0.32), { fit: "cover" })
      .png()
      .toBuffer();
    result = result.composite([{ input: image, top: 110, left: 70 }]);
  }
  return format === "jpeg"
    ? result.jpeg({ quality: 90 }).toBuffer()
    : result.png().toBuffer();
}
growthRouter.post(
  "/render",
  upload,
  endpoint((req, res) =>
    access(
      req,
      "export",
      async (c) => {
        await requirePremium(c);
        await rate(c.tx, "growth-render:" + c.companyId, 20, 3600);
        let raw: unknown;
        try {
          raw = JSON.parse(req.body.design ?? "{}");
        } catch {
          throw new HttpError(400, "Definição de arte inválida.");
        }
        const design = designSchema.parse(raw);
        const format = z.enum(["png", "jpeg"]).parse(req.body.format);
        const photo = req.file ? await safeImage(req.file) : undefined;
        const buffer = await renderDesign(design, photo, format);
        await quota(c, buffer.length);
        const doc = await saveGrowth(c, "design", design);
        const id = randomUUID();
        await c.tx.query(
          "INSERT INTO growth_files(id,company_id,document_id,name,mime,content) VALUES($1,$2,$3,$4,$5,$6)",
          [
            id,
            c.companyId,
            doc.id,
            "arte-template." + format,
            "image/" + format,
            buffer,
          ],
        );
        await audit(c, "growth.template.export", doc.id);
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="arte-impulsa.' + format + '"',
        );
        res.type("image/" + format).send(buffer);
      },
      true,
    ),
  ),
);
growthRouter.get(
  "/files/:id",
  endpoint((req, res) =>
    access(req, "read", async (c) => {
      await requirePremium(c);
      const f = (
        await c.tx.query(
          "SELECT * FROM growth_files WHERE company_id=$1 AND id=$2",
          [c.companyId, req.params.id],
        )
      ).rows[0];
      assert(f, "Arquivo não encontrado", 404);
      res.setHeader("Content-Disposition", 'inline; filename="' + f.name + '"');
      res.type(f.mime).send(Buffer.from(f.content));
    }),
  ),
);
export const growthAdminRouter = Router();
growthAdminRouter.post(
  "/grant",
  endpoint(async (req) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    assert(session, "Entre na sua conta", 401);
    assert(session.user.emailVerified, "Confirme seu e-mail", 403);
    if (config.enforceMfa)
      assert(
        session.user.twoFactorEnabled,
        "Ative MFA antes de conceder acesso",
        403,
      );
    const b = z
      .object({
        companyId: z.string().max(100),
        days: z.number().int().min(1).max(90),
        reason: z.string().min(10).max(500),
      })
      .parse(req.body);
    return transaction(async (tx) => {
      await tx.query("SELECT set_config('app.user_id',$1,true)", [
        session.user.id,
      ]);
      assert(
        (
          await tx.query("SELECT 1 FROM platform_admins WHERE user_id=$1", [
            session.user.id,
          ])
        ).rows.length,
        "Somente administrador autorizado da plataforma",
        403,
      );
      await tx.query(
        "INSERT INTO company_entitlements(company_id,granted_by,reason,expires_at) VALUES($1,$2,$3,now()+($4::text||' days')::interval) ON CONFLICT(company_id) DO UPDATE SET granted_by=EXCLUDED.granted_by,reason=EXCLUDED.reason,expires_at=EXCLUDED.expires_at",
        [b.companyId, session.user.id, b.reason, b.days],
      );
      await tx.query(
        "INSERT INTO platform_audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          session.user.id,
          "premium.grant:" + b.days + "days:" + b.reason,
          b.companyId,
        ],
      );
      return { ok: true };
    });
  }),
);
