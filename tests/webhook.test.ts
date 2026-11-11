import { createHmac } from "node:crypto";
import type { Request, Response } from "express";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

process.env.MERCADO_PAGO_TEST_TOKEN = "TEST-local-fixture";
process.env.MERCADO_PAGO_WEBHOOK_SECRET = "fixture-secret";
process.env.MERCADO_PAGO_TEST_SELLER_ID = "47";
process.env.MERCADO_PAGO_TEST_PAYER_EMAIL = "buyer@testuser.com";
process.env.APP_URL = "https://impulsa.example.test";
const { sql, migrate, closeDb } = await import("../server/db");
const { mercadoPagoWebhook } = await import("../server/billing");

beforeAll(async () => {
  await migrate();
  await sql.query(`INSERT INTO "user"(id,name,email,"createdAt","updatedAt")
    VALUES ('billing-owner','Teste','billing@example.test',now(),now())`);
  await sql.query(
    "INSERT INTO companies(id,name) VALUES('billing-company','Empresa teste')",
  );
  await sql.query(
    "INSERT INTO memberships VALUES('billing-company','billing-owner','owner')",
  );
  await sql.query(`INSERT INTO sandbox_subscriptions(company_id,provider_id,reference,plan,price_cents,checkout_url)
    VALUES('billing-company','sandbox-id','reference','completo',9900,'https://www.mercadopago.com.br')`);
});
afterAll(closeDb);
afterEach(() => vi.unstubAllGlobals());

function notification(
  topic = "subscription_preapproval",
  id = "sandbox-id",
  secret = "fixture-secret",
) {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac("sha256", secret)
    .update(`id:${id};request-id:fixture;ts:${ts};`)
    .digest("hex");
  const headers: Record<string, string> = {
    "x-signature": `ts=${ts},v1=${v1}`,
    "x-request-id": "fixture",
  };
  return {
    body: { live_mode: false, type: topic, data: { id } },
    query: { "data.id": id },
    get: (key: string) => headers[key],
  } as unknown as Request;
}
const response = { json: () => ({}) } as Response;
const company = async () =>
  (
    await sql.query(
      "SELECT plan,subscription_status,sandbox_paid_until FROM companies WHERE id='billing-company'",
    )
  ).rows[0];

it("valida assinatura, vínculo, pagamento, renovação, repetição, estorno e cancelamento", async () => {
  let status = "authorized";
  let paymentStatus = "approved";
  let amount = 99;
  let debitDate = new Date(Date.now() - 86_400_000).toISOString();
  const invoice = () => ({
    preapproval_id: "sandbox-id",
    debit_date: debitDate,
    payment: { id: 11 },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) => {
      if (url.pathname === "/preapproval/sandbox-id")
        return ResponseFor({
          id: "sandbox-id",
          external_reference: "reference",
          collector_id: 47,
          status,
          auto_recurring: {
            currency_id: "BRL",
            frequency: 1,
            frequency_type: "months",
            transaction_amount: 99,
          },
        });
      if (url.pathname === "/authorized_payments/search")
        return ResponseFor({ results: [invoice()] });
      if (url.pathname === "/authorized_payments/5")
        return ResponseFor(invoice());
      if (url.pathname === "/v1/payments/11")
        return ResponseFor({
          id: 11,
          live_mode: false,
          collector_id: 47,
          currency_id: "BRL",
          transaction_amount: amount,
          status: paymentStatus,
        });
      throw new Error("Requisição inesperada");
    }),
  );
  await expect(
    mercadoPagoWebhook(
      notification("subscription_preapproval", "sandbox-id", "invalid"),
      response,
    ),
  ).rejects.toMatchObject({ status: 400 });
  paymentStatus = "pending";
  await mercadoPagoWebhook(notification(), response);
  expect(await company()).toMatchObject({
    plan: "essencial",
    subscription_status: "pending",
  });
  paymentStatus = "approved";
  amount = 98;
  await expect(
    mercadoPagoWebhook(notification(), response),
  ).rejects.toMatchObject({ status: 422 });
  amount = 99;
  await mercadoPagoWebhook(notification(), response);
  await mercadoPagoWebhook(notification(), response);
  const active = await company();
  expect(active).toMatchObject({
    plan: "completo",
    subscription_status: "active",
  });
  expect(
    (await sql.query("SELECT * FROM billing_events WHERE status='active'"))
      .rows,
  ).toHaveLength(1);

  debitDate = new Date(Date.now() - 3600_000).toISOString();
  await mercadoPagoWebhook(
    notification("subscription_authorized_payment", "5"),
    response,
  );
  expect(
    new Date((await company()).sandbox_paid_until).getTime(),
  ).toBeGreaterThan(new Date(active.sandbox_paid_until).getTime());

  paymentStatus = "refunded";
  await mercadoPagoWebhook(notification("payment", "11"), response);
  expect(await company()).toMatchObject({
    plan: "essencial",
    subscription_status: "refunded",
    sandbox_paid_until: null,
  });
  status = "canceled";
  await mercadoPagoWebhook(notification(), response);
  expect(await company()).toMatchObject({ subscription_status: "canceled" });
});

function ResponseFor(data: object) {
  return globalThis.Response.json(data);
}
