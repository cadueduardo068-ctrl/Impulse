import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

process.env.SUPABASE_URL = "https://impulsa-mail.example.test";
process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
const { migrate, closeDb, sql } = await import("../server/db");
const { auth } = await import("../server/auth");
const { config } = await import("../server/config");
const { redeemAuthLink } = await import("../server/auth-mail");

beforeAll(migrate);
afterAll(closeDb);
afterEach(() => vi.unstubAllGlobals());

it("delivers signup, resend and recovery through Supabase and binds each link to its own PKCE flow", async () => {
  const issued: Array<{ email: string; challenge: string; ticket: string }> =
    [];
  const used = new Set<string>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://impulsa-mail.example.test");
      const body = JSON.parse(String(init?.body));
      if (url.pathname === "/auth/v1/otp") {
        const redirect = new URL(url.searchParams.get("redirect_to")!);
        expect(redirect.origin).toBe(config.url);
        expect(redirect.pathname).toMatch(/^\/confirmar-email\/[\w-]{43}$/);
        expect(body.code_challenge_method.toLowerCase()).toBe("s256");
        issued.push({
          email: body.email,
          challenge: body.code_challenge,
          ticket: redirect.pathname.split("/").at(-1)!,
        });
        return Response.json({});
      }
      expect(url.pathname).toBe("/auth/v1/token");
      const entry = issued[Number(body.auth_code)];
      if (
        !entry ||
        used.has(body.auth_code) ||
        createHash("sha256").update(body.code_verifier).digest("base64url") !==
          entry.challenge
      )
        return Response.json(
          { code: "bad_code_verifier", msg: "Invalid code" },
          { status: 400 },
        );
      used.add(body.auth_code);
      return Response.json({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: "supabase-only",
          email: entry.email,
          email_confirmed_at: "2026-01-01T00:00:00Z",
        },
      });
    }),
  );

  const email = "supabase-mail@example.test";
  const password = "Original.Password.123";
  const { user } = await auth.api.signUpEmail({
    body: {
      email,
      name: "Test",
      password,
      termsAccepted: true,
      callbackURL: "/app",
    } as never,
  });
  expect(user.emailVerified).toBe(false);
  await auth.api.sendVerificationEmail({
    body: { email, callbackURL: "/app" },
  });
  expect(issued).toHaveLength(2);

  await expect(
    redeemAuthLink(issued[0].ticket, "1", undefined, "fixture"),
  ).rejects.toMatchObject({ status: 400 });
  const verified = await redeemAuthLink(
    issued[1].ticket,
    "1",
    undefined,
    "fixture",
  );
  const confirmation = new URL(verified.redirect, config.url);
  expect(confirmation.pathname).toBe("/api/auth/verify-email");
  await auth.api.verifyEmail({
    query: { token: confirmation.searchParams.get("token")! },
  });
  await expect(
    redeemAuthLink(issued[1].ticket, "1", undefined, "fixture"),
  ).rejects.toMatchObject({ status: 400 });

  await auth.api.requestPasswordReset({
    body: { email, redirectTo: config.url + "/redefinir-senha" },
  });
  expect(issued).toHaveLength(3);
  await expect(
    auth.api.requestPasswordReset({
      body: { email, redirectTo: config.url + "/redefinir-senha" },
    }),
  ).rejects.toMatchObject({ status: "TOO_MANY_REQUESTS" });
  const reset = await redeemAuthLink(
    issued[2].ticket,
    "2",
    undefined,
    "fixture",
  );
  const resetToken = new URL(reset.redirect, config.url).pathname
    .split("/")
    .at(-1)!;
  const newPassword = "Updated.Password.123";
  await auth.api.resetPassword({ body: { token: resetToken, newPassword } });
  expect(
    (await auth.api.signInEmail({ body: { email, password: newPassword } }))
      .user.id,
  ).toBe(user.id);
  const result = await sql.query(
    'SELECT "emailVerified" FROM "user" WHERE id=$1',
    [user.id],
  );
  expect(result.rows[0].emailVerified).toBe(true);
});
