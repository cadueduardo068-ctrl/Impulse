import { queueAfterTransactionHook } from "@better-auth/core/context";
import { deliverAuthLink } from "./auth-mail.js";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { twoFactor } from "better-auth/plugins";
import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { authDb, sql, transaction } from "./db.js";
import * as schema from "./schema.js";
import { rate, hash } from "./service.js";
import { config } from "./config.js";
const escapeHtml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function mailHtml(subject: string, text: string) {
  const url = text.match(/https?:\/\/[^\s]+/)?.[0];
  return `<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;padding:24px;background:#f4f5fa;font:16px Arial;color:#252638"><main style="max-width:560px;margin:auto;background:white;padding:28px;border-radius:16px"><h2>Impulsa</h2><h1 style="font-size:24px">${escapeHtml(subject)}</h1><p style="line-height:1.6;overflow-wrap:anywhere">${escapeHtml(text)}</p>${url ? `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 20px;background:#4145b7;color:white;border-radius:8px">Continuar com segurança</a></p>` : ""}<p>Se você não solicitou esta ação, ignore esta mensagem. Links de confirmação expiram em uma hora.</p></main></body></html>`;
}
export async function sendMail(to: string, subject: string, text: string) {
  if (process.env.SMTP_HOST) {
    if (!process.env.MAIL_FROM)
      throw new Error("Configure MAIL_FROM para enviar e-mail por SMTP");
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_PORT === "465",
      requireTLS: process.env.SMTP_PORT !== "465",
      connectionTimeout: 10000,
      socketTimeout: 15000,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    await transport.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      text,
      html: mailHtml(subject, text),
    });
  } else {
    if (config.production) throw new Error("SMTP indisponível");
    await mkdir(".data/mail", { recursive: true });
    await writeFile(
      `.data/mail/${Date.now()}-${randomUUID()}.json`,
      JSON.stringify({ to, subject, text }),
      { mode: 0o600 },
    );
  }
}
async function sendAccountEmail(
  email: string,
  url: string,
  subject: string,
  text: string,
) {
  if (config.supabaseAuthMail)
    return queueAfterTransactionHook(() => deliverAuthLink(email, url));
  return sendMail(email, subject, text);
}

export const auth = betterAuth({
  baseURL: config.url,
  secret: config.secret,
  database: drizzleAdapter(authDb, {
    provider: "pg",
    schema,
    transaction: true,
  }),
  trustedOrigins: [config.url],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (["/send-verification-email", "/change-email"].includes(ctx.path)) {
        try {
          const session = await auth.api.getSession({
            headers: ctx.headers ?? new Headers(),
          });
          await transaction(async (tx) => {
            if (session)
              await rate(tx, "verification-user:" + session.user.id, 1, 60);
            await rate(
              tx,
              "verification:" +
                hash(
                  String(
                    ctx.body?.email ?? ctx.body?.newEmail ?? "unknown",
                  ).toLowerCase(),
                ),
              1,
              60,
            );
          });
        } catch {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Aguarde um minuto antes de solicitar outra confirmação.",
          });
        }
      }
      if (
        ctx.path === "/request-password-reset" &&
        config.supabaseAuthMail &&
        typeof ctx.body?.email === "string"
      ) {
        try {
          await transaction((tx) =>
            rate(
              tx,
              "auth-mail-recovery:" + hash(ctx.body.email.trim().toLowerCase()),
              1,
              60,
            ),
          );
        } catch {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Aguarde um minuto antes de solicitar outro link.",
          });
        }
      }
      if (ctx.path === "/sign-up/email" && ctx.body?.termsAccepted !== true)
        throw new APIError("BAD_REQUEST", {
          message: "É necessário aceitar os Termos de Uso",
        });
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user, ctx) => {
          if (ctx?.body?.termsAccepted === true)
            await sql.query(
              "INSERT INTO consents(id,user_id,terms_version,privacy_version,promotional) VALUES($1,$2,$3,$4,$5)",
              [
                randomUUID(),
                user.id,
                config.termsVersion,
                config.privacyVersion,
                ctx.body.promotional === true,
              ],
            );
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      try {
        await sendAccountEmail(
          user.email,
          url,
          "Redefina sua senha · Impulsa",
          `Acesse para redefinir sua senha: ${url}`,
        );
      } catch (error) {
        if (!config.supabaseAuthMail) throw error;
        // Keep the public recovery response identical for existing and unknown accounts.
        console.warn(
          "Não foi possível entregar o link de recuperação do Impulsa.",
        );
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) =>
      sendAccountEmail(
        user.email,
        url,
        "Confirme seu e-mail · Impulsa",
        `Confirme seu endereço: ${url}`,
      ),
  },
  user: {
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: true,
      sendChangeEmailConfirmation: async ({ user, url }) =>
        sendAccountEmail(
          user.email,
          url,
          "Confirme a alteração de e-mail · Impulsa",
          url,
        ),
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 15,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 10 },
      "/request-password-reset": { window: 60, max: 5 },
      "/send-verification-email": { window: 60, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: config.production,
    ipAddress: { ipAddressHeaders: ["x-impulsa-client-ip"] },
  },
  plugins: [twoFactor({ issuer: "Impulsa" })],
});
