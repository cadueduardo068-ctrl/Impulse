import { createClient } from "@supabase/supabase-js";
import { APIError } from "better-auth/api";
import { config } from "./config.js";
import { transaction, type Sql } from "./db.js";
import { assert, hash, rate, token } from "./service.js";

export function emailDeliveryMode() {
  if (config.supabaseAuthMail) return "supabase";
  return process.env.SMTP_HOST ? "smtp" : "development-capture";
}

function provider(storage: Map<string, string>) {
  const settings = config.supabaseAuthMail;
  assert(settings, "Serviço de e-mail indisponível", 503);
  return createClient(settings.url, settings.key, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
        removeItem: (key) => {
          storage.delete(key);
        },
      },
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          redirect: "error",
          signal: AbortSignal.timeout(12000),
        }),
    },
  }).auth;
}

function withMailStorage<T>(operation: (tx: Sql) => Promise<T>) {
  return transaction(async (tx) => {
    await tx.query("SELECT set_config('app.auth_mail_backend','1',true)");
    return operation(tx);
  });
}

function validateActionUrl(value: string) {
  const url = new URL(value);
  assert(
    url.origin === new URL(config.url).origin &&
      (url.pathname === "/api/auth/verify-email" ||
        /^\/api\/auth\/reset-password\/[a-zA-Z0-9_-]+$/.test(url.pathname)),
    "Link de autenticação inválido",
  );
  return url;
}

export async function deliverAuthLink(email: string, link: string) {
  const actionUrl = validateActionUrl(link);
  const ticket = token();
  const redirect = new URL("/confirmar-email/" + ticket, config.url);
  const storage = new Map<string, string>();
  const { error } = await provider(storage).signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirect.href },
  });
  if (error) {
    console.warn("Supabase Auth mail request failed", {
      code: error.code,
      status: error.status,
    });
    if (error.status === 429)
      throw new APIError("TOO_MANY_REQUESTS", {
        message: "Aguarde um minuto antes de solicitar outro e-mail.",
      });
    throw new APIError("SERVICE_UNAVAILABLE", {
      message: "O serviço de e-mail está indisponível. Tente novamente.",
    });
  }
  await withMailStorage(async (tx) => {
    await tx.query("DELETE FROM auth_mail_tickets WHERE expires_at <= now()");
    await tx.query(
      "INSERT INTO auth_mail_tickets(ticket_hash,email,action_url,pkce_storage) VALUES($1,$2,$3,$4)",
      [
        hash(ticket),
        email.toLowerCase(),
        actionUrl.href,
        JSON.stringify(Object.fromEntries(storage)),
      ],
    );
  });
}

export async function redeemAuthLink(
  ticket: string,
  code: string,
  flowId: string | undefined,
  ip: string,
) {
  await transaction((tx) => rate(tx, "auth-mail-redeem:" + ip, 15, 60));
  const ticketHash = hash(ticket);
  const record = await withMailStorage(
    async (tx) =>
      (
        await tx.query<{
          email: string;
          action_url: string;
          pkce_storage: Record<string, string>;
        }>(
          "SELECT email,action_url,pkce_storage FROM auth_mail_tickets WHERE ticket_hash=$1 AND expires_at>now()",
          [ticketHash],
        )
      ).rows[0],
  );
  assert(
    record,
    "Link inválido, expirado ou já utilizado. Solicite um novo link.",
    400,
  );

  const { data, error } = await provider(
    new Map(Object.entries(record.pkce_storage)),
  ).exchangeCodeForSession(code, flowId ? { flowId } : undefined);
  assert(error?.status !== 429, "Aguarde um minuto e tente novamente.", 429);
  assert(
    !error &&
      data.user?.email_confirmed_at &&
      data.user.email?.toLowerCase() === record.email,
    "Link inválido, expirado ou já utilizado. Solicite um novo link.",
    400,
  );

  const consumed = await withMailStorage(
    async (tx) =>
      (
        await tx.query(
          "DELETE FROM auth_mail_tickets WHERE ticket_hash=$1 AND expires_at>now() RETURNING ticket_hash",
          [ticketHash],
        )
      ).rows.length,
  );
  assert(consumed, "Link já utilizado. Solicite um novo link.", 400);
  const destination = validateActionUrl(record.action_url);
  return { redirect: destination.pathname + destination.search };
}
