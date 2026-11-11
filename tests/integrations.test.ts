import { it, expect } from "vitest";
import { briefSchema, redact } from "../server/integrations";
it("minimiza dados e recusa parâmetros adicionais de ferramentas", () => {
  expect(
    redact(
      "Contato pessoa@example.test CPF 123.456.789-01 tel (11) 99999-9999",
    ),
  ).not.toContain("pessoa@");
  expect(redact("123.456.789-01")).toContain("removido");
  expect(() =>
    briefSchema.parse({
      objective: "Criar legenda",
      channel: "instagram",
      product: "Produto",
      audience: "Público",
      tone: "direto",
      cta: "Saiba mais",
      sql: "SELECT *",
    }),
  ).toThrow();
});
