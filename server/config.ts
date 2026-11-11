import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const production = process.env.NODE_ENV === "production";
await mkdir(".data", { recursive: true });
let secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  if (production)
    throw new Error("BETTER_AUTH_SECRET é obrigatório em produção");
  try {
    secret = await readFile(".data/auth-secret", "utf8");
  } catch {
    secret = randomBytes(48).toString("hex");
    await writeFile(".data/auth-secret", secret, { mode: 0o600 });
  }
}
if (production && !process.env.DATABASE_URL)
  throw new Error("Configure PostgreSQL externo em produção");
if (production && secret.length < 32)
  throw new Error("Use BETTER_AUTH_SECRET com no mínimo 32 caracteres");
if (
  production &&
  (!process.env.APP_URL?.startsWith("https://") ||
    !process.env.SMTP_HOST ||
    !process.env.MAIL_FROM)
)
  throw new Error("HTTPS e SMTP são obrigatórios em produção");
export const config = {
  production,
  secret,
  url: process.env.APP_URL ?? "http://localhost:3000",
  port: Number(process.env.PORT ?? 3000),
  trialDays: Number(process.env.TRIAL_DAYS ?? 7),
  enforceMfa: production || process.env.ENFORCE_ADMIN_MFA === "true",
  termsVersion: "2026-11-09-operacao",
  privacyVersion: "2026-11-09-operacao",
  plans: {
    essencial: {
      name: "Básico",
      cents: Number(process.env.ESSENCIAL_CENTS ?? 4900),
      members: Number(process.env.ESSENCIAL_MEMBERS ?? 1),
      records: Number(process.env.ESSENCIAL_RECORDS ?? 500),
    },
    completo: {
      name: "Premium",
      cents: Number(process.env.COMPLETO_CENTS ?? 9900),
      members: Number(process.env.COMPLETO_MEMBERS ?? 10),
      records: Number(process.env.COMPLETO_RECORDS ?? 10000),
    },
  },
  institution: {
    entity: process.env.LEGAL_ENTITY ?? "",
    cnpj: process.env.LEGAL_CNPJ ?? "",
    address: process.env.LEGAL_ADDRESS ?? "",
    privacyEmail: process.env.PRIVACY_EMAIL ?? "",
    contactEmail: process.env.CONTACT_EMAIL ?? "",
  },
};
