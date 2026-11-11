import { beforeAll, afterAll, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { migrate, sql, closeDb } from "../server/db";
import { auth } from "../server/auth";
import { config } from "../server/config";
beforeAll(async () => {
  await migrate();
  await sql.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,false,now(),now())',
    ["verify-qa", "QA · Verificação", "verify-qa@example.test"],
  );
});
afterAll(closeDb);
function jwt(payload: any) {
  const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url"),
    body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return (
    header +
    "." +
    body +
    "." +
    createHmac("sha256", config.secret!)
      .update(header + "." + body)
      .digest("base64url")
  );
}
it("rejects expired, malformed and wrongly bound verification tokens and does not create sessions on replay", async () => {
  const payload = {
    email: "verify-qa@example.test",
    userId: "verify-qa",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const verify = (token: string) =>
    auth.api.verifyEmail({ query: { token }, asResponse: true });
  expect(
    (await verify(jwt({ ...payload, exp: Math.floor(Date.now() / 1000) - 60 })))
      .status,
  ).toBe(401);
  expect((await verify("malformed-token")).status).toBe(401);
  expect(
    (await verify(jwt({ ...payload, userId: "another-user" }))).status,
  ).toBe(401);
  expect(
    (
      await sql.query('SELECT "emailVerified" FROM "user" WHERE id=$1', [
        "verify-qa",
      ])
    ).rows[0].emailVerified,
  ).toBe(false);
  const token = jwt(payload);
  expect((await verify(token)).status).toBe(200);
  expect(
    (
      await sql.query('SELECT "emailVerified" FROM "user" WHERE id=$1', [
        "verify-qa",
      ])
    ).rows[0].emailVerified,
  ).toBe(true);
  const count = Number(
    (
      await sql.query('SELECT count(*) AS n FROM session WHERE "userId"=$1', [
        "verify-qa",
      ])
    ).rows[0].n,
  );
  expect(count).toBe(1);
  const replay = await verify(token);
  expect(replay.status).toBe(200);
  expect(replay.headers.get("set-cookie")).toBeNull();
  expect(
    Number(
      (
        await sql.query('SELECT count(*) AS n FROM session WHERE "userId"=$1', [
          "verify-qa",
        ])
      ).rows[0].n,
    ),
  ).toBe(count);
});
