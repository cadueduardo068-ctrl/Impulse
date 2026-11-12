import { test, expect } from "@playwright/test";

test("navegação pública fixa e demonstração com API indisponível", async ({
  page,
}, info) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({ status: 503, json: { error: "Serviço indisponível" } }),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Rejeitar opcionais" }).click();
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const menu = page.getByRole("button", { name: "Abrir menu" });
  if (info.project.name !== "desktop") {
    await menu.click();
    await expect(
      menu.or(page.getByRole("button", { name: "Fechar menu" })),
    ).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
  }
  for (const [label, id] of [
    ["Funcionalidades", "funcionalidades"],
    ["Para seu negócio", "solucoes"],
    ["Como funciona", "como-funciona"],
    ["Planos", "planos"],
  ]) {
    if (info.project.name !== "desktop") await menu.click();
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp("#" + id + "$"));
    await expect
      .poll(async () =>
        page.locator("#" + id).evaluate((section) => {
          const top = section.getBoundingClientRect().top;
          return top >= 70 && top <= 115;
        }),
      )
      .toBe(true);
    await expect(page.locator(".landing-header")).toHaveCSS(
      "position",
      "sticky",
    );
  }
  const hero = page.locator(".landing-hero");
  await expect(
    hero.getByRole("link", { name: "Experimentar grátis" }),
  ).toHaveAttribute("href", "/cadastro");
  await hero.getByRole("link", { name: "Ver demonstração" }).click();
  await expect(
    page.getByRole("heading", { name: "Demonstração do Impulsa" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

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
    page.getByRole("heading", { name: /Organize seu negócio em um só lugar/ }),
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
  await page
    .locator(".landing-hero")
    .getByRole("link", { name: "Ver demonstração" })
    .click();
  await expect(page.getByText("Dados fictícios")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Demonstração do Impulsa" }),
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
  await page.getByRole("button", { name: "Orçamentos", exact: true }).click();
  await page.getByRole("button", { name: "Simular aprovação" }).click();
  await expect(page.getByRole("status")).toContainText("Orçamento aprovado");
  await page.getByRole("button", { name: "Financeiro", exact: true }).click();
  await expect(page.getByText("Armário sob medida")).toBeVisible();
  await page.getByRole("button", { name: "Simular recebimento" }).click();
  await page.getByRole("button", { name: "Visão geral" }).click();
  await expect(page.locator(".sample-kpis")).toContainText("5.540,00");
  await expect(page.locator(".sample-kpis")).toContainText("2.640,00");
  await page.getByRole("button", { name: "Reiniciar" }).click();
  await expect(page.locator(".sample-kpis")).toContainText("4.860,00");
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
