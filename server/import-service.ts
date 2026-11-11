import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseCsv } from "../shared/operations.js";
import { recordSchema } from "../shared/domain.js";
import { authorize, isoDate } from "./operation-service.js";
import {
  assert,
  saveRecord,
  pay,
  audit,
  hash,
  rate,
  type Context,
} from "./service.js";
const request = z.object({
  kind: z.enum(["clients", "products", "bank"]),
  csv: z.string().max(1000000),
  mapping: z.record(z.string().max(50), z.string().max(200)),
  accountId: z.string().max(100).default(""),
});
export function csvAmount(value: string) {
  let v = value.trim().replace(/^R\$\s*/, "");
  const negative = v.startsWith("-");
  v = v.replace(/^[+-]/, "");
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  assert(
    /^\d{1,9}(\.\d{1,2})?$/.test(v),
    "Valor inválido: use reais com duas casas decimais",
  );
  const [a, b = ""] = v.split(".");
  return {
    cents: Number(a) * 100 + Number(b.padEnd(2, "0")),
    direction: negative ? "out" : "in",
  };
}
function csvDate(v: string) {
  const date = /^\d{2}\/\d{2}\/\d{4}$/.test(v)
    ? v.split("/").reverse().join("-")
    : v;
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      new Date(date + "T12:00Z").toISOString().slice(0, 10) === date,
    "Data inválida: use AAAA-MM-DD ou DD/MM/AAAA",
  );
  return date;
}
export async function previewImport(c: Context, input: unknown) {
  const b = request.parse(input);
  authorize(c, b.kind === "bank" ? "finance" : "imports", true);
  const parsed = parseCsv(b.csv);
  if (b.kind === "bank")
    assert(
      b.accountId &&
        (
          await c.tx.query(
            "SELECT 1 FROM financial_accounts WHERE company_id=$1 AND id=$2",
            [c.companyId, b.accountId],
          )
        ).rows.length,
      "Selecione uma conta financeira da empresa",
    );
  const existing = (
    await c.tx.query(
      "SELECT id,data FROM records WHERE company_id=$1 AND kind=$2 AND deleted_at IS NULL",
      [c.companyId, b.kind],
    )
  ).rows;
  const pending =
    b.kind === "bank"
      ? (
          await c.tx.query(
            "SELECT l.id,l.name,l.direction,l.amount_cents,l.due,coalesce(p.paid,0) AS paid FROM ledger l LEFT JOIN (SELECT ledger_id,sum(amount_cents) AS paid FROM payments WHERE company_id=$1 GROUP BY ledger_id) p ON p.ledger_id=l.id WHERE l.company_id=$1",
            [c.companyId],
          )
        ).rows
      : [];
  const seen = new Set<string>();
  const rows = parsed.rows.map((r) => {
    try {
      const get = (key: string) => (r.values[b.mapping[key]] ?? "").trim();
      if (b.kind === "bank") {
        const amount = csvAmount(get("amount"));
        assert(amount.cents > 0, "Informe valor diferente de zero");
        const stated = get("direction")
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase();
        assert(
          !stated || /^(in|out|entrada|saida|credito|debito)$/.test(stated),
          "Sentido inválido: use in/out, entrada/saída ou crédito/débito.",
        );
        const direction = stated
          ? ["out", "saida", "debito"].includes(stated)
            ? "out"
            : "in"
          : amount.direction;
        assert(
          !(amount.direction === "out" && direction === "in"),
          "Valor negativo contradiz o sentido de entrada informado.",
        );
        const date = csvDate(get("date")),
          name = get("name");
        assert(
          name.length >= 2 && name.length <= 160,
          "Descrição precisa ter de 2 a 160 caracteres",
        );
        const fingerprint = hash(
          JSON.stringify([
            b.accountId,
            date,
            amount.cents,
            direction,
            name.toLocaleLowerCase("pt-BR"),
            get("reference"),
          ]),
        );
        const duplicate = seen.has(fingerprint);
        seen.add(fingerprint);
        const suggestions = pending
          .filter(
            (l) =>
              l.direction === direction &&
              Number(l.amount_cents) - Number(l.paid) >= amount.cents &&
              Math.abs(
                new Date(isoDate(l.due)).getTime() - new Date(date).getTime(),
              ) <=
                7 * 86400000,
          )
          .slice(0, 10)
          .map((l) => ({
            id: l.id,
            name: l.name,
            remainingCents: Number(l.amount_cents) - Number(l.paid),
            reason:
              "Mesmo sentido, saldo suficiente e vencimento até sete dias da data. Confirme manualmente.",
          }));
        return {
          line: r.line,
          data: {
            name,
            date,
            amountCents: amount.cents,
            direction,
            accountId: b.accountId,
            fingerprint,
          },
          duplicate,
          suggestions,
          error: "",
        };
      }
      const price =
          b.kind === "products" ? csvAmount(get("price") || "0").cents : 0,
        cost = b.kind === "products" ? csvAmount(get("cost") || "0").cents : 0;
      const data = recordSchema.parse({
        name: get("name"),
        email: b.kind === "clients" ? get("email") : "",
        phone: get("phone"),
        category: get("category"),
        description: get("description"),
        priceCents: price,
        costCents: cost,
        costKnown: b.kind === "products" && !!get("cost"),
        sku: get("sku"),
        unit: get("unit") || "un",
      });
      const key = (data.email || data.sku || data.name)
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
      const duplicate =
        seen.has(key) ||
        existing.some(
          (e) =>
            (data.email &&
              data.email.toLowerCase() === e.data.email?.toLowerCase()) ||
            (data.sku && data.sku === e.data.sku) ||
            data.name.toLowerCase() === e.data.name.toLowerCase(),
        );
      seen.add(key);
      return { line: r.line, data, duplicate, error: "", suggestions: [] };
    } catch (e: any) {
      return {
        line: r.line,
        data: null,
        error: e.issues?.map((i: any) => i.message).join("; ") ?? e.message,
        duplicate: false,
        suggestions: [],
      };
    }
  });
  if (b.kind === "bank")
    for (const row of rows)
      if (row.data && "fingerprint" in row.data && row.data.fingerprint)
        row.duplicate ||= !!(
          await c.tx.query(
            "SELECT 1 FROM imported_bank_rows WHERE company_id=$1 AND fingerprint=$2",
            [c.companyId, row.data.fingerprint],
          )
        ).rows.length;
  return {
    kind: b.kind,
    headers: parsed.headers,
    rows,
    valid: rows.filter((r) => !r.error).length,
    invalid: rows.filter((r) => r.error).length,
  };
}
export async function queueImport(c: Context, input: any) {
  await rate(c.tx, "imports:" + c.companyId, 10, 3600);
  const preview = await previewImport(c, input);
  const choices = z
    .record(
      z.string(),
      z.object({
        action: z.enum(["import", "skip", "match"]),
        ledgerId: z.string().max(100).optional(),
        allowDuplicate: z.boolean().default(false),
      }),
    )
    .parse(input.choices);
  assert(input.confirmed === true, "Confirme a prévia antes de importar");
  if (preview.invalid)
    assert(
      input.validOnly === true,
      "Revise os erros e confirme importar somente as linhas válidas",
    );
  const rows = preview.rows.map((r) => ({
    ...r,
    choice: choices[String(r.line)] ?? {
      action: preview.kind === "bank" ? "skip" : "import",
      allowDuplicate: false,
    },
  }));
  for (const r of rows)
    if (r.choice.action === "match")
      assert(
        preview.kind === "bank" &&
          r.suggestions.some((s) => s.id === r.choice.ledgerId),
        "Confirme uma sugestão válida de correspondência",
      );
  const staged = Number(
    (
      await c.tx.query(
        "SELECT count(*) AS n FROM import_jobs WHERE company_id=$1 AND status IN ('ready','running')",
        [c.companyId],
      )
    ).rows[0].n,
  );
  assert(
    staged < 10,
    "Conclua as importações pendentes antes de criar mais trabalhos.",
  );
  const id = randomUUID();
  await c.tx.query(
    "INSERT INTO import_jobs(id,company_id,user_id,kind,rows,row_count) VALUES($1,$2,$3,$4,$5,$6)",
    [
      id,
      c.companyId,
      c.userId,
      preview.kind,
      JSON.stringify(rows),
      rows.length,
    ],
  );
  await audit(c, "import.queued", id);
  return { id };
}
export async function processImport(c: Context, id: string) {
  const job = (
    await c.tx.query(
      "SELECT * FROM import_jobs WHERE company_id=$1 AND id=$2 FOR UPDATE",
      [c.companyId, id],
    )
  ).rows[0];
  assert(job, "Importação não encontrada", 404);
  authorize(c, job.kind === "bank" ? "finance" : "imports", true);
  if (["done", "cancelled"].includes(job.status))
    return {
      ...job,
      status: job.status,
      result: job.result,
      cursor: job.cursor,
      rows: undefined,
      total: job.row_count,
    };
  const rows = job.rows as any[],
    result = job.result as any[],
    end = Math.min(job.cursor + 50, rows.length);
  for (let index = job.cursor; index < end; index++) {
    const r = rows[index];
    if (
      r.error ||
      r.choice.action === "skip" ||
      (r.duplicate && !r.choice.allowDuplicate)
    ) {
      result.push({
        line: r.line,
        status: r.error ? "error" : "skipped",
        message: r.error || "Linha dispensada ou duplicada.",
      });
      continue;
    }
    await c.tx.query("SAVEPOINT import_row");
    try {
      let entityId: string;
      if (job.kind === "bank") {
        const b = r.data;
        const duplicate = (
          await c.tx.query(
            "SELECT 1 FROM imported_bank_rows WHERE company_id=$1 AND fingerprint=$2",
            [c.companyId, b.fingerprint],
          )
        ).rows.length;
        assert(
          !duplicate,
          "Movimentação já importada; registre manualmente se forem transações diferentes.",
        );
        let ledgerId = r.choice.ledgerId;
        if (r.choice.action === "match") {
          const l = (
            await c.tx.query(
              "SELECT direction FROM ledger WHERE company_id=$1 AND id=$2",
              [c.companyId, ledgerId],
            )
          ).rows[0];
          assert(l?.direction === b.direction, "Correspondência incompatível");
        } else {
          ledgerId = randomUUID();
          await c.tx.query(
            "INSERT INTO ledger(id,company_id,direction,name,amount_cents,due,account_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              ledgerId,
              c.companyId,
              b.direction,
              b.name,
              b.amountCents,
              b.date,
              b.accountId,
            ],
          );
        }
        const p = await pay(
          c,
          ledgerId,
          b.amountCents,
          "bank:" + id + ":" + r.line,
          b.date,
          b.accountId,
        );
        entityId = p.id;
        await c.tx.query(
          "INSERT INTO imported_bank_rows(company_id,fingerprint,payment_id,job_id) VALUES($1,$2,$3,$4)",
          [c.companyId, b.fingerprint, entityId, id],
        );
      } else
        entityId = (
          await saveRecord(c, job.kind, {
            ...r.data,
            allowDuplicate: r.choice.allowDuplicate,
          })
        ).id!;
      result.push({ line: r.line, status: "imported", id: entityId });
      await c.tx.query("RELEASE SAVEPOINT import_row");
    } catch (e: any) {
      await c.tx.query("ROLLBACK TO SAVEPOINT import_row");
      await c.tx.query("RELEASE SAVEPOINT import_row");
      result.push({
        line: r.line,
        status: "error",
        message: e.message?.slice(0, 500) || "Linha inválida",
      });
    }
  }
  const status = end === rows.length ? "done" : "running";
  await c.tx.query(
    "UPDATE import_jobs SET cursor=$3,result=$4,status=$5,updated_at=now() WHERE company_id=$1 AND id=$2",
    [c.companyId, id, end, JSON.stringify(result), status],
  );
  if (status === "done")
    await c.tx.query(
      "UPDATE import_jobs SET rows='[]' WHERE company_id=$1 AND id=$2",
      [c.companyId, id],
    );
  await audit(c, "import.batch", id);
  return {
    ...job,
    rows: undefined,
    cursor: end,
    total: rows.length,
    result,
    status,
  };
}
