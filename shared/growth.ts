import { z } from "zod";
export const instagramSchema = z.object({
  handle: z.string().max(80),
  accountType: z.enum(["business", "creator", "undecided"]),
  publicName: z.string().max(120),
  bio: z.string().max(150),
  contact: z.string().max(200),
  link: z.string().url().or(z.literal("")),
  audience: z.string().max(500),
  objective: z.string().max(500),
  offer: z.string().max(500),
  tone: z.enum(["acolhedor", "direto", "elegante", "descontraído"]),
  colors: z
    .array(z.string().regex(/^#[a-f0-9]{6}$/i))
    .min(1)
    .max(3),
  category: z.string().max(120).default(""),
  region: z.string().max(200).default(""),
  cta: z.string().max(150).default(""),
  style: z.string().max(100).default("Essencial e legível"),
  highlights: z.string().max(500).default(""),
  catalog: z.string().max(1000).default(""),
  photoGuide: z.string().max(1000).default(""),
  checklist: z.array(z.string().max(80)).max(15),
});
export const postSchema = z.object({
  day: z.number().int().min(1).max(30),
  topic: z.string().min(2).max(200),
  format: z.enum(["feed", "story", "reel", "carrossel"]),
  objective: z.string().max(300),
  caption: z.string().max(3000),
  cta: z.string().max(200),
  status: z.enum(["planned", "prepared", "published"]),
  script: z.string().max(2000).default(""),
  productionChecklist: z.array(z.string().max(100)).max(10).default([]),
  publishedAt: z.iso.date().or(z.literal("")),
});
export const metricSchema = z.object({
  date: z.iso.date(),
  postId: z.string().max(100).default(""),
  reach: z.number().int().min(0).max(1e9),
  views: z.number().int().min(0).max(1e9),
  likes: z.number().int().min(0).max(1e9),
  comments: z.number().int().min(0).max(1e9),
  saves: z.number().int().min(0).max(1e9),
  messages: z.number().int().min(0).max(1e9),
  followers: z.number().int().min(0).max(1e9),
  visits: z.number().int().min(0).max(1e9).default(0),
  sales: z.number().int().min(0).max(1e9).default(0),
  notes: z.string().max(1000),
});
export const promptInputSchema = z.object({
  business: z.string().min(2).max(120),
  activity: z.string().max(120),
  objective: z.string().min(2).max(300),
  audience: z.string().max(300),
  product: z.string().max(500),
  headline: z.string().min(2).max(120),
  cta: z.string().max(150),
  tone: z.string().max(80),
  colors: z.string().max(100),
  format: z.enum(["feed", "story", "square"]),
  photoInstructions: z.string().max(500),
  style: z.string().max(200).default("Fotografia comercial natural"),
  scene: z.string().max(300).default("Fundo limpo e coerente com o produto"),
  lighting: z.string().max(200).default("Luz suave e uniforme"),
  price: z.string().max(100).default(""),
  restrictions: z.string().max(500),
});
export const promptSchema = z.object({
  inputs: promptInputSchema,
  text: z.string().min(20).max(12000),
  status: z.enum(["prepared", "copied", "imported"]).default("prepared"),
});
export const designSchema = z.object({
  template: z.enum(["clean", "bold", "editorial"]),
  headline: z.string().min(2).max(100),
  body: z.string().max(240),
  cta: z.string().max(70),
  business: z.string().max(100),
  background: z.string().regex(/^#[a-f0-9]{6}$/i),
  foreground: z.string().regex(/^#[a-f0-9]{6}$/i),
  accent: z.string().regex(/^#[a-f0-9]{6}$/i),
  format: z.enum(["square", "story"]),
});
export function preparePrompt(input: z.input<typeof promptInputSchema>) {
  return `Crie uma arte publicitária em português do Brasil para ${input.business}, atividade ${input.activity}.\nObjetivo: ${input.objective}. Público: ${input.audience}.\nProduto ou serviço (somente informações fornecidas): ${input.product}.\nTexto principal exato: "${input.headline}". Chamada para ação: "${input.cta}".\nEstilo: ${input.style ?? "Natural"}. Cenário: ${input.scene ?? "Fundo limpo"}. Iluminação: ${input.lighting ?? "Suave e uniforme"}. Preço informado: ${input.price || "Não informado; não inserir preço"}.
Tom: ${input.tone}. Paleta: ${input.colors}. Formato: ${input.format === "story" ? "vertical 9:16" : input.format === "feed" ? "vertical 4:5" : "quadrado 1:1"}.\n${input.photoInstructions ? "Foto de referência: " + input.photoInstructions + ". Enviarei a foto manualmente neste chat. Não invente outra foto do meu produto." : ""}\nSe eu anexar uma fotografia, use-a como referência e preserve formato, cor, proporções e características reais do produto.
Composição: hierarquia clara, texto legível em celular, margens seguras, contraste e espaço para a marca. Não invente preços, promoções, certificações, resultados ou contatos. Não use marcas de terceiros sem autorização.\nRestrições adicionais: ${input.restrictions || "Nenhuma informada"}.\nAntes de usar, revisarei textos, direitos de imagem e informações comerciais.`;
}
export function thirtyDays(offer: string, objective: string) {
  const themes = [
    "Apresente seu negócio",
    "Mostre um produto ou serviço",
    "Dúvida frequente",
    "Bastidores do trabalho",
    "Como escolher",
    "Cuidado e manutenção",
    "Convite para conversar",
    "Processo de atendimento",
    "Detalhe que faz diferença",
    "Pergunta para o público",
  ];
  return Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    topic: themes[i % themes.length],
    format: (["feed", "story", "reel", "carrossel"] as const)[i % 4],
    objective: objective || "Apresentar o negócio",
    caption: `Sugestão para adaptar: ${themes[i % themes.length].toLowerCase()}. Conte uma informação real sobre ${offer || "seu trabalho"}. Revise antes de publicar.`,
    cta: "Converse com a gente para saber mais.",
    script:
      "Abertura: apresente uma situação real. Desenvolvimento: mostre um detalhe do produto ou serviço. Encerramento: convide para conversar. Use a região de atendimento informada no perfil quando pertinente.",
    productionChecklist: [],
    status: "planned" as const,
    publishedAt: "",
  }));
}
export function metricAdvice(rows: z.infer<typeof metricSchema>[]) {
  if (!rows.length)
    return [
      "Registre métricas reais para acompanhar o que muda. Não há dados suficientes para avaliar desempenho.",
    ];
  const reach = rows.reduce((s, r) => s + r.reach, 0),
    interactions = rows.reduce((s, r) => s + r.likes + r.comments + r.saves, 0),
    messages = rows.reduce((s, r) => s + r.messages, 0);
  return [
    `${rows.length} registro(s) manual(is). Alcances de períodos sobrepostos não representam pessoas únicas.`,
    reach
      ? `Interações informadas / alcance somado: ${((100 * interactions) / reach).toFixed(1)}%. Não há comparação automática com o mercado.`
      : "Informe alcance para calcular uma proporção de interações.",
    messages
      ? "Revise quais chamadas acompanharam as mensagens e teste uma mudança por vez."
      : "Teste uma chamada clara para conversa e acompanhe as mensagens no próximo período.",
    "Compare períodos e formatos equivalentes. Os dados não demonstram causalidade nem garantem vendas.",
  ];
}
