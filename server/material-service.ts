import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import { sql } from "./db.js";
import { type Context, audit, assert, hash } from "./service.js";
import {
  quantityMilli,
  materialQuerySchema,
  offerSchema,
  listSchema,
  listItemSchema,
  type SearchResult,
} from "../shared/materials.js";
import {
  type SearchProvider,
  configuredSearchProvider,
  searchCacheKey,
  safePublicUrl,
} from "./search-providers.js";
import { validateCatalogQuery } from "./catalog.js";
import { locationById } from "./locations.js";
const inFlight = new Map<string, Promise<any>>();
export function signResult(result: SearchResult, companyId: string) {
  const value = Buffer.from(
    JSON.stringify({ result, companyId, expires: Date.now() + 3600000 }),
  ).toString("base64url");
  return `${value}.${createHmac("sha256", config.secret!).update(value).digest("hex")}`;
}
export function verifyResult(value: string, companyId: string): SearchResult {
  const [payload, signature] = value.split(".");
  assert(payload && signature, "Referência de resultado inválida");
  const expected = createHmac("sha256", config.secret!)
    .update(payload)
    .digest();
  const actual = Buffer.from(signature, "hex");
  assert(
    actual.length === expected.length && timingSafeEqual(actual, expected),
    "Referência de resultado inválida",
  );
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  assert(
    data.companyId === companyId && data.expires > Date.now(),
    "Resultado expirado ou de outra empresa",
    403,
  );
  return data.result;
}
export async function searchMaterials(
  input: unknown,
  companyId: string,
  refresh = false,
  provider: SearchProvider | undefined = configuredSearchProvider(),
) {
  const q = materialQuerySchema.parse(input);
  await validateCatalogQuery(q);
  q.specs = Object.fromEntries(
    Object.entries(q.specs).filter(([, v]) => v && v !== "Sem preferência"),
  );
  const city = locationById(q.cityId, q.state);
  const links = [
    {
      name: "Mercado Livre",
      url: `https://lista.mercadolivre.com.br/${encodeURIComponent([q.material, ...Object.values(q.specs), q.brand].filter(Boolean).join(" ").replace(/\s+/g, "-"))}`,
    },
    {
      name: "Amazon",
      url: `https://www.amazon.com.br/s?k=${encodeURIComponent([q.material, ...Object.values(q.specs), q.brand].filter(Boolean).join(" "))}`,
    },
    {
      name: "Google Maps",
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${q.material} ${city.name} ${city.state}`)}`,
    },
  ];
  const filterWarnings = [
    "Preços, frete, estoque e prazo dependem da confirmação da loja. A faixa de preço e o prazo informados não filtram resultados sem esses dados.",
  ];
  const base = {
    query: q,
    city,
    links,
    provider: provider?.id ?? null,
    configured: !!provider,
    radiusSupported: false,
  };
  if (!provider)
    return {
      ...base,
      results: [],
      warnings: [
        ...filterWarnings,
        "Busca integrada não configurada. Os botões abaixo abrem páginas de pesquisa; não são anúncios verificados.",
      ],
      cached: false,
      queriedAt: null,
    };
  const key = provider.id + ":" + searchCacheKey(q);
  let output: any;
  if (!refresh && provider.storageAllowed) {
    const cached = (
      await sql.query(
        "SELECT data FROM public_search_cache WHERE key=$1 AND expires>now()",
        [key],
      )
    ).rows[0];
    if (cached) output = { ...cached.data, cached: true };
  }
  if (!output) {
    if (!inFlight.has(key)) {
      const pending = (async () => {
        const found = await provider.search(q);
        const value = {
          ...found,
          queriedAt: new Date().toISOString(),
          cached: false,
        };
        if (provider.storageAllowed && found.results.length) {
          await sql.query(
            "DELETE FROM public_search_cache WHERE expires<now()",
          );
          await sql.query(
            "INSERT INTO public_search_cache(key,data,expires) VALUES($1,$2,now()+($3::text||' seconds')::interval) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data,expires=EXCLUDED.expires",
            [
              key,
              JSON.stringify(value),
              Math.min(
                900,
                Math.max(30, Number(process.env.SEARCH_CACHE_SECONDS ?? 300)),
              ),
            ],
          );
        }
        return value;
      })();
      inFlight.set(key, pending);
      void pending.finally(() => inFlight.delete(key)).catch(() => {});
    }
    try {
      output = await inFlight.get(key);
    } catch {
      output = {
        results: [],
        warnings: [
          "O provedor está indisponível. Seus filtros foram preservados. Use os links de pesquisa ou tente novamente.",
        ],
        queriedAt: new Date().toISOString(),
        cached: false,
      };
    }
  }
  return {
    ...base,
    ...output,
    warnings: [...(output.warnings ?? []), ...filterWarnings],
    results: output.results.map((r: SearchResult) => ({
      ...r,
      resultToken: signResult(r, companyId),
    })),
  };
}
export async function saveSearch(c: Context, input: unknown) {
  const q = materialQuerySchema.parse(input);
  locationById(q.cityId, q.state);
  await validateCatalogQuery(q, c.tx);
  const id = randomUUID();
  await c.tx.query(
    "INSERT INTO material_searches(id,company_id,query) VALUES($1,$2,$3)",
    [id, c.companyId, JSON.stringify(q)],
  );
  await c.tx.query(
    "DELETE FROM material_searches WHERE company_id=$1 AND id IN (SELECT id FROM material_searches WHERE company_id=$1 ORDER BY created_at DESC OFFSET 100)",
    [c.companyId],
  );
  return { id };
}
export async function favorite(c: Context, input: unknown) {
  const body = z
    .object({
      resultToken: z.string().max(12000).optional(),
      name: z.string().min(2).max(200).optional(),
      url: z.string().max(2000).optional(),
      kind: z.enum(["local", "online"]).default("online"),
    })
    .parse(input);
  let data: any;
  if (body.resultToken) {
    data = verifyResult(body.resultToken, c.companyId);
    assert(
      data.storageAllowed && process.env.BRAVE_STORAGE_RIGHTS === "true",
      "O plano do provedor não autoriza armazenar seus resultados. Salve a busca ou cadastre um fornecedor manualmente.",
      409,
    );
  } else {
    assert(body.name && body.url, "Informe nome e site do favorito");
    const url = safePublicUrl(body.url);
    assert(url, "URL externa inválida");
    data = {
      name: body.name,
      url,
      kind: body.kind,
      source: "Informado pelo usuário",
      checkedAt: new Date().toISOString(),
      match: "unverified",
      availability: "unconfirmed",
    };
  }
  const id = randomUUID();
  const row = (
    await c.tx.query(
      "INSERT INTO material_favorites(id,company_id,data,url_hash) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,url_hash) DO UPDATE SET data=EXCLUDED.data RETURNING id",
      [id, c.companyId, JSON.stringify(data), hash(data.url)],
    )
  ).rows[0];
  await audit(c, "materials.favorite", row.id);
  return row;
}
export async function createList(c: Context, input: unknown) {
  const b = listSchema.parse(input);
  if (b.quoteId)
    assert(
      (
        await c.tx.query("SELECT 1 FROM quotes WHERE company_id=$1 AND id=$2", [
          c.companyId,
          b.quoteId,
        ])
      ).rows.length,
      "Orçamento não encontrado",
      404,
    );
  if (b.orderId)
    assert(
      (
        await c.tx.query("SELECT 1 FROM orders WHERE company_id=$1 AND id=$2", [
          c.companyId,
          b.orderId,
        ])
      ).rows.length,
      "Ordem não encontrada",
      404,
    );
  if (b.quoteId && b.orderId)
    assert(
      (
        await c.tx.query(
          "SELECT 1 FROM orders WHERE company_id=$1 AND id=$2 AND quote_id=$3",
          [c.companyId, b.orderId, b.quoteId],
        )
      ).rows.length,
      "A ordem não pertence ao orçamento informado",
    );
  const id = randomUUID();
  await c.tx.query(
    "INSERT INTO purchase_lists(id,company_id,name,quote_id,order_id) VALUES($1,$2,$3,$4,$5)",
    [id, c.companyId, b.name, b.quoteId, b.orderId],
  );
  await audit(c, "materials.list.create", id);
  return { id };
}
export async function saveListItem(
  c: Context,
  listId: string,
  input: unknown,
  id?: string,
  version?: number,
) {
  const data = listItemSchema.parse(input);
  if (data.offerUrl)
    assert(safePublicUrl(data.offerUrl), "URL externa inválida");
  assert(
    (
      await c.tx.query(
        "SELECT 1 FROM purchase_lists WHERE company_id=$1 AND id=$2",
        [c.companyId, listId],
      )
    ).rows.length,
    "Lista não encontrada",
    404,
  );
  if (id) {
    const receipts = BigInt(
      (
        await c.tx.query(
          "SELECT coalesce(sum(purchase_milli),0) AS n FROM purchase_receipts WHERE company_id=$1 AND list_item_id=$2",
          [c.companyId, id],
        )
      ).rows[0].n,
    );
    if (receipts > 0n) {
      const previous = (
        await c.tx.query(
          "SELECT data FROM purchase_list_items WHERE company_id=$1 AND id=$2",
          [c.companyId, id],
        )
      ).rows[0];
      assert(
        data.purchased && quantityMilli(data.quantity) >= receipts,
        "O item possui recebimentos. Preserve a compra e a quantidade já recebida; devoluções precisam de ajuste com motivo.",
      );
      assert(
        previous?.data.unit === data.unit,
        "A unidade de compra não pode ser alterada depois de receber.",
      );
    }
    const r = await c.tx.query(
      "UPDATE purchase_list_items SET data=$4,version=version+1 WHERE company_id=$1 AND list_id=$2 AND id=$3 AND version=$5 RETURNING id,version",
      [c.companyId, listId, id, JSON.stringify(data), version],
    );
    assert(
      r.rows.length,
      "Este item foi alterado em outra aba. Atualize antes de salvar novamente.",
      409,
    );
    await audit(c, "materials.item.update", id);
    return r.rows[0];
  }
  id = randomUUID();
  await c.tx.query(
    "INSERT INTO purchase_list_items(id,company_id,list_id,data) VALUES($1,$2,$3,$4)",
    [id, c.companyId, listId, JSON.stringify(data)],
  );
  await audit(c, "materials.item.create", id);
  return { id, version: 1 };
}
export async function saveOffer(c: Context, input: unknown) {
  const data = offerSchema.parse(input);
  if (data.url) assert(safePublicUrl(data.url), "URL externa inválida");
  if (data.availability === "confirmed")
    assert(
      data.evidence.trim().length >= 5,
      "Informe como a disponibilidade foi confirmada",
    );
  const id = randomUUID();
  await c.tx.query(
    "INSERT INTO material_offers(id,company_id,data) VALUES($1,$2,$3)",
    [id, c.companyId, JSON.stringify({ ...data, origin: "user" })],
  );
  await audit(c, "materials.offer.create", id);
  return { id };
}
export async function readMaterials(c: Context) {
  const result: Record<string, any> = {};
  for (const [key, table] of Object.entries({
    history: "material_searches",
    favorites: "material_favorites",
    lists: "purchase_lists",
    items: "purchase_list_items",
    offers: "material_offers",
  }))
    result[key] = (
      await c.tx.query(
        `SELECT * FROM ${table} WHERE company_id=$1 ORDER BY created_at DESC LIMIT 500`,
        [c.companyId],
      )
    ).rows;
  return result;
}
export async function deleteMaterial(
  c: Context,
  kind: "searches" | "favorites" | "lists" | "items" | "offers",
  id: string,
) {
  const table = {
    searches: "material_searches",
    favorites: "material_favorites",
    lists: "purchase_lists",
    items: "purchase_list_items",
    offers: "material_offers",
  }[kind];
  if (kind === "items" || kind === "lists") {
    const receipts = (
      await c.tx.query(
        "SELECT 1 FROM purchase_receipts r JOIN purchase_list_items i ON i.company_id=r.company_id AND i.id=r.list_item_id WHERE r.company_id=$1 AND (i.id=$2 OR i.list_id=$2) LIMIT 1",
        [c.companyId, id],
      )
    ).rows;
    assert(
      !receipts.length,
      "Compras com recebimentos precisam preservar o histórico e não podem ser excluídas.",
    );
  }
  const r = await c.tx.query(
    `DELETE FROM ${table} WHERE company_id=$1 AND id=$2 RETURNING id`,
    [c.companyId, id],
  );
  assert(r.rows.length, "Registro não encontrado", 404);
  await audit(c, `materials.${kind}.delete`, id);
  return { ok: true };
}
