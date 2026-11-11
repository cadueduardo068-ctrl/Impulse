import { z } from "zod";
import { HttpError, rate, type Context } from "./service.js";
// Contrato server-side para provedores. Nenhuma ferramenta obtém acesso ao banco via prompt.
export const briefSchema = z
  .object({
    objective: z.string().min(3).max(300),
    channel: z.enum(["instagram", "whatsapp", "email", "site"]),
    product: z.string().min(2).max(300),
    audience: z.string().min(2).max(300),
    tone: z.enum(["profissional", "acolhedor", "direto"]),
    cta: z.string().min(2).max(200),
  })
  .strict();
export function redact(text: string) {
  return text
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[e-mail removido]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[documento removido]")
    .replace(
      /(?:\+55\s*)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g,
      "[telefone removido]",
    );
}
export interface ContentProvider {
  generate(
    brief: z.infer<typeof briefSchema>,
    signal: AbortSignal,
  ): Promise<{ text: string; costMicrocents: number }>;
}
export async function prepareContent(
  c: Context,
  input: unknown,
  provider?: ContentProvider,
) {
  const brief = briefSchema.parse(input);
  await rate(c.tx, `ai:${c.companyId}:${c.userId}`, 10, 3600);
  if (!provider)
    throw new HttpError(
      503,
      "Provedor de IA não configurado. O briefing manual continua disponível.",
    );
  const clean = Object.fromEntries(
    Object.entries(brief).map(([k, v]) => [k, redact(v)]),
  ) as z.infer<typeof briefSchema>;
  const month = new Date().toISOString().slice(0, 7);
  const budget = Number(process.env.AI_MONTHLY_BUDGET_MICROCENTS ?? 100000000);
  const reserve = Number(process.env.AI_REQUEST_RESERVE_MICROCENTS ?? 1000000);
  const row =
    (
      await c.tx.query(
        "INSERT INTO integration_budget(company_id,month,used_microcents) VALUES($1,$2,0) ON CONFLICT DO NOTHING RETURNING used_microcents",
        [c.companyId, month],
      )
    ).rows[0] ??
    (
      await c.tx.query(
        "SELECT used_microcents FROM integration_budget WHERE company_id=$1 AND month=$2 FOR UPDATE",
        [c.companyId, month],
      )
    ).rows[0];
  if (Number(row.used_microcents) + reserve > budget)
    throw new HttpError(429, "Orçamento mensal de IA atingido");
  let result;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await provider.generate(clean, AbortSignal.timeout(12000));
      break;
    } catch {
      if (attempt === 1)
        throw new HttpError(
          503,
          "O provedor não respondeu. Seu briefing continua disponível.",
        );
    }
  }
  if (
    !result ||
    !Number.isSafeInteger(result.costMicrocents) ||
    result.costMicrocents < 0 ||
    result.costMicrocents > reserve
  )
    throw new HttpError(503, "Resposta inválida do provedor");
  await c.tx.query(
    "UPDATE integration_budget SET used_microcents=used_microcents+$3 WHERE company_id=$1 AND month=$2",
    [c.companyId, month, result.costMicrocents],
  );
  await c.tx.query(
    "INSERT INTO integration_usage(company_id,user_id,count) VALUES($1,$2,1) ON CONFLICT(company_id,user_id,day) DO UPDATE SET count=integration_usage.count+1",
    [c.companyId, c.userId],
  );
  return { text: redact(result.text).slice(0, 10000), requiresReview: true };
}
