import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { fromNodeHeaders } from "better-auth/node";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import multer from "multer";
import PDFDocument from "pdfkit";
import {
  billingConfigured,
  startCheckout,
  cancelSubscription,
} from "./billing.js";
import { auth, sendMail } from "./auth.js";
import { allowed, sanitize, type Module } from "../shared/access.js";
import { authorize, nextRecurrence } from "./operation-service.js";
import { operationsRouter } from "./operations.js";
import { sql, transaction } from "./db.js";
import { config } from "./config.js";
import { growthRouter, growthAdminRouter } from "./growth.js";
import { catalogRouter } from "./catalog.js";
import { materialRouter } from "./material-routes.js";
import { cities, canonicalProfile } from "./locations.js";
import { kinds, profileSchema, recordSchema, money } from "../shared/domain.js";
import {
  tenant,
  audit,
  assert,
  HttpError,
  saveRecord,
  createQuote,
  getQuote,
  approveQuote,
  convertQuote,
  completeOrder,
  createRetailOrder,
  returnRetailItem,
  movement,
  pay,
  token,
  hash,
  rate,
  type Context,
  subscriptionActive,
  type Actor,
} from "./service.js";
export const router = Router();
router.use("/catalog", catalogRouter);
router.use("/growth-admin", growthAdminRouter);
router.use("/:company/growth", growthRouter);
router.use("/:company/materials", materialRouter);
router.use("/:company/operations", operationsRouter);
router.get("/health", routeHealth);
async function routeHealth(_req: Request, res: Response) {
  try {
    await sql.query("SELECT 1");
    res.json({
      status: "ok",
      database: "ready",
      time: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
}
router.get("/locations", (_req, res) =>
  res.json({ cities, source: "IBGE", updatedAt: "2026-11-08" }),
);
type Handler = (req: Request, res: Response) => Promise<unknown>;
const route =
  (f: Handler) => (req: Request, res: Response, next: NextFunction) => {
    void f(req, res).catch(next);
  };
async function actor(req: Request) {
  const s = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  assert(s, "Entre na sua conta para continuar", 401);
  return s.user as Actor;
}
const ctx = (
  req: Request,
  permission: string,
  fn: (c: Context) => Promise<any>,
  write = false,
  pendingProfile = false,
) =>
  actor(req).then((a) =>
    tenant(
      a,
      String(req.params.company),
      permission,
      async (c) => {
        const section = req.path.split("/")[2];
        const map: Record<string, Module> = {
          records: (req.params.kind === "opportunities"
            ? "clients"
            : req.params.kind) as Module,
          quotes: "quotes",
          orders: "orders",
          stock: "stock",
          finance: "finance",
          files: "files",
          team: "team",
          invitations: "team",
          audit: "settings",
          import: "imports",
          export: "imports",
        };
        if (map[section] && !(section === "team" && !write))
          authorize(c, map[section], write);
        if (section === "export")
          assert(
            ["owner", "admin"].includes(c.role),
            "Exportação geral restrita à administração da empresa",
            403,
          );
        const value = await fn(c);
        if (section === "overview") {
          value.records = value.records.filter((r: any) =>
            allowed(c.role, r.kind === "opportunities" ? "clients" : r.kind),
          );
          if (!allowed(c.role, "quotes")) value.quotes = [];
          if (!allowed(c.role, "orders")) value.orders = [];
          if (!allowed(c.role, "stock")) value.stock = [];
          if (!allowed(c.role, "finance")) value.finance = null;
        }
        if (section === "team" && !allowed(c.role, "team")) {
          value.members = value.members.map(({ user_id, name, role }: any) => ({
            user_id,
            name,
            role,
          }));
          value.invitations = [];
        }
        return sanitize(value, c.role);
      },
      write,
      pendingProfile,
    ),
  );
const json = (f: (req: Request) => Promise<any>) =>
  route(async (req, res) => res.json(await f(req)));
const idSchema = z.string().min(1).max(100);
const dateSchema = z.iso.date();
router.post(
  "/email-reauth",
  json(async (req) => {
    const a = await actor(req);
    await transaction((tx) => rate(tx, "email-reauth:" + a.id, 5, 300));
    await auth.api.verifyPassword({
      headers: fromNodeHeaders(req.headers),
      body: { password: z.string().min(1).max(128).parse(req.body.password) },
    });
    return { ok: true };
  }),
);
router.get(
  "/email-status",
  json(async (req) => {
    await actor(req);
    return { mode: process.env.SMTP_HOST ? "smtp" : "development-capture" };
  }),
);
router.get("/config", (_req, res) =>
  res.json({
    name: process.env.BRAND_NAME ?? "Impulsa",
    logo: process.env.BRAND_LOGO ?? "/icon.svg",
    tagline: "Seu negócio organizado, do primeiro orçamento ao próximo passo.",
    color: process.env.BRAND_COLOR ?? "#4145b7",
    trialDays: config.trialDays,
    plans: config.plans,
    institution: config.institution,
    termsVersion: config.termsVersion,
    privacyVersion: config.privacyVersion,
    integrations: {
      mail: !!process.env.SMTP_HOST,
      billing: billingConfigured(),
      ai: !!process.env.AI_API_KEY,
      search: !!process.env.BRAVE_SEARCH_API_KEY,
    },
    enforceMfa: config.enforceMfa,
  }),
);
router.get(
  "/me",
  json(async (req) => {
    const a = await actor(req);
    return transaction(async (tx) => {
      await tx.query("SELECT set_config('app.user_id',$1,true)", [a.id]);
      return {
        user: a,
        platformAdmin:
          a.emailVerified === true &&
          !!(
            await tx.query("SELECT 1 FROM platform_admins WHERE user_id=$1", [
              a.id,
            ])
          ).rows.length,
        companies: (
          await tx.query(
            "SELECT c.id,c.name,c.profile,c.profile_version,c.trial_end,c.plan,c.subscription_status,m.role FROM memberships m JOIN companies c ON c.id=m.company_id WHERE m.user_id=$1 ORDER BY c.created_at",
            [a.id],
          )
        ).rows,
        consent:
          (
            await tx.query(
              "SELECT terms_version,privacy_version,promotional FROM consents WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
              [a.id],
            )
          ).rows[0] ?? null,
      };
    });
  }),
);
router.post(
  "/consent",
  json(async (req) => {
    const a = await actor(req);
    const v = z
      .object({ accepted: z.literal(true), promotional: z.boolean() })
      .parse(req.body);
    await sql.query(
      "INSERT INTO consents(id,user_id,terms_version,privacy_version,promotional) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        a.id,
        config.termsVersion,
        config.privacyVersion,
        v.promotional,
      ],
    );
    return { ok: true };
  }),
);
router.post(
  "/companies",
  json(async (req) => {
    const a = await actor(req);
    const p = canonicalProfile(profileSchema.parse(req.body));
    assert(
      (
        await sql.query(
          "SELECT 1 FROM consents WHERE user_id=$1 AND terms_version=$2",
          [a.id, config.termsVersion],
        )
      ).rows.length,
      "Aceite os Termos de Uso antes de criar sua empresa",
    );
    return transaction(async (tx) => {
      await tx.query("SELECT set_config('app.user_id',$1,true)", [a.id]);
      await rate(tx, `company:${a.id}`, 5, 3600);
      if (a.emailVerified === false)
        assert(
          !(
            await tx.query("SELECT 1 FROM memberships WHERE user_id=$1", [a.id])
          ).rows.length,
          "Confirme seu e-mail antes de criar outra empresa",
          403,
        );
      const id = randomUUID();
      await tx.query(
        "INSERT INTO companies(id,name,profile,trial_end,owner_id) VALUES($1,$2,$3,now()+($4::text||' days')::interval,$5)",
        [id, p.name, JSON.stringify(p), config.trialDays, a.id],
      );
      await tx.query(
        "INSERT INTO memberships(company_id,user_id,role) VALUES($1,$2,'owner')",
        [id, a.id],
      );
      return { id, version: 1 };
    });
  }),
);
router.get(
  "/:company/profile",
  json((req) =>
    ctx(
      req,
      "settings",
      async (c) => ({
        profile: c.company.profile,
        version: c.company.profile_version,
      }),
      false,
      true,
    ),
  ),
);
router.put(
  "/:company/profile",
  json((req) =>
    ctx(
      req,
      "settings",
      async (c) => {
        const p = canonicalProfile(profileSchema.parse(req.body));
        const version = z.number().int().positive().parse(req.body.version);
        const updated = await c.tx.query(
          "UPDATE companies SET name=$2,profile=$3,profile_version=profile_version+1 WHERE id=$1 AND profile_version=$4 RETURNING profile_version",
          [c.companyId, p.name, JSON.stringify(p), version],
        );
        assert(
          updated.rows.length,
          "O perfil foi atualizado em outra aba. Seus campos foram preservados; revise a versão atual antes de salvar.",
          409,
        );
        await audit(c, "company.profile");
        return { ok: true, version: updated.rows[0].profile_version };
      },
      true,
      true,
    ),
  ),
);
router.get(
  "/:company/overview",
  json((req) =>
    ctx(req, "read", async (c) => {
      const records = (
        await c.tx.query(
          "SELECT id,kind,data FROM records WHERE company_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC",
          [c.companyId],
        )
      ).rows;
      const quotes = (
        await c.tx.query(
          "SELECT id,number,status,total_cents,data,version,approved_version,revises_id,updated_at,created_at,adjustment_requested_at,adjustment_contact,adjustment_message FROM quotes WHERE company_id=$1 ORDER BY created_at DESC",
          [c.companyId],
        )
      ).rows;
      const stock = (
        await c.tx.query(
          "SELECT s.*,r.data FROM stock s JOIN records r ON r.id=s.product_id AND r.company_id=s.company_id WHERE s.company_id=$1 AND r.deleted_at IS NULL",
          [c.companyId],
        )
      ).rows;
      const finance =
        c.role === "member"
          ? null
          : (
              await c.tx.query(
                "SELECT l.direction,coalesce(sum(l.amount_cents),0) AS planned,coalesce(sum(p.paid),0) AS paid FROM ledger l LEFT JOIN (SELECT ledger_id,sum(amount_cents) AS paid FROM payments WHERE company_id=$1 GROUP BY ledger_id) p ON p.ledger_id=l.id WHERE l.company_id=$1 GROUP BY l.direction",
                [c.companyId],
              )
            ).rows;
      return {
        records,
        quotes: quotes.map((q) => ({
          ...q,
          status:
            q.status === "sent" &&
            q.data.validUntil < new Date().toISOString().slice(0, 10)
              ? "expired"
              : q.status,
        })),
        stock,
        finance,
        orders: (
          await c.tx.query(
            "SELECT * FROM orders WHERE company_id=$1 ORDER BY created_at DESC",
            [c.companyId],
          )
        ).rows,
      };
    }),
  ),
);
router.get(
  "/:company/records/:kind",
  json((req) =>
    ctx(req, "read", async (c) => {
      const kind = z.enum(kinds).parse(req.params.kind);
      return (
        await c.tx.query(
          "SELECT * FROM records WHERE company_id=$1 AND kind=$2 AND deleted_at IS NULL ORDER BY created_at DESC",
          [c.companyId, kind],
        )
      ).rows;
    }),
  ),
);
router.post(
  "/:company/records/:kind",
  json((req) =>
    ctx(
      req,
      "write",
      (c) => saveRecord(c, z.enum(kinds).parse(req.params.kind), req.body),
      true,
    ),
  ),
);
router.put(
  "/:company/records/:kind/:id",
  json((req) =>
    ctx(
      req,
      "write",
      (c) =>
        saveRecord(
          c,
          z.enum(kinds).parse(req.params.kind),
          req.body,
          idSchema.parse(req.params.id),
          z.number().int().positive().parse(req.body.version),
        ),
      true,
    ),
  ),
);
router.delete(
  "/:company/records/:kind/:id",
  json((req) =>
    ctx(
      req,
      "write",
      async (c) => {
        const kind = z.enum(kinds).parse(req.params.kind);
        const id = idSchema.parse(req.params.id);
        if (kind === "products") {
          const used = (
            await c.tx.query(
              "SELECT 1 FROM stock WHERE company_id=$1 AND product_id=$2 AND (quantity>0 OR reserved>0)",
              [c.companyId, id],
            )
          ).rows;
          assert(
            !used.length,
            "Zere o estoque e conclua reservas antes de arquivar este produto",
          );
        }
        const r = await c.tx.query(
          "UPDATE records SET deleted_at=now() WHERE company_id=$1 AND id=$2 AND kind=$3 AND deleted_at IS NULL RETURNING id",
          [c.companyId, id, kind],
        );
        assert(r.rows.length, "Registro não encontrado", 404);
        await audit(c, `${kind}.archive`, id);
        return { ok: true };
      },
      true,
    ),
  ),
);
router.post(
  "/:company/import/clients",
  json((req) =>
    ctx(
      req,
      "write",
      async (c) => {
        await rate(c.tx, `import:${c.userId}`, 5, 3600);
        const rows = z.array(recordSchema).max(200).parse(req.body);
        const result = [];
        for (const row of rows)
          result.push(await saveRecord(c, "clients", row));
        return { count: result.length };
      },
      true,
    ),
  ),
);
router.get(
  "/:company/export",
  json((req) =>
    ctx(req, "export", async (c) => {
      await rate(c.tx, `export:${c.userId}`, 5, 3600);
      await audit(c, "company.export");
      const result: Record<string, any> = {
        company: { name: c.company.name, profile: c.company.profile },
      };
      for (const t of [
        "records",
        "quotes",
        "orders",
        "ledger",
        "payments",
        "stock",
        "movements",
        "audit",
        "privacy_requests",
        "material_searches",
        "material_favorites",
        "purchase_lists",
        "purchase_list_items",
        "material_offers",
        "operation_documents",
        "record_versions",
        "quote_versions",
        "purchase_receipts",
        "financial_accounts",
        "account_transfers",
        "import_jobs",
      ])
        result[t] = (
          await c.tx.query(`SELECT * FROM ${t} WHERE company_id=$1`, [
            c.companyId,
          ])
        ).rows;
      return result;
    }),
  ),
);
router.post(
  "/:company/quotes",
  json((req) => ctx(req, "write", (c) => createQuote(c, req.body), true)),
);
router.put(
  "/:company/quotes/:id",
  json((req) =>
    ctx(
      req,
      "write",
      (c) =>
        createQuote(
          c,
          req.body,
          String(req.params.id),
          z.number().int().positive().parse(req.body.version),
        ),
      true,
    ),
  ),
);
router.post(
  "/:company/quotes/:id/action",
  json((req) =>
    ctx(
      req,
      "write",
      async (c) => {
        const b = z
          .object({
            action: z.enum([
              "send",
              "approve",
              "reject",
              "convert",
              "share",
              "revoke",
            ]),
            approvalName: z.string().max(160).default(""),
          })
          .parse(req.body);
        const id = String(req.params.id);
        const q = await getQuote(c, id);
        if (b.action === "approve") {
          assert(b.approvalName.length >= 2, "Informe quem aprovou");
          return approveQuote(c, id, b.approvalName);
        }
        if (b.action === "convert") {
          assert(
            ["owner", "admin", "finance"].includes(c.role),
            "A conversão exige permissão financeira",
            403,
          );
          return convertQuote(c, id);
        }
        if (b.action === "share") {
          assert(
            ["sent", "approved"].includes(q.status),
            "Envie a proposta antes de compartilhar",
          );
          const value = token();
          await c.tx.query(
            "UPDATE quotes SET share_hash=$3,share_expires=least(now()+interval '7 days',($4::date+interval '1 day')) WHERE company_id=$1 AND id=$2",
            [c.companyId, id, hash(value), q.data.validUntil],
          );
          await audit(c, "quote.share", id);
          return { url: `${config.url}/proposta/${value}` };
        }
        if (b.action === "revoke") {
          await c.tx.query(
            "UPDATE quotes SET share_hash=NULL,share_expires=NULL WHERE company_id=$1 AND id=$2",
            [c.companyId, id],
          );
        } else {
          assert(
            b.action === "send"
              ? q.status === "draft"
              : ["draft", "sent"].includes(q.status),
            "Transição de estado inválida",
          );
          await c.tx.query(
            "UPDATE quotes SET status=$3 WHERE company_id=$1 AND id=$2",
            [c.companyId, id, b.action === "send" ? "sent" : "rejected"],
          );
        }
        await audit(c, `quote.${b.action}`, id);
        return { ok: true };
      },
      true,
    ),
  ),
);
router.get(
  "/:company/quotes/:id/pdf",
  route(async (req, res) => {
    const q = await ctx(req, "export", (c) => {
      assert(
        allowed(c.role, "quotes", "export"),
        "Seu papel não pode exportar propostas",
        403,
      );
      return getQuote(c, String(req.params.id));
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="proposta-${q.number}.pdf"`,
    );
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);
    doc.fillColor("#3539a7").fontSize(26).text(q.data.companyName);
    doc
      .fillColor("#17233d")
      .fontSize(18)
      .moveDown()
      .text(`Proposta #${q.number} - ${q.data.title}`);
    doc
      .fontSize(10)
      .text(
        `Versão ${q.version} · ${q.approved_version ? "Aprovada na versão " + q.approved_version : "Documento para revisão"}`,
      );
    doc
      .fontSize(11)
      .moveDown()
      .text(`Cliente: ${q.data.client.name}`)
      .text(`Validade: ${q.data.validUntil.split("-").reverse().join("/")}`);
    doc.moveDown();
    for (const i of q.data.items)
      doc.text(
        `${i.quantity} x ${i.name} | ${money(i.priceCents)} | ${money(i.priceCents * i.quantity)}`,
      );
    doc
      .moveDown()
      .text(`Mão de obra: ${money(q.data.laborCents)}`)
      .text(`Deslocamento: ${money(q.data.travelCents)}`)
      .text(`Desconto: ${money(q.data.discountCents)}`)
      .fontSize(16)
      .text(`Total: ${money(Number(q.total_cents))}`)
      .fontSize(11)
      .moveDown()
      .text(q.data.conditions)
      .moveDown()
      .text(q.data.notes);
    if (q.approved_at)
      doc
        .moveDown()
        .text(
          `Aprovação registrada por ${q.approval_name}. Não equivale a assinatura digital certificada.`,
        );
    doc.end();
  }),
);

router.post(
  "/:company/orders",
  json((req) => ctx(req, "write", (c) => createRetailOrder(c, req.body), true)),
);
router.post(
  "/:company/orders/:id/return",
  json((req) =>
    ctx(
      req,
      "write",
      (c) => {
        authorize(c, "stock", true);
        return returnRetailItem(c, String(req.params.id), req.body);
      },
      true,
    ),
  ),
);
router.post(
  "/:company/orders/:id/complete",
  json((req) =>
    ctx(req, "write", (c) => completeOrder(c, String(req.params.id)), true),
  ),
);
router.get(
  "/:company/stock",
  json((req) =>
    ctx(req, "read", async (c) => ({
      items: (
        await c.tx.query(
          "SELECT s.*,r.data FROM stock s JOIN records r ON r.id=s.product_id AND r.company_id=s.company_id WHERE s.company_id=$1 AND r.deleted_at IS NULL ORDER BY r.data->>'name'",
          [c.companyId],
        )
      ).rows,
      movements: (
        await c.tx.query(
          "SELECT * FROM movements WHERE company_id=$1 ORDER BY created_at DESC LIMIT 200",
          [c.companyId],
        )
      ).rows,
    })),
  ),
);
router.post(
  "/:company/stock/move",
  json((req) =>
    ctx(
      req,
      "write",
      async (c) => {
        const b = z
          .object({
            productId: idSchema,
            delta: z
              .number()
              .int()
              .min(-1000000)
              .max(1000000)
              .refine((n) => n !== 0),
            reason: z.string().min(3).max(200),
            key: z.string().min(8).max(100),
            expires: z.union([dateSchema, z.literal("")]).optional(),
          })
          .parse(req.body);
        return movement(c, b.productId, b.delta, 0, b.reason, b.key, b.expires);
      },
      true,
    ),
  ),
);
router.get(
  "/:company/finance",
  json((req) =>
    ctx(req, "finance", async (c) => ({
      ledger: (
        await c.tx.query(
          "SELECT l.*,coalesce(p.paid,0) AS paid_cents FROM ledger l LEFT JOIN (SELECT ledger_id,sum(amount_cents) AS paid FROM payments WHERE company_id=$1 GROUP BY ledger_id) p ON p.ledger_id=l.id WHERE l.company_id=$1 ORDER BY l.due",
          [c.companyId],
        )
      ).rows,
      payments: (
        await c.tx.query(
          "SELECT * FROM payments WHERE company_id=$1 ORDER BY paid_at DESC",
          [c.companyId],
        )
      ).rows,
    })),
  ),
);
router.post(
  "/:company/finance",
  json((req) =>
    ctx(
      req,
      "finance",
      async (c) => {
        const b = z
          .object({
            name: z.string().min(2).max(160),
            direction: z.enum(["in", "out"]),
            accountId: z.string().max(100).optional(),
            financialKind: z
              .enum(["operating", "withdrawal"])
              .default("operating"),
            category: z.string().max(80).default(""),
            amountCents: z.number().int().positive().max(10000000000),
            due: dateSchema,
            recurrence: z.enum(["none", "monthly"]).default("none"),
          })
          .parse(req.body);
        if (b.accountId)
          assert(
            (
              await c.tx.query(
                "SELECT 1 FROM financial_accounts WHERE company_id=$1 AND id=$2",
                [c.companyId, b.accountId],
              )
            ).rows.length,
            "Conta financeira não encontrada",
            404,
          );
        assert(
          b.financialKind !== "withdrawal" || b.direction === "out",
          "Retirada deve ser uma saída",
        );
        const id = randomUUID();
        await c.tx.query(
          "INSERT INTO ledger(id,company_id,direction,name,category,amount_cents,due,recurrence,account_id,financial_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            id,
            c.companyId,
            b.direction,
            b.name,
            b.category,
            b.amountCents,
            b.due,
            b.recurrence,
            b.accountId || null,
            b.financialKind,
          ],
        );
        await audit(c, "ledger.create", id);
        return { id };
      },
      true,
    ),
  ),
);
router.post(
  "/:company/finance/:id/pay",
  json((req) =>
    ctx(
      req,
      "finance",
      (c) => {
        const b = z
          .object({
            amountCents: z.number().int().positive(),
            key: z.string().min(8).max(100),
            date: dateSchema,
            accountId: z.string().max(100).optional(),
          })
          .parse(req.body);
        return pay(
          c,
          String(req.params.id),
          b.amountCents,
          b.key,
          b.date,
          b.accountId,
        );
      },
      true,
    ),
  ),
);
router.delete(
  "/:company/finance/:id",
  json((req) =>
    ctx(
      req,
      "finance",
      async (c) => {
        const l = (
          await c.tx.query(
            "SELECT * FROM ledger WHERE company_id=$1 AND id=$2 FOR UPDATE",
            [c.companyId, req.params.id],
          )
        ).rows[0];
        assert(l, "Conta não encontrada", 404);
        assert(!l.order_id, "Contas de ordens não podem ser excluídas");
        assert(
          !(
            await c.tx.query(
              "SELECT 1 FROM payments WHERE company_id=$1 AND ledger_id=$2",
              [c.companyId, req.params.id],
            )
          ).rows.length,
          "Contas com pagamentos precisam ser preservadas",
        );
        await c.tx.query("DELETE FROM ledger WHERE company_id=$1 AND id=$2", [
          c.companyId,
          req.params.id,
        ]);
        await audit(c, "ledger.delete", String(req.params.id));
        return { ok: true };
      },
      true,
    ),
  ),
);
router.post(
  "/:company/finance/:id/next",
  json((req) =>
    ctx(req, "finance", (c) => nextRecurrence(c, String(req.params.id)), true),
  ),
);
router.get(
  "/:company/team",
  json((req) =>
    ctx(req, "read", async (c) => ({
      members: (
        await c.tx.query(
          'SELECT m.user_id,m.role,u.name,u.email FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.company_id=$1',
          [c.companyId],
        )
      ).rows,
      invitations:
        c.role === "owner" || c.role === "admin"
          ? (
              await c.tx.query(
                "SELECT id,email,role,expires,accepted_at FROM invitations WHERE company_id=$1 ORDER BY expires DESC",
                [c.companyId],
              )
            ).rows
          : [],
    })),
  ),
);
router.post(
  "/:company/team/invite",
  json((req) =>
    ctx(
      req,
      "team",
      async (c) => {
        await rate(c.tx, `invite:${c.userId}`, 10, 3600);
        const b = z
          .object({
            email: z.email(),
            role: z.enum([
              "admin",
              "member",
              "finance",
              "sales",
              "operations",
              "readonly",
            ]),
          })
          .parse(req.body);
        const n =
          Number(
            (
              await c.tx.query(
                "SELECT count(*) AS n FROM memberships WHERE company_id=$1",
                [c.companyId],
              )
            ).rows[0].n,
          ) +
          Number(
            (
              await c.tx.query(
                "SELECT count(*) AS n FROM invitations WHERE company_id=$1 AND accepted_at IS NULL AND expires>now()",
                [c.companyId],
              )
            ).rows[0].n,
          );
        assert(
          n <
            (c.company.plan === "essencial"
              ? config.plans.essencial.members
              : config.plans.completo.members),
          "Limite de equipe atingido",
          402,
        );
        assert(
          c.role === "owner" || b.role !== "admin",
          "Somente o proprietário pode convidar administradores",
          403,
        );
        const value = token();
        await c.tx.query(
          "INSERT INTO invitations(id,company_id,email,role,token_hash,expires) VALUES($1,$2,$3,$4,$5,now()+interval '48 hours')",
          [
            randomUUID(),
            c.companyId,
            b.email.toLowerCase(),
            b.role,
            hash(value),
          ],
        );
        await sendMail(
          b.email,
          "Convite para a equipe · Impulsa",
          `Acesse ${config.url}/convite/${value} e entre com este e-mail para aceitar. Expira em 48 horas.`,
        );
        await audit(c, "team.invite");
        return { ok: true };
      },
      true,
    ),
  ),
);
router.delete(
  "/:company/team/:userId",
  json((req) =>
    ctx(
      req,
      "team",
      async (c) => {
        assert(
          c.userId !== req.params.userId,
          "Você não pode remover a si mesmo",
        );
        const m = (
          await c.tx.query(
            "SELECT role FROM memberships WHERE company_id=$1 AND user_id=$2",
            [c.companyId, req.params.userId],
          )
        ).rows[0];
        assert(
          m && m.role !== "owner" && (c.role === "owner" || m.role !== "admin"),
          "Não é possível remover esse acesso",
          403,
        );
        await c.tx.query(
          "DELETE FROM memberships WHERE company_id=$1 AND user_id=$2",
          [c.companyId, req.params.userId],
        );
        await audit(c, "team.remove", String(req.params.userId));
        return { ok: true };
      },
      true,
    ),
  ),
);
router.delete(
  "/:company/invitations/:id",
  json((req) =>
    ctx(
      req,
      "team",
      async (c) => {
        await c.tx.query(
          "DELETE FROM invitations WHERE company_id=$1 AND id=$2",
          [c.companyId, req.params.id],
        );
        await audit(c, "invite.revoke", String(req.params.id));
        return { ok: true };
      },
      true,
    ),
  ),
);
router.post(
  "/invitations/accept",
  json(async (req) => {
    const a = await actor(req);
    assert(
      a.emailVerified,
      "Confirme seu e-mail antes de aceitar convites",
      403,
    );
    const value = z.string().min(20).max(100).parse(req.body.token);
    return transaction(async (tx) => {
      await rate(tx, `accept-invite:${a.id}`, 10, 3600);
      try {
        await tx.query("SELECT accept_team_invitation($1,$2)", [
          hash(value),
          a.id,
        ]);
      } catch {
        throw new HttpError(
          400,
          "Convite inválido, expirado, destinado a outro e-mail ou sem vagas no plano.",
        );
      }
      return { ok: true };
    });
  }),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
router.get(
  "/:company/files",
  json((req) =>
    ctx(
      req,
      "read",
      async (c) =>
        (
          await c.tx.query(
            "SELECT id,name,type,category,expires,created_at FROM files WHERE company_id=$1 ORDER BY created_at DESC",
            [c.companyId],
          )
        ).rows,
    ),
  ),
);
router.post(
  "/:company/files",
  upload.single("file"),
  json((req) =>
    ctx(
      req,
      "write",
      async (c) => {
        await rate(c.tx, `upload:${c.companyId}:${c.userId}`, 20, 3600);
        const total = Number(
          (
            await c.tx.query(
              "SELECT coalesce(sum(octet_length(bytes)),0) AS size FROM files WHERE company_id=$1",
              [c.companyId],
            )
          ).rows[0].size,
        );
        const f = req.file;
        assert(f, "Selecione um arquivo");
        assert(
          total + f.size <= Number(process.env.FILE_QUOTA_BYTES ?? 52428800),
          "Cota de arquivos da empresa atingida",
          402,
        );
        const png = f.buffer
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg =
          f.buffer[0] === 255 && f.buffer[1] === 216 && f.buffer[2] === 255;
        const pdf = f.buffer.subarray(0, 5).toString() === "%PDF-";
        assert(
          (f.mimetype === "image/png" && png) ||
            (f.mimetype === "image/jpeg" && jpeg) ||
            (f.mimetype === "application/pdf" && pdf),
          "Envie um PNG, JPEG ou PDF válido de até 5 MB",
        );
        const id = randomUUID();
        await c.tx.query(
          "INSERT INTO files(id,company_id,name,type,bytes,category,expires) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            id,
            c.companyId,
            f.originalname.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 120),
            f.mimetype,
            f.buffer,
            z
              .string()
              .max(80)
              .parse(req.body.category ?? ""),
            req.body.expires ? dateSchema.parse(req.body.expires) : null,
          ],
        );
        await audit(c, "file.upload", id);
        return { id };
      },
      true,
    ),
  ),
);
router.post(
  "/:company/files/:id/link",
  json((req) =>
    ctx(req, "read", async (c) => {
      assert(
        (
          await c.tx.query(
            "SELECT 1 FROM files WHERE company_id=$1 AND id=$2",
            [c.companyId, req.params.id],
          )
        ).rows.length,
        "Arquivo não encontrado",
        404,
      );
      const exp = Date.now() + 60000;
      const payload = `${c.companyId}:${req.params.id}:${c.userId}:${exp}`;
      const sig = createHmac("sha256", config.secret!)
        .update(payload)
        .digest("hex");
      return {
        url: `/api/${c.companyId}/files/${req.params.id}/download?exp=${exp}&sig=${sig}`,
      };
    }),
  ),
);
router.get(
  "/:company/files/:id/download",
  route(async (req, res) => {
    const file = await ctx(req, "read", async (c) => {
      const exp = Number(req.query.exp);
      assert(
        exp > Date.now() && exp < Date.now() + 61000,
        "Link expirado",
        403,
      );
      const wanted = createHmac("sha256", config.secret!)
        .update(`${c.companyId}:${req.params.id}:${c.userId}:${exp}`)
        .digest();
      const actual = Buffer.from(String(req.query.sig), "hex");
      assert(
        actual.length === wanted.length && timingSafeEqual(actual, wanted),
        "Link inválido",
        403,
      );
      const f = (
        await c.tx.query("SELECT * FROM files WHERE company_id=$1 AND id=$2", [
          c.companyId,
          req.params.id,
        ])
      ).rows[0];
      assert(f, "Arquivo não encontrado", 404);
      await audit(c, "file.download", String(req.params.id));
      return f;
    });
    res.setHeader("Content-Type", file.type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    res.send(Buffer.from(file.bytes));
  }),
);
router.delete(
  "/:company/files/:id",
  json((req) =>
    ctx(
      req,
      "write",
      async (c) => {
        await c.tx.query("DELETE FROM files WHERE company_id=$1 AND id=$2", [
          c.companyId,
          req.params.id,
        ]);
        await audit(c, "file.delete", String(req.params.id));
        return { ok: true };
      },
      true,
    ),
  ),
);
router.get(
  "/:company/privacy",
  json((req) =>
    ctx(
      req,
      "read",
      async (c) =>
        (
          await c.tx.query(
            "SELECT * FROM privacy_requests WHERE company_id=$1 AND user_id=$2 ORDER BY created_at DESC",
            [c.companyId, c.userId],
          )
        ).rows,
    ),
  ),
);
router.post(
  "/:company/privacy",
  json((req) =>
    ctx(req, "read", async (c) => {
      await rate(c.tx, `privacy:${c.userId}`, 5, 3600);
      const b = z
        .object({
          type: z.enum(["access", "correction", "deletion"]),
          details: z.string().min(5).max(3000),
        })
        .parse(req.body);
      const id = randomUUID();
      await c.tx.query(
        "INSERT INTO privacy_requests(id,company_id,user_id,type,details) VALUES($1,$2,$3,$4,$5)",
        [id, c.companyId, c.userId, b.type, b.details],
      );
      await audit(c, "privacy.request", id);
      return { id };
    }),
  ),
);
router.get(
  "/:company/audit",
  json((req) =>
    ctx(
      req,
      "settings",
      async (c) =>
        (
          await c.tx.query(
            "SELECT * FROM audit WHERE company_id=$1 ORDER BY created_at DESC LIMIT 200",
            [c.companyId],
          )
        ).rows,
    ),
  ),
);
router.post(
  "/:company/integrations/:type",
  json((req) =>
    ctx(
      req,
      "write",
      async (c) => {
        await rate(c.tx, `integration:${c.userId}`, 10, 3600);
        throw new HttpError(
          503,
          req.params.type === "search"
            ? "Busca externa não configurada. Cadastre fornecedores manualmente e registre a fonte."
            : "Geração com IA indisponível nesta versão. Use o briefing e prepare o material manualmente.",
        );
      },
      true,
    ),
  ),
);
router.get(
  "/:company/billing",
  json((req) =>
    ctx(req, "settings", async (c) => ({
      plan: c.company.plan,
      status: subscriptionActive(c.company)
        ? "active"
        : c.company.subscription_status === "active"
          ? "expired"
          : c.company.subscription_status,
      trialEnd: c.company.trial_end,
      paidUntil: c.company.sandbox_paid_until,
      history: (
        await c.tx.query(
          "SELECT * FROM billing_events WHERE company_id=$1 ORDER BY created_at DESC LIMIT 100",
          [c.companyId],
        )
      ).rows,
      configured: billingConfigured(),
      canCancel:
        c.role === "owner" &&
        billingConfigured() &&
        (
          await c.tx.query(
            "SELECT 1 FROM sandbox_subscriptions WHERE company_id=$1 AND status<>'canceled'",
            [c.companyId],
          )
        ).rows.length > 0,
      canCheckout: c.role === "owner" && billingConfigured(),
    })),
  ),
);
router.post(
  "/:company/billing/checkout",
  json((req) =>
    ctx(
      req,
      "settings",
      async (c) => {
        const body = z
          .object({
            plan: z.enum(["essencial", "completo"]),
            recurringAuthorization: z.literal(true),
          })
          .parse(req.body);
        return startCheckout(c, body.plan);
      },
      true,
    ),
  ),
);
router.post(
  "/:company/billing/cancel",
  json((req) => ctx(req, "settings", cancelSubscription, true)),
);

router.get(
  "/:company/catalog-share",
  json((req) =>
    ctx(req, "settings", async (c) => ({
      active: Boolean(c.company.catalog_share_hash),
    })),
  ),
);
router.post(
  "/:company/catalog-share",
  json((req) =>
    ctx(
      req,
      "settings",
      async (c) => {
        const { share } = z.object({ share: z.boolean() }).parse(req.body);
        const linkToken = share ? token() : null;
        await c.tx.query(
          "UPDATE companies SET catalog_share_hash=$2 WHERE id=$1",
          [c.companyId, linkToken ? hash(linkToken) : null],
        );
        await audit(c, share ? "catalog.share" : "catalog.revoke");
        return {
          active: share,
          url: linkToken ? config.url + "/catalogo-publico/" + linkToken : null,
        };
      },
      true,
    ),
  ),
);
router.get(
  "/public-catalog/:token",
  json(async (req) => {
    await transaction((tx) => rate(tx, "public-catalog:" + req.ip, 60, 60));
    const linkToken = z
      .string()
      .regex(/^[a-zA-Z0-9_-]{32,128}$/)
      .parse(req.params.token);
    const data = (
      await sql.query("SELECT resolve_public_catalog($1) AS catalog", [
        hash(linkToken),
      ])
    ).rows[0].catalog;
    assert(data, "Catálogo indisponível", 404);
    return data;
  }),
);
// Links públicos dão acesso somente à proposta correspondente, sem e-mail/endereço do cliente.
async function shared(req: Request, fn: (c: Context, q: any) => Promise<any>) {
  await transaction((tx) => rate(tx, `share:${req.ip}`, 30, 60));
  const q = (
    await sql.query("SELECT * FROM resolve_quote_link($1)", [
      hash(String(req.params.token)),
    ])
  ).rows[0];
  assert(q, "Link inválido, revogado ou expirado", 404);
  return tenant(
    { id: q.owner_id, twoFactorEnabled: true },
    q.company_id,
    "read",
    async (c) => {
      const current = await getQuote(c, q.id);
      assert(
        current.share_hash === hash(String(req.params.token)) &&
          new Date(current.share_expires) > new Date(),
        "Link revogado",
        404,
      );
      return fn(c, current);
    },
  );
}
router.get(
  "/shared/:token",
  json((req) =>
    shared(req, async (_c, q) => ({
      number: q.number,
      status: q.status,
      data: {
        title: q.data.title,
        companyName: q.data.companyName,
        items: q.data.items.map((i: any) => ({
          name: i.name,
          quantity: i.quantity,
          priceCents: i.priceCents,
        })),
        laborCents: q.data.laborCents,
        travelCents: q.data.travelCents,
        discountCents: q.data.discountCents,
        conditions: q.data.conditions,
        validUntil: q.data.validUntil,
      },
      totalCents: Number(q.total_cents),
    })),
  ),
);
router.post(
  "/shared/:token/approve",
  json((req) =>
    shared(req, async (c, q) => {
      const name = z.string().min(2).max(160).parse(req.body.name);
      const result = await approveQuote(c, q.id, name);
      await audit(
        { ...c, userId: "external-link" },
        "quote.external-approval",
        q.id,
      );
      return result;
    }),
  ),
);

router.post(
  "/shared/:token/adjustment",
  json((req) =>
    shared(req, async (c, q) => {
      const body = z
        .object({
          name: z.string().trim().min(2).max(160),
          message: z.string().trim().min(5).max(1500),
        })
        .parse(req.body);
      if (
        q.status === "adjustment_requested" &&
        q.adjustment_contact === body.name &&
        q.adjustment_message === body.message
      )
        return { status: "adjustment_requested" };
      assert(q.status === "sent", "Esta proposta já recebeu uma resposta", 409);
      assert(
        q.data.validUntil >= new Date().toISOString().slice(0, 10),
        "Proposta expirada",
        409,
      );
      await c.tx.query(
        `UPDATE quotes SET status='adjustment_requested', adjustment_contact=$3,
      adjustment_message=$4, adjustment_requested_at=now(),updated_at=now() WHERE company_id=$1 AND id=$2`,
        [c.companyId, q.id, body.name, body.message],
      );
      await audit(
        { ...c, userId: "external-link" },
        "quote.external-adjustment",
        q.id,
      );
      return { status: "adjustment_requested" };
    }),
  ),
);
