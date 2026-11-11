import { z } from "zod";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import { transaction, type Sql } from "./db.js";
import {
  quoteSchema,
  quoteTotals,
  recordSchema,
  type Kind,
} from "../shared/domain.js";
import { canCosts } from "../shared/access.js";
import { config } from "./config.js";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}
export function assert(ok: unknown, message: string, status = 400): asserts ok {
  if (!ok) throw new HttpError(status, message);
}
export type Actor = {
  id: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean | null;
};
export type Context = {
  tx: Sql;
  companyId: string;
  userId: string;
  role: string;
  company: any;
};
export function subscriptionActive(company: {
  subscription_status?: string;
  sandbox_paid_until?: string | Date | null;
}) {
  return (
    company.subscription_status === "active" &&
    (!company.sandbox_paid_until ||
      new Date(company.sandbox_paid_until) > new Date())
  );
}
const permissions: Record<string, string[]> = {
  owner: ["read", "write", "finance", "team", "settings", "export"],
  admin: ["read", "write", "finance", "team", "settings", "export"],
  member: ["read", "write"],
  finance: ["read", "finance", "export"],
  sales: ["read", "write", "export"],
  operations: ["read", "write"],
  readonly: ["read"],
};
export async function tenant<T>(
  actor: Actor,
  companyId: string,
  permission: string,
  fn: (ctx: Context) => Promise<T>,
  write = false,
  pendingProfile = false,
  premiumWrite = false,
): Promise<T> {
  assert(
    actor.emailVerified !== false || pendingProfile,
    "Confirme seu e-mail para acessar os módulos do negócio",
    403,
  );
  return transaction(async (tx) => {
    await tx.query("SELECT set_config('app.user_id',$1,true)", [actor.id]);
    const m = (
      await tx.query(
        "SELECT m.role,c.* FROM memberships m JOIN companies c ON c.id=m.company_id WHERE m.user_id=$1 AND m.company_id=$2",
        [actor.id, companyId],
      )
    ).rows[0];
    assert(m, "Empresa não encontrada", 404);
    assert(
      permissions[m.role]?.includes(permission),
      "Seu papel não permite esta ação",
      403,
    );
    if (
      write &&
      ["owner", "admin"].includes(m.role) &&
      config.enforceMfa &&
      !(pendingProfile && actor.emailVerified === false)
    )
      assert(
        actor.twoFactorEnabled,
        "Ative a autenticação em duas etapas em Segurança para continuar",
        403,
      );
    if (
      write &&
      !["settings", "team"].includes(permission) &&
      !subscriptionActive(m) &&
      new Date(m.trial_end) < new Date() &&
      !(
        premiumWrite &&
        (
          await tx.query(
            "SELECT 1 FROM company_entitlements WHERE company_id=$1 AND expires_at>now()",
            [companyId],
          )
        ).rows.length
      )
    )
      throw new HttpError(
        402,
        "O teste terminou. Seus dados continuam disponíveis para consulta e exportação. Configure uma assinatura para novas alterações.",
      );
    await tx.query(
      "SELECT set_config('app.company_id',$1,true),set_config('app.user_id',$2,true)",
      [companyId, actor.id],
    );
    if (write) await rate(tx, `write:${companyId}:${actor.id}`, 120, 60);
    return fn({ tx, companyId, userId: actor.id, role: m.role, company: m });
  });
}
export async function audit(c: Context, action: string, id = "") {
  await c.tx.query(
    "INSERT INTO audit(id,company_id,user_id,action,entity_id) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), c.companyId, c.userId, action, id],
  );
}
export async function rate(tx: Sql, key: string, max: number, seconds = 60) {
  const r = (
    await tx.query(
      "INSERT INTO rate_buckets(key,count,expires) VALUES($1,1,now()+($2::text||' seconds')::interval) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_buckets.expires<now() THEN 1 ELSE rate_buckets.count+1 END,expires=CASE WHEN rate_buckets.expires<now() THEN EXCLUDED.expires ELSE rate_buckets.expires END RETURNING count",
      [key, seconds],
    )
  ).rows[0];
  assert(
    r.count <= max,
    "Muitas solicitações. Tente novamente em alguns minutos.",
    429,
  );
}
export async function findRecord(c: Context, id: string, kind?: string) {
  const r = (
    await c.tx.query(
      "SELECT * FROM records WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL",
      [c.companyId, id],
    )
  ).rows[0];
  assert(r && (!kind || r.kind === kind), "Registro não encontrado", 404);
  return r;
}
export async function saveRecord(
  c: Context,
  kind: Kind,
  input: unknown,
  id?: string,
  expectedVersion?: number,
) {
  const data = recordSchema.parse(input);
  if (kind === "opportunities")
    assert(data.clientId, "Selecione o cliente da oportunidade");
  if (
    (data.stage === "lost" || data.pipelineStage === "lost") &&
    kind === "opportunities"
  )
    assert(data.lossReason.trim(), "Informe o motivo da perda");
  if (kind === "products" && data.productType === "variation")
    assert(data.parentProductId, "Selecione o produto base da variação");
  if (data.parentProductId) {
    assert(
      kind === "products" &&
        data.productType === "variation" &&
        data.parentProductId !== id,
      "Variação inválida",
    );
    await findRecord(c, data.parentProductId, "products");
  }
  if (kind === "clients") {
    await c.tx.query("SELECT id FROM companies WHERE id=$1 FOR NO KEY UPDATE", [
      c.companyId,
    ]);
    const candidates = (
      await c.tx.query(
        "SELECT id,data FROM records WHERE company_id=$1 AND kind='clients' AND deleted_at IS NULL AND id<>$2",
        [c.companyId, id ?? ""],
      )
    ).rows;
    const norm = (v: string) =>
      v
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim();
    const duplicate = candidates.some(
      (r) =>
        (data.email &&
          data.email.toLowerCase() === r.data.email?.toLowerCase()) ||
        (data.phone.replace(/\D/g, "").length >= 8 &&
          data.phone.replace(/\D/g, "") === r.data.phone?.replace(/\D/g, "")) ||
        norm(data.name) === norm(r.data.name),
    );
    if (duplicate && !data.allowDuplicate)
      throw new HttpError(
        409,
        "Possível cliente duplicado. Revise nome, telefone e e-mail; confirme a criação separada se forem cadastros diferentes.",
        { allowDuplicate: "Confirme a revisão da possível duplicidade." },
      );
  }
  if (
    kind === "appointments" &&
    !["inactive", "done"].includes(data.status) &&
    !["completed", "cancelled"].includes(data.bookingStatus)
  ) {
    assert(
      data.due && data.startTime && (data.endTime || data.durationMinutes > 0),
      "Informe data, horário e duração do agendamento",
    );
    const minutes = (v: string) =>
      Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
    const start = minutes(data.startTime),
      end = data.endTime ? minutes(data.endTime) : start + data.durationMinutes;
    assert(
      end > start && end < 1440,
      "O término deve ocorrer depois do início, no mesmo dia",
    );
    data.endTime = `${Math.floor(end / 60)
      .toString()
      .padStart(2, "0")}:${(end % 60).toString().padStart(2, "0")}`;
    data.durationMinutes = end - start;
    await c.tx.query("SELECT id FROM companies WHERE id=$1 FOR NO KEY UPDATE", [
      c.companyId,
    ]);
    const bookings = (
      await c.tx.query(
        "SELECT id,data FROM records WHERE company_id=$1 AND kind='appointments' AND deleted_at IS NULL AND id<>$2 AND data->>'due'=$3 AND coalesce(data->>'assignee','')=$4",
        [c.companyId, id ?? "", data.due, data.assignee],
      )
    ).rows;
    assert(
      !bookings.some(
        (b) =>
          !["done", "inactive"].includes(b.data.status) &&
          !["cancelled", "completed"].includes(b.data.bookingStatus) &&
          b.data.startTime &&
          b.data.endTime &&
          minutes(b.data.startTime) < end &&
          minutes(b.data.endTime) > start,
      ),
      "Este responsável já tem compromisso ou bloqueio neste horário",
      409,
    );
  }
  if (data.startTime && data.endTime)
    assert(
      data.endTime > data.startTime,
      "O horário final deve ser posterior ao inicial",
    );
  if (data.supplierId) await findRecord(c, data.supplierId, "suppliers");
  for (const id of data.attachments)
    assert(
      (
        await c.tx.query("SELECT 1 FROM files WHERE company_id=$1 AND id=$2", [
          c.companyId,
          id,
        ])
      ).rows.length,
      "Anexo não encontrado nesta empresa",
      404,
    );
  if (data.clientId) await findRecord(c, data.clientId, "clients");
  if (data.assignee) {
    assert(
      (
        await c.tx.query(
          "SELECT 1 FROM memberships WHERE company_id=$1 AND user_id=$2",
          [c.companyId, data.assignee],
        )
      ).rows.length,
      "Responsável não pertence à equipe",
    );
  }
  for (const m of data.materials) {
    assert(m.productId !== id, "O item não pode ser material de si mesmo");
    await findRecord(c, m.productId, "products");
  }
  if (id) {
    const previous = await findRecord(c, id, kind);
    await c.tx.query(
      "INSERT INTO record_versions(company_id,record_id,version,data,user_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [
        c.companyId,
        id,
        previous.version,
        JSON.stringify(previous.data),
        c.userId,
      ],
    );
    const updated = await c.tx.query(
      "UPDATE records SET data=$3,updated_at=now(),version=version+1 WHERE company_id=$1 AND id=$2 AND ($4::integer IS NULL OR version=$4) RETURNING id",
      [c.companyId, id, JSON.stringify(data), expectedVersion ?? null],
    );
    assert(
      updated.rows.length,
      "Este registro foi alterado em outra aba. Reabra a versão atual antes de salvar; os dados digitados foram preservados.",
      409,
    );
  } else {
    const count = (
      await c.tx.query(
        "SELECT count(*)::int AS n FROM records WHERE company_id=$1 AND deleted_at IS NULL",
        [c.companyId],
      )
    ).rows[0].n;
    const limit =
      c.company.plan === "completo"
        ? config.plans.completo.records
        : config.plans.essencial.records;
    assert(count < limit, "Limite de registros do plano atingido", 402);
    id = randomUUID();
    await c.tx.query(
      "INSERT INTO records(id,company_id,kind,data) VALUES($1,$2,$3,$4)",
      [id, c.companyId, kind, JSON.stringify(data)],
    );
    if (kind === "products")
      await c.tx.query(
        "INSERT INTO stock(id,company_id,product_id) VALUES($1,$2,$3)",
        [randomUUID(), c.companyId, id],
      );
  }
  const saved = (
    await c.tx.query(
      "SELECT version FROM records WHERE company_id=$1 AND id=$2",
      [c.companyId, id],
    )
  ).rows[0];
  await c.tx.query(
    "INSERT INTO record_versions(company_id,record_id,version,data,user_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
    [c.companyId, id, saved.version, JSON.stringify(data), c.userId],
  );
  await audit(c, `${kind}.save`, id);
  return { id, data, version: saved.version };
}
export async function createQuote(
  c: Context,
  input: unknown,
  id?: string,
  expectedVersion?: number,
) {
  let raw = input as any;
  if (!canCosts(c.role)) {
    raw = {
      ...raw,
      items: await Promise.all(
        (raw.items ?? []).map(async (i: any) => {
          const product = i.productId
            ? await findRecord(c, i.productId, "products")
            : null;
          return {
            ...i,
            costCents: product?.data.costCents ?? 0,
            costKnown: product?.data.costKnown ?? false,
          };
        }),
      ),
    };
  }
  const data = quoteSchema.parse(raw);
  const client = await findRecord(c, data.clientId, "clients");
  if (data.opportunityId) {
    const opportunity = await findRecord(
      c,
      data.opportunityId,
      "opportunities",
    );
    assert(
      opportunity.data.clientId === data.clientId,
      "A oportunidade pertence a outro cliente",
    );
  }
  for (const i of data.items) {
    if (i.productId) await findRecord(c, i.productId, "products");
    assert(
      !i.stockProduct || !i.materials.some((m) => m.productId === i.productId),
      "Não reserve o mesmo SKU como item e como componente do próprio item",
    );
    for (const m of i.materials) await findRecord(c, m.productId, "products");
  }
  const totals = quoteTotals(data);
  const snapshot = {
    ...data,
    client: { name: client.data.name },
    companyName: c.company.name,
  };
  if (id) {
    const q = await getQuote(c, id);
    assert(q.status === "draft", "Somente rascunhos podem ser editados");
    assert(
      expectedVersion === undefined || q.version === expectedVersion,
      "Proposta alterada em outra aba. Reabra a versão atual.",
      409,
    );
    await c.tx.query(
      "UPDATE quotes SET data=$3,total_cents=$4,cost_cents=$5,version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",
      [
        c.companyId,
        id,
        JSON.stringify(snapshot),
        totals.totalCents,
        totals.costCents,
      ],
    );
  } else {
    id = randomUUID();
    const n = (
      await c.tx.query("SELECT next_quote_number($1,$2) AS quote_sequence", [
        c.companyId,
        c.userId,
      ])
    ).rows[0].quote_sequence;
    await c.tx.query(
      "INSERT INTO quotes(id,company_id,number,data,total_cents,cost_cents) VALUES($1,$2,$3,$4,$5,$6)",
      [
        id,
        c.companyId,
        n,
        JSON.stringify(snapshot),
        totals.totalCents,
        totals.costCents,
      ],
    );
  }
  await audit(c, "quote.save", id);
  const saved = (
    await c.tx.query(
      "SELECT version,data FROM quotes WHERE company_id=$1 AND id=$2",
      [c.companyId, id],
    )
  ).rows[0];
  await c.tx.query(
    "INSERT INTO quote_versions(company_id,quote_id,version,data) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [c.companyId, id, saved.version, JSON.stringify(saved.data)],
  );
  return { id, version: saved.version, ...totals };
}
export async function getQuote(c: Context, id: string) {
  const q = (
    await c.tx.query(
      "SELECT * FROM quotes WHERE company_id=$1 AND id=$2 FOR UPDATE",
      [c.companyId, id],
    )
  ).rows[0];
  assert(q, "Proposta não encontrada", 404);
  return q;
}
export async function movement(
  c: Context,
  productId: string,
  delta: number,
  reservedDelta: number,
  reason: string,
  key: string,
  expires?: string,
  orderId?: string,
) {
  await findRecord(c, productId, "products");
  const exists = (
    await c.tx.query(
      "SELECT id,product_id,delta,reserved_delta,reason,order_id FROM movements WHERE company_id=$1 AND idempotency_key=$2",
      [c.companyId, key],
    )
  ).rows[0];
  if (exists) {
    assert(
      exists.product_id === productId &&
        exists.delta === delta &&
        exists.reserved_delta === reservedDelta &&
        exists.reason === reason &&
        (exists.order_id ?? null) === (orderId ?? null),
      "Chave de movimento já usada em outra operação",
      409,
    );
    return exists;
  }
  const s = (
    await c.tx.query(
      "SELECT * FROM stock WHERE company_id=$1 AND product_id=$2 FOR UPDATE",
      [c.companyId, productId],
    )
  ).rows[0];
  assert(s, "Estoque não encontrado", 404);
  assert(
    s.quantity + delta >= 0 &&
      s.reserved + reservedDelta >= 0 &&
      s.reserved + reservedDelta <= s.quantity + delta,
    "Estoque disponível insuficiente",
  );
  const id = randomUUID();
  await c.tx.query(
    "UPDATE stock SET quantity=quantity+$3,reserved=reserved+$4 WHERE company_id=$1 AND product_id=$2",
    [c.companyId, productId, delta, reservedDelta],
  );
  await c.tx.query(
    "INSERT INTO movements(id,company_id,product_id,delta,reserved_delta,reason,idempotency_key,expires,order_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      id,
      c.companyId,
      productId,
      delta,
      reservedDelta,
      reason,
      key,
      expires || null,
      orderId ?? null,
    ],
  );
  await audit(c, "stock.move", id);
  return { id };
}
function materialTotals(data: any) {
  const m = new Map<string, number>();
  for (const i of data.items) {
    if (i.stockProduct && i.productId)
      m.set(i.productId, (m.get(i.productId) ?? 0) + i.quantity);
    for (const v of i.materials ?? [])
      m.set(v.productId, (m.get(v.productId) ?? 0) + v.quantity * i.quantity);
  }
  return m;
}
export async function approveQuote(c: Context, id: string, name: string) {
  const q = await getQuote(c, id);
  if (q.status === "approved") return { id, status: "approved" };
  assert(q.status === "sent", "Envie a proposta antes de aprovar");
  assert(
    q.data.validUntil >= new Date().toISOString().slice(0, 10),
    "Proposta expirada",
  );
  await c.tx.query(
    "UPDATE quotes SET status='approved',approved_at=now(),approval_name=$3,approved_version=version,updated_at=now() WHERE company_id=$1 AND id=$2",
    [c.companyId, id, name],
  );
  await audit(c, "quote.approve", id);
  return { id, status: "approved" };
}
export async function convertQuote(c: Context, id: string) {
  const q = await getQuote(c, id);
  const existing = (
    await c.tx.query(
      "SELECT id FROM orders WHERE company_id=$1 AND quote_id=$2",
      [c.companyId, id],
    )
  ).rows[0];
  if (existing) return existing;
  assert(q.status === "approved", "A proposta precisa estar aprovada");

  return registerOrder(c, q.data, Number(q.total_cents), {
    quoteId: id,
    label: `Proposta #${q.number} · ${q.data.title}`,
  });
}
type OrderSource =
  | { quoteId: string; label: string }
  | { requestKey: string; requestHash: string; label: string };

async function registerOrder(
  c: Context,
  snapshot: any,
  totalCents: number,
  source: OrderSource,
) {
  const orderId = randomUUID();
  await c.tx.query(
    "INSERT INTO orders(id,company_id,quote_id,snapshot,request_key,request_hash) VALUES($1,$2,$3,$4,$5,$6)",
    [
      orderId,
      c.companyId,
      "quoteId" in source ? source.quoteId : null,
      JSON.stringify(snapshot),
      "requestKey" in source ? source.requestKey : null,
      "requestHash" in source ? source.requestHash : null,
    ],
  );
  const materials = [...materialTotals(snapshot)].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [productId, n] of materials)
    await movement(
      c,
      productId,
      0,
      n,
      "Reserva da ordem",
      `reserve:${orderId}:${productId}`,
      undefined,
      orderId,
    );
  if (totalCents > 0)
    await c.tx.query(
      "INSERT INTO ledger(id,company_id,order_id,direction,name,amount_cents,due) VALUES($1,$2,$3,'in',$4,$5,$6)",
      [
        randomUUID(),
        c.companyId,
        orderId,
        source.label,
        totalCents,
        snapshot.paymentDue || snapshot.deliveryDue || snapshot.validUntil,
      ],
    );
  await audit(
    c,
    "quoteId" in source ? "quote.convert" : "order.retail.create",
    orderId,
  );
  return { id: orderId };
}

const retailOrderSchema = z.object({
  requestKey: z.uuid(),
  title: z.string().trim().min(1).max(160),
  clientId: z.string().min(1).max(100),
  paymentDue: z.iso.date(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(100),
        quantity: z.number().int().positive().max(100000),
      }),
    )
    .min(1)
    .max(50),
});

export async function createRetailOrder(c: Context, input: unknown) {
  const { requestKey, ...data } = retailOrderSchema.parse(input);
  const requestHash = hash(JSON.stringify(data));
  await c.tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    c.companyId + ":" + requestKey,
  ]);
  const prior = (
    await c.tx.query(
      "SELECT id,request_hash FROM orders WHERE company_id=$1 AND request_key=$2",
      [c.companyId, requestKey],
    )
  ).rows[0];
  if (prior) {
    assert(
      prior.request_hash === requestHash,
      "Chave já usada com outros dados de pedido",
      409,
    );
    return { id: prior.id };
  }
  const client = await findRecord(c, data.clientId, "clients");
  assert(
    new Set(data.items.map((item) => item.productId)).size ===
      data.items.length,
    "Informe cada produto ou variação apenas uma vez",
  );
  const items = [];
  for (const item of data.items) {
    const product = (await findRecord(c, item.productId, "products")).data;
    assert(
      product.status === "active" &&
        ["product", "variation"].includes(product.productType ?? "product"),
      "Escolha produtos ou variações ativos",
    );
    items.push({
      ...item,
      name: [product.name, product.size, product.color, product.sku]
        .filter(Boolean)
        .join(" · "),
      priceCents: product.priceCents,
      costCents: product.costCents,
      costKnown: product.costKnown,
      stockProduct: product.trackStock === true,
      materials: [],
    });
  }
  const snapshot = {
    ...data,
    items,
    client: { name: client.data.name },
    companyName: c.company.name,
    validUntil: data.paymentDue,
    deliveryDue: "",
    laborCents: 0,
    travelCents: 0,
    discountCents: 0,
    conditions: "",
    notes: "",
    opportunityId: "",
  };
  const { totalCents, costCents } = quoteTotals(snapshot);
  return registerOrder(c, { ...snapshot, totalCents, costCents }, totalCents, {
    requestKey,
    requestHash,
    label: "Pedido · " + data.title,
  });
}

const returnSchema = z.object({
  requestKey: z.uuid(),
  productId: z.string().min(1).max(100),
  quantity: z.number().int().positive().max(100000),
});
export async function returnRetailItem(c: Context, id: string, input: unknown) {
  const { requestKey, productId, quantity } = returnSchema.parse(input);
  const order = (
    await c.tx.query(
      "SELECT * FROM orders WHERE company_id=$1 AND id=$2 AND request_key IS NOT NULL FOR UPDATE",
      [c.companyId, id],
    )
  ).rows[0];
  assert(order, "Pedido não encontrado", 404);
  assert(
    order.status === "done",
    "Conclua o pedido antes de registrar uma devolução",
  );
  const key = "retail-return:" + id + ":" + requestKey;
  const existing = (
    await c.tx.query(
      "SELECT product_id,delta FROM movements WHERE company_id=$1 AND idempotency_key=$2",
      [c.companyId, key],
    )
  ).rows[0];
  if (existing) {
    assert(
      existing.product_id === productId && existing.delta === quantity,
      "Devolução já registrada com outros dados",
      409,
    );
    return { id };
  }
  const totals = (
    await c.tx.query(
      "SELECT coalesce(sum(delta),0)::int AS net FROM movements WHERE company_id=$1 AND order_id=$2 AND product_id=$3",
      [c.companyId, id, productId],
    )
  ).rows[0];
  assert(
    quantity <= -totals.net,
    "A quantidade excede o saldo vendido deste item",
  );
  await movement(
    c,
    productId,
    quantity,
    0,
    "Devolução de pedido",
    key,
    undefined,
    id,
  );
  await audit(c, "order.retail.return", id);
  return { id };
}
export async function completeOrder(c: Context, id: string) {
  const o = (
    await c.tx.query(
      "SELECT * FROM orders WHERE company_id=$1 AND id=$2 FOR UPDATE",
      [c.companyId, id],
    )
  ).rows[0];
  assert(o, "Ordem não encontrada", 404);
  if (o.status === "done") return { id };
  const execution = (
    await c.tx.query(
      "SELECT data FROM operation_documents WHERE company_id=$1 AND kind='execution' AND entity_key=$2",
      [c.companyId, id],
    )
  ).rows[0];
  assert(
    !execution?.data.stages?.some((s: any) => !s.done),
    "Conclua as etapas da execução antes de finalizar",
  );
  const remaining = (
    await c.tx.query(
      "SELECT product_id,sum(reserved_delta)::integer AS n FROM movements WHERE company_id=$1 AND order_id=$2 GROUP BY product_id HAVING sum(reserved_delta)>0",
      [c.companyId, id],
    )
  ).rows;
  for (const { product_id: productId, n } of remaining)
    await movement(
      c,
      productId,
      -n,
      -n,
      "Consumo na conclusão",
      `consume:${id}:${productId}`,
      undefined,
      id,
    );
  await c.tx.query(
    "UPDATE orders SET status='done',completed_at=now() WHERE company_id=$1 AND id=$2",
    [c.companyId, id],
  );
  await saveRecord(c, "aftersales", {
    name: `Acompanhar entrega · ${o.snapshot.title}`,
    clientId: o.snapshot.clientId,
    status: "pending",
    due: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    description:
      "Verifique a satisfação e registre garantias ou manutenção combinadas.",
  });
  await audit(c, "order.complete", id);
  return { id };
}
export async function pay(
  c: Context,
  id: string,
  amount: number,
  key: string,
  date: string,
  accountId?: string,
) {
  const l = (
    await c.tx.query(
      "SELECT * FROM ledger WHERE company_id=$1 AND id=$2 FOR UPDATE",
      [c.companyId, id],
    )
  ).rows[0];
  assert(l, "Conta não encontrada", 404);
  const account = accountId || l.account_id || null;
  if (account)
    assert(
      (
        await c.tx.query(
          "SELECT 1 FROM financial_accounts WHERE company_id=$1 AND id=$2 AND active=true",
          [c.companyId, account],
        )
      ).rows.length,
      "Conta financeira não encontrada",
      404,
    );
  const existing = (
    await c.tx.query(
      "SELECT id,ledger_id,amount_cents,account_id FROM payments WHERE company_id=$1 AND idempotency_key=$2",
      [c.companyId, key],
    )
  ).rows[0];
  if (existing) {
    assert(
      existing.ledger_id === id &&
        Number(existing.amount_cents) === amount &&
        (existing.account_id ?? null) === account,
      "Chave já usada em outro pagamento",
      409,
    );
    return existing;
  }
  const paid = Number(
    (
      await c.tx.query(
        "SELECT coalesce(sum(amount_cents),0) AS total FROM payments WHERE company_id=$1 AND ledger_id=$2",
        [c.companyId, id],
      )
    ).rows[0].total,
  );
  assert(
    amount > 0 &&
      Number.isSafeInteger(amount) &&
      amount <= Number(l.amount_cents) - paid,
    "Pagamento excede o saldo ou é inválido",
  );
  const paymentId = randomUUID();
  await c.tx.query(
    "INSERT INTO payments(id,company_id,ledger_id,amount_cents,paid_at,idempotency_key,account_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [paymentId, c.companyId, id, amount, date, key, account],
  );
  await audit(c, "ledger.pay", id);
  return { id: paymentId };
}
export const token = () => randomBytes(32).toString("base64url");
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
