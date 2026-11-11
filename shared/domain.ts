import { z } from "zod";
z.config(z.locales.pt());
export const kinds = [
  "clients",
  "opportunities",
  "products",
  "suppliers",
  "tasks",
  "appointments",
  "planning",
  "purchases",
  "marketing",
  "aftersales",
  "guides",
] as const;
export type Kind = (typeof kinds)[number];
export const recordSchema = z.object({
  allowDuplicate: z.boolean().default(false),
  contactType: z.enum(["person", "company"]).default("person"),
  tags: z.array(z.string().max(40)).max(20).default([]),
  communication: z.enum(["whatsapp", "email", "phone", "none"]).default("none"),
  nextAction: z.string().max(500).default(""),
  lossReason: z.string().max(500).default(""),
  pipelineStage: z.string().max(80).default(""),
  valueCents: z.number().int().min(0).max(1000000000).default(0),
  productType: z
    .enum(["product", "service", "material", "variation"])
    .default("product"),
  parentProductId: z.string().max(100).default(""),
  sku: z.string().max(80).default(""),
  size: z.string().max(80).default(""),
  color: z.string().max(80).default(""),
  trackStock: z.boolean().default(false),
  publicCatalog: z.boolean().default(false),
  costKnown: z.boolean().default(false),
  bookingStatus: z
    .enum(["scheduled", "confirmed", "completed", "cancelled", "blocked"])
    .default("scheduled"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  warrantyConditions: z.string().max(2000).default(""),
  warrantyUntil: z.iso.date().or(z.literal("")).default(""),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(5000).default(""),
  status: z
    .enum(["active", "inactive", "pending", "doing", "done"])
    .default("active"),
  email: z.union([z.email(), z.literal("")]).default(""),
  phone: z.string().max(30).default(""),
  category: z.string().max(80).default(""),
  priceCents: z.number().int().min(0).max(1000000000).default(0),
  costCents: z.number().int().min(0).max(1000000000).default(0),
  quantity: z.number().int().min(0).max(1000000).default(0),
  minimum: z.number().int().min(0).max(1000000).default(0),
  unit: z.string().max(30).default("un"),
  due: z.union([z.iso.date(), z.literal("")]).default(""),
  startTime: z
    .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")])
    .default(""),
  endTime: z
    .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")])
    .default(""),
  stage: z
    .enum(["lead", "contact", "proposal", "negotiation", "won", "lost"])
    .default("lead"),
  specification: z.string().max(300).default(""),
  supplierId: z.string().max(100).default(""),
  freightCents: z.number().int().min(0).max(100000000).default(0),
  deliveryDays: z.number().int().min(0).max(3650).default(0),
  brandTone: z.string().max(80).default(""),
  channel: z.string().max(80).default(""),
  audience: z.string().max(300).default(""),
  cta: z.string().max(300).default(""),
  checklist: z
    .array(z.object({ text: z.string().min(1).max(300), done: z.boolean() }))
    .max(100)
    .default([]),
  attachments: z.array(z.string().max(100)).max(20).default([]),
  assignee: z.string().max(100).default(""),
  clientId: z.string().max(100).default(""),
  source: z.string().max(500).default(""),
  confirmed: z.boolean().default(false),
  durationMinutes: z.number().int().min(0).max(100000).default(0),
  variants: z.string().max(2000).default(""),
  expires: z.string().max(40).default(""),
  materials: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive().max(100000),
      }),
    )
    .max(100)
    .default([]),
});
export const profileSchema = z
  .object({
    businessModels: z
      .array(
        z.enum([
          "products",
          "services",
          "custom",
          "appointments",
          "team",
          "deliveries",
          "stock",
        ]),
      )
      .max(7)
      .default([]),
    hiddenTools: z.array(z.string().max(60)).max(30).default([]),
    name: z.string().trim().min(2).max(120),
    area: z.string().min(1).max(80),
    profession: z.string().min(1).max(100),
    state: z.string().max(2),
    city: z.string().max(100),
    cityId: z
      .string()
      .regex(/^\d{7}$/)
      .or(z.literal(""))
      .default(""),
    serviceRegion: z.string().max(300).default(""),
    purchaseProducts: z.array(z.string().max(80)).max(30).default([]),
    materialsNotes: z.string().max(500).default(""),
    purchasePurposes: z
      .array(z.enum(["resale", "manufacturing", "packaging", "equipment"]))
      .max(4)
      .default([]),
    purchaseCategories: z.array(z.string().max(80)).max(30).default([]),
    buysMaterials: z.enum(["yes", "no", "unsure"]).default("unsure"),
    cep: z.string().max(9).default(""),
    stage: z.enum(["starting", "operating"]),
    offer: z.enum(["products", "services", "both"]),
    team: z.enum(["solo", "team"]),
    attendance: z.enum(["local", "online", "home", "mixed"]),
    goals: z.array(z.string().max(40)).max(12),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("pt-BR", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Fuso inválido"),
    step: z.number().int().min(1).max(6),
    complete: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    if (p.complete || p.step >= 4) {
      if (!p.state)
        ctx.addIssue({
          code: "custom",
          path: ["state"],
          message: "Selecione o estado do negócio.",
        });
      if (!p.cityId && !p.city)
        ctx.addIssue({
          code: "custom",
          path: ["cityId"],
          message: "Selecione uma cidade da lista oficial do IBGE.",
        });
    }
  });
export const quoteSchema = z.object({
  clientId: z.string().min(1),
  title: z.string().min(2).max(160),
  items: z
    .array(
      z.object({
        stockProduct: z.boolean().default(false),
        costKnown: z.boolean().default(false),
        productId: z.string().default(""),
        name: z.string().min(1).max(160),
        quantity: z.number().int().positive().max(100000),
        priceCents: z.number().int().min(0).max(100000000),
        costCents: z.number().int().min(0).max(100000000),
        materials: z
          .array(
            z.object({
              productId: z.string(),
              quantity: z.number().int().positive().max(100000),
            }),
          )
          .default([]),
      }),
    )
    .min(1)
    .max(100),
  laborCents: z.number().int().min(0).max(100000000).default(0),
  travelCents: z.number().int().min(0).max(100000000).default(0),
  discountCents: z.number().int().min(0).max(100000000).default(0),
  paymentDue: z.iso.date().or(z.literal("")).default(""),
  deliveryDue: z.iso.date().or(z.literal("")).default(""),
  opportunityId: z.string().max(100).default(""),
  validUntil: z.iso.date(),
  conditions: z.string().max(3000).default(""),
  notes: z.string().max(3000).default(""),
});
export type QuoteInput = z.infer<typeof quoteSchema>;
export function quoteTotals(q: QuoteInput) {
  const revenue =
    q.items.reduce(
      (s, i) => s + BigInt(i.priceCents) * BigInt(i.quantity),
      0n,
    ) +
    BigInt(q.laborCents) +
    BigInt(q.travelCents) -
    BigInt(q.discountCents);
  const cost = q.items.reduce(
    (s, i) => s + BigInt(i.costCents) * BigInt(i.quantity),
    0n,
  );
  if (revenue < 0n || revenue > 100000000000n || cost > 100000000000n)
    throw new Error("Total fora do limite permitido");
  return {
    totalCents: Number(revenue),
    costCents: Number(cost),
    margin:
      revenue > 0n ? Number(((revenue - cost) * 10000n) / revenue) / 100 : null,
    markup: cost > 0n ? Number(((revenue - cost) * 10000n) / cost) / 100 : null,
  };
}
export const money = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    c / 100,
  );
export function parseMoney(v: string) {
  if (!/^\d{1,9}(,\d{1,2})?$/.test(v))
    throw new Error("Use um valor como 49,90");
  const [a, b = ""] = v.split(",");
  return Number(a) * 100 + Number(b.padEnd(2, "0"));
}
export const areas: Record<string, string[]> = {
  Construção: [
    "Pedreiro",
    "Eletricista",
    "Pintor",
    "Arquiteto",
    "Engenheiro civil",
  ],
  Automotivo: ["Mecânico", "Estética automotiva", "Autoelétrica"],
  Beleza: ["Cabeleireiro", "Manicure", "Esteticista", "Barbeiro"],
  Comércio: ["Loja de roupas", "Mercado", "Comércio eletrônico"],
  Artesanato: ["Artesão", "Costureiro", "Marcenaria"],
  Tecnologia: ["Desenvolvedor", "Técnico de informática", "Designer"],
  "Serviços profissionais": ["Consultor", "Fotógrafo", "Professor particular"],
  Jardinagem: ["Jardineiro", "Paisagista"],
  Manutenção: ["Técnico de refrigeração", "Manutenção predial"],
  Outras: ["Outra atividade"],
};
