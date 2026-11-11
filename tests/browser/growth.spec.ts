import { test, expect } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
const origin = process.env.IMPULSA_TEST_URL ?? "http://localhost:3000";
test("pending account saves six steps, cannot search, corrects email and confirms without privilege leakage", async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Integration runs once; Premium layout runs on all sizes.",
  );
  const email = "pending-qa-" + Date.now() + "@example.test",
    password = "Pending-local-test-2026!";
  await page.goto("/cadastro");
  await page.getByRole("button", { name: "Rejeitar opcionais" }).click();
  await page.getByLabel("Seu nome").fill("QA · Cadastro pendente");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.locator("input[name=terms]").check();
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(
    page.getByRole("heading", { name: "Qual é a sua área de atuação?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Marcenaria", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Roupas e moda", exact: true })
    .click();
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.getByText("Loja de roupas", { exact: true }).click();
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.getByLabel("Estado", { exact: true }).selectOption("SP");
  await page.getByLabel("Cidade", { exact: true }).fill("São Paulo");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Conte um pouco do seu momento." }),
  ).toBeVisible();
  const me = await (await context.request.get("/api/me")).json(),
    base = "/api/" + me.companies[0].id;
  expect(me.user.emailVerified).toBe(false);
  expect((await context.request.get(base + "/overview")).status()).toBe(403);
  expect(
    (
      await context.request.post(base + "/materials/search", {
        headers: { origin },
        data: {
          query: {
            material: "MDF",
            category: "mdf",
            specs: {
              thickness: "18",
              dimensions: "2750 x 1850",
              finish: "Melamínico",
              color: "Branco",
            },
            quantity: "1",
            unit: "un",
            cityId: "3550308",
            state: "SP",
            preference: "both",
          },
        },
      })
    ).status(),
  ).toBe(403);
  expect((await context.request.get(base + "/growth")).status()).toBe(403);
  expect((await context.request.get("/api/catalog/admin")).status()).toBe(403);
  await page.getByLabel("Nome do negócio").fill("QA · Perfil pendente");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page
    .getByLabel("Sua empresa compra materiais, produtos ou equipamentos?")
    .selectOption("no");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.getByText("Instagram e divulgação", { exact: true }).click();
  await page.getByRole("button", { name: "Abrir meu negócio" }).click();
  await expect(
    page.getByRole("heading", { name: "Confirme seu e-mail" }),
  ).toBeVisible();
  await expect(
    page.getByText("Entrega por e-mail desativada", {
      exact: false,
    }),
  ).toBeVisible();
  await page.goto("/api/auth/verify-email?token=invalid&callbackURL=/app");
  await expect(
    page.getByText("Link inválido, expirado ou já utilizado.", {
      exact: false,
    }),
  ).toBeVisible();
  const corrected = email.replace("@", "-corrigido@");
  await page.getByText("Corrigir endereço de e-mail", { exact: true }).click();
  await page.getByLabel("Novo e-mail").fill(corrected);
  await page.getByLabel("Senha atual").fill(password);
  await page.getByRole("button", { name: "Corrigir e reenviar" }).click();
  await expect(page.getByText(corrected, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Aguarde \d+s/ }),
  ).toBeDisabled();
  const resend = await context.request.post(
    "/api/auth/send-verification-email",
    { headers: { origin }, data: { email: corrected, callbackURL: "/app" } },
  );
  expect(resend.status()).toBe(429);
  let mail: any;
  for (const file of (await readdir(".data/mail")).reverse()) {
    const m = JSON.parse(await readFile(".data/mail/" + file, "utf8"));
    if (m.to === corrected) {
      mail = m;
      break;
    }
  }
  await page.goto(mail.text.match(/http\S+/)[0]);
  await expect(page.getByRole("heading", { name: /QA/ })).toBeVisible();
  expect((await context.request.get(base + "/overview")).status()).toBe(200);
  await page.goto("/app/instagram");
  await expect(
    page.getByRole("heading", { name: "Um próximo passo para sua divulgação" }),
  ).toBeVisible();
  expect(
    (
      await context.request.post("/api/growth-admin/grant", {
        headers: { origin },
        data: {
          companyId: me.companies[0].id,
          days: 1,
          reason: "Tentativa não autorizada",
        },
      })
    ).status(),
  ).toBe(403);
});
test("Premium programme, explicit clipboard fallback, plain ChatGPT link, private import and image exports", async ({
  page,
  context,
  playwright,
}, info) => {
  const fixture = JSON.parse(await readFile(".data/e2e-growth.json", "utf8"));
  await page.goto("/entrar");
  await page.getByRole("button", { name: "Rejeitar opcionais" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(fixture.email);
  await page.locator("input[name=password]").fill(fixture.password);
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await page.waitForURL("**/app");
  await expect(page.getByRole("heading", { name: /QA/ })).toBeVisible();
  const grant=await context.request.post("/api/growth-admin/grant",{headers:{origin},data:{companyId:fixture.companyId,days:1,reason:"Renovação explícita da concessão de QA local"}});expect(grant.ok()).toBe(true);
  await page.goto("/app/materiais");await page.getByLabel("Finalidade da compra").selectOption("resale");await page.getByLabel("Produto do catálogo").selectOption("clothing");await expect(page.getByLabel("Tipo de peça",{exact:true})).toBeVisible();await expect(page.getByLabel("Espessura (mm)",{exact:true})).toHaveCount(0);await page.getByLabel("Finalidade da compra").selectOption("manufacturing");await page.getByLabel("Produto do catálogo").selectOption("fabric");await expect(page.getByLabel("Composição",{exact:true})).toBeVisible();await expect(page.getByLabel("Tipo de peça",{exact:true})).toHaveCount(0);
  await page.goto("/app/instagram");
  await expect(
    page.getByRole("heading", { name: "Faça seu negócio ser reconhecido" }),
  ).toBeVisible();
  await page
    .getByLabel("Bio (até 150 caracteres)")
    .fill("Perfil de QA, sem publicação externa.");
  await page.getByRole("button", { name: "Salvar configuração" }).click();
  await page.getByRole("tab", { name: /Identidade visual/ }).click();
  await page
    .getByLabel("Objetivo da divulgação")
    .fill("Apresentar produtos reais");
  await page.getByRole("button", { name: "Salvar configuração" }).click();
  await page.getByRole("tab", { name: /Plano de 30 dias/ }).click();
  if (
    await page
      .getByRole("button", { name: "Criar sugestões para 30 dias" })
      .count()
  )
    await page
      .getByRole("button", { name: "Criar sugestões para 30 dias" })
      .click();
  await expect(page.locator(".post-card")).toHaveCount(30);
  await page.locator(".post-card").first().click();
  await page
    .getByLabel("Legenda", { exact: true })
    .fill("Legenda de QA editada, sem postagem automática.");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await page.getByRole("tab", { name: /Resultados/ }).click();
  await page.getByRole("button", { name: "Registrar métricas" }).click();
  await page.getByLabel("Alcance", { exact: true }).fill("100");
  await page.getByLabel("Visitas ao perfil", { exact: true }).fill("12");
  await page
    .getByLabel("Período e observações")
    .fill("Dados de teste identificados, sem origem externa.");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await page.goto("/app/artes");
  await page
    .getByLabel("Texto principal", { exact: true })
    .fill("Arte de QA " + info.project.name);
  await page
    .getByLabel("Produto ou serviço e informações reais")
    .fill("Produto de teste, sem oferta comercial.");
  const photo = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#c6c5de" },
  })
    .png()
    .toBuffer();
  let uploads = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/growth/import")) uploads++;
  });
  await page
    .getByLabel("Foto própria para referência (opcional)")
    .setInputFiles({
      name: "foto-qa.png",
      mimeType: "image/png",
      buffer: photo,
    });
  await expect(
    page.getByAltText("Prévia local da foto de referência"),
  ).toBeVisible();
  expect(uploads).toBe(0);
  await expect(
    page.getByRole("link", { name: "Abrir ChatGPT" }),
  ).toHaveAttribute("href", "https://chatgpt.com/");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copiar instruções" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Prompt copiado para a área de transferência." }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "Arte de QA",
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("Bloqueio de teste")),
      },
    }),
  );
  await page.getByRole("button", { name: "Copiar instruções" }).click();
  await expect(
    page.getByText("A cópia automática não funcionou.", { exact: false }),
  ).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).__qaCopied = text;
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Copiar instruções" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Prompt copiado para a área de transferência." }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).__qaCopied)).toContain(
    "Arte de QA",
  );
  await page.getByLabel("Arte final (PNG ou JPEG, até 5 MB)").setInputFiles({
    name: "resultado-qa.png",
    mimeType: "image/png",
    buffer: photo,
  });
  await page
    .getByRole("button", { name: "Importar arte", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Arte importada na biblioteca privada." }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Editor com templates" }).click();
  await page.getByLabel("Título", { exact: true }).fill("Composição QA");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar arte", exact: false })
    .click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe("arte-impulsa.png");
  await page.getByRole("tab", { name: "Artes e prompts salvos" }).click();
  await expect(page.locator(".library-grid img").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/growth-" + info.project.name + ".png",
    fullPage: true,
  });
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    axe.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const files = await (
    await context.request.get("/api/" + fixture.companyId + "/growth")
  ).json();
  const stranger=await playwright.request.newContext({baseURL:origin});expect((await stranger.get("/api/"+fixture.companyId+"/growth/files/"+files.files[0].id)).status()).toBe(401);await stranger.dispose();
  expect(
    files.documents.some(
      (d: any) => d.kind === "prompt" && d.data.status === "imported",
    ),
  ).toBe(true);
});

