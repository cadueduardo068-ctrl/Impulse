import { z } from "zod";
import { authorize, isoDate, todayIn } from "./operation-service.js";
import { type Context } from "./service.js";
export async function reports(c: Context, input: unknown) {
  authorize(c, "reports");
  const p = z
    .object({ from: z.iso.date(), to: z.iso.date() })
    .refine((v) => v.from <= v.to, "Período inválido")
    .parse(input);
  const inside = (date: any) => {
    const d = isoDate(date);
    return d >= p.from && d <= p.to;
  };
  const orders = (
    await c.tx.query(
      "SELECT o.*,q.number,coalesce(q.total_cents,(o.snapshot->>'totalCents')::bigint) AS total_cents,coalesce(q.cost_cents,(o.snapshot->>'costCents')::bigint) AS cost_cents,e.data AS execution FROM orders o LEFT JOIN quotes q ON q.company_id=o.company_id AND q.id=o.quote_id LEFT JOIN operation_documents e ON e.company_id=o.company_id AND e.kind='execution' AND e.entity_key=o.id WHERE o.company_id=$1",
      [c.companyId],
    )
  ).rows;
  const ledger = (
    await c.tx.query(
      "SELECT l.*,coalesce(p.paid,0) AS paid FROM ledger l LEFT JOIN (SELECT ledger_id,sum(amount_cents) AS paid FROM payments WHERE company_id=$1 GROUP BY ledger_id)p ON p.ledger_id=l.id WHERE l.company_id=$1",
      [c.companyId],
    )
  ).rows;
  const payments = (
    await c.tx.query(
      "SELECT p.*,l.direction,l.name,l.financial_kind FROM payments p JOIN ledger l ON l.company_id=p.company_id AND l.id=p.ledger_id WHERE p.company_id=$1 AND p.paid_at BETWEEN $2 AND $3",
      [c.companyId, p.from, p.to],
    )
  ).rows;
  const quotes = (
    await c.tx.query(
      "SELECT id,number,status,data,created_at FROM quotes WHERE company_id=$1 AND status<>'draft'",
      [c.companyId],
    )
  ).rows.filter((q) => inside(q.created_at));
  const sales = orders.filter((o) => inside(o.created_at)),
    completed = orders.filter((o) => o.completed_at && inside(o.completed_at));
  const overdue = ledger.filter(
    (l) =>
      inside(l.due) &&
      isoDate(l.due) < todayIn(c.company.profile.timezone) &&
      Number(l.paid) < Number(l.amount_cents),
  );
  const movements = (
    await c.tx.query(
      "SELECT m.*,r.data->>'name' AS product FROM movements m JOIN records r ON r.company_id=m.company_id AND r.id=m.product_id WHERE m.company_id=$1 AND m.delta<0 AND m.order_id IS NOT NULL AND m.created_at>=$2::date AND m.created_at<($3::date+interval '1 day')",
      [c.companyId, p.from, p.to],
    )
  ).rows;
  const indicator = (
    key: string,
    title: string,
    value: number | null,
    unit: string,
    definition: string,
    rows: any[],
  ) => ({
    key,
    title,
    value,
    unit,
    definition,
    missing: rows.length
      ? "Os totais dependem de registros manuais e do preenchimento das datas."
      : "Não há registros elegíveis no período.",
    rows,
  });
  const sum = (rows: any[], field: string) =>
    rows.reduce((n, r) => n + Number(r[field]), 0);
  const received = payments.filter((p) => p.direction === "in"),
    spent = payments.filter(
      (p) => p.direction === "out" && p.financial_kind !== "withdrawal",
    ),
    withdrawals = payments.filter(
      (p) => p.direction === "out" && p.financial_kind === "withdrawal",
    );
  const top = new Map<string, any>();
  for (const o of sales)
    for (const i of o.snapshot.items) {
      const key = i.productId || i.name;
      const prev = top.get(key) ?? {
        name: i.name,
        quantity: 0,
        grossCents: 0,
        orderIds: [],
      };
      prev.quantity += i.quantity;
      prev.grossCents += i.quantity * i.priceCents;
      prev.orderIds.push(o.id);
      top.set(key, prev);
    }
  const results = sales.map((o) => {
    const known =
      o.execution?.costMode === "total" ||
      (o.execution?.costMode === "snapshot" &&
        o.snapshot.items.every((i: any) => i.costKnown || i.costCents > 0));
    const cost =
      o.execution?.costMode === "total"
        ? o.execution.actualCostCents
        : Number(o.cost_cents);
    return {
      id: o.id,
      name: o.snapshot.title,
      revenueCents: Number(o.total_cents),
      costCents: known ? cost : null,
      resultCents: known ? Number(o.total_cents) - cost : null,
      explanation: known
        ? "Estimativa com custo total confirmado pelo responsável, contado uma vez. Não substitui apuração contábil."
        : "Custo total não confirmado; resultado indisponível.",
    };
  });
  return {
    period: p,
    updatedAt: new Date().toISOString(),
    indicators: [
      indicator(
        "sales",
        "Vendas registradas",
        sales.length ? sum(sales, "total_cents") : null,
        "money",
        "Pedidos e ordens criados no período. Não significa dinheiro recebido.",
        sales.map((o) => ({
          id: o.id,
          name: o.snapshot.title,
          value: Number(o.total_cents),
          target: "ordens",
        })),
      ),
      indicator(
        "received",
        "Dinheiro recebido",
        received.length ? sum(received, "amount_cents") : null,
        "money",
        "Pagamentos manuais de contas a receber pela data efetiva; exclui transferências.",
        received.map((r) => ({
          id: r.ledger_id,
          name: r.name,
          value: Number(r.amount_cents),
          target: "financeiro",
        })),
      ),
      indicator(
        "spent",
        "Despesas pagas",
        spent.length ? sum(spent, "amount_cents") : null,
        "money",
        "Pagamentos de saída no período, sem retiradas dos sócios e transferências.",
        spent.map((r) => ({
          id: r.ledger_id,
          name: r.name,
          value: Number(r.amount_cents),
          target: "financeiro",
        })),
      ),
      indicator(
        "withdrawals",
        "Retiradas dos sócios",
        withdrawals.length ? sum(withdrawals, "amount_cents") : null,
        "money",
        "Pagamentos classificados explicitamente como retirada.",
        withdrawals.map((r) => ({
          id: r.ledger_id,
          name: r.name,
          value: Number(r.amount_cents),
          target: "financeiro",
        })),
      ),
      indicator(
        "overdue",
        "Valores em atraso",
        overdue.length
          ? overdue.reduce(
              (n, r) => n + Number(r.amount_cents) - Number(r.paid),
              0,
            )
          : null,
        "money",
        "Saldo em aberto de contas com vencimento no período e anterior a hoje.",
        overdue.map((l) => ({
          id: l.id,
          name: l.name,
          value: Number(l.amount_cents) - Number(l.paid),
          target: "financeiro",
        })),
      ),
      indicator(
        "conversion",
        "Conversão de propostas",
        quotes.length
          ? Math.round(
              (quotes.filter((q) => q.status === "approved").length * 10000) /
                quotes.length,
            ) / 100
          : null,
        "percent",
        "Aprovadas / propostas não rascunho criadas no período (inclui rejeitadas). Sem base, não há percentual.",
        quotes.map((q) => ({
          id: q.id,
          name: `#${q.number} ${q.data.title}`,
          value: q.status,
          target: "propostas",
        })),
      ),
      indicator(
        "leadTime",
        "Prazo médio de execução",
        completed.length
          ? Math.round(
              (completed.reduce(
                (n, o) =>
                  n +
                  (new Date(o.completed_at).getTime() -
                    new Date(o.created_at).getTime()) /
                    86400000,
                0,
              ) /
                completed.length) *
                10,
            ) / 10
          : null,
        "days",
        "Dias corridos entre criação e conclusão, para ordens concluídas no período. Históricos sem data de conclusão não entram.",
        completed.map((o) => ({
          id: o.id,
          name: o.snapshot.title,
          target: "ordens",
        })),
      ),
    ],
    consumption: movements.map((m) => ({
      id: m.id,
      product: m.product,
      quantity: -m.delta,
      orderId: m.order_id,
    })),
    topProducts: [...top.values()].sort((a, b) => b.grossCents - a.grossCents),
    workResults: results,
    cash: {
      receivedCents: sum(received, "amount_cents"),
      paidCents: sum([...spent, ...withdrawals], "amount_cents"),
      balanceCents:
        sum(received, "amount_cents") -
        sum([...spent, ...withdrawals], "amount_cents"),
      definition:
        "Movimentação líquida manual no período, sem saldo inicial. Não é lucro.",
    },
    forecast: ledger
      .filter((l) => inside(l.due))
      .map((l) => ({
        id: l.id,
        name: l.name,
        due: isoDate(l.due),
        direction: l.direction,
        remainingCents: Number(l.amount_cents) - Number(l.paid),
      })),
  };
}
