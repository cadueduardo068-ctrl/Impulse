import { test, expect, type APIRequestContext } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
const origin = process.env.IMPULSA_TEST_URL ?? "http://localhost:3000";
async function mailFor(email: string, subject = "Confirme") {
  let mail: any;
  await expect
    .poll(async () => {
      for (const file of (await readdir(".data/mail")).reverse()) {
        const m = JSON.parse(await readFile(".data/mail/" + file, "utf8"));
        if (m.to === email && m.subject.includes(subject)) {
          mail = m;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return mail;
}
async function post(req: APIRequestContext, path: string, data: any) {
  const r = await req.post("/api" + path, { headers: { origin }, data });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function signup(req: APIRequestContext, name: string) {
  const email =
      "ops-qa-" +
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2, 7) +
      "@example.test",
    password = "Operacao-local-QA-2026!";
  await post(req, "/auth/sign-up/email", {
    email,
    password,
    name,
    termsAccepted: true,
    promotional: false,
    callbackURL: "/app",
  });
  const mail = await mailFor(email);
  await req.get(mail.text.match(/http\S+/)[0]);
  return { email, password };
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
test("operação conectada: cliente, proposta, execução, recebimento, caixa, importação e relatórios", async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name === "tablet",
    "Fluxo completo em desktop e celular; tablet tem inspeção dos módulos preservados.",
  );
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const req = context.request;
  await signup(req, "QA · Operação " + info.project.name);
  const company = await post(req, "/companies", {
    name: "QA · Empresa operacional " + info.project.name,
    area: "Marcenaria",
    profession: "Marceneiro",
    businessModels: ["products", "custom", "stock", "team"],
    state: "SP",
    city: "São Paulo",
    cityId: "3550308",
    stage: "operating",
    offer: "both",
    team: "team",
    attendance: "mixed",
    goals: ["Materiais e fornecedores", "Finanças"],
    timezone: "America/Sao_Paulo",
    step: 6,
    complete: true,
    buysMaterials: "yes",
  });
  const base = "/" + company.id;
  const material = await post(req, base + "/records/products", {
    name: "QA · Material de produção",
    unit: "un",
    costCents: 1000,
    costKnown: true,
  });
  const parent = await post(req, base + "/records/products", {
    name: "QA · Produto base",
  });
  const sku = await post(req, base + "/records/products", {
    name: "QA · Produto P azul",
    sku: "QA-P-AZUL",
    productType: "variation",
    parentProductId: parent.id,
    size: "P",
    color: "Azul",
    unit: "un",
    trackStock: true,
    minimum: 4,
    priceCents: 20000,
    costCents: 5000,
    costKnown: true,
    materials: [{ productId: material.id, quantity: 1 }],
  });
  for (const [productId, delta] of [
    [material.id, 10],
    [sku.id, 5],
  ])
    await post(req, base + "/stock/move", {
      productId,
      delta,
      reason: "Entrada inicial identificada de QA",
      key: crypto.randomUUID(),
    });
  await page.goto("/app/clientes");
  await page.getByRole("button", { name: "Rejeitar opcionais" }).click();
  await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nome", { exact: true })
    .fill("QA · Cliente comercial");
  await dialog
    .getByLabel("E-mail (opcional)")
    .fill("cliente-comercial-" + Date.now() + "@example.test");
  await dialog
    .getByLabel("Preferência de comunicação")
    .selectOption("whatsapp");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const clients = await (
    await req.get("/api" + base + "/records/clients")
  ).json();
  const client = clients[0];
  await page.goto("/app/crm");
  await page
    .getByRole("button", { name: "Nova oportunidade", exact: false })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nome da oportunidade")
    .fill("QA · Venda acompanhada");
  await dialog.getByLabel("Cliente", { exact: true }).selectOption(client.id);
  await dialog.getByLabel("Etapa do funil").selectOption("won");
  await dialog.getByLabel("Valor previsto (R$)").fill("400,00");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await (await req.get("/api" + base + "/finance")).json()).ledger,
  ).toEqual([]);
  await page.goto("/app/propostas");
  await page
    .getByRole("button", { name: "Novo orçamento", exact: false })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Título", { exact: true })
    .fill("QA · Trabalho conectado");
  await dialog.getByLabel("Cliente", { exact: true }).selectOption(client.id);
  await dialog.getByLabel("Selecionar produto ou serviço").selectOption(sku.id);
  await dialog.getByLabel("Quantidade", { exact: true }).fill("2");
  await dialog
    .getByLabel("Prazo de entrega combinado (opcional)")
    .fill(today());
  await dialog.getByLabel("Vencimento previsto do recebimento").fill(today());
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page
    .getByRole("button", { name: "Buscar materiais", exact: true })
    .click();
  await page.getByLabel("Material do orçamento").selectOption(material.id);
  await expect(page.getByLabel("Material ou produto")).toHaveValue(
    "QA · Material de produção",
  );
  await page.goto("/app/propostas");
  await page
    .getByRole("button", { name: "Marcar enviado", exact: true })
    .click();
  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Quem aprovou?").fill("Cliente de QA");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Registrar aprovação", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Gerar ordem", exact: false }).click();
  const overview = await (await req.get("/api" + base + "/overview")).json(),
    order = overview.orders[0];
  expect(order.snapshot.items[0].priceCents).toBe(20000);
  await page.goto("/app/execucao?id=" + order.id);
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await page
    .getByLabel("Descrição da etapa 1")
    .fill("Conferir acabamento e entrega");
  await page.getByLabel("Concluir etapa 1").check();
  await page.getByLabel("Tempo realizado (min)").fill("90");
  await page.getByLabel("Base do resultado estimado").selectOption("total");
  await page.getByLabel("Custo total confirmado (R$)").fill("150,00");
  await page
    .getByRole("button", { name: "Salvar execução", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Execução salva com controle de versão." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reservar ou consumir material" })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Produto / SKU").selectOption(material.id);
  await dialog.getByLabel("Ação", { exact: true }).selectOption("consume");
  await dialog
    .getByLabel("Motivo", { exact: true })
    .fill("Consumo parcial conferido QA");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Concluir trabalho", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar conclusão", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Estado: Concluído", { exact: false }),
  ).toBeVisible();
  let stock = await (await req.get("/api" + base + "/stock")).json();
  expect(
    stock.items.find((s: any) => s.product_id === material.id).quantity,
  ).toBe(8);
  expect(stock.items.find((s: any) => s.product_id === sku.id).quantity).toBe(
    3,
  );
  const list = await post(req, base + "/materials/lists", {
    name: "QA · Reposição",
  });
  const item = await post(
    req,
    base + "/materials/lists/" + list.id + "/items",
    {
      material: "QA · Material de produção",
      quantity: "3",
      unit: "un",
      purchased: true,
      paidCents: null,
    },
  );
  await page.goto("/app/recebimentos");
  await page
    .getByRole("button", { name: "Registrar recebimento", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("SKU que entrará no estoque")
    .selectOption(material.id);
  await dialog
    .getByLabel("Conferência, lote ou conversão entre unidades")
    .fill("Uma unidade conferida fisicamente, lote de QA");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  stock = await (await req.get("/api" + base + "/stock")).json();
  expect(
    stock.items.find((s: any) => s.product_id === material.id).quantity,
  ).toBe(9);
  expect(
    (
      await (await req.get("/api" + base + "/operations/receipts")).json()
    ).receipts.some((r: any) => r.list_item_id === item.id),
  ).toBe(true);
  await page.goto("/app/contas");
  await page
    .getByRole("button", { name: "Nova conta financeira", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome da conta").fill("QA · Caixa manual");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let accounts = await (
    await req.get("/api" + base + "/operations/accounts")
  ).json();
  const cash = accounts.accounts[0];
  await page.goto("/app/financeiro");
  await page
    .getByRole("button", { name: "Registrar pagamento", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Valor pago / recebido (R$)").fill("100,00");
  await dialog.getByLabel("Conta financeira efetiva").selectOption(cash.id);
  await dialog
    .getByRole("button", { name: "Confirmar registro", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let finance = await (await req.get("/api" + base + "/finance")).json();
  expect(Number(finance.ledger[0].paid_cents)).toBe(10000);
  await page.goto("/app/importacoes");
  await page.getByLabel("Arquivo CSV · até 1 MB e 1.000 linhas").setInputFiles({
    name: "clientes-qa.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name;email\nQA · Cliente importado;csv-" +
        Date.now() +
        "@example.test\nQA · Linha inválida;email-invalido",
    ),
  });
  await page
    .getByRole("button", { name: "Validar e visualizar prévia" })
    .click();
  await expect(
    page.getByRole("heading", { name: /1 válidas, 1 com erro/ }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /Revisei os erros/ }).check();
  await page.getByRole("checkbox", { name: /Revisei os dados/ }).check();
  await page
    .getByRole("button", { name: "Confirmar e processar importação" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Resultado da importação" }),
  ).toBeVisible();
  await expect(
    page.getByText("Linha 3 · Erro", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("2/2", { exact: false })).toBeVisible();
  await page.goto("/app/contas");
  await page.getByLabel("Conta financeira do extrato").selectOption(cash.id);
  await page.getByLabel("Arquivo CSV · até 1 MB e 1.000 linhas").setInputFiles({
    name: "extrato-qa.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name;date;amount\nQA · Recebimento conferido;" + today() + ";200,00",
    ),
  });
  await page
    .getByRole("button", { name: "Validar e visualizar prévia" })
    .click();
  await page.getByLabel("Ação da linha 2").selectOption("match");
  await page
    .getByLabel("Correspondência da linha 2")
    .selectOption(finance.ledger[0].id);
  await page.getByRole("checkbox", { name: /Revisei os dados/ }).check();
  await page
    .getByRole("button", { name: "Confirmar e processar importação" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Resultado da importação" }),
  ).toBeVisible();
  finance = await (await req.get("/api" + base + "/finance")).json();
  expect(Number(finance.ledger[0].paid_cents)).toBe(30000);
  accounts = await (
    await req.get("/api" + base + "/operations/accounts")
  ).json();
  expect(accounts.accounts[0].balanceCents).toBe(30000);
  await page.goto("/app/precificacao");
  await page.getByLabel("Materiais · total (R$)").fill("10,00");
  await page.getByLabel("Mão de obra (minutos)").fill("30");
  await page.getByLabel("Custo da hora de trabalho (R$)").fill("20,00");
  await page
    .getByRole("button", { name: "Calcular preço", exact: true })
    .click();
  await expect(page.getByText("Preço sugerido", { exact: true })).toBeVisible();
  await page.getByLabel("Aplicar a um produto ou serviço").selectOption(sku.id);
  await page
    .getByRole("button", { name: "Aplicar preço e custo ao catálogo" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Preço e custo aplicados" }),
  ).toBeVisible();
  const historical = await (
    await req.get("/api" + base + "/operations/orders/" + order.id)
  ).json();
  expect(historical.order.snapshot.items[0].priceCents).toBe(20000);
  await page.goto("/app/relatorios");
  await expect(
    page.getByRole("heading", { name: "Relatórios para decidir" }),
  ).toBeVisible();
  await expect(page.getByText("R$ 250,00", { exact: true })).toBeVisible();
  const reportDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar CSV seguro" }).click();
  expect((await reportDownload).suggestedFilename()).toBe(
    "relatorio-impulsa.csv",
  );
  let axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    axe.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/operacao-relatorios-" + info.project.name + ".png",
    fullPage: true,
  });
  await post(req, base + "/records/tasks", {
    name: "QA · Conferir o dia",
    due: today(),
    status: "pending",
  });
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /Meu dia/ })).toBeVisible();
  await expect(
    page.getByText("QA · Conferir o dia", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    axe.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/operacao-meu-dia-" + info.project.name + ".png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("papéis novos, duas empresas, custos privados e bloqueio de exportação", async ({
  playwright,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Verificação de autorização executada uma vez.",
  );
  const owner = await playwright.request.newContext({ baseURL: origin }),
    worker = await playwright.request.newContext({ baseURL: origin }),
    stranger = await playwright.request.newContext({ baseURL: origin });
  const ownerAuth = await signup(owner, "QA · Proprietário de permissões");
  const account = await signup(worker, "QA · Operação restrita");
  await signup(stranger, "QA · Outra empresa");
  const profile = {
    name: "QA · Empresa de permissões",
    area: "Serviços profissionais",
    profession: "Consultor",
    state: "SP",
    city: "São Paulo",
    cityId: "3550308",
    stage: "operating",
    offer: "both",
    team: "team",
    attendance: "mixed",
    goals: [],
    timezone: "America/Sao_Paulo",
    step: 6,
    complete: true,
  };
  const company = await post(owner, "/companies", profile),
    other = await post(stranger, "/companies", {
      ...profile,
      name: "QA · Empresa estrangeira",
    }),
    base = "/" + company.id;
  const product = await post(owner, base + "/records/products", {
    name: "QA · Custo privado",
    priceCents: 12500,
    costCents: 4500,
  });
  await post(owner, base + "/team/invite", {
    email: account.email,
    role: "operations",
  });
  const invitation = await mailFor(account.email, "Convite"),
    invite = invitation.text.match(/convite\/([^\s]+)/)[1];
  await post(worker, "/invitations/accept", { token: invite });
  expect((await worker.get("/api" + base + "/finance")).status()).toBe(403);
  expect((await worker.get("/api" + base + "/export")).status()).toBe(403);
  expect(
    (
      await worker.get(
        "/api" + base + "/operations/reports?from=2026-01-01&to=2026-12-31",
      )
    ).status(),
  ).toBe(403);
  const products = await (
    await worker.get("/api" + base + "/records/products")
  ).json();
  expect(products[0].data.priceCents).toBeUndefined();
  expect(products[0].data.costCents).toBeUndefined();
  expect(
    (
      await worker.put("/api" + base + "/records/products/" + product.id, {
        headers: { origin },
        data: { name: "Tentativa", version: 1 },
      })
    ).status(),
  ).toBe(403);
  expect((await stranger.get("/api" + base + "/overview")).status()).toBe(404);
  expect(
    (await worker.get("/api/" + other.id + "/operations/day")).status(),
  ).toBe(404);
  const preview = await owner.post(
    "/api" + base + "/operations/imports/preview",
    {
      headers: { origin },
      data: {
        kind: "clients",
        csv: "name;email\nQA Cliente;email-inválido",
        mapping: { name: "name", email: "email" },
      },
    },
  );
  expect(preview.ok()).toBe(true);
  expect((await preview.json()).invalid).toBe(1);
  const workerMe = await (await worker.get("/api/me")).json();
  await post(owner, base + "/operations/ownership/request", {
    userId: workerMe.user.id,
    password: ownerAuth.password,
  });
  const transfer = await mailFor(account.email, "transferência");
  const url = new URL(transfer.text.match(/http\S+/)[0]);
  expect(url.searchParams.get("company")).toBe(company.id);
  await post(worker, base + "/operations/ownership/accept", {
    token: url.searchParams.get("transfer"),
    password: account.password,
  });
  expect(
    (await (await worker.get("/api/me")).json()).companies.find(
      (c: any) => c.id === company.id,
    ).role,
  ).toBe("owner");
  expect(
    (await (await owner.get("/api/me")).json()).companies.find(
      (c: any) => c.id === company.id,
    ).role,
  ).toBe("admin");
  const replay = await worker.post(
    "/api" + base + "/operations/ownership/accept",
    {
      headers: { origin },
      data: {
        token: url.searchParams.get("transfer"),
        password: account.password,
      },
    },
  );
  expect(replay.status()).toBe(400);
  await owner.dispose();
  await worker.dispose();
  await stranger.dispose();
});
test("loja cria pedido por SKU, recebe parte e devolve ao estoque", async ({
  page,
  context,
  browser,
}, info) => {
  test.skip(
    info.project.name === "tablet",
    "Cobertura comercial em desktop e celular.",
  );
  const req = context.request;
  await signup(req, "QA · Loja " + info.project.name);
  const company = await post(req, "/companies", {
    name: "QA · Loja de camisetas",
    area: "Roupas e moda",
    profession: "Loja de roupas",
    businessModels: ["products", "stock"],
    offer: "products",
    state: "SP",
    city: "São Paulo",
    cityId: "3550308",
    stage: "operating",
    team: "solo",
    attendance: "mixed",
    goals: ["Finanças"],
    timezone: "America/Sao_Paulo",
    step: 6,
    complete: true,
  });
  const base = "/" + company.id;
  const client = await post(req, base + "/records/clients", {
    name: "QA · Cliente da loja",
  });
  const product = await post(req, base + "/records/products", {
    name: "Camiseta",
  });
  const variation = await post(req, base + "/records/products", {
    name: "Camiseta M",
    sku: "QA-M-AZUL",
    size: "M",
    color: "Azul",
    productType: "variation",
    parentProductId: product.id,
    trackStock: true,
    priceCents: 7500,
    publicCatalog: true,
  });
  await post(req, base + "/stock/move", {
    productId: variation.id,
    delta: 5,
    reason: "Saldo inicial QA",
    key: crypto.randomUUID(),
  });
  const stock = async () =>
    (await (await req.get("/api" + base + "/stock")).json()).items.find(
      (row: any) => row.product_id === variation.id,
    );
  await page.goto("/app/ordens?company=" + company.id);
  await page.getByRole("button", { name: "Rejeitar opcionais" }).click();
  await expect(
    page.getByRole("heading", { name: "Pedidos", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Novo pedido", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Título do pedido").fill("Pedido de duas camisetas");
  await dialog.getByLabel("Cliente", { exact: true }).selectOption(client.id);
  await dialog.getByLabel("Vencimento").fill(today());
  await dialog.getByLabel("Produto ou variação 1").selectOption(variation.id);
  await dialog.getByLabel("Quantidade 1").fill("2");
  await dialog.getByRole("button", { name: "Registrar pedido" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await stock()).toMatchObject({ quantity: 5, reserved: 2 });

  await page.getByRole("button", { name: "Concluir pedido" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Confirmar conclusão" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await stock()).toMatchObject({ quantity: 3, reserved: 0 });
  await page.getByRole("button", { name: "Registrar devolução" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Produto devolvido").selectOption(variation.id);
  await dialog.getByLabel("Quantidade devolvida").fill("1");
  await dialog.getByRole("button", { name: "Repor estoque" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await stock()).toMatchObject({ quantity: 4, reserved: 0 });

  const cash = await post(req, base + "/operations/accounts", {
    name: "Caixa da loja",
    type: "cash",
    openingCents: 0,
    openingDate: today(),
  });
  await page.goto("/app/financeiro?company=" + company.id);
  await page
    .getByRole("button", { name: "Registrar pagamento", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Valor pago / recebido (R$)").fill("50,00");
  await dialog.getByLabel("Conta financeira efetiva").selectOption(cash.id);
  await dialog.getByRole("button", { name: "Confirmar registro" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText(/Pedido · Pedido de duas camisetas/),
  ).toBeVisible();

  await page.goto("/app/produtos?company=" + company.id);
  await page.getByRole("button", { name: "Compartilhar catálogo" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Gerar link", exact: true }).click();
  await expect(dialog.getByLabel("Link do catálogo")).toHaveValue(
    /catalogo-publico/,
  );
  const link = await dialog.getByLabel("Link do catálogo").inputValue();
  const anon = await browser.newPage();
  try {
    await anon.goto(link);
    await expect(
      anon.getByRole("heading", { name: "Camiseta M", exact: true }),
    ).toBeVisible();
    await expect(
      anon.getByRole("heading", { name: "Camiseta", exact: true }),
    ).toHaveCount(0);
    await dialog
      .getByRole("button", { name: "Revogar link do catálogo" })
      .click();
    await expect(dialog.getByText("Catálogo privado.")).toBeVisible();
    await anon.reload();
    await expect(anon.getByText("Catálogo indisponível")).toBeVisible();
  } finally {
    await anon.close();
  }
});
