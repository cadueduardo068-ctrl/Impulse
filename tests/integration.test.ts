import { beforeAll, afterAll, it, expect, describe } from "vitest";
import { randomUUID } from "node:crypto";
import { migrate, sql, transaction, closeDb } from "../server/db";
import {
  tenant,
  saveRecord,
  createQuote,
  approveQuote,
  convertQuote,
  completeOrder,
  movement,
  pay,
  rate,
} from "../server/service";
const userA = { id: "owner-a" },
  userB = { id: "owner-b" },
  member = { id: "member-a" },
  finance = { id: "finance-a" };
beforeAll(async () => {
  await migrate();
  for (const u of [userA, userB, member, finance])
    await sql.query(
      'INSERT INTO "user"(id,name,email,"createdAt","updatedAt") VALUES($1,$1,$2,now(),now())',
      [u.id, `${u.id}@example.test`],
    );
  for (const [id, u] of [
    ["company-a", "owner-a"],
    ["company-b", "owner-b"],
  ]) {
    await sql.query("INSERT INTO companies(id,name) VALUES($1,$1)", [id]);
    await sql.query(
      "INSERT INTO memberships(company_id,user_id,role) VALUES($1,$2,'owner')",
      [id, u],
    );
  }
  await sql.query(
    "INSERT INTO memberships VALUES('company-a','member-a','member'),('company-a','finance-a','finance')",
  );
});
afterAll(closeDb);
describe("Isolamento, papéis e fluxo transacional", () => {
  it("executa o serviço completo sob papel restrito, incluindo bootstrap e numeração por colaborador", async () => {
    await sql.query("CREATE ROLE isolated_app NOLOGIN NOSUPERUSER NOBYPASSRLS");
    await sql.query("GRANT USAGE ON SCHEMA public TO isolated_app");
    await sql.query(
      "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO isolated_app",
    );
    await sql.query("SET ROLE isolated_app");
    try {
      await transaction(async (tx) => {
        await tx.query("SELECT set_config('app.user_id','owner-b',true)");
        await tx.query(
          "INSERT INTO companies(id,name,owner_id) VALUES('restricted-new','Empresa nova','owner-b')",
        );
        await tx.query(
          "INSERT INTO memberships VALUES('restricted-new','owner-b','owner')",
        );
        expect(
          (await tx.query("SELECT * FROM companies")).rows.every(
            (c) => c.id === "restricted-new" || c.id === "company-b",
          ),
        ).toBe(true);
      });
      await expect(
        tenant(userA, "company-b", "read", async () => true),
      ).rejects.toMatchObject({ status: 404 });
      await tenant(
        member,
        "company-a",
        "write",
        async (c) => {
          const client = await saveRecord(c, "clients", {
            name: "Cliente do colaborador",
          });
          const q = await createQuote(c, {
            clientId: client.id,
            title: "Proposta com RLS",
            validUntil: "2099-01-01",
            items: [
              { name: "Serviço", quantity: 1, priceCents: 100, costCents: 50 },
            ],
          });
          expect(q.totalCents).toBe(100);
          expect(
            (await c.tx.query("SELECT * FROM records")).rows.every(
              (r) => r.company_id === "company-a",
            ),
          ).toBe(true);
        },
        true,
      );
    } finally {
      await sql.query("RESET ROLE");
    }
  });
  it("nega acesso cruzado e papéis sem permissão", async () => {
    await expect(
      tenant(userA, "company-b", "read", async () => true),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      tenant(member, "company-a", "finance", async () => true),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      tenant(finance, "company-a", "write", async () => true),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      tenant(member, "company-a", "export", async () => true),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("não aceita vínculo de cliente ou material de outra empresa", async () => {
    const foreign = await tenant(
      userB,
      "company-b",
      "write",
      (c) => saveRecord(c, "clients", { name: "Privado B" }),
      true,
    );
    await expect(
      tenant(
        userA,
        "company-a",
        "write",
        (c) =>
          saveRecord(c, "tasks", {
            name: "Não deve criar",
            clientId: foreign.id,
          }),
        true,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("aprova → reserva → cria recebível → paga parcialmente → conclui sem duplicar", async () => {
    const { client, product, service } = await tenant(
      userA,
      "company-a",
      "write",
      async (c) => {
        const client = await saveRecord(c, "clients", {
          name: "Cliente teste",
        });
        const product = await saveRecord(c, "products", {
          name: "Material",
          priceCents: 1000,
          costCents: 500,
          minimum: 3,
        });
        await movement(
          c,
          product.id!,
          10,
          0,
          "Compra inicial",
          "stock-in-unique",
        );
        const service = await saveRecord(c, "products", {
          name: "Instalação",
          priceCents: 15000,
          costCents: 10000,
          materials: [{ productId: product.id, quantity: 2 }],
        });
        return { client, product, service };
      },
      true,
    );
    const input = {
      clientId: client.id,
      title: "Instalação",
      items: [
        {
          productId: service.id,
          name: "Instalação",
          quantity: 2,
          priceCents: 15000,
          costCents: 10000,
          materials: [{ productId: product.id, quantity: 2 }],
        },
      ],
      validUntil: "2099-01-01",
    };
    const q = await tenant(
      userA,
      "company-a",
      "write",
      (c) => createQuote(c, input),
      true,
    );
    await tenant(
      userA,
      "company-a",
      "write",
      async (c) => {
        await saveRecord(
          c,
          "products",
          { name: "Novo nome", priceCents: 99999 },
          service.id,
        );
        await c.tx.query(
          "UPDATE quotes SET status='sent' WHERE id=$1 AND company_id=$2",
          [q.id, c.companyId],
        );
        await approveQuote(c, q.id!, "Cliente de teste");
      },
      true,
    );
    const order = await tenant(
      userA,
      "company-a",
      "write",
      (c) => convertQuote(c, q.id!),
      true,
    );
    const duplicate = await tenant(
      userA,
      "company-a",
      "write",
      (c) => convertQuote(c, q.id!),
      true,
    );
    expect(duplicate.id).toBe(order.id);
    const stock = (
      await sql.query("SELECT * FROM stock WHERE product_id=$1", [product.id])
    ).rows[0];
    expect(stock.quantity).toBe(10);
    expect(stock.reserved).toBe(4);
    const old = (await sql.query("SELECT data FROM quotes WHERE id=$1", [q.id]))
      .rows[0].data;
    expect(old.items[0].name).toBe("Instalação");
    expect(old.items[0].priceCents).toBe(15000);
    const ledger = (
      await sql.query("SELECT * FROM ledger WHERE order_id=$1", [order.id])
    ).rows[0];
    expect(Number(ledger.amount_cents)).toBe(30000);
    await tenant(
      userA,
      "company-a",
      "finance",
      async (c) => {
        await pay(c, ledger.id, 10000, "payment-one", "2026-11-08");
        await pay(c, ledger.id, 10000, "payment-one", "2026-11-08");
      },
      true,
    );
    await expect(
      tenant(
        userA,
        "company-a",
        "finance",
        (c) => pay(c, ledger.id, 20001, "payment-too-large", "2026-11-08"),
        true,
      ),
    ).rejects.toThrow("excede");
    await tenant(
      userA,
      "company-a",
      "write",
      async (c) => {
        await completeOrder(c, order.id);
        await completeOrder(c, order.id);
      },
      true,
    );
    expect(
      (await sql.query("SELECT * FROM stock WHERE product_id=$1", [product.id]))
        .rows[0],
    ).toMatchObject({ quantity: 6, reserved: 0 });
    expect(
      (
        await sql.query("SELECT * FROM payments WHERE ledger_id=$1", [
          ledger.id,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (await sql.query("SELECT * FROM records WHERE kind='aftersales'")).rows,
    ).toHaveLength(1);
  });
  it("reverte toda a conversão quando um material é insuficiente", async () => {
    const ids = await tenant(
      userB,
      "company-b",
      "write",
      async (c) => {
        const p = await saveRecord(c, "products", { name: "Sem estoque" });
        const cl = await saveRecord(c, "clients", { name: "Outro cliente" });
        const q = await createQuote(c, {
          clientId: cl.id,
          title: "Falha controlada",
          validUntil: "2099-01-01",
          items: [
            {
              name: "Item",
              quantity: 1,
              priceCents: 500,
              costCents: 0,
              materials: [{ productId: p.id, quantity: 1 }],
            },
          ],
        });
        await c.tx.query(
          "UPDATE quotes SET status='sent' WHERE company_id=$1 AND id=$2",
          [c.companyId, q.id],
        );
        await approveQuote(c, q.id!, "Teste");
        return q;
      },
      true,
    );
    await expect(
      tenant(
        userB,
        "company-b",
        "write",
        (c) => convertQuote(c, ids.id!),
        true,
      ),
    ).rejects.toThrow("insuficiente");
    expect(
      (await sql.query("SELECT * FROM orders WHERE quote_id=$1", [ids.id]))
        .rows,
    ).toHaveLength(0);
  });
  it("mantém leitura e exportação depois do teste, bloqueia novas escritas", async () => {
    await sql.query(
      "UPDATE companies SET trial_end=now()-interval '1 day' WHERE id='company-b'",
    );
    await expect(
      tenant(
        userB,
        "company-b",
        "write",
        (c) => saveRecord(c, "clients", { name: "Bloqueado" }),
        true,
      ),
    ).rejects.toMatchObject({ status: 402 });
    await expect(
      tenant(userB, "company-b", "export", async () => true),
    ).resolves.toBe(true);
  });
  it("aplica limite persistente por chave", async () => {
    await transaction(async (tx) => {
      await rate(tx, "test-rate", 1);
    });
    await expect(
      transaction((tx) => rate(tx, "test-rate", 1)),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("RLS impede SELECT e INSERT cruzados mesmo sob papel sem BYPASSRLS", async () => {
    await sql.query("CREATE ROLE test_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS");
    await sql.query("GRANT SELECT,INSERT ON records TO test_runtime");
    await sql.query("GRANT SELECT ON memberships TO test_runtime");
    await transaction(async (tx) => {
      await tx.query(
        "SELECT set_config('app.company_id','company-a',true),set_config('app.user_id','owner-a',true)",
      );
      await tx.query("SET LOCAL ROLE test_runtime");
      const r = await tx.query("SELECT * FROM records");
      expect(r.rows.every((v) => v.company_id === "company-a")).toBe(true);
      await tx.query("SAVEPOINT denied_write");
      await expect(
        tx.query(
          "INSERT INTO records(id,company_id,kind,data) VALUES($1,$2,$3,$4)",
          [randomUUID(), "company-b", "clients", '{"name":"Intrusão"}'],
        ),
      ).rejects.toThrow();
      await tx.query("ROLLBACK TO SAVEPOINT denied_write");
    });
  });
});
