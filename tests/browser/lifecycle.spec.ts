import { test, expect, type APIRequestContext } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { totp } from "./helpers";
const origin = process.env.IMPULSA_TEST_URL ?? "http://localhost:3000";
async function messageFor(email: string, subject: string) {
  let result: any;
  await expect
    .poll(async () => {
      for (const f of (await readdir(".data/mail")).reverse()) {
        const m = JSON.parse(
          await readFile(path.join(".data/mail", f), "utf8"),
        );
        if (m.to === email && m.subject.includes(subject)) {
          result = m;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return result;
}
async function post(req: APIRequestContext, url: string, data: any) {
  return req.post(url, { data, headers: { origin } });
}
test("conta real local, confirmação, onboarding, fluxo conectado, privacidade, arquivo e recuperação", async ({
  page,
  context,
  playwright,
  browser,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Fluxo de integração executado uma vez; layout é verificado nos três tamanhos.",
  );
  page.setDefaultTimeout(10000);
  page.on("response", async (r) => {
    if (r.url().includes("/api/") && r.status() >= 400)
      console.log("HTTP", r.status(), r.url(), await r.text());
  });
  const unique = `${Date.now()}@example.test`;
  const password = "Teste-local-exclusivo-2026!";
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/cadastro");
  await page.getByRole("button", { name: "Rejeitar opcionais" }).click();
  await page.getByLabel("Seu nome").fill("Pessoa de Teste");
  await page.getByLabel("E-mail", { exact: true }).fill(unique);
  await page.locator("input[name=password]").fill(password);
  await page.locator("input[name=terms]").check();
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(
    page.getByRole("heading", { name: "Qual é a sua área de atuação?" }),
  ).toBeVisible();
  const mail = await messageFor(unique, "Confirme");
  const url = mail.text.match(/http\S+/)[0];
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Qual é a sua área de atuação?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tecnologia", exact: true }).click();
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.getByText("Desenvolvedor", { exact: true }).click();
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.screenshot({ path: "test-results/onboarding-step3.png" });
  await expect(
    page.getByRole("heading", { name: "Onde seu negócio acontece?" }),
  ).toBeVisible();
  await page.getByLabel("Estado", { exact: true }).selectOption("SP");
  await page.getByLabel("Cidade").fill("São Paulo");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.getByLabel("Nome do negócio").fill("Empresa de teste isolada");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "O que sua empresa precisa comprar?" }),
  ).toBeVisible();
  await page
    .getByLabel("Sua empresa compra materiais, produtos ou equipamentos?")
    .selectOption("no");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.getByText("Finanças", { exact: true }).click();
  await page.getByRole("button", { name: "Abrir meu negócio" }).click();
  await expect(page.getByRole("heading", { name: /Pessoa/ })).toBeVisible();
  const me = await (await context.request.get("/api/me")).json();
  expect(me.consent.terms_version).toBe("2026-11-09-operacao");
  const company = me.companies[0].id;
  const base = `/api/${company}`;
  const empty = await (await context.request.get(`${base}/overview`)).json();
  expect(empty.records).toEqual([]);
  expect(empty.finance).toEqual([]);
  async function create(kind: string, data: any) {
    const r = await post(context.request, `${base}/records/${kind}`, data);
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  }
  const client = await create("clients", { name: "Cliente do teste" });
  const material = await create("products", {
    name: "Material do teste",
    priceCents: 1000,
    costCents: 500,
  });
  let r = await post(context.request, `${base}/stock/move`, {
    productId: material.id,
    delta: 10,
    reason: "Entrada teste",
    key: crypto.randomUUID(),
  });
  expect(r.ok()).toBe(true);
  const service = await create("products", {
    name: "Serviço do teste",
    priceCents: 20000,
    costCents: 10000,
    materials: [{ productId: material.id, quantity: 2 }],
  });
  r = await post(context.request, `${base}/quotes`, {
    clientId: client.id,
    title: "Proposta de teste",
    validUntil: "2099-01-01",
    items: [
      {
        productId: service.id,
        name: "Serviço do teste",
        quantity: 1,
        priceCents: 20000,
        costCents: 10000,
        materials: [{ productId: material.id, quantity: 2 }],
      },
    ],
  });
  expect(r.ok(), await r.text()).toBe(true);

  const originalQuote = await r.json();
  async function quoteAction(id: string, action: string) {
    const response = await post(
      context.request,
      `${base}/quotes/${id}/action`,
      { action },
    );
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  await quoteAction(originalQuote.id, "send");
  const originalShare = await quoteAction(originalQuote.id, "share");
  const customerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const customer = await customerContext.newPage();
  let quote;
  let share;
  try {
    await customer.goto(originalShare.url);
    await customer.getByRole("button", { name: "Rejeitar opcionais" }).click();
    await customer.getByText("Pedir ajustes", { exact: true }).click();
    await customer.getByLabel("Seu nome").fill("Cliente teste");
    await customer
      .getByLabel("O que precisa mudar?")
      .fill("Confirme o acabamento antes da instalação.");
    await customer
      .getByRole("button", { name: "Enviar pedido de ajuste" })
      .click();
    await expect(
      customer.getByText("Situação: Ajustes solicitados"),
    ).toBeVisible();

    const overview = await (
      await context.request.get(`${base}/overview`)
    ).json();
    expect(overview.quotes[0]).toMatchObject({
      status: "adjustment_requested",
      adjustment_contact: "Cliente teste",
    });
    await page.goto("/app/propostas");
    await page.getByText("Ler pedido de ajuste", { exact: true }).click();
    await expect(
      page.getByText("Confirme o acabamento antes da instalação."),
    ).toBeVisible();
    const revision = await post(
      context.request,
      `${base}/operations/quotes/${originalQuote.id}/revision`,
      {},
    );
    expect(revision.ok(), await revision.text()).toBe(true);
    quote = await revision.json();
    await quoteAction(quote.id, "send");
    share = await quoteAction(quote.id, "share");
    await customer.goto(share.url);
    await customer.getByLabel("Nome de quem aprova").fill("Cliente teste");
    await customer
      .getByRole("checkbox", { name: /Confirmo a aprovação/ })
      .check();
    await customer.getByRole("button", { name: "Registrar aprovação" }).click();
    await expect(customer.getByText("Situação: Aprovada")).toBeVisible();
  } finally {
    await customerContext.close();
  }
  await quoteAction(quote.id, "convert");
  await quoteAction(quote.id, "convert");
  const anonymous = await playwright.request.newContext();
  const shared = await (
    await anonymous.get(share.url.replace("/proposta/", "/api/shared/"))
  ).json();
  expect(JSON.stringify(shared)).not.toContain("costCents");
  expect(JSON.stringify(shared)).not.toContain("clientId");
  expect(JSON.stringify(shared)).not.toContain("notes");
  await quoteAction(quote.id, "revoke");
  expect(
    (
      await anonymous.get(share.url.replace("/proposta/", "/api/shared/"))
    ).status(),
  ).toBe(404);
  let overview = await (await context.request.get(`${base}/overview`)).json();
  expect(overview.orders).toHaveLength(1);
  const order = overview.orders[0];
  const finance = await (await context.request.get(`${base}/finance`)).json();
  expect(finance.ledger).toHaveLength(1);
  const key = crypto.randomUUID();
  for (let i = 0; i < 2; i++) {
    r = await post(
      context.request,
      `${base}/finance/${finance.ledger[0].id}/pay`,
      { amountCents: 10000, key, date: "2026-11-08" },
    );
    expect(r.ok(), await r.text()).toBe(true);
  }
  for (let i = 0; i < 2; i++)
    expect(
      (
        await post(context.request, `${base}/orders/${order.id}/complete`, {})
      ).ok(),
    ).toBe(true);
  overview = await (await context.request.get(`${base}/overview`)).json();
  expect(
    overview.stock.find((s: any) => s.product_id === material.id),
  ).toMatchObject({ quantity: 8, reserved: 0 });
  expect(
    overview.records.filter((r: any) => r.kind === "aftersales"),
  ).toHaveLength(1);
  await page.goto("/app/clientes");
  await expect(
    page.getByRole("cell", { name: /Cliente do teste/ }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
  await page
    .getByLabel("Nome", { exact: true })
    .fill("Cliente pelo formulário");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: /Cliente pelo formulário/ }).first(),
  ).toBeVisible();
  await page.goto("/app/financeiro");
  await expect(
    page.getByRole("cell", { name: "R$ 100,00", exact: true }).first(),
  ).toBeVisible();
  const pdf = await context.request.get(`${base}/quotes/${quote.id}/pdf`);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const upload = await context.request.post(`${base}/files`, {
    headers: { origin },
    multipart: {
      category: "Teste",
      file: {
        name: "proposta.pdf",
        mimeType: "application/pdf",
        buffer: await pdf.body(),
      },
    },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const file = await upload.json();
  const link = await (
    await post(context.request, `${base}/files/${file.id}/link`, {})
  ).json();
  expect((await anonymous.get(origin + link.url)).status()).toBe(401);
  expect((await context.request.get(link.url)).ok()).toBe(true);
  r = await post(context.request, `${base}/privacy`, {
    type: "access",
    details: "Solicitação de teste local",
  });
  expect(r.ok()).toBe(true);
  expect((await context.request.get(`${base}/export`)).ok()).toBe(true);
  await page.screenshot({
    path: "test-results/financeiro-real-desktop.png",
    fullPage: true,
  });
  // Segunda conta: isolamento HTTP e convite/revogação imediata.
  const other = await playwright.request.newContext({ baseURL: origin });
  const otherEmail = `b-${unique}`;
  const second = await post(other, "/api/auth/sign-up/email", {
    email: otherEmail,
    password,
    name: "Outra Pessoa",
    termsAccepted: true,
    promotional: false,
    callbackURL: "/app",
  });
  expect(second.ok(), await second.text()).toBe(true);
  const otherMail = await messageFor(otherEmail, "Confirme");
  await other.get(otherMail.text.match(/http\S+/)[0]);
  expect((await other.get(`${base}/overview`)).status()).toBe(404);
  expect((await other.get(origin + link.url)).status()).toBe(404);
  const forged = await other.post(`${base}/records/clients`, {
    data: { name: "Origem inválida" },
    headers: { origin: "https://invalid.example" },
  });
  expect(forged.status()).toBe(403);
  const invite = await post(context.request, `${base}/team/invite`, {
    email: otherEmail,
    role: "member",
  });
  expect(invite.ok(), await invite.text()).toBe(true);
  const invitationMail = await messageFor(otherEmail, "Convite");
  const inviteToken = invitationMail.text.match(/convite\/([A-Za-z0-9_-]+)/)[1];
  expect(
    (await post(other, "/api/invitations/accept", { token: inviteToken })).ok(),
  ).toBe(true);
  expect((await other.get(`${base}/overview`)).ok()).toBe(true);
  expect((await other.get(`${base}/finance`)).status()).toBe(403);
  expect((await other.get(`${base}/export`)).status()).toBe(403);
  const otherMe = await (await other.get("/api/me")).json();
  expect(
    (
      await context.request.delete(`${base}/team/${otherMe.user.id}`, {
        headers: { origin },
      })
    ).ok(),
  ).toBe(true);
  expect((await other.get(`${base}/overview`)).status()).toBe(404);
  await other.dispose();
  // MFA usa a biblioteca real, sem alterar tabelas nem desativar sua verificação.
  const enabled = await post(context.request, "/api/auth/two-factor/enable", {
    password,
  });
  expect(enabled.ok(), await enabled.text()).toBe(true);
  const setup = await enabled.json();
  expect(setup.backupCodes.length).toBeGreaterThan(0);
  expect(
    (
      await post(context.request, "/api/auth/two-factor/verify-totp", {
        code: totp(setup.totpURI),
      })
    ).ok(),
  ).toBe(true);
  expect(
    (await (await context.request.get("/api/me")).json()).user.twoFactorEnabled,
  ).toBe(true);
  await post(context.request, "/api/auth/sign-out", {});
  const signIn = await post(context.request, "/api/auth/sign-in/email", {
    email: unique,
    password,
  });
  expect((await signIn.json()).twoFactorRedirect).toBe(true);
  expect((await context.request.get("/api/me")).status()).toBe(401);
  expect(
    (
      await post(context.request, "/api/auth/two-factor/verify-backup-code", {
        code: setup.backupCodes[0],
      })
    ).ok(),
  ).toBe(true);
  expect((await context.request.get("/api/me")).ok()).toBe(true);
  await page.goto("/recuperar");
  await page.getByLabel("E-mail", { exact: true }).fill(unique);
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  await expect(page.getByRole("status")).toContainText("Se houver uma conta");
  const reset = await messageFor(unique, "Redefina");
  await page.goto(reset.text.match(/http\S+/)[0]);
  await page.locator("input[name=password]").fill(password + "Nova");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByRole("status")).toContainText("Senha alterada");
  expect((await context.request.get("/api/me")).status()).toBe(401);
  expect(errors).toEqual([]);
  await anonymous.dispose();
});
