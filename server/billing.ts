import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { config } from "./config.js";
import { transaction, type Sql } from "./db.js";
import { assert, audit, type Context } from "./service.js";

type Plan = keyof typeof config.plans;
type Subscription = {
  provider_id: string;
  reference: string;
  plan: Plan;
  price_cents: number;
  checkout_url: string;
  status: string;
};

function settings() {
  const token = process.env.MERCADO_PAGO_TEST_TOKEN;
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  const seller = process.env.MERCADO_PAGO_TEST_SELLER_ID;
  const payer = process.env.MERCADO_PAGO_TEST_PAYER_EMAIL;
  if (
    !config.production &&
    /^TEST-[\w-]+$/.test(token ?? "") &&
    token &&
    secret &&
    seller &&
    /^\d+$/.test(seller) &&
    payer &&
    /^[^@\s]+@testuser\.com$/i.test(payer) &&
    config.url.startsWith("https://")
  )
    return { token, secret, seller, payer };
}
export const billingConfigured = () => Boolean(settings());
function credentials() {
  const value = settings();
  assert(
    value,
    "Mercado Pago Assinaturas em teste: configuração pendente",
    503,
  );
  return value;
}

async function request(
  path: string,
  method = "GET",
  body?: object,
  key?: string,
) {
  const { token } = credentials();
  const response = await fetch(new URL(path, "https://api.mercadopago.com"), {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "X-scope": "stage",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "X-Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(7000),
  }).catch(() => null);
  assert(response?.ok, "O Mercado Pago não confirmou a operação de teste", 502);
  return response.json();
}

const providerId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const cents = (value: unknown) =>
  typeof value === "number" || typeof value === "string"
    ? Math.round(Number(value) * 100)
    : NaN;
async function current(tx: Sql, company: string) {
  return (
    await tx.query<Subscription>(
      "SELECT * FROM sandbox_subscriptions WHERE company_id=$1 FOR UPDATE",
      [company],
    )
  ).rows[0];
}

export async function startCheckout(c: Context, plan: Plan) {
  assert(c.role === "owner", "Somente o proprietário pode contratar", 403);
  const { payer, seller } = credentials();
  await c.tx.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [
    c.companyId,
  ]);
  const previous = await current(c.tx, c.companyId);
  if (previous && previous.status !== "canceled") {
    assert(
      previous.plan === plan && previous.status === "pending",
      "Gerencie a assinatura existente antes de contratar outro plano",
      409,
    );
    return { url: previous.checkout_url };
  }

  // A referência é estável entre tentativas da mesma assinatura, inclusive após timeout.
  const reference = createHmac("sha256", config.secret)
    .update([c.companyId, previous?.provider_id ?? "initial", plan].join(":"))
    .digest("hex");
  const price = config.plans[plan];
  assert(
    Number.isSafeInteger(price.cents) && price.cents > 0,
    "Preço inválido",
    503,
  );
  const result = await request(
    "/preapproval",
    "POST",
    {
      reason:
        (process.env.BRAND_NAME || "Impulsa") + " " + price.name + " (teste)",
      payer_email: payer,
      back_url: config.url + "/app/assinatura?retorno=1",
      external_reference: reference,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        currency_id: "BRL",
        transaction_amount: price.cents / 100,
      },
    },
    reference,
  );
  assert(
    String(result.collector_id) === seller &&
      result.external_reference === reference,
    "Vendedor ou referência da assinatura divergente",
    502,
  );
  const id = providerId.parse(result.id);
  const url = z.url().parse(result.sandbox_init_point ?? result.init_point);
  const checkout = new URL(url);
  assert(
    checkout.protocol === "https:" &&
      !checkout.port &&
      !checkout.username &&
      !checkout.password &&
      [
        "www.mercadopago.com.br",
        "sandbox.mercadopago.com.br",
        "www.mercadopago.com",
        "sandbox.mercadopago.com",
      ].includes(checkout.hostname),
    "Endereço de checkout inválido",
    502,
  );
  await c.tx.query(
    `INSERT INTO sandbox_subscriptions(company_id,provider_id,reference,plan,price_cents,checkout_url)
     VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id) DO UPDATE SET
     provider_id=excluded.provider_id,reference=excluded.reference,plan=excluded.plan,
     price_cents=excluded.price_cents,checkout_url=excluded.checkout_url,status='pending'`,
    [c.companyId, id, reference, plan, price.cents, url],
  );
  await audit(c, "billing.checkout", id);
  return { url };
}

export async function cancelSubscription(c: Context) {
  assert(c.role === "owner", "Somente o proprietário pode cancelar", 403);
  await c.tx.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [
    c.companyId,
  ]);
  const subscription = await current(c.tx, c.companyId);
  assert(subscription, "Assinatura de teste não encontrada", 404);
  if (subscription.status === "canceled") return { status: "canceled" };
  const result = await request(
    "/preapproval/" + subscription.provider_id,
    "PUT",
    { status: "canceled" },
  );
  assert(
    result.status === "canceled",
    "Cancelamento ainda pendente no Mercado Pago",
    502,
  );
  await setStatus(c.tx, c.companyId, subscription, "canceled", null);
  await audit(c, "billing.cancel", subscription.provider_id);
  return { status: "canceled" };
}

async function setStatus(
  tx: Sql,
  company: string,
  sub: Subscription,
  status: string,
  debitDate: string | null,
) {
  await tx.query(
    "UPDATE sandbox_subscriptions SET status=$2 WHERE company_id=$1",
    [company, status],
  );
  await tx.query(
    `UPDATE companies SET plan=$2, subscription_status=$3,
       sandbox_paid_until=CASE WHEN $4::timestamptz IS NULL THEN NULL
         ELSE ($4::timestamptz AT TIME ZONE 'America/Sao_Paulo' + interval '1 month') AT TIME ZONE 'America/Sao_Paulo' END
     WHERE id=$1`,
    [company, status === "active" ? sub.plan : "essencial", status, debitDate],
  );
}

function validateSignature(req: Request) {
  const { secret } = credentials();
  const id = providerId.parse(req.query["data.id"]);
  const requestId = req.get("x-request-id");
  const signature = new Map(
    (req.get("x-signature") ?? "")
      .split(",")
      .map((part) => part.trim().split("=", 2) as [string, string]),
  );
  const ts = signature.get("ts");
  const v1 = signature.get("v1");
  assert(
    requestId &&
      ts &&
      /^\d{10,13}$/.test(ts) &&
      v1 &&
      /^[a-f0-9]{64}$/i.test(v1),
    "Assinatura inválida",
  );
  const epoch = Number(ts) * (ts.length <= 10 ? 1000 : 1);
  assert(Math.abs(Date.now() - epoch) <= 15 * 60_000, "Notificação expirada");
  const expected = createHmac("sha256", secret)
    .update(
      "id:" + id.toLowerCase() + ";request-id:" + requestId + ";ts:" + ts + ";",
    )
    .digest();
  assert(
    timingSafeEqual(expected, Buffer.from(v1, "hex")),
    "Assinatura inválida",
  );
  return id;
}

export async function mercadoPagoWebhook(req: Request, res: Response) {
  const id = validateSignature(req);
  assert(
    req.body?.live_mode !== true && String(req.body?.data?.id) === id,
    "Notificação incompatível com o ambiente de teste",
  );
  const topic = req.body.type;
  let subscriptionId: string;
  if (topic === "subscription_preapproval") subscriptionId = id;
  else if (topic === "subscription_authorized_payment") {
    const invoice = await request("/authorized_payments/" + id);
    subscriptionId = providerId.parse(invoice.preapproval_id);
  } else if (topic === "payment") {
    const invoices = await request(
      "/authorized_payments/search?payment_id=" + id,
    );
    const invoice = invoices.results?.find(
      (item: { payment?: { id?: string | number } }) =>
        String(item.payment?.id) === id,
    );
    if (!invoice) return res.json({ received: true });
    subscriptionId = providerId.parse(invoice.preapproval_id);
  } else return res.json({ received: true });

  await transaction(async (tx) => {
    const company = (
      await tx.query("SELECT resolve_sandbox_subscription($1) AS id", [
        subscriptionId,
      ])
    ).rows[0]?.id;
    if (!company) return;
    await tx.query(
      "SELECT set_config('app.company_id',$1,true),set_config('app.user_id',resolve_company_owner($1),true)",
      [company],
    );
    await tx.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [
      company,
    ]);
    const sub = await current(tx, company);
    if (sub?.provider_id !== subscriptionId) return;

    // Releitura do provedor após obter o lock evita aplicar snapshots fora de ordem.
    const remote = await request("/preapproval/" + subscriptionId);
    assert(
      remote.id === subscriptionId &&
        remote.external_reference === sub.reference &&
        String(remote.collector_id) === credentials().seller &&
        remote.auto_recurring?.currency_id === "BRL" &&
        remote.auto_recurring?.frequency === 1 &&
        remote.auto_recurring?.frequency_type === "months" &&
        cents(remote.auto_recurring?.transaction_amount) === sub.price_cents,
      "Vínculo ou valor da assinatura divergente",
      422,
    );

    let status =
      remote.status === "canceled"
        ? "canceled"
        : remote.status === "paused"
          ? "paused"
          : "pending";
    let paidDate: string | null = null;
    if (remote.status === "authorized") {
      const invoices = await request(
        "/authorized_payments/search?preapproval_id=" +
          subscriptionId +
          "&limit=50",
      );
      const invoice = (invoices.results ?? [])
        .filter(
          (item: { preapproval_id: string; debit_date: string }) =>
            item.preapproval_id === subscriptionId &&
            Date.parse(item.debit_date) <= Date.now(),
        )
        .sort(
          (left: { debit_date: string }, right: { debit_date: string }) =>
            Date.parse(right.debit_date) - Date.parse(left.debit_date),
        )[0];
      if (invoice?.payment?.id) {
        const paymentId = providerId.parse(String(invoice.payment.id));
        const payment = await request("/v1/payments/" + paymentId);
        assert(
          String(payment.id) === paymentId &&
            payment.live_mode === false &&
            String(payment.collector_id) === credentials().seller &&
            payment.currency_id === "BRL" &&
            cents(payment.transaction_amount) === sub.price_cents,
          "Pagamento divergente",
          422,
        );
        if (
          payment.status === "approved" &&
          !(Number(payment.transaction_amount_refunded) > 0)
        ) {
          status = "active";
          paidDate = new Date(invoice.debit_date).toISOString();
        } else if (
          ["refunded", "charged_back", "in_mediation"].includes(
            payment.status,
          ) ||
          Number(payment.transaction_amount_refunded) > 0
        )
          status = "refunded";
      }
    }
    await setStatus(tx, company, sub, status, paidDate);
    if (status !== sub.status)
      await tx.query(
        "INSERT INTO billing_events(id,company_id,type,status) VALUES($1,$2,$3,$4)",
        [randomUUID(), company, "Mercado Pago · " + topic, status],
      );
  });
  return res.json({ received: true });
}
