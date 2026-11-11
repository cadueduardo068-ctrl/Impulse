import { z } from "zod";
export const units = [
  "un",
  "g",
  "kg",
  "ml",
  "l",
  "mm",
  "cm",
  "m",
  "m2",
] as const;
export const quantitySchema = z
  .string()
  .trim()
  .regex(/^\d{1,7}([,.]\d{1,3})?$/, "Use uma quantidade como 2 ou 1,5")
  .refine((v) => /[1-9]/.test(v), "Informe uma quantidade maior que zero");
export const specifications: Record<string, readonly (readonly string[])[]> = {
  mdf: [
    ["thickness", "Espessura (mm)", "18"],
    ["dimensions", "Dimensões da chapa (mm)", "2750 × 1850"],
    ["finish", "Acabamento", "Melamínico"],
    ["color", "Cor", "Branco"],
  ],
  screw: [
    ["diameter", "Diâmetro (mm)", "4"],
    ["length", "Comprimento (mm)", "40"],
    ["type", "Tipo de parafuso", "Chipboard cabeça chata"],
  ],
  paint: [
    ["volume", "Volume da embalagem (L)", "18"],
    ["color", "Cor", "Branco neve"],
    ["application", "Aplicação", "Parede interna"],
  ],
  other: [],
} as const;
export const categories = {
  mdf: "MDF e chapas",
  screw: "Parafusos e fixação",
  paint: "Tintas",
  other: "Outro material ou equipamento",
};
export function suggestedCategory(
  material: string,
): "mdf" | "screw" | "paint" | "other" {
  return /^mdf\b/i.test(material.trim())
    ? "mdf"
    : /^parafuso/i.test(material.trim())
      ? "screw"
      : /^tinta\b/i.test(material.trim())
        ? "paint"
        : "other";
}
export const materialQuerySchema = z
  .object({
    material: z.string().trim().min(2, "Informe o material").max(160),
    category: z.string().regex(/^[a-z0-9-]{2,80}$/),
    specs: z.record(z.string().max(40), z.string().trim().max(150)),
    description: z.string().max(1000).default(""),
    quantity: quantitySchema,
    unit: z.string().regex(/^[a-z0-9]{1,10}$/),
    brand: z.string().max(100).default(""),
    minPriceCents: z
      .number()
      .int()
      .min(0)
      .max(1000000000)
      .nullable()
      .default(null),
    maxPriceCents: z
      .number()
      .int()
      .min(0)
      .max(1000000000)
      .nullable()
      .default(null),
    cityId: z.string().regex(/^\d{7}$/, "Selecione um município do IBGE"),
    state: z.string().length(2),
    cep: z
      .string()
      .regex(/^(\d{5}-?\d{3})?$/, "CEP deve ter 8 dígitos")
      .default(""),
    preference: z.enum(["local", "online", "both"]),
    radiusKm: z.number().min(1).max(300).nullable().default(null),
    deadline: z.union([z.iso.date(), z.literal("")]).default(""),
  })
  .superRefine((q, ctx) => {
    if (Object.keys(q.specs).length > 48)
      ctx.addIssue({
        code: "custom",
        path: ["specs"],
        message: "Use até 48 especificações e o campo de detalhes.",
      });
    if (
      q.minPriceCents !== null &&
      q.maxPriceCents !== null &&
      q.minPriceCents > q.maxPriceCents
    )
      ctx.addIssue({
        code: "custom",
        path: ["maxPriceCents"],
        message: "O preço máximo deve ser maior ou igual ao mínimo",
      });
  });
export type MaterialQuery = z.infer<typeof materialQuerySchema>;
export const offerSchema = z.object({
  name: z.string().trim().min(2).max(200),
  supplier: z.string().max(200).default(""),
  url: z.string().max(2000).default(""),
  category: z.string().regex(/^[a-z0-9-]{2,80}$/),
  specs: z.record(z.string().max(40), z.string().max(150)),
  brand: z.string().max(100).default(""),
  packageQuantity: quantitySchema,
  unit: z.string().regex(/^[a-z0-9]{1,10}$/),
  priceCents: z.number().int().min(0).max(1000000000).nullable().default(null),
  freightCents: z
    .number()
    .int()
    .min(0)
    .max(1000000000)
    .nullable()
    .default(null),
  freightCep: z
    .string()
    .regex(/^(\d{5}-?\d{3})?$/)
    .default(""),
  delivery: z.string().max(200).default(""),
  source: z.string().min(2).max(200),
  checkedAt: z.iso.datetime(),
  availability: z.enum(["unconfirmed", "confirmed"]).default("unconfirmed"),
  evidence: z.string().max(1000).default(""),
});
export type Offer = z.infer<typeof offerSchema>;
export type SearchResult = {
  id: string;
  kind: "local" | "online";
  name: string;
  url: string;
  description: string;
  source: string;
  checkedAt: string;
  city?: string;
  address?: string;
  phone?: string;
  mapUrl?: string;
  offer?: Offer;
  match: "category" | "unverified" | "exact" | "similar" | "search-link";
  differences: string[];
  availability: "unconfirmed" | "confirmed";
  storageAllowed: boolean;
};
export const listSchema = z.object({
  name: z.string().trim().min(2).max(160),
  quoteId: z.string().max(100).nullable().default(null),
  orderId: z.string().max(100).nullable().default(null),
});
export const listItemSchema = z.object({
  material: z.string().trim().min(2).max(160),
  specification: z.string().max(1000).default(""),
  quantity: quantitySchema,
  unit: z.string().regex(/^[a-z0-9]{1,10}$/),
  purchased: z.boolean().default(false),
  paidCents: z.number().int().min(0).max(1000000000).nullable().default(null),
  supplier: z.string().max(200).default(""),
  offerUrl: z.string().max(2000).default(""),
});
export function quantityMilli(v: string) {
  const [a, b = ""] = v.replace(",", ".").split(".");
  return BigInt(a) * 1000n + BigInt(b.padEnd(3, "0"));
}
const dimensions: Record<string, [string, bigint]> = {
  un: ["count", 1n],
  g: ["mass", 1n],
  kg: ["mass", 1000n],
  ml: ["volume", 1n],
  l: ["volume", 1000n],
  mm: ["length", 1n],
  cm: ["length", 10n],
  m: ["length", 1000n],
  m2: ["area", 1n],
};
const dimension = (unit: string): [string, bigint] =>
  dimensions[unit] ?? ["custom:" + unit, 1n];
const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/×/g, "x")
    .trim();
export function compatibility(query: MaterialQuery, offer: Offer) {
  const differences: string[] = [];
  const missing: string[] = [];
  const requestedName = normalize(query.material).split(/\s+/).filter(Boolean);
  if (!requestedName.every((part) => normalize(offer.name).includes(part)))
    differences.push("Identificação do produto diferente da solicitada");
  if (
    query.description &&
    !normalize(offer.evidence).includes(normalize(query.description))
  )
    missing.push("outras especificações");
  if (query.category !== offer.category)
    differences.push("Categoria diferente");
  if (dimension(query.unit)[0] !== dimension(offer.unit)[0])
    differences.push(`Unidades incompatíveis: ${query.unit} e ${offer.unit}`);
  for (const [k, v] of Object.entries(query.specs)) {
    if (!v || normalize(v) === "sem preferencia") continue;
    if (!offer.specs[k]) missing.push(k);
    else if (normalize(v) !== normalize(offer.specs[k]))
      differences.push(`${k}: solicitado ${v}; oferta ${offer.specs[k]}`);
  }
  if (query.brand && normalize(query.brand) !== normalize(offer.brand))
    differences.push(
      `Marca: solicitada ${query.brand}; oferta ${offer.brand || "não informada"}`,
    );
  return {
    match: differences.length
      ? "similar"
      : missing.length
        ? "unverified"
        : "exact",
    differences: [
      ...differences,
      ...missing.map((k) => `${k}: não informado na oferta`),
    ],
  } as const;
}
export function compareOffer(query: MaterialQuery, offer: Offer) {
  const match = compatibility(query, offer);
  if (match.match !== "exact" || offer.priceCents === null)
    return {
      ...match,
      packages: null,
      subtotalCents: null,
      totalCents: null,
      unitPriceCents: null,
    };
  const required = quantityMilli(query.quantity) * dimension(query.unit)[1],
    pack = quantityMilli(offer.packageQuantity) * dimension(offer.unit)[1];
  const packages = (required + pack - 1n) / pack;
  const subtotal = packages * BigInt(offer.priceCents);
  if (subtotal > 9000000000000n)
    throw new Error("Quantidade fora do limite de comparação");
  const freightConfirmed =
    offer.freightCents !== null &&
    !!query.cep &&
    offer.freightCep.replace("-", "") === query.cep.replace("-", "");
  return {
    ...match,
    packages: Number(packages),
    subtotalCents: Number(subtotal),
    totalCents: freightConfirmed
      ? Number(subtotal) + offer.freightCents!
      : null,
    unitPriceCents: Number(
      (BigInt(offer.priceCents) * 1000n * dimension(query.unit)[1] +
        pack / 2n) /
        pack,
    ),
  };
}
export function queryText(q: MaterialQuery) {
  return [
    q.material,
    ...Object.entries(q.specs)
      .filter(([, v]) => v && normalize(v) !== "sem preferencia")
      .map(
        ([k, v]) =>
          `${(specifications[q.category] ?? []).find(([id]) => id === k)?.[1] ?? k}: ${v}`,
      ),
    q.description,
    q.brand,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 600);
}
export function marketplaceLinks(q: MaterialQuery) {
  const text = queryText(q);
  return [
    {
      name: "Mercado Livre",
      url: `https://lista.mercadolivre.com.br/${encodeURIComponent(text.replace(/\s+/g, "-"))}`,
    },
    {
      name: "Amazon",
      url: `https://www.amazon.com.br/s?k=${encodeURIComponent(text)}`,
    },
    {
      name: "Google Maps",
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${q.material} ${q.state} município IBGE ${q.cityId}`)}`,
    },
  ];
}
