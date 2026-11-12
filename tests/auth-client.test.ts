import { expect, it, vi } from "vitest";

it("sends signup, login and password recovery to the same-origin proxy", async () => {
  vi.stubEnv("BETTER_AUTH_URL", "https://backend.example.test");
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({ status: true }),
  );
  vi.stubGlobal("fetch", fetchMock);
  try {
    const { authClient } = await import("../src/api");
    const email = "cliente@example.test";
    const password = "Test.Password.123";
    await authClient.signUp.email({ email, password, name: "Cliente" });
    await authClient.signIn.email({ email, password });
    await authClient.requestPasswordReset({
      email,
      redirectTo: "/redefinir-senha",
    });

    const posts = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(posts.map(([url]) => String(url))).toEqual([
      "/api/auth/sign-up/email",
      "/api/auth/sign-in/email",
      "/api/auth/request-password-reset",
    ]);
    for (const [, init] of posts) {
      expect(init).toMatchObject({
        credentials: "same-origin",
        redirect: "error",
      });
    }
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
