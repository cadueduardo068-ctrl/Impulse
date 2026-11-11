import { test, expect } from "@playwright/test";
test("site público, demonstração responsiva, cookies e PWA", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  let deliberatelyOffline = false;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      !(deliberatelyOffline && m.text().includes("ERR_INTERNET_DISCONNECTED"))
    )
      errors.push(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Organize seus clientes, orçamentos e recebimentos/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rejeitar opcionais" }).click();
  await expect(
    page.getByRole("complementary", { name: "Preferências de cookies" }),
  ).toHaveCount(0);
  await page
    .locator("img")
    .evaluateAll((imgs) =>
      imgs.forEach((img) => ((img as HTMLImageElement).loading = "eager")),
    );
  await expect
    .poll(async () =>
      page
        .locator("img")
        .evaluateAll((imgs) =>
          imgs.every((img) => (img as HTMLImageElement).complete),
        ),
    )
    .toBe(true);
  const images = await page
    .locator("img")
    .evaluateAll((imgs) =>
      imgs.every(
        (img) =>
          (img as HTMLImageElement).complete &&
          (img as HTMLImageElement).naturalWidth > 0,
      ),
    );
  expect(images).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/home-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Conhecer o painel" }).click();
  await expect(page.getByText("Demonstração somente leitura")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Seu negócio começa aqui." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Novo orçamento", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("somente leitura");
  const manifest = await (
    await context.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const urls = [];
    for (const k of keys) {
      for (const r of await (await caches.open(k)).keys())
        urls.push(new URL(r.url).pathname);
    }
    return urls;
  });
  expect(cached.some((u) => u.startsWith("/api/"))).toBe(false);
  deliberatelyOffline = true;
  await context.setOffline(true);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Uma pausa na conexão." }),
  ).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
test("cadastro exige aceitação desmarcada e páginas legais acessíveis", async ({
  page,
}) => {
  await page.goto("/cadastro");
  const terms = page.locator("input[name=terms]");
  await expect(terms).not.toBeChecked();
  await expect(page.locator("input[name=promo]")).not.toBeChecked();
  await expect(
    page.getByRole("link", { name: "Termos de Uso" }),
  ).toHaveAttribute("href", "/termos");
  await page.goto("/politica-privacidade");
  await expect(
    page.getByRole("heading", { name: "Política de Privacidade", exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("body")).toHaveCSS("scroll-behavior", "auto");
});
