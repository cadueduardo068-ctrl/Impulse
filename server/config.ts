import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const production = process.env.NODE_ENV === "production";
const appUrl = new URL(
  process.env.APP_URL?.trim() || (production ? "" : "http://localhost:3000"),
);
if (
  (appUrl.protocol !== "https:" &&
    (production || appUrl.protocol !== "http:")) ||
  appUrl.pathname !== "/" ||
  appUrl.username ||
  appUrl.password ||
  appUrl.search ||
  appUrl.hash
)
  throw new Error("APP_URL deve ser a origem pública do Impulsa");
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
const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (
  (supabaseUrl || supabaseKey) &&
  (!supabaseUrl ||
    !supabaseKey ||
    new URL(supabaseUrl).protocol !== "https:" ||
    !/^sb_publishable_[a-zA-Z0-9_-]+$/.test(supabaseKey))
)
  throw new Error(
    "Configure a URL HTTPS e a chave publicável do Supabase juntas",
  );

if (
  production &&
  !supabaseUrl &&
  (!process.env.SMTP_HOST || !process.env.MAIL_FROM)
)
  throw new Error(
    "Configure HTTPS e um provedor de e-mail para autenticação em produção",
  );
export const config = {
  supabaseAuthMail:
    supabaseUrl && supabaseKey ? { url: supabaseUrl, key: supabaseKey } : null,
  production,
  secret,
  url: appUrl.origin,
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
