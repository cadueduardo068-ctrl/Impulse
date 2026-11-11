import { Router } from "express";
import { z } from "zod";
import { fromNodeHeaders } from "better-auth/node";
import { randomUUID } from "node:crypto";
import { auth } from "./auth.js";
import { config } from "./config.js";
import { sql, transaction, type Sql } from "./db.js";
import { assert, HttpError, tenant, audit } from "./service.js";
import {
  attributeIssues,
  type Catalog,
  type CatalogProduct,
} from "../shared/catalog.js";

export async function readCatalog(db: Sql = sql): Promise<Catalog> {
  const nodes = (
    await db.query(
      "SELECT * FROM catalog_nodes WHERE active=true ORDER BY name",
    )
  ).rows;
  const attrs = (await db.query("SELECT * FROM catalog_attributes ORDER BY id"))
    .rows;
  return {
    revision: nodes.map((n) => `${n.id}:${n.version}`).join("|"),
    areas: nodes
      .filter((n) => n.kind === "area")
      .map((n) => ({
        id: n.id.replace(/^area-/, ""),
        name: n.name,
        image: n.data.image ?? 0,
        activities: nodes
          .filter((a) => a.kind === "activity" && a.parent_id === n.id)
          .map((a) => a.name),
      })),
    categories: nodes
      .filter((n) => n.kind === "category")
      .map((n) => ({ id: n.id, name: n.name, ...n.data })),
    products: nodes
      .filter(
        (n) =>
          n.kind === "product" &&
          nodes.some(
            (parent) => parent.id === n.parent_id && parent.kind === "category",
          ),
      )
      .map((n) => ({
        id: n.id,
        name: n.name,
        categoryId: n.parent_id,
        aliases: n.data.aliases ?? [],
        units: n.data.units ?? ["un"],
        attributes: attrs
          .filter((a) => a.product_id === n.id)
          .map((a) => a.data),
      })),
  };
}
export async function validateCatalogQuery(
  query: { category: string; specs: Record<string, string>; unit: string },
  db: Sql = sql,
) {
  const catalog = await readCatalog(db);
  const p = catalog.products.find((p) => p.id === query.category);
  assert(p, "Selecione um produto ativo do catálogo");
  const errors = attributeIssues(p, query.specs);
  const allowed = new Set(
    p.attributes.flatMap((a) => [a.key, a.key + "Detail"]),
  );
  for (const key of Object.keys(query.specs))
    if (!allowed.has(key))
      errors["specs." + key] =
        "Característica não pertence ao produto selecionado.";
  if (!p.units.includes(query.unit))
    errors.unit = "Escolha uma unidade permitida para este produto.";
  if (Object.keys(errors).length)
    throw new HttpError(400, "Revise as características do produto.", errors);
  return p;
}
const attribute = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/),
  label: z.string().min(2).max(120),
  type: z.enum(["select", "multi", "number", "text"]),
  required: z.boolean(),
  options: z.array(z.string().min(1).max(100)).max(80),
  unit: z.string().max(20).optional(),
  example: z.string().max(150).optional(),
  dependsOn: z
    .object({ key: z.string().max(40), value: z.string().max(100) })
    .optional(),
});
const nodeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,80}$/),
  kind: z.enum(["area", "activity", "category", "product"]),
  parentId: z.string().max(80).nullable(),
  name: z.string().min(2).max(120),
  version: z.number().int().positive().nullable(),
  active: z.boolean(),
  data: z
    .object({
      image: z.number().int().min(0).max(11).optional(),
      areas: z.array(z.string().max(80)).max(30).optional(),
      purpose: z
        .enum(["resale", "manufacturing", "packaging", "equipment"])
        .optional(),
      aliases: z.array(z.string().max(80)).max(30).optional(),
      units: z.array(z.string().max(10)).min(1).max(20).optional(),
    })
    .strict(),
  attributes: z.array(attribute).max(24).default([]),
});
export const catalogRouter = Router();
const endpoint =
  (f: (req: any) => Promise<any>) => (req: any, res: any, next: any) => {
    void f(req)
      .then((v) => res.json(v))
      .catch(next);
  };
catalogRouter.get(
  "/",
  endpoint(() => readCatalog()),
);
async function administrator(
  req: any,
  fn: (tx: Sql, userId: string) => Promise<any>,
) {
  const s = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  assert(s, "Entre na sua conta", 401);
  assert(s.user.emailVerified, "Confirme seu e-mail", 403);
  if (config.enforceMfa)
    assert(
      s.user.twoFactorEnabled,
      "Ative MFA antes de administrar o catálogo",
      403,
    );
  return transaction(async (tx) => {
    await tx.query("SELECT set_config('app.user_id',$1,true)", [s.user.id]);
    assert(
      (
        await tx.query("SELECT 1 FROM platform_admins WHERE user_id=$1", [
          s.user.id,
        ])
      ).rows.length,
      "Somente administrador autorizado da plataforma",
      403,
    );
    return fn(tx, s.user.id);
  });
}
catalogRouter.get(
  "/admin",
  endpoint((req) =>
    administrator(req, async (tx) => ({
      nodes: (await tx.query("SELECT * FROM catalog_nodes ORDER BY kind,name"))
        .rows,
      attributes: (
        await tx.query("SELECT * FROM catalog_attributes ORDER BY id")
      ).rows,
      units: (await tx.query("SELECT * FROM catalog_units")).rows,
      requests: (
        await tx.query(
          "SELECT * FROM catalog_requests ORDER BY created_at DESC LIMIT 200",
        )
      ).rows,
    })),
  ),
);
catalogRouter.post(
  "/admin/unit",
  endpoint((req) =>
    administrator(req, async (tx, userId) => {
      const b = z
        .object({
          id: z.string().regex(/^[a-z0-9]{1,10}$/),
          name: z.string().min(1).max(80),
        })
        .parse(req.body);
      await tx.query("INSERT INTO catalog_units(id,name) VALUES($1,$2)", [
        b.id,
        b.name,
      ]);
      await tx.query(
        "INSERT INTO platform_audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)",
        [randomUUID(), userId, "catalog.unit.create", b.id],
      );
      return { ok: true };
    }),
  ),
);
catalogRouter.put(
  "/admin/request/:id",
  endpoint((req) =>
    administrator(req, async (tx, userId) => {
      assert(
        (
          await tx.query(
            "UPDATE catalog_requests SET status='reviewed' WHERE id=$1 RETURNING id",
            [req.params.id],
          )
        ).rows.length,
        "Solicitação não encontrada",
        404,
      );
      await tx.query(
        "INSERT INTO platform_audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)",
        [randomUUID(), userId, "catalog.request.reviewed", req.params.id],
      );
      return { ok: true };
    }),
  ),
);
catalogRouter.put(
  "/admin",
  endpoint((req) =>
    administrator(req, async (tx, userId) => {
      const b = nodeSchema.parse(req.body);
      if (b.parentId) {
        const parent = (
          await tx.query("SELECT kind FROM catalog_nodes WHERE id=$1", [
            b.parentId,
          ])
        ).rows[0];
        assert(
          parent &&
            parent.kind === (b.kind === "activity" ? "area" : "category"),
          "Relação de catálogo inválida",
        );
      }
      if (b.kind === "activity" || b.kind === "product")
        assert(b.parentId, "Selecione a área ou categoria do item");
      if (b.kind === "product") {
        assert(b.data.units?.length, "Informe as unidades");
        const units = (await tx.query("SELECT id FROM catalog_units")).rows.map(
          (u) => u.id,
        );
        assert(
          b.data.units.every((u) => units.includes(u)),
          "Unidade não cadastrada",
        );
        const keys = b.attributes.map((a) => a.key);
        assert(
          new Set(keys).size === keys.length,
          "Chaves de características devem ser únicas",
        );
        for (const a of b.attributes) {
          const visited = new Set<string>();
          let current: typeof a | undefined = a;
          while (current?.dependsOn) {
            assert(
              !visited.has(current.key),
              "Dependência circular entre características",
            );
            visited.add(current.key);
            current = b.attributes.find(
              (v) => v.key === current!.dependsOn!.key,
            );
          }

          if (a.dependsOn)
            assert(
              keys.includes(a.dependsOn.key) && a.dependsOn.key !== a.key,
              "Dependência inválida",
            );
          if (["select", "multi"].includes(a.type))
            assert(a.options.length, "Informe as opções do seletor");
        }
      }
      if (b.version === null) {
        await tx.query(
          "INSERT INTO catalog_nodes(id,kind,parent_id,name,data,active) VALUES($1,$2,$3,$4,$5,$6)",
          [b.id, b.kind, b.parentId, b.name, JSON.stringify(b.data), b.active],
        );
      } else
        assert(
          (
            await tx.query(
              "UPDATE catalog_nodes SET name=$2,data=$3,active=$4,parent_id=$5,version=version+1 WHERE id=$1 AND version=$6 AND kind=$7 RETURNING id",
              [
                b.id,
                b.name,
                JSON.stringify(b.data),
                b.active,
                b.parentId,
                b.version,
                b.kind,
              ],
            )
          ).rows.length,
          "Catálogo alterado em outra aba. Recarregue antes de salvar.",
          409,
        );
      if (b.kind === "product") {
        await tx.query("DELETE FROM catalog_attributes WHERE product_id=$1", [
          b.id,
        ]);
        for (const a of b.attributes)
          await tx.query(
            "INSERT INTO catalog_attributes(id,product_id,field_key,data) VALUES($1,$2,$3,$4)",
            [b.id + "-" + a.key, b.id, a.key, JSON.stringify(a)],
          );
      }
      await tx.query(
        "INSERT INTO platform_audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)",
        [randomUUID(), userId, "catalog.save", b.id],
      );
      return { ok: true };
    }),
  ),
);
catalogRouter.post(
  "/request/:company",
  endpoint(async (req) => {
    const s = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    assert(s, "Entre na sua conta", 401);
    return tenant(
      s.user,
      req.params.company,
      "write",
      async (c) => {
        const description = z
          .string()
          .trim()
          .min(5)
          .max(1000)
          .parse(req.body.description);
        const id = randomUUID();
        await c.tx.query(
          "INSERT INTO catalog_requests(id,company_id,user_id,description) VALUES($1,$2,$3,$4)",
          [id, c.companyId, c.userId, description],
        );
        await audit(c, "catalog.request", id);
        return { id };
      },
      true,
    );
  }),
);
export type { CatalogProduct };
