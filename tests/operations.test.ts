import { beforeAll, afterAll, it, expect } from "vitest";
import { migrate, sql, closeDb } from "../server/db";
import {
  tenant,
  saveRecord,
  createQuote,
  approveQuote,
  convertQuote,
  completeOrder,
  movement,
} from "../server/service";
import {
  authorize,
  execution,
  consume,
  receive,
  nextRecurrence,
  createInstallments,
  day,
  reminder,
} from "../server/operation-service";
import { createList, saveListItem } from "../server/material-service";
import {
  previewImport,
  queueImport,
  processImport,
  csvAmount,
} from "../server/import-service";
import { reports } from "../server/reports";
import { calculatePrice, parseCsv, toCsv } from "../shared/operations";
import { allowed, sanitize } from "../shared/access";
const actor = { id: "ops-owner", emailVerified: true },
  other = { id: "ops-other", emailVerified: true };
const run = <T>(f: (c: any) => Promise<T>) =>
  tenant(actor, "ops-company", "write", f, true);
beforeAll(async () => {
  await migrate();
  for (const id of [
    "ops-owner",
    "ops-other",
    "ops-worker",
    "ops-sales",
    "ops-finance",
    "ops-reader",
  ])
    await sql.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$1,$2,true,now(),now())',
      [id, id + "@example.test"],
    );
  for (const [id, owner] of [
    ["ops-company", "ops-owner"],
    ["ops-company-b", "ops-other"],
  ]) {
    await sql.query(
      "INSERT INTO companies(id,name,owner_id) VALUES($1,$1,$2)",
      [id, owner],
    );
    await sql.query("INSERT INTO memberships VALUES($1,$2,'owner')", [
      id,
      owner,
    ]);
  }
  for (const [id, role] of [
    ["ops-worker", "operations"],
    ["ops-sales", "sales"],
    ["ops-finance", "finance"],
    ["ops-reader", "readonly"],
  ])
    await sql.query("INSERT INTO memberships VALUES($1,$2,$3)", [
      "ops-company",
      id,
      role,
    ]);
});
afterAll(closeDb);
it("calculates margin rather than markup, selects one material basis and rejects impossible percentages", () => {
  const p = {
    materialMode: "total",
    materialCents: 10000,
    materials: [
      { name: "not counted twice", quantity: 1, unitCostCents: 99999 },
    ],
    laborMinutes: 60,
    hourlyRateCents: 2000,
    variableCents: 500,
    travelCents: 500,
    feeBps: 500,
    taxBps: 500,
    marginBps: 2000,
  };
  const v = calculatePrice(p);
  expect(v.baseCents).toBe(13000);
  expect(v.priceCents).toBeGreaterThanOrEqual(18572);
  expect(v.markupPercent).not.toBe(v.marginPercent);
  expect(() => calculatePrice({ ...p, marginBps: 9000 })).toThrow();
  expect(
    calculatePrice({
      ...p,
      materialMode: "items",
      materials: [{ name: "Item", quantity: 2, unitCostCents: 100 }],
      laborMinutes: 0,
      variableCents: 0,
      travelCents: 0,
    }).materialCents,
  ).toBe(200);
});
it("preserves quote versions and connects SKU reservations, partial consumption, execution, receipt and aftersales idempotently", async () => {
  await run(async (c) => {
    const client = await saveRecord(c, "clients", {
        name: "Cliente do fluxo QA",
      }),
      material = await saveRecord(c, "products", {
        name: "Material QA",
        unit: "un",
        costCents: 100,
        costKnown: true,
      }),
      base = await saveRecord(c, "products", { name: "Camiseta base QA" }),
      sku = await saveRecord(c, "products", {
        name: "Camiseta P azul QA",
        productType: "variation",
        parentProductId: base.id,
        size: "P",
        color: "Azul",
        trackStock: true,
        costCents: 500,
        costKnown: true,
      });
    await movement(
      c,
      material.id!,
      10,
      0,
      "Entrada de QA",
      "entry-material-qa",
    );
    await movement(c, sku.id!, 5, 0, "Entrada de QA", "entry-sku-qa");
    const input = {
      clientId: client.id,
      title: "Trabalho conectado QA",
      items: [
        {
          name: "Produto QA",
          productId: sku.id,
          stockProduct: true,
          costKnown: true,
          quantity: 2,
          priceCents: 10000,
          costCents: 500,
          materials: [{ productId: material.id, quantity: 1 }],
        },
      ],
      validUntil: "2099-12-31",
      paymentDue: "2099-12-20",
      deliveryDue: "2099-12-15",
    };
    const q = await createQuote(c, input);
    await createQuote(
      c,
      { ...input, items: [{ ...input.items[0], priceCents: 15000 }] },
      q.id,
      q.version,
    );
    await expect(createQuote(c, input, q.id, 1)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (
        await c.tx.query("SELECT * FROM quote_versions WHERE quote_id=$1", [
          q.id,
        ])
      ).rows,
    ).toHaveLength(2);
    await c.tx.query("UPDATE quotes SET status='sent' WHERE id=$1", [q.id]);
    await approveQuote(c, q.id!, "Cliente QA");
    expect(
      (
        await c.tx.query("SELECT approved_version FROM quotes WHERE id=$1", [
          q.id,
        ])
      ).rows[0].approved_version,
    ).toBe(2);
    const order = await convertQuote(c, q.id!);
    expect((await convertQuote(c, q.id!)).id).toBe(order.id);
    expect(
      (
        await c.tx.query("SELECT reserved FROM stock WHERE product_id=$1", [
          sku.id,
        ])
      ).rows[0].reserved,
    ).toBe(2);
    const exec = {
      due: "2099-12-15",
      assignee: actor.id,
      estimatedMinutes: 60,
      actualMinutes: 40,
      stages: [{ text: "Conferir", done: false, due: "", assignee: "" }],
      notes: "Condições reais",
      incidents: "",
      attachments: [],
      costMode: "total",
      actualCostCents: 6000,
    };
    const saved = await execution(c, order.id, exec, null);
    await expect(completeOrder(c, order.id)).rejects.toThrow("etapas");
    const partial = {
      productId: material.id!,
      quantity: 1,
      action: "consume",
      note: "Uso parcial conferido",
      key: "partial-consumption-qa",
    };
    await consume(c, order.id, partial);
    await consume(c, order.id, partial);
    expect(
      (
        await c.tx.query(
          "SELECT quantity,reserved FROM stock WHERE product_id=$1",
          [material.id],
        )
      ).rows[0],
    ).toMatchObject({ quantity: 9, reserved: 1 });
    await execution(
      c,
      order.id,
      { ...exec, stages: [{ ...exec.stages[0], done: true }] },
      saved.version,
    );
    await completeOrder(c, order.id);
    await completeOrder(c, order.id);
    expect(
      (
        await c.tx.query(
          "SELECT quantity,reserved FROM stock WHERE product_id=$1",
          [material.id],
        )
      ).rows[0],
    ).toMatchObject({ quantity: 8, reserved: 0 });
    expect(
      (
        await c.tx.query("SELECT quantity FROM stock WHERE product_id=$1", [
          sku.id,
        ])
      ).rows[0].quantity,
    ).toBe(3);
    expect(
      (
        await c.tx.query(
          "SELECT 1 FROM records WHERE kind='aftersales' AND data->>'clientId'=$1",
          [client.id],
        )
      ).rows,
    ).toHaveLength(1);
    const p = (
      await c.tx.query("SELECT data,version FROM records WHERE id=$1", [sku.id])
    ).rows[0];
    await saveRecord(
      c,
      "products",
      { ...p.data, priceCents: 99999 },
      sku.id,
      p.version,
    );
    const snapshot = (
      await c.tx.query("SELECT snapshot FROM orders WHERE id=$1", [order.id])
    ).rows[0].snapshot;
    expect(snapshot.items[0].priceCents).toBe(15000);
    expect(
      (
        await c.tx.query("SELECT count(*) AS n FROM ledger WHERE order_id=$1", [
          order.id,
        ])
      ).rows[0].n,
    ).toBe(1);
  });
});
it("records purchases without claiming payment and receives a partial quantity into the correct SKU only once", async () => {
  await run(async (c) => {
    const product = await saveRecord(c, "products", {
        name: "Recebimento parcial QA",
        unit: "un",
      }),
      list = await createList(c, { name: "Compra QA" }),
      item = await saveListItem(c, list.id, {
        material: "Material QA",
        quantity: "3",
        unit: "un",
        purchased: true,
        paidCents: null,
      });
    const receipt = {
      itemId: item.id,
      productId: product.id,
      quantity: "1",
      stockQuantity: 1,
      note: "Conferência física de QA",
      key: "receive-once-qa",
    };
    await receive(c, receipt);
    await receive(c, receipt);
    expect(
      (
        await c.tx.query("SELECT quantity FROM stock WHERE product_id=$1", [
          product.id,
        ])
      ).rows[0].quantity,
    ).toBe(1);
    await expect(
      receive(c, {
        ...receipt,
        quantity: "3",
        stockQuantity: 3,
        key: "receive-overflow-qa",
      }),
    ).rejects.toThrow("excede");
    expect(
      (
        await c.tx.query(
          "SELECT * FROM purchase_receipts WHERE list_item_id=$1",
          [item.id],
        )
      ).rows,
    ).toHaveLength(1);
  });
});
it("serializes concurrent appointments and releases cancelled slots", async () => {
  const book = {
    name: "Horário de QA",
    due: "2099-11-09",
    startTime: "09:00",
    endTime: "10:00",
    assignee: "ops-worker",
    status: "pending",
  };
  const results = await Promise.allSettled([
    run((c) => saveRecord(c, "appointments", book)),
    run((c) =>
      saveRecord(c, "appointments", {
        ...book,
        name: "Conflito QA",
        startTime: "09:30",
        endTime: "10:30",
      }),
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  const saved = (
    results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>
  ).value;
  await run(async (c) => {
    await saveRecord(
      c,
      "appointments",
      { ...book, bookingStatus: "cancelled" },
      saved.id,
      saved.version,
    );
    await saveRecord(c, "appointments", book);
  });
});
it("preserves month-end recurrence anchors, exact installment totals and duplicate requests", async () => {
  await run(async (c) => {
    await c.tx.query(
      "INSERT INTO ledger(id,company_id,direction,name,amount_cents,due,recurrence) VALUES('rec-qa',$1,'out','Recorrência QA',10000,'2027-01-31','monthly')",
      [c.companyId],
    );
    const feb = await nextRecurrence(c, "rec-qa");
    expect(feb.due).toBe("2027-02-28");
    expect((await nextRecurrence(c, "rec-qa")).id).toBe(feb.id);
    expect((await nextRecurrence(c, feb.id)).due).toBe("2027-03-31");
    const input = {
      name: "Parcelas QA",
      direction: "in",
      totalCents: 10001,
      count: 3,
      firstDue: "2027-01-31",
      category: "Venda",
      key: "installments-qa",
    };
    const first = await createInstallments(c, input);
    expect((await createInstallments(c, input)).ids).toEqual(first.ids);
    expect(
      Number(
        (
          await c.tx.query(
            "SELECT sum(amount_cents) AS n FROM ledger WHERE installment_group=$1",
            [input.key],
          )
        ).rows[0].n,
      ),
    ).toBe(10001);
  });
});
it("maps CSVs, previews invalid rows, resumes imports and confirms bank matches without duplicate payments", async () => {
  await run(async (c) => {
    const csv =
      "nome;email\nCliente CSV QA;csv-qa@example.test\nInválido;nao-email";
    const preview = await previewImport(c, {
      kind: "clients",
      csv,
      mapping: { name: "nome", email: "email" },
    });
    expect(preview.invalid).toBe(1);
    const queued = await queueImport(c, {
      kind: "clients",
      csv,
      mapping: { name: "nome", email: "email" },
      choices: {},
      confirmed: true,
      validOnly: true,
    });
    const result = await processImport(c, queued.id);
    expect(result.status).toBe("done");
    expect(result.result.map((r: any) => r.status)).toEqual([
      "imported",
      "error",
    ]);
    expect((await processImport(c, queued.id)).status).toBe("done");
    expect(
      (
        await c.tx.query(
          "SELECT id FROM records WHERE company_id=$1 AND data->>'email'='csv-qa@example.test'",
          [c.companyId],
        )
      ).rows,
    ).toHaveLength(1);
    await c.tx.query(
      "INSERT INTO financial_accounts(id,company_id,name) VALUES('account-qa',$1,'Conta de QA')",
      [c.companyId],
    );
    await c.tx.query(
      "INSERT INTO ledger(id,company_id,direction,name,amount_cents,due) VALUES('bank-ledger-qa',$1,'in','Venda do extrato QA',10001,'2026-11-10')",
      [c.companyId],
    );
    const bank = {
      kind: "bank",
      csv: "descricao;data;valor\nVenda do extrato QA;10/11/2026;100,01",
      mapping: { name: "descricao", date: "data", amount: "valor" },
      accountId: "account-qa",
    };
    const p = await previewImport(c, bank);
    expect(p.rows[0].suggestions.some((s) => s.id === "bank-ledger-qa")).toBe(
      true,
    );
    const job = await queueImport(c, {
      ...bank,
      choices: { "2": { action: "match", ledgerId: "bank-ledger-qa" } },
      confirmed: true,
    });
    await processImport(c, job.id);
    await processImport(c, job.id);
    expect(
      Number(
        (
          await c.tx.query(
            "SELECT sum(amount_cents) AS n FROM payments WHERE ledger_id='bank-ledger-qa'",
          )
        ).rows[0].n,
      ),
    ).toBe(10001);
    expect((await previewImport(c, bank)).rows[0].duplicate).toBe(true);
  });
  const batch = await run((c) =>
    queueImport(c, {
      kind: "clients",
      csv:
        "nome;email\n" +
        Array.from(
          { length: 53 },
          (_, i) => `Cliente lote ${i};lote-${i}@example.test`,
        ).join("\n"),
      mapping: { name: "nome", email: "email" },
      choices: {},
      confirmed: true,
    }),
  );
  const first = await run((c) => processImport(c, batch.id));
  expect(first.cursor).toBe(50);
  expect(first.status).toBe("running");
  const resumed = await run((c) => processImport(c, batch.id));
  expect(resumed.status).toBe("done");
  expect(resumed.result).toHaveLength(53);
  const replayed = await run((c) => processImport(c, batch.id));
  expect(replayed.result).toHaveLength(53);
  await run(async (c) => {
    const job = (
      await c.tx.query("SELECT rows,row_count FROM import_jobs WHERE id=$1", [
        batch.id,
      ])
    ).rows[0];
    expect(job.rows).toEqual([]);
    expect(job.row_count).toBe(53);
    expect(
      (
        await c.tx.query(
          "SELECT id FROM records WHERE company_id=$1 AND data->>'email' LIKE 'lote-%@example.test'",
          [c.companyId],
        )
      ).rows,
    ).toHaveLength(53);
  });
  expect(csvAmount("-1.234,56")).toEqual({ cents: 123456, direction: "out" });
  expect(() => parseCsv('nome;email\n"sem fim')).toThrow();
  expect(
    toCsv(
      [{ Nome: '=HYPERLINK("evil")', Email: "@exemplo" }],
      ["Nome", "Email"],
    ),
  ).toContain("'=HYPERLINK");
});
it("requires module permissions and strips financial fields from operations, including nested snapshots", async () => {
  expect(allowed("operations", "finance")).toBe(false);
  expect(allowed("operations", "clients", "export")).toBe(false);
  expect(allowed("sales", "quotes", "write")).toBe(true);
  const cleaned = sanitize(
    {
      snapshot: {
        items: [{ priceCents: 100, costCents: 30 }],
        actualCostCents: 50,
      },
      finance: { amount_cents: 100 },
      data: { name: "Operação" },
    },
    "operations",
  ) as any;
  expect(cleaned.snapshot.items[0]).toEqual({});
  expect(cleaned.snapshot.actualCostCents).toBeUndefined();
  await tenant({ id: "ops-worker" }, "ops-company", "read", async (c) => {
    expect(() => authorize(c, "finance")).toThrow();
    expect(() => authorize(c, "products", true)).toThrow();
  });
  await expect(
    tenant(other, "ops-company", "read", async () => true),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    tenant(
      { id: "ops-reader" },
      "ops-company",
      "write",
      async () => true,
      true,
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("explains report bases, separates cash from sales, and leaves estimated results unavailable without costs", async () => {
  await tenant(actor, "ops-company", "finance", async (c) => {
    const data = await reports(c, { from: "2020-01-01", to: "2099-12-31" });
    const work = data.workResults.find(
      (r) => r.name === "Trabalho conectado QA",
    );
    expect(work?.resultCents).toBe(24000);
    expect(
      data.indicators.find((i) => i.key === "received")?.definition,
    ).toContain("exclui transferências");
    expect(data.cash.definition).toContain("Não é lucro");
    const empty = await reports(c, { from: "2001-01-01", to: "2001-01-02" });
    expect(empty.indicators.every((i) => i.value === null)).toBe(true);
  });
});
it("persists reminder decisions and does not mark a sale paid when an opportunity is won", async () => {
  await run(async (c) => {
    const client = await saveRecord(c, "clients", {
      name: "Cliente comercial QA",
    });
    const before = Number(
      (
        await c.tx.query(
          "SELECT count(*) AS n FROM payments WHERE company_id=$1",
          [c.companyId],
        )
      ).rows[0].n,
    );
    await saveRecord(c, "opportunities", {
      name: "Venda ganha QA",
      clientId: client.id,
      pipelineStage: "won",
      stage: "won",
    });
    expect(
      Number(
        (
          await c.tx.query(
            "SELECT count(*) AS n FROM payments WHERE company_id=$1",
            [c.companyId],
          )
        ).rows[0].n,
      ),
    ).toBe(before);
    const task = await saveRecord(c, "tasks", {
      name: "Tarefa de hoje QA",
      status: "pending",
      due: new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date()),
    });
    const initial = await day(c);
    expect(initial.items.some((i) => i.id === "record:" + task.id)).toBe(true);
    await reminder(c, { id: "record:" + task.id, status: "dismissed" });
    expect((await day(c)).items.some((i) => i.id === "record:" + task.id)).toBe(
      false,
    );
  });
});
