import { describe, it, expect } from "vitest";
import { parseMoney, quoteSchema, quoteTotals } from "../shared/domain";
describe("Dinheiro em centavos e propostas", () => {
  it("converte decimais brasileiros sem arredondamento binário", () => {
    expect(parseMoney("0,10") + parseMoney("0,20")).toBe(30);
    expect(parseMoney("1234,5")).toBe(123450);
    expect(() => parseMoney("1.000,00")).toThrow();
    expect(() => parseMoney("1,999")).toThrow();
    expect(() => parseMoney("-10")).toThrow();
  });
  it("distingue margem e markup e soma quantidades, serviços, frete e desconto", () => {
    const q = quoteSchema.parse({
      clientId: "a",
      title: "Teste",
      items: [
        { name: "Item", quantity: 2, priceCents: 15000, costCents: 10000 },
      ],
      laborCents: 1000,
      travelCents: 500,
      discountCents: 1500,
      validUntil: "2026-12-01",
    });
    expect(quoteTotals(q)).toEqual({
      totalCents: 30000,
      costCents: 20000,
      margin: 33.33,
      markup: 50,
    });
  });
  it("recusa totais negativos e limita inteiros para impedir overflow", () => {
    const q = quoteSchema.parse({
      clientId: "a",
      title: "Teste",
      items: [{ name: "Item", quantity: 1, priceCents: 10, costCents: 0 }],
      discountCents: 100,
      validUntil: "2026-12-01",
    });
    expect(() => quoteTotals(q)).toThrow();
    expect(() =>
      quoteSchema.parse({
        ...q,
        items: [{ name: "x", quantity: 0.2, priceCents: 100, costCents: 0 }],
      }),
    ).toThrow();
  });
});
