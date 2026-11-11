export type CatalogAttribute = {
  key: string;
  label: string;
  type: "select" | "multi" | "number" | "text";
  required: boolean;
  options: string[];
  unit?: string;
  example?: string;
  dependsOn?: { key: string; value: string };
};
export type CatalogProduct = {
  id: string;
  name: string;
  categoryId: string;
  aliases: string[];
  units: string[];
  attributes: CatalogAttribute[];
};
export type CatalogCategory = {
  id: string;
  name: string;
  areas: string[];
  purpose?: string;
};
export const areaSeed = [
  [
    "construction",
    "Construção",
    ["Pedreiro", "Eletricista", "Pintor", "Arquiteto", "Engenheiro civil"],
    0,
  ],
  [
    "woodwork",
    "Marcenaria",
    ["Marceneiro", "Montador de móveis", "Restaurador de móveis"],
    4,
  ],
  [
    "fashion",
    "Roupas e moda",
    ["Loja de roupas", "Confecção", "Costureiro", "Estilista"],
    3,
  ],
  [
    "automotive",
    "Automotivo",
    ["Mecânico", "Estética automotiva", "Autoelétrica"],
    1,
  ],
  [
    "beauty",
    "Beleza",
    ["Cabeleireiro", "Manicure", "Esteticista", "Barbeiro"],
    2,
  ],
  [
    "commerce",
    "Comércio",
    ["Comerciante", "Mercado", "Comércio eletrônico"],
    3,
  ],
  ["craft", "Artesanato", ["Artesão", "Costureiro", "Marcenaria"], 4],
  [
    "technology",
    "Tecnologia",
    ["Desenvolvedor", "Técnico de informática", "Designer"],
    5,
  ],
  ["garden", "Jardinagem", ["Jardineiro", "Paisagista"], 7],
  [
    "maintenance",
    "Manutenção",
    ["Técnico de refrigeração", "Manutenção predial"],
    8,
  ],
  [
    "professional",
    "Serviços profissionais",
    ["Consultor", "Fotógrafo", "Professor particular"],
    6,
  ],
  ["other", "Outras áreas", ["Outra atividade"], 9],
] as const;
export const categorySeed: CatalogCategory[] = [
  {
    id: "boards",
    name: "MDF e madeira",
    areas: ["woodwork", "craft", "construction"],
  },
  {
    id: "hardware",
    name: "Ferragens, corrediças e dobradiças",
    areas: ["woodwork", "craft", "construction", "maintenance"],
  },
  {
    id: "finish",
    name: "Tintas e acabamentos",
    areas: ["woodwork", "construction", "craft", "maintenance"],
  },
  {
    id: "tools",
    name: "Ferramentas e equipamentos",
    areas: [
      "woodwork",
      "construction",
      "automotive",
      "maintenance",
      "garden",
      "technology",
    ],
  },
  {
    id: "ready-fashion",
    name: "Peças prontas para revenda",
    areas: ["fashion", "commerce"],
    purpose: "resale",
  },
  {
    id: "fabrication",
    name: "Tecidos e aviamentos",
    areas: ["fashion", "craft"],
    purpose: "manufacturing",
  },
  {
    id: "packaging-category",
    name: "Embalagens",
    areas: ["fashion", "commerce", "craft"],
    purpose: "packaging",
  },
  {
    id: "fashion-equipment",
    name: "Máquinas e acessórios",
    areas: ["fashion"],
    purpose: "equipment",
  },
  {
    id: "auto-products",
    name: "Produtos e acessórios automotivos",
    areas: ["automotive"],
  },
  {
    id: "beauty-supplies",
    name: "Produtos e insumos de beleza",
    areas: ["beauty"],
  },
  {
    id: "garden-supplies",
    name: "Plantas, substratos e irrigação",
    areas: ["garden"],
  },
  {
    id: "tech-supplies",
    name: "Componentes e acessórios de tecnologia",
    areas: ["technology"],
  },
  {
    id: "office",
    name: "Materiais de apoio e escritório",
    areas: ["professional", "technology", "other"],
  },
  { id: "general", name: "Pesquisa geral", areas: areaSeed.map((a) => a[0]) },
];
const select = (
  key: string,
  label: string,
  options: string[],
  required = true,
  example = "",
): CatalogAttribute => ({
  key,
  label,
  type: "select",
  required,
  options: [...options, ...(!required ? ["Sem preferência"] : [])],
  example,
});
const number = (
  key: string,
  label: string,
  unit: string,
): CatalogAttribute => ({
  key,
  label,
  type: "number",
  required: true,
  options: [],
  unit,
});
const text = (
  key: string,
  label: string,
  example = "",
  required = true,
): CatalogAttribute => ({
  key,
  label,
  type: "text",
  required,
  options: [],
  example,
});
const colors = [
  "Branco",
  "Preto",
  "Cinza",
  "Bege",
  "Natural",
  "Azul",
  "Vermelho",
  "Verde",
  "Outra cor",
];
const mdf = [
  select("thickness", "Espessura (mm)", [
    "3",
    "6",
    "9",
    "12",
    "15",
    "18",
    "25",
    "30",
  ]),
  select("dimensions", "Dimensões da chapa (mm)", [
    "2750 x 1850",
    "2750 x 1840",
    "2440 x 1220",
    "Outra medida",
  ]),
  select("finish", "Acabamento", [
    "Melamínico",
    "Cru",
    "Laminado",
    "Outro acabamento",
  ]),
  select("color", "Cor", colors),
];
export const productSeed: CatalogProduct[] = [
  {
    id: "mdf",
    name: "MDF",
    categoryId: "boards",
    aliases: ["chapa de mdf"],
    units: ["un", "m2"],
    attributes: mdf,
  },
  {
    id: "wood",
    name: "Madeira",
    categoryId: "boards",
    aliases: [],
    units: ["un", "m", "m2"],
    attributes: [
      select("species", "Tipo de madeira", [
        "Pinus",
        "Eucalipto",
        "Compensado",
        "Outra madeira",
      ]),
      number("thickness", "Espessura (mm)", "mm"),
      text("dimensions", "Dimensões (mm)", "2000 x 100 x 20"),
    ],
  },
  {
    id: "screw",
    name: "Parafuso",
    categoryId: "hardware",
    aliases: ["parafusos"],
    units: ["un"],
    attributes: [
      number("diameter", "Diâmetro (mm)", "mm"),
      number("length", "Comprimento (mm)", "mm"),
      select("type", "Tipo de parafuso", [
        "Chipboard cabeça chata",
        "Phillips",
        "Sextavado",
        "Allen",
        "Outro tipo",
      ]),
    ],
  },
  {
    id: "slide",
    name: "Corrediça",
    categoryId: "hardware",
    aliases: [],
    units: ["un"],
    attributes: [
      number("length", "Comprimento (mm)", "mm"),
      select("type", "Tipo", ["Telescópica", "Oculta", "Roldana"]),
      select(
        "closing",
        "Fechamento",
        ["Com amortecimento", "Sem amortecimento"],
        false,
      ),
    ],
  },
  {
    id: "hinge",
    name: "Dobradiça",
    categoryId: "hardware",
    aliases: [],
    units: ["un"],
    attributes: [
      select("type", "Tipo", ["Reta", "Curva", "Supercurva", "Outro tipo"]),
      number("diameter", "Diâmetro do caneco (mm)", "mm"),
    ],
  },
  {
    id: "paint",
    name: "Tinta",
    categoryId: "finish",
    aliases: ["tinta acrílica"],
    units: ["un", "l", "ml"],
    attributes: [
      select("volume", "Volume da embalagem (L)", [
        "0,9",
        "1",
        "3,6",
        "18",
        "Outro volume",
      ]),
      select("color", "Cor", colors),
      select("application", "Aplicação", [
        "Parede interna",
        "Parede externa",
        "Madeira",
        "Metal",
        "Outra aplicação",
      ]),
    ],
  },
  {
    id: "varnish",
    name: "Verniz",
    categoryId: "finish",
    aliases: [],
    units: ["un", "l"],
    attributes: [
      select("finish", "Acabamento", ["Fosco", "Acetinado", "Brilhante"]),
      number("volume", "Volume (L)", "L"),
    ],
  },
  {
    id: "tool",
    name: "Ferramenta ou equipamento",
    categoryId: "tools",
    aliases: [],
    units: ["un"],
    attributes: [
      text("model", "Tipo ou modelo", "Furadeira 13 mm"),
      select(
        "voltage",
        "Tensão",
        ["127 V", "220 V", "Bivolt", "Sem alimentação"],
        false,
      ),
    ],
  },
  {
    id: "clothing",
    name: "Peça de roupa para revenda",
    categoryId: "ready-fashion",
    aliases: ["camiseta", "calça", "vestido", "roupa"],
    units: ["un"],
    attributes: [
      select("garment", "Tipo de peça", [
        "Camiseta",
        "Calça",
        "Vestido",
        "Camisa",
        "Blusa",
        "Bermuda",
        "Outra peça",
      ]),
      select("audience", "Público", ["Adulto", "Infantil", "Bebê"]),
      select("fit", "Modelagem", [
        "Regular",
        "Slim",
        "Oversized",
        "Outra modelagem",
      ]),
      {
        ...select("sizes", "Tamanho ou grade", [
          "PP",
          "P",
          "M",
          "G",
          "GG",
          "XG",
          "Grade infantil",
          "Outra grade",
        ]),
        type: "multi",
      },
      select("color", "Cor", colors),
      select("composition", "Material", [
        "Algodão",
        "Poliéster",
        "Viscose",
        "Linho",
        "Jeans",
        "Outra composição",
      ]),
      select("trade", "Modalidade", ["Atacado", "Varejo"]),
      {
        ...number("childGrade", "Grade infantil (informar faixa)", "anos"),
        dependsOn: { key: "sizes", value: "Grade infantil" },
      },
    ],
  },
  {
    id: "fabric",
    name: "Tecido",
    categoryId: "fabrication",
    aliases: ["tecido"],
    units: ["m", "m2"],
    attributes: [
      select("composition", "Composição", [
        "Algodão",
        "Poliéster",
        "Viscose",
        "Linho",
        "Mista",
        "Outra composição",
      ]),
      number("width", "Largura (cm)", "cm"),
      select("color", "Cor", colors),
      select("pattern", "Estampa", ["Liso", "Estampado"], false),
    ],
  },
  {
    id: "thread",
    name: "Linha de costura",
    categoryId: "fabrication",
    aliases: ["linha"],
    units: ["un", "m"],
    attributes: [
      select("material", "Material", ["Poliéster", "Algodão", "Nylon"]),
      select("color", "Cor", colors),
      number("spool", "Metragem por carretel (m)", "m"),
    ],
  },
  {
    id: "button",
    name: "Botão",
    categoryId: "fabrication",
    aliases: [],
    units: ["un"],
    attributes: [
      number("diameter", "Diâmetro (mm)", "mm"),
      select("material", "Material", ["Plástico", "Metal", "Madeira", "Outro"]),
      select("color", "Cor", colors),
    ],
  },
  {
    id: "zipper",
    name: "Zíper",
    categoryId: "fabrication",
    aliases: [],
    units: ["un"],
    attributes: [
      number("length", "Comprimento (cm)", "cm"),
      select("type", "Tipo", ["Comum", "Invisível", "Destacável"]),
      select("color", "Cor", colors),
    ],
  },
  {
    id: "sewing-machine",
    name: "Máquina de costura",
    categoryId: "fashion-equipment",
    aliases: [],
    units: ["un"],
    attributes: [
      select("type", "Tipo", [
        "Doméstica",
        "Reta industrial",
        "Overloque",
        "Interloque",
      ]),
      select("voltage", "Tensão", ["127 V", "220 V", "Bivolt"]),
    ],
  },
  {
    id: "packaging",
    name: "Embalagem",
    categoryId: "packaging-category",
    aliases: ["embalagens"],
    units: ["un"],
    attributes: [
      select("type", "Tipo", ["Caixa", "Sacola", "Envelope", "Saco", "Outro"]),
      text("dimensions", "Dimensões (cm)", "30 x 20 x 10"),
      select("material", "Material", [
        "Papel",
        "Papelão",
        "Plástico",
        "Tecido",
        "Outro",
      ]),
    ],
  },
  {
    id: "auto-chemical",
    name: "Produto para cuidado automotivo",
    categoryId: "auto-products",
    aliases: ["shampoo automotivo"],
    units: ["un", "l", "ml"],
    attributes: [
      select("application", "Aplicação", [
        "Lavagem externa",
        "Limpeza interna",
        "Polimento",
        "Proteção",
        "Outra aplicação",
      ]),
      number("volume", "Volume (L)", "L"),
      select(
        "concentration",
        "Concentração",
        ["Pronto para uso", "Concentrado"],
        false,
      ),
    ],
  },
  {
    id: "beauty-product",
    name: "Produto de beleza",
    categoryId: "beauty-supplies",
    aliases: [],
    units: ["un", "ml", "l"],
    attributes: [
      select("application", "Aplicação", ["Cabelo", "Pele", "Unhas", "Outra"]),
      number("volume", "Volume (ml)", "ml"),
    ],
  },
  {
    id: "substrate",
    name: "Substrato",
    categoryId: "garden-supplies",
    aliases: [],
    units: ["kg", "l", "un"],
    attributes: [
      select("application", "Aplicação", [
        "Horta",
        "Flores",
        "Orquídeas",
        "Uso geral",
      ]),
      select(
        "composition",
        "Composição",
        ["Orgânico", "Mineral", "Misto"],
        false,
      ),
    ],
  },
  {
    id: "component",
    name: "Componente de tecnologia",
    categoryId: "tech-supplies",
    aliases: [],
    units: ["un"],
    attributes: [text("model", "Modelo ou compatibilidade", "USB-C 65 W")],
  },
  {
    id: "office-supply",
    name: "Material de escritório",
    categoryId: "office",
    aliases: [],
    units: ["un"],
    attributes: [text("type", "Tipo de material", "Papel A4")],
  },
  {
    id: "other",
    name: "Produto não cadastrado / pesquisa geral",
    categoryId: "general",
    aliases: [],
    units: ["un", "g", "kg", "ml", "l", "mm", "cm", "m", "m2"],
    attributes: [],
  },
];
export const purchasePurposes = [
  { id: "resale", name: "Comprar peças para revenda" },
  { id: "manufacturing", name: "Comprar materiais para fabricação" },
  { id: "packaging", name: "Comprar embalagens" },
  { id: "equipment", name: "Comprar equipamentos e acessórios" },
];
export type Catalog = {
  areas: { id: string; name: string; activities: string[]; image: number }[];
  categories: CatalogCategory[];
  products: CatalogProduct[];
  revision: string;
};
export const initialCatalog: Catalog = {
  areas: areaSeed.map((a) => ({
    id: a[0],
    name: a[1],
    activities: [...a[2]],
    image: a[3],
  })),
  categories: categorySeed,
  products: productSeed,
  revision: "2026-11-consolidado",
};
export function relevantCategories(
  catalog: Catalog,
  area: string,
  purpose = "",
) {
  const id =
    catalog.areas.find((a) => a.name === area || a.id === area)?.id ?? "other";
  return catalog.categories.filter(
    (c) =>
      c.areas.includes(id) && (!purpose || !c.purpose || c.purpose === purpose),
  );
}
export function activeAttributes(
  product: CatalogProduct,
  specs: Record<string, string>,
) {
  return product.attributes.filter(
    (a) =>
      !a.dependsOn ||
      (specs[a.dependsOn.key] ?? "")
        .split(",")
        .map((v) => v.trim())
        .includes(a.dependsOn.value),
  );
}
export function attributeIssues(
  product: CatalogProduct,
  specs: Record<string, string>,
) {
  const errors: Record<string, string> = {};
  for (const a of activeAttributes(product, specs)) {
    const v = specs[a.key]?.trim();
    if (v && /^outr[oa]/i.test(v) && !specs[a.key + "Detail"]?.trim())
      errors[`specs.${a.key}Detail`] = `Descreva ${a.label.toLowerCase()}.`;
    if (a.required && !v)
      errors[`specs.${a.key}`] =
        `Selecione ou informe ${a.label.toLowerCase()}.`;
    else if (v && a.type === "number" && !/^\d{1,7}([,.]\d{1,3})?$/.test(v))
      errors[`specs.${a.key}`] =
        "Informe um número positivo, sem presumir uma medida.";
    else if (v && a.type === "number" && !/[1-9]/.test(v))
      errors[`specs.${a.key}`] = "Informe um valor maior que zero.";
    else if (
      v &&
      ["select", "multi"].includes(a.type) &&
      !v.split(",").every((s) => a.options.includes(s.trim()))
    )
      errors[`specs.${a.key}`] = "Selecione uma opção válida do catálogo.";
  }
  return errors;
}
