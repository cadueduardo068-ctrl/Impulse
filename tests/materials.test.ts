import { attributeIssues, initialCatalog } from "../shared/catalog";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import {
  materialQuerySchema,
  offerSchema,
  compareOffer,
  compatibility,
  quantityMilli,
} from "../shared/materials";
import {
  safePublicUrl,
  fetchSearchJson,
  BraveSearchProvider,
  searchCacheKey,
} from "../server/search-providers";
import { locationById, canonicalProfile } from "../server/locations";
import { migrate, sql, closeDb } from "../server/db";
import { tenant, saveRecord } from "../server/service";
import {
  searchMaterials,
  saveSearch,
  createList,
  saveListItem,
  favorite,
  saveOffer,
  readMaterials,
  verifyResult,
} from "../server/material-service";
const query = () =>
  materialQuerySchema.parse({
    material: "MDF",
    category: "mdf",
    specs: {
      thickness: "18",
      dimensions: "2750 x 1850",
      finish: "Melamínico",
      color: "Branco",
    },
    quantity: "3",
    unit: "un",
    cityId: "3550308",
    state: "SP",
    preference: "both",
    cep: "01001-000",
  });
const offer = (changes: any = {}) =>
  offerSchema.parse({
    name: "MDF branco 18 mm",
    supplier: "Fornecedor informado",
    category: "mdf",
    specs: query().specs,
    packageQuantity: "2",
    unit: "un",
    priceCents: 20000,
    source: "Informação do usuário em teste",
    checkedAt: "2026-11-08T12:00:00.000Z",
    ...changes,
  });
beforeAll(async () => {
  await migrate();
  for (const id of ["materials-a", "materials-b"]) {
    await sql.query(
      'INSERT INTO "user"(id,name,email,"createdAt","updatedAt") VALUES($1,$1,$2,now(),now())',
      [id, `${id}@example.test`],
    );
    await sql.query(
      "INSERT INTO companies(id,name,owner_id) VALUES($1,$1,$1)",
      [id],
    );
    await sql.query("INSERT INTO memberships VALUES($1,$1,'owner')", [id]);
  }
});
afterAll(closeDb);
describe("Especificações, unidades, embalagens e procedência", () => {
  it("pede características essenciais sem presumir medidas ou cor", () => {
    const issues = attributeIssues(
      initialCatalog.products.find((p) => p.id === "mdf")!,
      { thickness: "18" },
    );
    expect(issues["specs.dimensions"]).toBeTruthy();
    expect(() =>
      materialQuerySchema.parse({ ...query(), quantity: "0" }),
    ).toThrow();
    expect(quantityMilli("1,125")).toBe(1125n);
  });
  it("calcula pacotes por arredondamento para cima e mantém subtotal sem frete", () => {
    expect(compareOffer(query(), offer())).toMatchObject({
      match: "exact",
      packages: 2,
      subtotalCents: 40000,
      totalCents: null,
      unitPriceCents: 10000,
    });
    expect(
      compareOffer(
        query(),
        offer({ freightCents: 1500, freightCep: "01001000" }),
      ).totalCents,
    ).toBe(41500);
    expect(
      compareOffer(
        query(),
        offer({ freightCents: 1500, freightCep: "99999999" }),
      ).totalCents,
    ).toBeNull();
  });
  it("normaliza massa e volume e separa produtos incompatíveis", () => {
    const q = {
      ...query(),
      material: "Tinta",
      category: "other" as const,
      specs: {},
      quantity: "1,5",
      unit: "l" as const,
    };
    expect(
      compareOffer(
        q,
        offer({
          name: "Tinta",
          category: "other",
          specs: {},
          packageQuantity: "500",
          unit: "ml",
          priceCents: 1000,
        }),
      ),
    ).toMatchObject({ packages: 3, subtotalCents: 3000 });
    expect(
      compareOffer(
        { ...q, material: "Areia", quantity: "2", unit: "kg" },
        offer({
          name: "Areia",
          category: "other",
          specs: {},
          packageQuantity: "500",
          unit: "g",
          priceCents: 250,
        }),
      ),
    ).toMatchObject({ packages: 4, subtotalCents: 1000 });
    expect(
      compatibility(
        query(),
        offer({ specs: { ...query().specs, thickness: "15" } }),
      ).match,
    ).toBe("similar");
    expect(
      compareOffer(query(), offer({ unit: "kg" })).subtotalCents,
    ).toBeNull();
    expect(compareOffer(query(), offer({ specs: {} })).match).toBe(
      "unverified",
    );
    expect(
      compareOffer(query(), offer({ priceCents: null })).subtotalCents,
    ).toBeNull();
  });
  it("usa cidade IBGE e bloqueia URLs internas, credenciais e esquemas perigosos", () => {
    expect(locationById("3550308", "SP").name).toBe("São Paulo");
    expect(() => locationById("3550308", "RJ")).toThrow();
    expect(canonicalProfile({ city: "São Paulo", state: "SP" }).cityId).toBe(
      "3550308",
    );
    for (const u of [
      "http://localhost",
      "http://127.0.0.1",
      "http://2130706433",
      "http://0x7f000001",
      "http://[::1]",
      "http://10.0.0.1",
      "http://service.internal",
      "https://user:pass@shop.com",
      "javascript:alert(1)",
      "file:///a",
      "https://store.com:3000/a",
    ])
      expect(safePublicUrl(u)).toBeNull();
    expect(safePublicUrl("https://www.amazon.com.br/s?k=MDF")).toContain(
      "amazon.com.br",
    );
  });
  it("não transforma falta de credenciais em ofertas e não inclui CEP nos links", async () => {
    const result = await searchMaterials(
      query(),
      "materials-a",
      false,
      undefined,
    );
    expect(result.configured).toBe(false);
    expect(result.results).toEqual([]);
    expect(result.links.some((l: any) => l.name === "Mercado Livre")).toBe(
      true,
    );
    expect(JSON.stringify(result.links)).not.toContain("01001");
  });
  it("limita destinos da rede e retorna resultados sem inferir preço ou disponibilidade", async () => {
    const fetcher = vi.fn(async (input: any) => {
      const u = new URL(input);
      if (u.pathname.includes("/pois"))
        return new Response(
          JSON.stringify({
            results: [
              {
                title: "Loja encontrada",
                url: "https://loja.example.com",
                postal_address: { displayAddress: "Rua Comercial, 20" },
                contact: { telephone: "Contato público" },
              },
            ],
          }),
        );
      if (u.searchParams.get("q")?.startsWith("lojas"))
        return new Response(
          JSON.stringify({
            locations: { results: [{ id: "abc123" }] },
            web: { results: [] },
          }),
        );
      return new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: "MDF 18 mm",
                url: "https://loja.example.com/produto",
                description: "<b>Oferta</b> encontrada",
              },
              { title: "Pesquisa", url: "https://www.amazon.com.br/s?k=MDF" },
              { title: "Injetado", url: "http://localhost/admin" },
            ],
          },
        }),
      );
    });
    const provider = new BraveSearchProvider(
      "fake-test-key",
      false,
      fetcher as typeof fetch,
    );
    const result = await provider.search(query());
    expect(result.results).toHaveLength(3);
    expect(result.results.find((r) => r.kind === "local")).toMatchObject({
      address: "Rua Comercial, 20",
      availability: "unconfirmed",
      match: "category",
    });
    expect(result.results.find((r) => r.url.includes("/s?"))?.match).toBe(
      "search-link",
    );
    expect(result.results.every((r) => !r.offer)).toBe(true);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("01001");
    await expect(
      fetchSearchJson(
        new URL("http://127.0.0.1"),
        "key",
        fetcher as typeof fetch,
      ),
    ).rejects.toThrow("não permitido");
  });
  it("trata indisponibilidade parcial, limites e falhas do provedor", async () => {
    const provider = new BraveSearchProvider(
      "test",
      false,
      vi.fn(async () => new Response("{}", { status: 429 })) as typeof fetch,
    );
    const r = await provider.search(query());
    expect(r.results).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("cache licenciado preserva data original e deduplica requisições concorrentes", async () => {
    const provider = {
      id: "fixture",
      storageAllowed: true,
      search: vi.fn(async () => ({
        results: [
          {
            id: "1",
            kind: "online" as const,
            name: "Fixture de teste",
            url: "https://loja.example.com/produto",
            description: "Dados de teste, nunca fornecidos em produção",
            source: "Fixture",
            checkedAt: "2026-11-08T12:00:00.000Z",
            match: "unverified" as const,
            differences: [],
            availability: "unconfirmed" as const,
            storageAllowed: true,
          },
        ],
        warnings: [],
      })),
    };
    const [a, b] = await Promise.all([
      searchMaterials(query(), "materials-a", true, provider),
      searchMaterials(query(), "materials-a", true, provider),
    ]);
    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(a.results[0].checkedAt).toBe(b.results[0].checkedAt);
    const cached = await searchMaterials(
      query(),
      "materials-a",
      false,
      provider,
    );
    expect(cached.cached).toBe(true);
    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(() =>
      verifyResult(a.results[0].resultToken, "materials-b"),
    ).toThrow();
    expect(searchCacheKey(query())).toBe(
      searchCacheKey({ ...query(), cep: "99999999" }),
    );
  });
});
describe("Listas, favoritos e isolamento multiempresa", () => {
  it("salva busca e favoritos manuais sem aceitar URL interna", async () => {
    await tenant(
      { id: "materials-a" },
      "materials-a",
      "write",
      async (c) => {
        await saveSearch(c, query());
        await favorite(c, {
          name: "Parceiro cadastrado",
          url: "https://loja.example.com",
          kind: "local",
        });
        await expect(
          favorite(c, { name: "URL proibida", url: "http://localhost" }),
        ).rejects.toThrow();
        const data = await readMaterials(c);
        expect(data.history).toHaveLength(1);
        expect(data.favorites).toHaveLength(1);
      },
      true,
    );
    await expect(
      tenant({ id: "materials-b" }, "materials-a", "read", readMaterials),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("lista privada registra valor pago, protege atualização e não movimenta finanças", async () => {
    const list = await tenant(
      { id: "materials-a" },
      "materials-a",
      "write",
      (c) => createList(c, { name: "Projeto teste" }),
      true,
    );
    const item = await tenant(
      { id: "materials-a" },
      "materials-a",
      "write",
      (c) =>
        saveListItem(c, list.id, {
          material: "MDF",
          quantity: "1,5",
          unit: "un",
        }),
      true,
    );
    await tenant(
      { id: "materials-a" },
      "materials-a",
      "write",
      (c) =>
        saveListItem(
          c,
          list.id,
          {
            material: "MDF",
            quantity: "1,5",
            unit: "un",
            purchased: true,
            paidCents: 12500,
          },
          item.id,
          item.version,
        ),
      true,
    );
    await expect(
      tenant(
        { id: "materials-a" },
        "materials-a",
        "write",
        (c) =>
          saveListItem(
            c,
            list.id,
            { material: "MDF", quantity: "1", unit: "un" },
            item.id,
            1,
          ),
        true,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      tenant(
        { id: "materials-b" },
        "materials-b",
        "write",
        (c) =>
          saveListItem(c, list.id, {
            material: "Intrusão",
            quantity: "1",
            unit: "un",
          }),
        true,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect((await sql.query("SELECT * FROM ledger")).rows).toHaveLength(0);
    expect((await sql.query("SELECT * FROM movements")).rows).toHaveLength(0);
  });
  it("rejeita vínculo de orçamento estrangeiro e mantém referências de preços manuais separadas", async () => {
    await expect(
      tenant(
        { id: "materials-a" },
        "materials-a",
        "write",
        (c) => createList(c, { name: "Lista indevida", quoteId: "unknown" }),
        true,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await tenant(
      { id: "materials-a" },
      "materials-a",
      "write",
      (c) => saveOffer(c, offer()),
      true,
    );
    const data = await tenant(
      { id: "materials-b" },
      "materials-b",
      "read",
      readMaterials,
    );
    expect(data.offers).toHaveLength(0);
  });
  it("versões de cadastros impedem sobrescrita silenciosa", async () => {
    await tenant(
      { id: "materials-a" },
      "materials-a",
      "write",
      async (c) => {
        const r = await saveRecord(c, "suppliers", { name: "Original" });
        await saveRecord(c, "suppliers", { name: "Versão nova" }, r.id, 1);
        await expect(
          saveRecord(c, "suppliers", { name: "Versão antiga" }, r.id, 1),
        ).rejects.toMatchObject({ status: 409 });
      },
      true,
    );
  });
  it("RLS e chave estrangeira composta bloqueiam acesso e vínculo cruzados", async () => {
    await sql.query(
      "CREATE ROLE material_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS",
    );
    await sql.query("GRANT USAGE ON SCHEMA public TO material_runtime");
    await sql.query(
      "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO material_runtime",
    );
    const list = (await sql.query("SELECT id FROM purchase_lists LIMIT 1"))
      .rows[0];
    await sql.query("SET ROLE material_runtime");
    try {
      await tenant(
        { id: "materials-b" },
        "materials-b",
        "write",
        async (c) => {
          expect(
            (await c.tx.query("SELECT * FROM purchase_lists")).rows,
          ).toHaveLength(0);
          await c.tx.query("SAVEPOINT forbidden");
          await expect(
            c.tx.query(
              "INSERT INTO purchase_list_items(id,company_id,list_id,data) VALUES($1,$2,$3,$4)",
              ["evil", "materials-b", list.id, "{}"],
            ),
          ).rejects.toThrow();
          await c.tx.query("ROLLBACK TO SAVEPOINT forbidden");
        },
        true,
      );
    } finally {
      await sql.query("RESET ROLE");
    }
  });
});
