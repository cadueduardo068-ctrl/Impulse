import { randomUUID } from "node:crypto";
import { z } from "zod";
import { allowed, sanitize, canCosts, type Module } from "../shared/access.js";
import {
  executionSchema,
  calculatePrice,
  pipelineDefault,
} from "../shared/operations.js";
import { quantityMilli, quantitySchema } from "../shared/materials.js";
import { recordSchema } from "../shared/domain.js";
import {
  audit,
  assert,
  findRecord,
  movement,
  saveRecord,
  pay,
  hash,
  type Context,
} from "./service.js";
export function authorize(c: Context, module: Module, write = false) {
  assert(
    allowed(c.role, module, write ? "write" : "read"),
    "Seu papel não permite esta ação neste módulo",
    403,
  );
}
export async function documents(c: Context, kind: string) {
  return (
    await c.tx.query(
      "SELECT * FROM operation_documents WHERE company_id=$1 AND kind=$2 ORDER BY updated_at DESC LIMIT 500",
      [c.companyId, kind],
    )
  ).rows;
}
export async function putDocument(
  c: Context,
  kind: string,
  key: string,
  data: unknown,
  version: number | null,
) {
  const previous = (
    await c.tx.query(
      "SELECT * FROM operation_documents WHERE company_id=$1 AND kind=$2 AND entity_key=$3 FOR UPDATE",
      [c.companyId, kind, key],
    )
  ).rows[0];
  assert(
    (previous?.version ?? null) === version,
    "Informações alteradas em outra aba. Reabra a versão atual; seus campos foram preservados.",
    409,
  );
  const id = previous?.id ?? randomUUID();
  if (previous)
    await c.tx.query(
      "UPDATE operation_documents SET data=$3,version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",
      [c.companyId, id, JSON.stringify(data)],
    );
  else
    await c.tx.query(
      "INSERT INTO operation_documents(id,company_id,kind,entity_key,data) VALUES($1,$2,$3,$4,$5)",
      [id, c.companyId, kind, key, JSON.stringify(data)],
    );
  await audit(c, kind + ".save", id);
  return { id, version: previous ? previous.version + 1 : 1, data };
}
export const todayIn = (zone = "America/Sao_Paulo") =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const isoDate = (value: any) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
export async function day(c: Context) {
  const today = todayIn(c.company.profile.timezone),
    soon = new Date(today + "T12:00:00Z");
  soon.setUTCDate(soon.getUTCDate() + 7);
  const last = soon.toISOString().slice(0, 10);
  const records = (
    await c.tx.query(
      "SELECT * FROM records WHERE company_id=$1 AND deleted_at IS NULL",
      [c.companyId],
    )
  ).rows;
  const all: any[] = [];
  const add = (
    id: string,
    module: Module,
    title: string,
    reason: string,
    target: string,
    date: string,
    completable = false,
    source = "",
  ) => {
    if (allowed(c.role, module))
      all.push({
        id,
        module,
        title,
        reason,
        target,
        date,
        completable,
        fingerprint: hash(JSON.stringify([id, date, title, reason, source])),
      });
  };
  for (const r of records) {
    const d = r.data;
    if (d.status === "done" || d.status === "inactive") continue;
    if (r.kind === "clients" && d.nextAction && d.due && d.due <= today)
      add(
        "record:" + r.id,
        "clients",
        d.name,
        d.nextAction,
        "crm",
        d.due,
        true,
        String(r.version),
      );
    if (
      r.kind === "appointments" &&
      d.due === today &&
      !["cancelled", "completed"].includes(d.bookingStatus)
    )
      add(
        "record:" + r.id,
        "appointments",
        d.name,
        `Compromisso hoje, ${d.startTime || "sem horário"}.`,
        "agenda",
        d.due,
        true,
        String(r.version),
      );
    if (["tasks", "aftersales"].includes(r.kind) && d.due && d.due <= today)
      add(
        "record:" + r.id,
        r.kind === "tasks" ? "tasks" : "aftersales",
        d.name,
        d.due < today ? "Prazo vencido." : "Retorno previsto para hoje.",
        r.kind === "tasks" ? "tarefas" : "pos-venda",
        d.due,
        true,
      );
    if (
      r.kind === "opportunities" &&
      d.due &&
      d.due <= today &&
      !["won", "lost"].includes(d.pipelineStage || d.stage)
    )
      add(
        "record:" + r.id,
        "clients",
        d.name,
        d.nextAction || "Próxima ação comercial vencendo.",
        "crm",
        d.due,
        true,
      );
  }
  if (allowed(c.role, "quotes"))
    for (const q of (
      await c.tx.query(
        "SELECT q.id,q.number,q.data,q.status,q.updated_at FROM quotes q WHERE q.company_id=$1 AND (q.status='sent' OR (q.status='adjustment_requested' AND NOT EXISTS (SELECT 1 FROM quotes next WHERE next.company_id=q.company_id AND next.revises_id=q.id)))",
        [c.companyId],
      )
    ).rows) {
      const days = Math.floor(
        (Date.now() - new Date(q.updated_at).getTime()) / 86400000,
      );
      if (q.status === "adjustment_requested" || days >= 5)
        add(
          "quote:" + q.id,
          "quotes",
          `Proposta #${q.number} · ${q.data.title}`,
          q.status === "adjustment_requested"
            ? "O cliente pediu ajustes na proposta."
            : `Sem atualização há ${days} dias.`,
          "propostas",
          isoDate(q.updated_at),
        );
    }
  if (allowed(c.role, "orders"))
    for (const o of (
      await c.tx.query(
        "SELECT o.id,o.snapshot,e.data AS execution FROM orders o LEFT JOIN operation_documents e ON e.company_id=o.company_id AND e.kind='execution' AND e.entity_key=o.id WHERE o.company_id=$1 AND o.status<>'done'",
        [c.companyId],
      )
    ).rows) {
      const due = o.execution?.due || o.snapshot.deliveryDue;
      if (due && due <= last)
        add(
          "order:" + o.id,
          "orders",
          o.snapshot.title,
          `Entrega prevista para ${due}.`,
          "ordens",
          due,
        );
    }
  if (allowed(c.role, "finance"))
    for (const l of (
      await c.tx.query(
        "SELECT l.*,coalesce(p.paid,0) AS paid FROM ledger l LEFT JOIN (SELECT ledger_id,sum(amount_cents) AS paid FROM payments WHERE company_id=$1 GROUP BY ledger_id) p ON p.ledger_id=l.id WHERE l.company_id=$1 AND l.due<=$2",
        [c.companyId, last],
      )
    ).rows) {
      if (Number(l.paid) < Number(l.amount_cents))
        add(
          "ledger:" + l.id,
          "finance",
          l.name,
          `${l.direction === "in" ? "Recebimento pendente" : "Conta a pagar"} · vencimento ${isoDate(l.due)}.`,
          "financeiro",
          isoDate(l.due),
        );
    }
  if (allowed(c.role, "stock"))
    for (const s of (
      await c.tx.query(
        "SELECT s.*,r.data FROM stock s JOIN records r ON r.company_id=s.company_id AND r.id=s.product_id WHERE s.company_id=$1 AND r.deleted_at IS NULL",
        [c.companyId],
      )
    ).rows)
      if (s.quantity - s.reserved < s.data.minimum)
        add(
          "stock:" + s.product_id,
          "stock",
          s.data.name,
          `Disponível ${s.quantity - s.reserved}; mínimo configurado ${s.data.minimum}.`,
          "estoque",
          today,
        );
  const actions = await documents(c, "reminder");
  const items = all
    .filter((i) => {
      const a = actions.find((a) => a.entity_key === c.userId + ":" + i.id);
      return (
        !a ||
        a.data.fingerprint !== i.fingerprint ||
        (a.data.status === "snoozed" && a.data.until <= today)
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  let activation = [
    {
      id: "profile",
      title: "Revisar o modelo do negócio",
      done: !!c.company.profile.businessModels?.length,
      target: "configuracoes",
    },
    {
      id: "data",
      title: "Cadastrar ou importar clientes e catálogo",
      done: records.some((r) => ["clients", "products"].includes(r.kind)),
      target: "importacoes",
    },
    {
      id: "first",
      title: "Criar o primeiro orçamento ou agendamento",
      done:
        records.some((r) => r.kind === "appointments") ||
        !!(
          await c.tx.query("SELECT 1 FROM quotes WHERE company_id=$1 LIMIT 1", [
            c.companyId,
          ])
        ).rows.length,
      target: c.company.profile.businessModels?.includes("appointments")
        ? "agenda"
        : "propostas",
    },
    ...(allowed(c.role, "finance")
      ? [
          {
            id: "payment",
            title: "Registrar o primeiro recebimento real",
            done: !!(
              await c.tx.query(
                "SELECT 1 FROM payments p JOIN ledger l ON l.company_id=p.company_id AND l.id=p.ledger_id WHERE p.company_id=$1 AND l.direction='in' LIMIT 1",
                [c.companyId],
              )
            ).rows.length,
            target: "financeiro",
          },
        ]
      : []),
    ...(c.company.profile.team === "team" ||
    c.company.profile.businessModels?.includes("team")
      ? [
          {
            id: "team",
            title: "Convidar a equipe",
            done:
              Number(
                (
                  await c.tx.query(
                    "SELECT count(*) AS n FROM memberships WHERE company_id=$1",
                    [c.companyId],
                  )
                ).rows[0].n,
              ) > 1,
            target: "equipe",
          },
        ]
      : []),
  ];
  activation = activation.filter((s) =>
    s.target === "configuracoes"
      ? allowed(c.role, "settings")
      : s.target === "importacoes"
        ? allowed(c.role, "imports")
        : s.target === "equipe"
          ? allowed(c.role, "team")
          : true,
  );
  return {
    today,
    updatedAt: new Date().toISOString(),
    items,
    activation,
    permissions: {
      finance: allowed(c.role, "finance"),
      clients: allowed(c.role, "clients"),
    },
  };
}
export async function reminder(c: Context, input: unknown) {
  const b = z
    .object({
      id: z.string().max(150),
      status: z.enum(["done", "snoozed", "dismissed"]),
      until: z.iso.date().optional(),
    })
    .parse(input);
  const visible = (await day(c)).items.find((i) => i.id === b.id);
  assert(visible, "Lembrete não encontrado ou já tratado", 404);
  if (b.status === "done" && visible.completable) {
    authorize(c, visible.module, true);
    const r = await findRecord(c, b.id.slice(7));
    await saveRecord(
      c,
      r.kind,
      {
        ...r.data,
        ...(["clients", "opportunities"].includes(r.kind)
          ? { due: "", nextAction: "" }
          : { status: "done" }),
        ...(r.kind === "appointments" ? { bookingStatus: "completed" } : {}),
      },
      r.id,
      r.version,
    );
  }
  if (b.status === "snoozed")
    assert(
      b.until && b.until > todayIn(c.company.profile.timezone),
      "Escolha uma data futura para adiar",
    );
  const key = c.userId + ":" + b.id,
    existing = (await documents(c, "reminder")).find(
      (d) => d.entity_key === key,
    );
  return putDocument(
    c,
    "reminder",
    key,
    {
      status: b.status,
      until: b.until ?? "",
      reason: visible.reason,
      fingerprint: visible.fingerprint,
    },
    existing?.version ?? null,
  );
}
export async function execution(
  c: Context,
  orderId: string,
  input: unknown,
  version: number | null,
) {
  authorize(c, "orders", true);
  const o = (
    await c.tx.query(
      "SELECT * FROM orders WHERE company_id=$1 AND id=$2 FOR UPDATE",
      [c.companyId, orderId],
    )
  ).rows[0];
  assert(
    o && o.status !== "done",
    "Trabalho não encontrado ou já concluído",
    409,
  );
  const data = executionSchema.parse(input);
  if (!canCosts(c.role)) {
    const previous = (
      await c.tx.query(
        "SELECT data FROM operation_documents WHERE company_id=$1 AND kind='execution' AND entity_key=$2",
        [c.companyId, orderId],
      )
    ).rows[0];
    data.costMode = previous?.data.costMode ?? "unknown";
    data.actualCostCents = previous?.data.actualCostCents ?? 0;
  }
  for (const uid of [
    data.assignee,
    ...data.stages.map((s) => s.assignee),
  ].filter(Boolean))
    assert(
      (
        await c.tx.query(
          "SELECT 1 FROM memberships WHERE company_id=$1 AND user_id=$2",
          [c.companyId, uid],
        )
      ).rows.length,
      "Responsável fora da empresa",
    );
  for (const id of data.attachments)
    assert(
      (
        await c.tx.query("SELECT 1 FROM files WHERE company_id=$1 AND id=$2", [
          c.companyId,
          id,
        ])
      ).rows.length,
      "Anexo de outra empresa",
      404,
    );
  return putDocument(c, "execution", orderId, data, version);
}
export async function consume(c: Context, orderId: string, input: unknown) {
  authorize(c, "orders", true);
  const b = z
    .object({
      productId: z.string().max(100),
      quantity: z.number().int().positive().max(1000000),
      action: z.enum(["reserve", "consume"]),
      note: z.string().min(3).max(200),
      key: z.string().min(8).max(100),
    })
    .parse(input);
  const o = (
    await c.tx.query(
      "SELECT * FROM orders WHERE company_id=$1 AND id=$2 FOR UPDATE",
      [c.companyId, orderId],
    )
  ).rows[0];
  assert(o && o.status !== "done", "Trabalho não encontrado ou concluído", 409);
  const previous = (
    await c.tx.query(
      "SELECT 1 FROM movements WHERE company_id=$1 AND idempotency_key=$2",
      [c.companyId, b.key],
    )
  ).rows.length;
  if (!previous && b.action === "consume") {
    const reserved = Number(
      (
        await c.tx.query(
          "SELECT coalesce(sum(reserved_delta),0) AS n FROM movements WHERE company_id=$1 AND order_id=$2 AND product_id=$3",
          [c.companyId, orderId, b.productId],
        )
      ).rows[0].n,
    );
    assert(
      reserved >= b.quantity,
      "Reserve o material para este trabalho antes de consumir",
    );
  }
  return movement(
    c,
    b.productId,
    b.action === "consume" ? -b.quantity : 0,
    b.action === "consume" ? -b.quantity : b.quantity,
    b.note,
    b.key,
    undefined,
    orderId,
  );
}
export async function receive(c: Context, input: unknown) {
  authorize(c, "stock", true);
  await c.tx.query("SELECT id FROM companies WHERE id=$1 FOR NO KEY UPDATE", [
    c.companyId,
  ]);
  const b = z
    .object({
      itemId: z.string().max(100),
      productId: z.string().max(100),
      quantity: quantitySchema,
      stockQuantity: z.number().int().positive().max(1000000),
      note: z.string().min(3).max(500),
      key: z.string().min(8).max(100),
    })
    .parse(input);
  const n = quantityMilli(b.quantity),
    prev = (
      await c.tx.query(
        "SELECT * FROM purchase_receipts WHERE company_id=$1 AND idempotency_key=$2",
        [c.companyId, b.key],
      )
    ).rows[0];
  if (prev) {
    assert(
      prev.list_item_id === b.itemId &&
        prev.product_id === b.productId &&
        Number(prev.purchase_milli) === Number(n) &&
        prev.stock_quantity === b.stockQuantity &&
        prev.note === b.note,
      "Chave de recebimento reutilizada com outros valores",
      409,
    );
    return prev;
  }
  const item = (
    await c.tx.query(
      "SELECT * FROM purchase_list_items WHERE company_id=$1 AND id=$2 FOR UPDATE",
      [c.companyId, b.itemId],
    )
  ).rows[0];
  assert(item?.data.purchased, "Registre a compra antes do recebimento");
  const product = await findRecord(c, b.productId, "products");
  const received = BigInt(
    (
      await c.tx.query(
        "SELECT coalesce(sum(purchase_milli),0) AS n FROM purchase_receipts WHERE company_id=$1 AND list_item_id=$2",
        [c.companyId, b.itemId],
      )
    ).rows[0].n,
  );
  assert(
    n + received <= quantityMilli(item.data.quantity),
    "Recebimento excede a quantidade comprada",
  );
  if (item.data.unit === product.data.unit)
    assert(
      n === BigInt(b.stockQuantity) * 1000n,
      "Quantidade física deve corresponder à unidade cadastrada. Para conversão, use a unidade correta do SKU.",
    );
  const id = randomUUID();
  await movement(
    c,
    b.productId,
    b.stockQuantity,
    0,
    "Recebimento de compra: " + b.note.slice(0, 170),
    "receipt:" + b.key,
  );
  await c.tx.query(
    "INSERT INTO purchase_receipts(id,company_id,list_item_id,product_id,purchase_milli,stock_quantity,note,idempotency_key,purchase_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      id,
      c.companyId,
      b.itemId,
      b.productId,
      String(n),
      b.stockQuantity,
      b.note,
      b.key,
      JSON.stringify(item.data),
    ],
  );
  await audit(c, "purchase.receive", id);
  return { id };
}
export async function price(c: Context, input: any) {
  authorize(c, "products", true);
  const result = calculatePrice(input.assumptions);
  if (input.productId) {
    const p = await findRecord(
      c,
      z.string().max(100).parse(input.productId),
      "products",
    );
    if (input.apply === true) {
      assert(p.version === input.version, "Produto alterado em outra aba", 409);
      await saveRecord(
        c,
        "products",
        {
          ...p.data,
          priceCents: result.priceCents,
          costCents: result.baseCents,
          costKnown: true,
        },
        p.id,
        p.version,
      );
    }
  }
  const saved = await putDocument(
    c,
    "pricing",
    randomUUID(),
    {
      ...result,
      productId: input.productId ?? "",
      applied: input.apply === true,
    },
    null,
  );
  return { ...result, id: saved.id };
}
export async function nextRecurrence(c: Context, id: string) {
  authorize(c, "finance", true);
  const current = (
    await c.tx.query(
      "SELECT * FROM ledger WHERE company_id=$1 AND id=$2 FOR UPDATE",
      [c.companyId, id],
    )
  ).rows[0];
  assert(current?.recurrence === "monthly", "Lançamento não recorrente");
  const rootId = current.recurrence_root || current.id;
  const root = (
    await c.tx.query(
      "SELECT * FROM ledger WHERE company_id=$1 AND id=$2 FOR UPDATE",
      [c.companyId, rootId],
    )
  ).rows[0];
  assert(root, "Origem da recorrência não encontrada");
  const index = current.recurrence_index + 1;
  const due = (
    await c.tx.query(
      "SELECT (date_trunc('month',$1::date)+($2::text||' month')::interval+(least(extract(day from $1::date)::integer,extract(day from(date_trunc('month',$1::date)+(($2::integer+1)::text||' month')::interval-interval '1 day'))::integer)-1)*interval '1 day')::date::text AS due",
      [root.due, index],
    )
  ).rows[0].due;
  const previous = (
    await c.tx.query(
      "SELECT id FROM ledger WHERE company_id=$1 AND recurrence_root=$2 AND due=$3",
      [c.companyId, rootId, due],
    )
  ).rows[0];
  if (previous) return previous;
  const legacy = (
    await c.tx.query("SELECT 1 FROM audit WHERE company_id=$1 AND action=$2", [
      c.companyId,
      `recurrence:${id}:${due}`,
    ])
  ).rows.length;
  if (legacy) return { ok: true };
  const newId = randomUUID();
  await c.tx.query(
    "INSERT INTO ledger(id,company_id,direction,name,category,amount_cents,due,recurrence,recurrence_root,recurrence_index,account_id,financial_kind) VALUES($1,$2,$3,$4,$5,$6,$7,'monthly',$8,$9,$10,$11)",
    [
      newId,
      c.companyId,
      current.direction,
      current.name,
      current.category,
      current.amount_cents,
      due,
      rootId,
      index,
      current.account_id,
      current.financial_kind,
    ],
  );
  await audit(c, "finance.recurrence", newId);
  return { id: newId, due };
}
export async function createInstallments(c: Context, input: unknown) {
  await c.tx.query("SELECT id FROM companies WHERE id=$1 FOR NO KEY UPDATE", [
    c.companyId,
  ]);
  authorize(c, "finance", true);
  const b = z
    .object({
      name: z.string().min(2).max(150),
      direction: z.enum(["in", "out"]),
      totalCents: z.number().int().positive().max(1000000000),
      count: z.number().int().min(2).max(48),
      firstDue: z.iso.date(),
      category: z.string().max(80),
      key: z.string().min(8).max(100),
    })
    .parse(input);
  const existing = (
    await c.tx.query(
      "SELECT id FROM ledger WHERE company_id=$1 AND installment_group=$2 ORDER BY installment_number",
      [c.companyId, b.key],
    )
  ).rows;
  if (existing.length) {
    const original = (
      await c.tx.query(
        "SELECT data FROM operation_documents WHERE company_id=$1 AND kind='installments' AND entity_key=$2",
        [c.companyId, b.key],
      )
    ).rows[0];
    assert(
      original &&
        Object.entries(b).every(([key, value]) => original.data[key] === value),
      "Chave de parcelamento reutilizada com outros valores",
      409,
    );
    return { ids: existing.map((v) => v.id) };
  }
  assert(
    b.totalCents >= b.count,
    "O valor precisa permitir pelo menos um centavo por parcela",
  );
  const base = Math.floor(b.totalCents / b.count),
    remainder = b.totalCents % b.count,
    ids = [];
  for (let i = 0; i < b.count; i++) {
    const id = randomUUID(),
      due = (
        await c.tx.query(
          "SELECT (date_trunc('month',$1::date)+($2::text||' month')::interval+(least(extract(day from $1::date)::integer,extract(day from(date_trunc('month',$1::date)+(($2::integer+1)::text||' month')::interval-interval '1 day'))::integer)-1)*interval '1 day')::date::text AS due",
          [b.firstDue, i],
        )
      ).rows[0].due;
    await c.tx.query(
      "INSERT INTO ledger(id,company_id,direction,name,category,amount_cents,due,installment_group,installment_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        c.companyId,
        b.direction,
        `${b.name} · ${i + 1}/${b.count}`,
        b.category,
        base + (i < remainder ? 1 : 0),
        due,
        b.key,
        i + 1,
      ],
    );
    ids.push(id);
  }
  await putDocument(c, "installments", b.key, b, null);
  await audit(c, "finance.installments", b.key);
  return { ids };
}
export async function crm(c: Context) {
  authorize(c, "clients");
  const records = (
    await c.tx.query(
      "SELECT * FROM records WHERE company_id=$1 AND kind IN ('clients','opportunities') AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 2000",
      [c.companyId],
    )
  ).rows;
  return sanitize(
    {
      members: (
        await c.tx.query(
          'SELECT m.user_id,u.name FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.company_id=$1',
          [c.companyId],
        )
      ).rows,
      clients: records.filter((r) => r.kind === "clients"),
      opportunities: records.filter((r) => r.kind === "opportunities"),
      pipeline: (await documents(c, "pipeline"))[0] ?? {
        data: {
          stages: pipelineDefault,
          templates: [
            "Olá, {cliente}! Podemos conversar sobre sua proposta?",
            "Olá, {cliente}! Sua entrega ocorreu como combinado?",
          ],
        },
        version: null,
      },
      contacts: await documents(c, "contact"),
      quotes: (
        await c.tx.query(
          "SELECT id,number,status,data,approved_at,approved_version FROM quotes WHERE company_id=$1",
          [c.companyId],
        )
      ).rows,
      orders: (
        await c.tx.query(
          "SELECT id,status,snapshot,completed_at FROM orders WHERE company_id=$1",
          [c.companyId],
        )
      ).rows,
    },
    c.role,
  );
}
export async function recordHistory(c: Context, id: string) {
  const r = await findRecord(c, id);
  authorize(c, r.kind === "opportunities" ? "clients" : (r.kind as Module));
  return sanitize(
    (
      await c.tx.query(
        "SELECT version,data,created_at FROM record_versions WHERE company_id=$1 AND record_id=$2 ORDER BY version DESC LIMIT 100",
        [c.companyId, id],
      )
    ).rows,
    c.role,
  );
}
export { saveRecord, pay, hash, recordSchema };
