import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readdir, readFile } from "node:fs/promises";
const origin = process.env.IMPULSA_TEST_URL ?? "http://localhost:3000";
test("materiais: perfil, localização, especificações, comparação e lista privada", async ({
  page,
  context,
}, info) => {
  const email = `materials-${Date.now()}-${info.project.name}@example.test`,
    password = "Materiais-Visualizacao-2026!";
  const post = async (path: string, data: any) => {
    const r = await context.request.post("/api" + path, {
      headers: { origin },
      data,
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  await post("/auth/sign-up/email", {
    email,
    password,
    name: "Materiais Teste",
    termsAccepted: true,
    promotional: false,
    callbackURL: "/app",
  });
  let mail: any;
  for (const file of (await readdir(".data/mail")).reverse()) {
    const m = JSON.parse(await readFile(".data/mail/" + file, "utf8"));
    if (m.to === email) {
      mail = m;
      break;
    }
  }
  expect(mail).toBeTruthy();
  await context.request.get(mail.text.match(/http\S+/)[0]);
  const profile = {
    name: "Oficina de teste",
    area: "Artesanato",
    profession: "Marcenaria",
    state: "SP",
    city: "São Paulo",
    cityId: "3550308",
    cep: "01001-000",
    stage: "operating",
    offer: "both",
    team: "solo",
    attendance: "mixed",
    goals: ["Fornecedores"],
    timezone: "America/Sao_Paulo",
    step: 5,
    complete: true,
    buysMaterials: "yes",
  };
  const company = await post("/companies", profile);
  const base = `/${company.id}`;
  const client = await post(`${base}/records/clients`, {
    name: "Cliente fixture",
  });
  const quote = await post(`${base}/quotes`, {
    clientId: client.id,
    title: "Armário fixture",
    validUntil: "2099-01-01",
    items: [
      {
        name: "Serviço fixture",
        quantity: 1,
        priceCents: 50000,
        costCents: 10000,
      },
    ],
  });
  for (const action of ["send", "approve", "convert"])
    await post(`${base}/quotes/${quote.id}/action`, {
      action,
      approvalName: "Pessoa fixture",
    });
  const before = await (
    await context.request.get("/api" + base + "/overview")
  ).json();
  const order = before.orders[0];
  await page.goto("/app/configuracoes");
  await page.getByRole("button", { name: "Rejeitar opcionais" }).click();
  await page.getByRole("button", { name: "Editar perfil e objetivos" }).click();
  await page.getByRole("tab", { name: "Localização e atendimento" }).click();
  await page.getByLabel("Cidade", { exact: true }).fill("Campinas");
  await expect(page.getByText("Município IBGE 3509502")).toBeVisible();
  await page
    .getByLabel("Região de atendimento (opcional)")
    .fill("Campinas e região");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Perfil atualizado" }),
  ).toBeVisible();
  await page.goto("/app/materiais");
  await expect(
    page.getByRole("heading", {
      name: "Materiais e fornecedores",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Cidade", { exact: true })).toHaveValue(
    "Campinas",
  );
  await page.getByLabel("Material ou produto", { exact: true }).fill("MDF");
  await page
    .getByLabel("Produto do catálogo", { exact: true })
    .selectOption("mdf");
  await page
    .getByRole("button", { name: "Buscar onde comprar", exact: true })
    .click();
  await expect(page.locator('select[name="specs.thickness"]')).toHaveValue("");
  await expect(page.getByLabel("Material ou produto")).toHaveValue("MDF");
  const specs = [
    ["Espessura (mm)", "18"],
    ["Dimensões da chapa (mm)", "2750 x 1850"],
    ["Acabamento", "Melamínico"],
    ["Cor", "Branco"],
  ];
  for (const [label, value] of specs)
    await page.getByLabel(label, { exact: true }).selectOption(value);
  await page.getByLabel("Quantidade necessária").fill("3");
  await page
    .getByRole("button", { name: "Buscar onde comprar", exact: true })
    .click();
  await expect(
    page.getByText("Busca integrada não configurada", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Pesquisar no mapa" }),
  ).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\//);
  await page.getByRole("tab", { name: "Comprar online" }).click();
  await expect(
    page.getByRole("link", { name: "Pesquisar na Amazon" }),
  ).toHaveAttribute("href", /^https:\/\/www\.amazon\.com\.br\/s\?/);
  const ml = page.getByRole("link", { name: "Pesquisar no Mercado Livre" });
  await expect(ml).toHaveAttribute("target", "_blank");
  await expect(ml).toHaveAttribute("rel", "noopener noreferrer");
  expect(await ml.getAttribute("href")).not.toContain("01001");
  await expect(
    page.getByText(
      "Nenhum anúncio, preço ou estoque foi verificado pelo Impulsa.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Salvar busca", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Busca salva" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Registrar oferta conferida manualmente" })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do produto").fill("MDF branco 18 mm");
  await dialog.getByLabel("Loja / vendedor").fill("Fornecedor fixture");
  for (const [label, value] of specs)
    await dialog.getByLabel(label, { exact: true }).selectOption(value);
  await dialog.getByLabel("Quantidade na embalagem").fill("2");
  await dialog.getByLabel("Preço da embalagem (R$, opcional)").fill("200,00");
  await dialog
    .getByLabel("Fonte", { exact: true })
    .fill("Informado pelo usuário · fixture");
  await dialog
    .getByRole("button", { name: "Guardar referência de preço" })
    .click();
  await expect(
    page.getByText("Correspondência exata", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: /R\$ 400,00/ })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /Frete não confirmado/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Criar lista de compras", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nome do projeto ou lista")
    .fill("Armário · compras fixture");
  await dialog
    .getByLabel("Vincular orçamento (opcional)")
    .selectOption(quote.id);
  await dialog
    .getByLabel("Vincular ordem de serviço (opcional)")
    .selectOption(order.id);
  await dialog
    .getByRole("button", { name: "Criar lista", exact: true })
    .click();
  await expect(page.getByText("Ordem: Armário fixture")).toBeVisible();
  await page.getByRole("button", { name: "Material manual" }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Material", { exact: true })
    .fill("MDF branco comprado");
  await dialog.getByLabel("Material comprado", { exact: true }).check();
  await dialog.getByLabel("Valor total efetivamente pago (R$)").fill("350,00");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Comprado · valor pago R$ 350,00")).toBeVisible();
  await page.getByRole("tab", { name: "Salvos", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar favorito manual" }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nome", { exact: true })
    .fill("Fornecedor manual fixture");
  await dialog
    .getByLabel("Site ou link do produto")
    .fill("https://loja.example.com/material");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByText("Fornecedor manual fixture", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Minha lista", exact: true }).click();
  await expect(
    page.getByText("MDF branco comprado", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Salvos", exact: true }).click();
  await expect(
    page.getByText("Fornecedor manual fixture", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/materials-${info.project.name}.png`,
    fullPage: true,
  });
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    audit.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  const after = await (
    await context.request.get("/api" + base + "/overview")
  ).json();
  expect(after.quotes[0].data.items[0].costCents).toBe(10000);
  expect(after.finance).toEqual(before.finance);
  expect(after.stock).toEqual(before.stock);
  await page.goto("/app/configuracoes");
  await page.getByRole("button", { name: "Editar perfil e objetivos" }).click();
  await page
    .getByLabel("Nome do negócio", { exact: true })
    .fill("Edição local preservada");
  const current = await (
    await context.request.get("/api" + base + "/profile")
  ).json();
  const changed = await context.request.put("/api" + base + "/profile", {
    headers: { origin },
    data: {
      ...current.profile,
      name: "Alteração mais recente",
      version: current.version,
    },
  });
  expect(changed.ok()).toBe(true);
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "outra aba" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nome do negócio", { exact: true })).toHaveValue(
    "Edição local preservada",
  );
  expect(
    (await (await context.request.get("/api" + base + "/profile")).json())
      .profile.name,
  ).toBe("Alteração mais recente");
});
