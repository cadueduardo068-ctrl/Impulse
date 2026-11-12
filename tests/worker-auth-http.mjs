import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import worker from "../worker/index.ts";

const publicOrigin = "https://impulse.cadueduardo068.workers.dev";
const backendOrigin = "https://api.example.test";
const assets = { fetch: async () => new Response("SPA") };

test("Worker sends API routes to the backend and assets to the SPA", async () => {
  const env = { ASSETS: assets };
  assert.equal(
    await (
      await worker.fetch(new Request(publicOrigin + "/cadastro"), env)
    ).text(),
    "SPA",
  );
  for (const route of ["/api", "/api/auth/sign-up/email"]) {
    const response = await worker.fetch(
      new Request(publicOrigin + route, { method: "POST" }),
      env,
    );
    assert.equal(response.status, 503);
    assert.match(response.headers.get("content-type"), /application\/json/);
  }
});

test(
  "Better Auth accepts the expected methods through the Worker",
  { timeout: 30000 },
  async (t) => {
    const socket = createServer();
    socket.listen(0, "127.0.0.1");
    await once(socket, "listening");
    const { port } = socket.address();
    await new Promise((resolve, reject) =>
      socket.close((error) => (error ? reject(error) : resolve())),
    );

    const tempRoot = path.resolve(tmpdir());
    const fixture = await mkdtemp(path.join(tempRoot, "impulsa-worker-test-"));
    const entry = fileURLToPath(
      new URL("../dist-server/index.js", import.meta.url),
    );
    const migrations = fileURLToPath(new URL("../migrations", import.meta.url));
    await cp(migrations, path.join(fixture, "migrations"), { recursive: true });
    const child = spawn(process.execPath, [entry], {
      cwd: fixture,
      env: {
        ...process.env,
        PORT: String(port),
        APP_URL: publicOrigin + "/",
        // Better Auth skips origin validation by default under NODE_ENV=test.
        NODE_ENV: "development",
        SERVE_BUILD: "true",
        HOST: "127.0.0.1",
        TEST_DB: "memory",
        DATABASE_URL: "",
        ENFORCE_ADMIN_MFA: "false",
        BETTER_AUTH_SECRET: "worker-test-secret-not-used-in-production",
        SUPABASE_URL: "",
        SUPABASE_PUBLISHABLE_KEY: "",
        SMTP_HOST: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = once(child, "exit");
    t.after(async () => {
      child.kill();
      await exited;
      assert.equal(path.dirname(fixture), tempRoot);
      await rm(fixture, { recursive: true, force: true });
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Origin failed to start")),
        12000,
      );
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error("Origin exited with " + code));
      });
      child.stdout.on("data", (chunk) => {
        if (String(chunk).includes("Impulsa em ")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    const realFetch = globalThis.fetch;
    t.mock.method(globalThis, "fetch", async (input, options) => {
      assert.equal(new URL(input.url).origin, backendOrigin);
      const request = new Request(input, options);
      assert.equal(
        request.headers.get("x-forwarded-host"),
        new URL(publicOrigin).host,
      );
      assert.equal(request.headers.get("x-forwarded-proto"), "https");
      const url = new URL(request.url);
      const local = new URL(
        url.pathname + url.search,
        "http://127.0.0.1:" + port,
      );
      return realFetch(new Request(local, request));
    });
    const env = { ASSETS: assets, IMPULSA_API_ORIGIN: backendOrigin };
    const request = (route, method = "GET", data, cookie, browserHeaders) =>
      worker.fetch(
        new Request(new URL(route, publicOrigin), {
          method,
          headers: {
            origin: publicOrigin,
            ...(data ? { "content-type": "application/json" } : {}),
            ...(cookie ? { cookie } : {}),
            ...browserHeaders,
          },
          body: data ? JSON.stringify(data) : undefined,
        }),
        env,
      );
    const assertOk = async (response) => {
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    };
    const mailLink = async (subject) => {
      const dir = path.join(fixture, ".data", "mail");
      for (const file of await readdir(dir)) {
        const mail = JSON.parse(await readFile(path.join(dir, file), "utf8"));
        if (mail.subject.startsWith(subject))
          return mail.text.match(/https?:\/\/\S+/)?.[0];
      }
      assert.fail("Confirmation or recovery message missing: " + subject);
    };

    const email = "worker-flow@example.test";
    const password = "Worker.Original.Pass.123";
    assert.ok(
      [404, 405].includes((await request("/api/auth/sign-up/email")).status),
    );
    const signup = {
      email,
      password,
      name: "Worker Test",
      termsAccepted: true,
      callbackURL: "/app",
    };
    for (const origin of ["https://other.example.test", "null"]) {
      const forbidden = await request(
        "/api/auth/sign-up/email",
        "POST",
        signup,
        undefined,
        {
          origin,
          "sec-fetch-site": "cross-site",
          "sec-fetch-mode": "cors",
          "x-forwarded-host": "other.example.test",
          "x-forwarded-proto": "http",
        },
      );
      assert.equal(forbidden.status, 403);
      assert.equal(
        (await forbidden.json()).code,
        origin === "null" ? "MISSING_OR_NULL_ORIGIN" : "INVALID_ORIGIN",
      );
    }
    const sameOrigin = {
      origin: "null",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
    };
    const created = await assertOk(
      await request(
        "/api/auth/sign-up/email",
        "POST",
        signup,
        undefined,
        sameOrigin,
      ),
    );
    assert.equal(created.user.emailVerified, false);
    const verify = await request(await mailLink("Confirme"));
    assert.equal(verify.status, 302);
    assert.ok(verify.headers.get("set-cookie"));
    assert.equal(
      new URL(verify.headers.get("location"), publicOrigin).origin,
      publicOrigin,
    );

    const signIn = await request("/api/auth/sign-in/email", "POST", {
      email,
      password,
    });
    const signedIn = await assertOk(signIn);
    assert.equal(signedIn.user.id, created.user.id);
    assert.equal(signedIn.user.emailVerified, true);
    const session = signIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    assert.ok(session);
    const signOut = await request("/api/auth/sign-out", "POST", {}, session);
    assert.equal((await assertOk(signOut)).success, true);
    assert.equal(
      await (
        await request("/api/auth/get-session", "GET", undefined, session)
      ).json(),
      null,
    );

    await assertOk(
      await request(
        "/api/auth/request-password-reset",
        "POST",
        {
          email,
          redirectTo: publicOrigin + "/redefinir-senha",
        },
        undefined,
        sameOrigin,
      ),
    );
    const recovery = await request(await mailLink("Redefina"));
    assert.equal(recovery.status, 302);
    const resetPage = new URL(recovery.headers.get("location"), publicOrigin);
    assert.equal(resetPage.pathname, "/redefinir-senha");
    const newPassword = "Worker.Updated.Pass.123";
    await assertOk(
      await request("/api/auth/reset-password", "POST", {
        token: resetPage.searchParams.get("token"),
        newPassword,
      }),
    );
    const loginAfterReset = await assertOk(
      await request("/api/auth/sign-in/email", "POST", {
        email,
        password: newPassword,
      }),
    );
    assert.equal(loginAfterReset.user.id, created.user.id);
  },
);
