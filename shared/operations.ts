import { z } from "zod";
export const cents = z.number().int().min(0).max(1000000000);
export const pricingSchema = z
  .object({
    materialMode: z.enum(["total", "items"]),
    materialCents: cents,
    materials: z
      .array(
        z.object({
          name: z.string().max(100),
          quantity: z.number().int().positive().max(100000),
          unitCostCents: cents,
        }),
      )
      .max(100),
    laborMinutes: z.number().int().min(0).max(100000),
    hourlyRateCents: cents,
    variableCents: cents,
    travelCents: cents,
    feeBps: z.number().int().min(0).max(9999),
    taxBps: z.number().int().min(0).max(9999),
    marginBps: z.number().int().min(0).max(9999),
  })
  .superRefine((v, c) => {
    if (v.feeBps + v.taxBps + v.marginBps >= 10000)
      c.addIssue({
        code: "custom",
        path: ["marginBps"],
        message: "Margem, taxas e impostos precisam somar menos de 100%.",
      });
  });
export function calculatePrice(input: unknown) {
  const p = pricingSchema.parse(input),
    ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
  const materials =
      p.materialMode === "items"
        ? p.materials.reduce(
            (n, i) => n + BigInt(i.unitCostCents) * BigInt(i.quantity),
            0n,
          )
        : BigInt(p.materialCents),
    labor = ceil(BigInt(p.laborMinutes) * BigInt(p.hourlyRateCents), 60n),
    base = materials + labor + BigInt(p.variableCents) + BigInt(p.travelCents);
  let price = ceil(
      base * 10000n,
      10000n - BigInt(p.feeBps + p.taxBps + p.marginBps),
    ),
    fees = ceil(price * BigInt(p.feeBps + p.taxBps), 10000n);
  while (
    price > 0n &&
    (price - base - fees) * 10000n < price * BigInt(p.marginBps) &&
    price <= 1000000000n
  ) {
    price++;
    fees = ceil(price * BigInt(p.feeBps + p.taxBps), 10000n);
  }
  const result = price - base - fees;
  if (price > 1000000000n) throw new Error("Preço excede o limite permitido.");
  return {
    assumptions: p,
    materialCents: Number(materials),
    laborCents: Number(labor),
    baseCents: Number(base),
    priceCents: Number(price),
    feesCents: Number(fees),
    estimatedResultCents: Number(result),
    marginPercent: price ? Number((result * 10000n) / price) / 100 : null,
    markupPercent: base ? Number(((price - base) * 10000n) / base) / 100 : null,
    formula:
      "Preço = custo base ÷ (1 − taxas − impostos informados − margem desejada). Mão de obra arredondada para cima no centavo. Materiais detalhados substituem o total manual.",
  };
}
export const executionSchema = z.object({
  costMode: z.enum(["unknown", "snapshot", "total"]).default("unknown"),
  actualCostCents: cents.default(0),
  due: z.iso.date().or(z.literal("")),
  assignee: z.string().max(100),
  estimatedMinutes: z.number().int().min(0).max(100000),
  actualMinutes: z.number().int().min(0).max(100000),
  stages: z
    .array(
      z.object({
        text: z.string().min(1).max(200),
        done: z.boolean(),
        due: z.iso.date().or(z.literal("")),
        assignee: z.string().max(100),
      }),
    )
    .max(60),
  notes: z.string().max(4000),
  incidents: z.string().max(4000),
  attachments: z.array(z.string().max(100)).max(20),
});
export const pipelineDefault = [
  { id: "lead", label: "Novo contato" },
  { id: "contact", label: "Entendimento" },
  { id: "proposal", label: "Proposta" },
  { id: "negotiation", label: "Negociação" },
  { id: "won", label: "Ganho" },
  { id: "lost", label: "Perdido" },
];
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^\s*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  return (
    "\uFEFF" +
    [
      columns.map(csvCell).join(";"),
      ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(";")),
    ].join("\r\n")
  );
}
export function parseCsv(text: string) {
  if (text.length > 1000000) throw new Error("CSV limitado a 1 MB.");
  const source = text.replace(/^\uFEFF/, "");
  const first = source.split(/\r?\n/)[0],
    sep =
      (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0)
        ? ";"
        : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!cell || quoted) quoted = !quoted;
      else cell += c;
    } else if (c === sep && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
    if (rows.length > 1001 || cell.length > 10000)
      throw new Error(
        "CSV limitado a 1.000 linhas e campos de 10.000 caracteres.",
      );
  }
  if (quoted) throw new Error("Aspas não fechadas no CSV.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((h) => h.trim()) ?? [];
  if (
    !headers.length ||
    headers.length > 30 ||
    new Set(headers).size !== headers.length
  )
    throw new Error("Use de 1 a 30 cabeçalhos únicos.");
  if (rows.some((r) => r.length !== headers.length))
    throw new Error(
      "Quantidade de colunas divergente. Revise as linhas do CSV.",
    );
  return {
    headers,
    rows: rows.map((r, i) => ({
      line: i + 2,
      values: Object.fromEntries(headers.map((h, j) => [h, r[j]])),
    })),
  };
}
