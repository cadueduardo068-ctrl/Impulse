import { Router } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auth, sendMail } from "./auth.js";
import { config } from "./config.js";
import {
  tenant,
  assert,
  HttpError,
  audit,
  rate,
  createQuote,
  getQuote,
  findRecord,
  hash,
  token,
  type Context,
} from "./service.js";
import { allowed, sanitize, canCosts, type Module } from "../shared/access.js";
import { toCsv } from "../shared/operations.js";
import {
  authorize,
  day,
  reminder,
  crm,
  execution,
  consume,
  receive,
  price,
  documents,
  putDocument,
  recordHistory,
  createInstallments,
} from "./operation-service.js";
import { previewImport, queueImport, processImport } from "./import-service.js";
import { reports } from "./reports.js";
import { createList, saveListItem } from "./material-service.js";
export const operationsRouter = Router({ mergeParams: true });
const endpoint =
  (f: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) => {
    void f(req, res)
      .then((v) => {
        if (!res.headersSent) res.json(v);
      })
      .catch(next);
  };
async function access(
  req: any,
  module: Module,
  write: boolean,
  fn: (c: Context) => Promise<any>,
) {
  const s = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  assert(s, "Entre na sua conta", 401);
  return tenant(
    s.user,
    String(req.params.company),
    module === "finance" || module === "reports"
      ? "finance"
      : write
        ? "write"
        : "read",
    async (c) => {
      authorize(c, module, write);
      return sanitize(await fn(c), c.role);
    },
    write,
  );
}
operationsRouter.get(
  "/day",
  endpoint((req) => access(req, "help", false, day)),
);
operationsRouter.get(
  "/record/:id",
  endpoint((req) =>
    access(req, "help", false, async (c) => {
      const r = await findRecord(c, req.params.id);
      authorize(c, r.kind === "opportunities" ? "clients" : (r.kind as Module));
      return r;
    }),
  ),
);
operationsRouter.put(
  "/ledger/:id",
  endpoint((req) =>
    access(req, "finance", true, async (c) => {
      const b = z
        .object({
          version: z.number().int().positive(),
          name: z.string().min(2).max(160),
          due: z.iso.date(),
          category: z.string().max(80),
          financialKind: z.enum(["operating", "withdrawal"]),
          reason: z.string().min(5).max(500),
        })
        .strict()
        .parse(req.body);
      const row = (
        await c.tx.query(
          "SELECT * FROM ledger WHERE company_id=$1 AND id=$2 FOR UPDATE",
          [c.companyId, req.params.id],
        )
      ).rows[0];
      assert(row, "Conta não encontrada", 404);
      assert(
        row.version === b.version,
        "Conta alterada em outra aba. Reabra a versão atual.",
        409,
      );
      assert(
        b.financialKind !== "withdrawal" || row.direction === "out",
        "Somente saídas podem ser retiradas",
      );
      await c.tx.query(
        "UPDATE ledger SET name=$3,due=$4,category=$5,financial_kind=$6,version=version+1 WHERE company_id=$1 AND id=$2",
        [c.companyId, row.id, b.name, b.due, b.category, b.financialKind],
      );
      await putDocument(
        c,
        "finance-history",
        randomUUID(),
        { ledgerId: row.id, previous: row, changed: b },
        null,
      );
      return { ok: true, version: row.version + 1 };
    }),
  ),
);
operationsRouter.post(
  "/reminders",
  endpoint(async (req) => {
    const visible = await access(req, "help", false, async (c) =>
      (await day(c)).items.find((i) => i.id === req.body.id),
    );
    assert(visible, "Lembrete já tratado ou indisponível", 404);
    return access(
      req,
      visible.completable && req.body.status === "done"
        ? visible.module
        : "help",
      visible.completable && req.body.status === "done",
      (c) => reminder(c, req.body),
    );
  }),
);
operationsRouter.get(
  "/options",
  endpoint((req) =>
    access(req, "help", false, async (c) => ({
      members: (
        await c.tx.query(
          'SELECT m.user_id,u.name,m.role FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.company_id=$1',
          [c.companyId],
        )
      ).rows,
      clients: (
        await c.tx.query(
          "SELECT id,data->>'name' AS name FROM records WHERE company_id=$1 AND kind='clients' AND deleted_at IS NULL ORDER BY data->>'name'",
          [c.companyId],
        )
      ).rows,
      products: allowed(c.role, "products")
        ? (
            await c.tx.query(
              "SELECT id,data,version FROM records WHERE company_id=$1 AND kind='products' AND deleted_at IS NULL ORDER BY data->>'name'",
              [c.companyId],
            )
          ).rows
        : [],
      files: allowed(c.role, "files")
        ? (
            await c.tx.query("SELECT id,name FROM files WHERE company_id=$1", [
              c.companyId,
            ])
          ).rows
        : [],
    })),
  ),
);
operationsRouter.get(
  "/crm",
  endpoint((req) => access(req, "clients", false, crm)),
);
operationsRouter.post(
  "/contact",
  endpoint((req) =>
    access(req, "clients", true, async (c) => {
      const b = z
        .object({
          clientId: z.string().max(100),
          text: z.string().min(2).max(3000),
          channel: z.enum(["phone", "email", "whatsapp", "meeting", "note"]),
          date: z.iso.date(),
        })
        .parse(req.body);
      await c.tx.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [
        c.companyId,
      ]);
      assert(
        (
          await c.tx.query(
            "SELECT 1 FROM records WHERE company_id=$1 AND id=$2 AND kind='clients' AND deleted_at IS NULL",
            [c.companyId, b.clientId],
          )
        ).rows.length,
        "Cliente não encontrado",
        404,
      );
      return putDocument(c, "contact", randomUUID(), b, null);
    }),
  ),
);
operationsRouter.put(
  "/pipeline",
  endpoint((req) =>
    access(req, "settings", true, async (c) => {
      const b = z
        .object({
          version: z.number().int().positive().nullable(),
          stages: z
            .array(
              z.object({
                id: z.string().regex(/^[a-z0-9-]{2,40}$/),
                label: z.string().min(2).max(80),
              }),
            )
            .min(3)
            .max(15),
          templates: z.array(z.string().min(5).max(1500)).max(10),
        })
        .parse(req.body);
      assert(
        new Set(b.stages.map((s) => s.id)).size === b.stages.length &&
          ["won", "lost"].every((id) => b.stages.some((s) => s.id === id)),
        "Inclua etapas únicas com identificadores won e lost",
      );
      const active = (
        await c.tx.query(
          "SELECT data FROM records WHERE company_id=$1 AND kind='opportunities' AND deleted_at IS NULL",
          [c.companyId],
        )
      ).rows;
      assert(
        active.every((r) =>
          b.stages.some((s) => s.id === (r.data.pipelineStage || r.data.stage)),
        ),
        "Mova as oportunidades antes de remover uma etapa em uso",
      );
      return putDocument(
        c,
        "pipeline",
        "settings",
        { stages: b.stages, templates: b.templates },
        b.version,
      );
    }),
  ),
);
operationsRouter.get(
  "/history/:id",
  endpoint((req) =>
    access(req, "help", false, (c) => recordHistory(c, req.params.id)),
  ),
);
operationsRouter.get(
  "/search/:kind",
  endpoint((req) =>
    access(
      req,
      req.params.kind === "opportunities" ? "clients" : req.params.kind,
      false,
      async (c) => {
        const kind = z
            .string()
            .regex(/^[a-z]+$/)
            .parse(req.params.kind),
          q = z
            .string()
            .max(150)
            .parse(req.query.q ?? ""),
          page = z.coerce
            .number()
            .int()
            .min(1)
            .max(10000)
            .parse(req.query.page ?? 1),
          status = z
            .string()
            .max(30)
            .parse(req.query.status ?? "all");
        const where =
          "company_id=$1 AND kind=$2 AND deleted_at IS NULL AND (data->>'name' ILIKE $3 OR data->>'email' ILIKE $3 OR data->>'phone' ILIKE $3 OR data->>'sku' ILIKE $3 OR data->>'category' ILIKE $3) AND ($4='all' OR data->>'status'=$4)";
        const params = [c.companyId, kind, "%" + q + "%", status];
        const total = Number(
          (
            await c.tx.query(
              "SELECT count(*) AS n FROM records WHERE " + where,
              params,
            )
          ).rows[0].n,
        );
        const rows = (
          await c.tx.query(
            "SELECT * FROM records WHERE " +
              where +
              " ORDER BY updated_at DESC,id LIMIT 50 OFFSET $5",
            [...params, (page - 1) * 50],
          )
        ).rows;
        return { rows, total, page, limit: 50 };
      },
    ),
  ),
);
operationsRouter.get(
  "/filters/:kind",
  endpoint((req) =>
    access(req, "help", false, async (c) =>
      (await documents(c, "filter")).filter(
        (d) => d.data.kind === req.params.kind && d.data.userId === c.userId,
      ),
    ),
  ),
);
operationsRouter.post(
  "/filters",
  endpoint((req) =>
    access(req, "help", false, async (c) => {
      const b = z
        .object({
          name: z.string().min(2).max(80),
          kind: z.string().max(30),
          q: z.string().max(150),
          status: z.string().max(30),
        })
        .parse(req.body);
      assert(
        (await documents(c, "filter")).filter((f) => f.data.userId === c.userId)
          .length < 30,
        "Limite de 30 filtros salvos por usuário",
      );
      return putDocument(
        c,
        "filter",
        randomUUID(),
        { ...b, userId: c.userId },
        null,
      );
    }),
  ),
);
operationsRouter.post(
  "/bulk",
  endpoint((req) =>
    access(
      req,
      req.body.kind === "opportunities" ? "clients" : req.body.kind,
      true,
      async (c) => {
        const b = z
          .object({
            kind: z.string().max(30),
            ids: z.array(z.string().max(100)).min(1).max(100),
            confirmed: z.literal(true),
            key: z.string().min(8).max(100),
          })
          .parse(req.body);
        const previous = (await documents(c, "bulk")).find(
          (d) => d.entity_key === b.key,
        );
        if (previous) return previous;
        for (const id of new Set(b.ids)) {
          const r = (
            await c.tx.query(
              "SELECT * FROM records WHERE company_id=$1 AND id=$2 AND kind=$3 AND deleted_at IS NULL",
              [c.companyId, id, b.kind],
            )
          ).rows[0];
          assert(r, "Registro selecionado não encontrado", 404);
          if (b.kind === "products")
            assert(
              !(
                await c.tx.query(
                  "SELECT 1 FROM stock WHERE company_id=$1 AND product_id=$2 AND (quantity>0 OR reserved>0)",
                  [c.companyId, id],
                )
              ).rows.length,
              "Produto possui estoque ou reserva; ajuste antes de arquivar",
            );
          await c.tx.query(
            "UPDATE records SET deleted_at=now() WHERE company_id=$1 AND id=$2",
            [c.companyId, id],
          );
        }
        return putDocument(
          c,
          "bulk",
          b.key,
          {
            ids: b.ids,
            kind: b.kind,
            undoUntil: new Date(Date.now() + 600000).toISOString(),
            undone: false,
          },
          null,
        );
      },
    ),
  ),
);
operationsRouter.post(
  "/bulk/:id/undo",
  endpoint(async (req) => {
    const kind = await access(req, "help", false, async (c) => {
      const d = (await documents(c, "bulk")).find(
        (d) => d.id === req.params.id,
      );
      assert(d, "Operação não encontrada", 404);
      return d.data.kind;
    });
    return access(
      req,
      kind === "opportunities" ? "clients" : kind,
      true,
      async (c) => {
        const doc = (await documents(c, "bulk")).find(
          (d) => d.id === req.params.id,
        );
        assert(
          doc && new Date(doc.data.undoUntil) > new Date(),
          "Prazo de desfazer encerrado",
          409,
        );
        if (doc.data.undone) return { ok: true };
        await c.tx.query(
          "UPDATE records SET deleted_at=NULL WHERE company_id=$1 AND id=ANY($2::text[])",
          [c.companyId, doc.data.ids],
        );
        return putDocument(
          c,
          "bulk",
          doc.entity_key,
          { ...doc.data, undone: true },
          doc.version,
        );
      },
    );
  }),
);
operationsRouter.get(
  "/orders/:id",
  endpoint((req) =>
    access(req, "orders", false, async (c) => {
      const o = (
        await c.tx.query("SELECT * FROM orders WHERE company_id=$1 AND id=$2", [
          c.companyId,
          req.params.id,
        ])
      ).rows[0];
      assert(o, "Trabalho não encontrado", 404);
      return {
        order: o,
        execution:
          (
            await c.tx.query(
              "SELECT * FROM operation_documents WHERE company_id=$1 AND kind='execution' AND entity_key=$2",
              [c.companyId, o.id],
            )
          ).rows[0] ?? null,
        movements: (
          await c.tx.query(
            "SELECT * FROM movements WHERE company_id=$1 AND order_id=$2 ORDER BY created_at",
            [c.companyId, o.id],
          )
        ).rows,
      };
    }),
  ),
);
operationsRouter.put(
  "/orders/:id",
  endpoint((req) =>
    access(req, "orders", true, (c) =>
      execution(
        c,
        req.params.id,
        req.body.data,
        z.number().int().positive().nullable().parse(req.body.version),
      ),
    ),
  ),
);
operationsRouter.post(
  "/orders/:id/material",
  endpoint((req) =>
    access(req, "orders", true, (c) => consume(c, req.params.id, req.body)),
  ),
);
operationsRouter.post(
  "/orders/:id/purchase-list",
  endpoint((req) =>
    access(req, "purchases", true, async (c) => {
      const b = z
        .object({
          items: z
            .array(
              z.object({
                productId: z.string().max(100),
                quantity: z.number().int().positive().max(100000),
              }),
            )
            .min(1)
            .max(100),
          key: z.string().min(8).max(100),
        })
        .parse(req.body);
      const previous = (await documents(c, "project-list")).find(
        (d) => d.entity_key === b.key,
      );
      if (previous) return previous.data;
      const o = (
        await c.tx.query("SELECT * FROM orders WHERE company_id=$1 AND id=$2", [
          c.companyId,
          req.params.id,
        ])
      ).rows[0];
      assert(o, "Trabalho não encontrado", 404);
      const list = await createList(c, {
        name: "Materiais · " + o.snapshot.title,
        orderId: o.id,
        quoteId: o.quote_id,
      });
      for (const item of b.items) {
        const p = (
          await c.tx.query(
            "SELECT data FROM records WHERE company_id=$1 AND id=$2 AND kind='products' AND deleted_at IS NULL",
            [c.companyId, item.productId],
          )
        ).rows[0];
        assert(p, "Produto não encontrado", 404);
        await saveListItem(c, list.id, {
          material: p.data.name,
          specification: p.data.specification,
          quantity: String(item.quantity),
          unit: p.data.unit,
        });
      }
      await putDocument(c, "project-list", b.key, list, null);
      return list;
    }),
  ),
);
operationsRouter.get(
  "/receipts",
  endpoint((req) =>
    access(req, "purchases", false, async (c) => ({
      items: (
        await c.tx.query(
          "SELECT i.*,l.name AS list_name,l.order_id,coalesce(r.received_milli,0) AS received_milli FROM purchase_list_items i JOIN purchase_lists l ON l.company_id=i.company_id AND l.id=i.list_id LEFT JOIN(SELECT list_item_id,sum(purchase_milli) AS received_milli FROM purchase_receipts WHERE company_id=$1 GROUP BY list_item_id)r ON r.list_item_id=i.id WHERE i.company_id=$1 ORDER BY i.created_at DESC",
          [c.companyId],
        )
      ).rows,
      receipts: (
        await c.tx.query(
          "SELECT * FROM purchase_receipts WHERE company_id=$1 ORDER BY created_at DESC LIMIT 200",
          [c.companyId],
        )
      ).rows,
    })),
  ),
);
operationsRouter.post(
  "/receipts",
  endpoint((req) => access(req, "stock", true, (c) => receive(c, req.body))),
);
operationsRouter.post(
  "/pricing",
  endpoint((req) => access(req, "products", true, (c) => price(c, req.body))),
);
operationsRouter.get(
  "/pricing",
  endpoint((req) =>
    access(req, "products", false, (c) => {
      assert(canCosts(c.role), "Sem acesso a custos e premissas de preço", 403);
      return documents(c, "pricing");
    }),
  ),
);
operationsRouter.post(
  "/installments",
  endpoint((req) =>
    access(req, "finance", true, (c) => createInstallments(c, req.body)),
  ),
);
operationsRouter.get(
  "/accounts",
  endpoint((req) =>
    access(req, "finance", false, async (c) => {
      const accounts = (
        await c.tx.query(
          "SELECT * FROM financial_accounts WHERE company_id=$1 ORDER BY name",
          [c.companyId],
        )
      ).rows;
      const payments = (
        await c.tx.query(
          "SELECT p.account_id,p.amount_cents,l.direction FROM payments p JOIN ledger l ON l.company_id=p.company_id AND l.id=p.ledger_id WHERE p.company_id=$1",
          [c.companyId],
        )
      ).rows;
      const transfers = (
        await c.tx.query(
          "SELECT * FROM account_transfers WHERE company_id=$1 ORDER BY paid_at DESC",
          [c.companyId],
        )
      ).rows;
      return {
        accounts: accounts.map((a) => ({
          ...a,
          balanceCents:
            Number(a.opening_cents) +
            payments
              .filter((p) => p.account_id === a.id)
              .reduce(
                (n, p) =>
                  n + (p.direction === "in" ? 1 : -1) * Number(p.amount_cents),
                0,
              ) +
            transfers.reduce(
              (n, t) =>
                n +
                (t.to_id === a.id
                  ? Number(t.amount_cents)
                  : t.from_id === a.id
                    ? -Number(t.amount_cents)
                    : 0),
              0,
            ),
        })),
        transfers,
        unassignedCents: payments
          .filter((p) => !p.account_id)
          .reduce(
            (n, p) =>
              n + (p.direction === "in" ? 1 : -1) * Number(p.amount_cents),
            0,
          ),
      };
    }),
  ),
);
operationsRouter.post(
  "/accounts",
  endpoint((req) =>
    access(req, "finance", true, async (c) => {
      const b = z
          .object({
            name: z.string().min(2).max(100),
            openingCents: z.number().int().min(-1000000000).max(1000000000),
          })
          .parse(req.body),
        id = randomUUID();
      assert(
        Number(
          (
            await c.tx.query(
              "SELECT count(*) AS n FROM financial_accounts WHERE company_id=$1",
              [c.companyId],
            )
          ).rows[0].n,
        ) < 30,
        "Limite de 30 contas",
      );
      await c.tx.query(
        "INSERT INTO financial_accounts(id,company_id,name,opening_cents) VALUES($1,$2,$3,$4)",
        [id, c.companyId, b.name, b.openingCents],
      );
      await audit(c, "account.create", id);
      return { id };
    }),
  ),
);
operationsRouter.post(
  "/transfers",
  endpoint((req) =>
    access(req, "finance", true, async (c) => {
      const b = z
        .object({
          fromId: z.string().max(100),
          toId: z.string().max(100),
          amountCents: z.number().int().positive().max(1000000000),
          date: z.iso.date(),
          key: z.string().min(8).max(100),
        })
        .parse(req.body);
      assert(b.fromId !== b.toId, "Selecione contas diferentes");
      const previous = (
        await c.tx.query(
          "SELECT * FROM account_transfers WHERE company_id=$1 AND idempotency_key=$2",
          [c.companyId, b.key],
        )
      ).rows[0];
      if (previous) {
        assert(
          previous.from_id === b.fromId &&
            previous.to_id === b.toId &&
            Number(previous.amount_cents) === b.amountCents,
          "Chave de transferência reutilizada com outros valores",
          409,
        );
        return previous;
      }
      assert(
        (
          await c.tx.query(
            "SELECT id FROM financial_accounts WHERE company_id=$1 AND id=ANY($2::text[]) AND active=true FOR UPDATE",
            [c.companyId, [b.fromId, b.toId]],
          )
        ).rows.length === 2,
        "Contas não encontradas nesta empresa",
      );
      const id = randomUUID();
      await c.tx.query(
        "INSERT INTO account_transfers(id,company_id,from_id,to_id,amount_cents,paid_at,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id, c.companyId, b.fromId, b.toId, b.amountCents, b.date, b.key],
      );
      await audit(c, "account.transfer", id);
      return { id };
    }),
  ),
);
operationsRouter.get(
  "/reports",
  endpoint((req) =>
    access(req, "reports", false, (c) => reports(c, req.query)),
  ),
);
operationsRouter.get(
  "/reports/export",
  endpoint((req, res) =>
    access(req, "reports", false, async (c) => {
      assert(
        allowed(c.role, "reports", "export"),
        "Sem permissão para exportar",
        403,
      );
      const data = await reports(c, req.query);
      await audit(c, "report.export");
      res
        .attachment("relatorio-impulsa.csv")
        .type("text/csv")
        .send(
          toCsv(
            data.indicators.map((i) => ({
              Indicador: i.title,
              Valor: i.value ?? "Sem informação",
              Unidade: i.unit,
              Definicao: i.definition,
              Atualizacao: data.updatedAt,
            })),
            ["Indicador", "Valor", "Unidade", "Definicao", "Atualizacao"],
          ),
        );
    }),
  ),
);
operationsRouter.post(
  "/imports/preview",
  endpoint((req) =>
    access(req, req.body.kind === "bank" ? "finance" : "imports", true, (c) =>
      previewImport(c, req.body),
    ),
  ),
);
operationsRouter.post(
  "/imports",
  endpoint((req) =>
    access(req, req.body.kind === "bank" ? "finance" : "imports", true, (c) =>
      queueImport(c, req.body),
    ),
  ),
);
operationsRouter.get(
  "/imports",
  endpoint((req) =>
    access(
      req,
      req.query.kind === "bank" ? "finance" : "imports",
      false,
      async (c) =>
        (
          await c.tx.query(
            "SELECT id,kind,status,cursor,row_count AS total,result,created_at FROM import_jobs WHERE company_id=$1 AND ($2='bank' AND kind='bank' OR $2<>'bank' AND kind<>'bank') ORDER BY created_at DESC LIMIT 20",
            [c.companyId, req.query.kind ?? "records"],
          )
        ).rows,
    ),
  ),
);
operationsRouter.post(
  "/imports/:id/process",
  endpoint(async (req) => {
    const kind = await access(req, "help", false, async (c) => {
      const job = (
        await c.tx.query(
          "SELECT kind FROM import_jobs WHERE company_id=$1 AND id=$2",
          [c.companyId, req.params.id],
        )
      ).rows[0];
      assert(job, "Importação não encontrada", 404);
      return job.kind;
    });
    return access(req, kind === "bank" ? "finance" : "imports", true, (c) =>
      processImport(c, req.params.id),
    );
  }),
);
operationsRouter.post(
  "/quotes/:id/revision",
  endpoint((req) =>
    access(req, "quotes", true, async (c) => {
      const q = await getQuote(c, req.params.id);
      assert(q.status !== "draft", "Edite o rascunho atual");
      const result = await createQuote(c, q.data);
      await c.tx.query(
        "UPDATE quotes SET revises_id=$3 WHERE company_id=$1 AND id=$2",
        [c.companyId, result.id, q.id],
      );
      await audit(c, "quote.revision", result.id);
      return result;
    }),
  ),
);
operationsRouter.get(
  "/quotes/:id/history",
  endpoint((req) =>
    access(
      req,
      "quotes",
      false,
      async (c) =>
        (
          await c.tx.query(
            "SELECT version,data,created_at FROM quote_versions WHERE company_id=$1 AND quote_id=$2 ORDER BY version",
            [c.companyId, req.params.id],
          )
        ).rows,
    ),
  ),
);
operationsRouter.get(
  "/support",
  endpoint((req) => access(req, "help", false, (c) => documents(c, "support"))),
);
operationsRouter.post(
  "/support",
  endpoint((req) =>
    access(req, "help", false, async (c) => {
      await rate(c.tx, "support:" + c.userId, 10, 3600);
      const b = z
        .object({
          subject: z.string().min(3).max(120),
          category: z.enum(["question", "problem", "suggestion"]),
          description: z.string().min(10).max(3000),
        })
        .parse(req.body);
      return putDocument(
        c,
        "support",
        randomUUID(),
        { ...b, status: "open", userId: c.userId },
        null,
      );
    }),
  ),
);
operationsRouter.put(
  "/support/:id",
  endpoint((req) =>
    access(req, "settings", true, async (c) => {
      const b = z
        .object({
          status: z.enum(["open", "resolved"]),
          reply: z.string().max(2000),
          version: z.number().int().positive(),
        })
        .parse(req.body);
      const doc = (await documents(c, "support")).find(
        (d) => d.id === req.params.id,
      );
      assert(doc, "Solicitação não encontrada", 404);
      return putDocument(
        c,
        "support",
        doc.entity_key,
        { ...doc.data, status: b.status, reply: b.reply },
        b.version,
      );
    }),
  ),
);
operationsRouter.post(
  "/ownership/request",
  endpoint(async (req) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    assert(session, "Entre na sua conta", 401);
    await auth.api.verifyPassword({
      headers: fromNodeHeaders(req.headers),
      body: { password: z.string().min(1).max(128).parse(req.body.password) },
    });
    return access(req, "team", true, async (c) => {
      assert(
        c.role === "owner",
        "Somente o proprietário pode transferir a empresa",
        403,
      );
      const toId = z.string().max(100).parse(req.body.userId);
      assert(toId !== c.userId, "Selecione outro membro");
      const user = (
        await c.tx.query(
          'SELECT u.email FROM memberships m JOIN "user"u ON u.id=m.user_id WHERE m.company_id=$1 AND m.user_id=$2 AND u."emailVerified"=true',
          [c.companyId, toId],
        )
      ).rows[0];
      assert(user, "Destinatário precisa ser membro com e-mail confirmado");
      const value = token(),
        id = randomUUID();
      await c.tx.query(
        "INSERT INTO ownership_transfers(id,company_id,from_id,to_id,token_hash,expires) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour')",
        [id, c.companyId, c.userId, toId, hash(value)],
      );
      await sendMail(
        user.email,
        "Confirme a transferência de propriedade · Impulsa",
        `Confirme a transferência solicitada pelo proprietário. Entre na sua conta e acesse:\n${config.url}/app/equipe?company=${c.companyId}&transfer=${value}\nO link expira em uma hora.`,
      );
      await audit(c, "ownership.request", id);
      return {
        ok: true,
        mailMode: process.env.SMTP_HOST ? "smtp" : "development-capture",
      };
    });
  }),
);
operationsRouter.post(
  "/ownership/accept",
  endpoint(async (req) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    assert(session, "Entre na sua conta", 401);
    if (config.enforceMfa)
      assert(
        session.user.twoFactorEnabled,
        "Ative duas etapas antes de receber a propriedade",
        403,
      );
    await auth.api.verifyPassword({
      headers: fromNodeHeaders(req.headers),
      body: { password: z.string().min(1).max(128).parse(req.body.password) },
    });
    return access(req, "help", false, async (c) => {
      const value = z.string().min(20).max(100).parse(req.body.token);
      try {
        await c.tx.query("SELECT accept_ownership_transfer($1,$2)", [
          hash(value),
          c.userId,
        ]);
      } catch (e: any) {
        if (e.code === "P0001")
          throw new HttpError(
            400,
            "Transferência inválida, expirada, já utilizada ou com membros alterados.",
          );
        throw e;
      }
      await audit(c, "ownership.accept");
      return { ok: true };
    });
  }),
);
