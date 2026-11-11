import { resolveTxt } from "node:dns/promises";
import nodemailer from "nodemailer";
const env = process.env;
if (!env.SMTP_HOST) {
  console.log(
    "SMTP ausente: captura local de desenvolvimento. Não houve tentativa de entrega externa. Configure SMTP_HOST, SMTP_PORT, MAIL_FROM e autenticação no ambiente do servidor.",
  );
  process.exit(0);
}
console.log("SMTP configurado; verificando conexão sem exibir credenciais.");
try {
  await nodemailer
    .createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT ?? 587),
      secure: env.SMTP_PORT === "465",
      requireTLS: env.SMTP_PORT !== "465",
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 10000,
      socketTimeout: 10000,
    })
    .verify();
  console.log(
    "Conexão/autenticação aceitas. Isso não comprova entrega na caixa de entrada.",
  );
} catch (e) {
  console.log("Falha SMTP:", e.code ?? "erro sem código");
  process.exitCode = 1;
}
const domain = env.MAIL_FROM?.match(/@([^>\s]+)/)?.[1];
if (!domain) {
  console.log("MAIL_FROM ausente ou sem domínio; DNS não conferido.");
  process.exitCode = 1;
} else {
  for (const [name, type] of [
    [domain, "SPF"],
    ["_dmarc." + domain, "DMARC"],
    ...(env.DKIM_SELECTOR
      ? [[env.DKIM_SELECTOR + "._domainkey." + domain, "DKIM"]]
      : []),
  ]) {
    try {
      const records = (await resolveTxt(name)).map((r) => r.join(""));
      console.log(
        type,
        records.some((r) =>
          r.includes(
            type === "SPF" ? "v=spf1" : type === "DMARC" ? "v=DMARC1" : "p=",
          ),
        )
          ? "registro encontrado; conferir alinhamento com o provedor"
          : "registro esperado não encontrado",
      );
    } catch {
      console.log(
        type,
        "consulta não retornou registro; conferir DNS do domínio",
      );
    }
  }
  if (!env.DKIM_SELECTOR)
    console.log(
      "DKIM não conferido: informe DKIM_SELECTOR fornecido pelo provedor. Nenhum seletor foi presumido.",
    );
}
