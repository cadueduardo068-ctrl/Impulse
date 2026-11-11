export const roles = {
  owner: "Proprietário",
  admin: "Administrador",
  sales: "Comercial",
  operations: "Operação",
  finance: "Financeiro",
  readonly: "Leitura",
  member: "Colaborador (legado)",
};
export type Module =
  | "clients"
  | "products"
  | "quotes"
  | "orders"
  | "stock"
  | "purchases"
  | "suppliers"
  | "tasks"
  | "appointments"
  | "planning"
  | "aftersales"
  | "marketing"
  | "files"
  | "finance"
  | "reports"
  | "team"
  | "settings"
  | "growth"
  | "help"
  | "imports";
const read: Record<string, string[]> = {
  sales: [
    "clients",
    "products",
    "quotes",
    "orders",
    "tasks",
    "appointments",
    "aftersales",
    "marketing",
    "help",
    "growth",
  ],
  operations: [
    "clients",
    "products",
    "orders",
    "stock",
    "purchases",
    "suppliers",
    "tasks",
    "appointments",
    "planning",
    "aftersales",
    "help",
  ],
  finance: ["clients", "products", "orders", "finance", "reports", "help"],
  readonly: [
    "clients",
    "products",
    "quotes",
    "orders",
    "stock",
    "tasks",
    "appointments",
    "planning",
    "aftersales",
    "help",
  ],
};
const write: Record<string, string[]> = {
  sales: [
    "clients",
    "quotes",
    "tasks",
    "appointments",
    "aftersales",
    "marketing",
    "growth",
  ],
  operations: [
    "orders",
    "stock",
    "purchases",
    "suppliers",
    "tasks",
    "appointments",
    "planning",
    "aftersales",
  ],
  finance: ["finance"],
  member: [
    "clients",
    "quotes",
    "orders",
    "stock",
    "purchases",
    "suppliers",
    "tasks",
    "appointments",
    "planning",
    "aftersales",
    "marketing",
    "growth",
  ],
};
export function allowed(
  role: string,
  module: Module,
  action: "read" | "write" | "export" = "read",
) {
  if (["owner", "admin"].includes(role)) return true;
  if (action === "export")
    return (
      (role === "sales" && module === "quotes") ||
      (role === "finance" && ["finance", "reports"].includes(module))
    );
  if (role === "member")
    return action === "read"
      ? !["finance", "reports", "settings", "imports"].includes(module)
      : write.member.includes(module);
  return (action === "read" ? read : write)[role]?.includes(module) ?? false;
}
export const canCosts = (role: string) =>
  ["owner", "admin", "finance"].includes(role);
export const canPrices = (role: string) => !["operations"].includes(role);
export const modelOptions = [
  ["products", "Vendo produtos"],
  ["services", "Presto serviços"],
  ["custom", "Fabrico sob encomenda"],
  ["appointments", "Trabalho com agendamentos"],
  ["team", "Uso equipe"],
  ["deliveries", "Faço entregas"],
  ["stock", "Mantenho estoque"],
] as const;
export const pageModules: Record<string, Module> = {
  clientes: "clients",
  crm: "clients",
  produtos: "products",
  precificacao: "products",
  propostas: "quotes",
  ordens: "orders",
  execucao: "orders",
  estoque: "stock",
  compras: "purchases",
  materiais: "purchases",
  recebimentos: "purchases",
  fornecedores: "suppliers",
  tarefas: "tasks",
  agenda: "appointments",
  planejamento: "planning",
  "pos-venda": "aftersales",
  divulgacao: "marketing",
  documentos: "files",
  financeiro: "finance",
  contas: "finance",
  relatorios: "reports",
  equipe: "team",
  configuracoes: "settings",
  instagram: "growth",
  artes: "growth",
  importacoes: "imports",
  ajuda: "help",
};
export function sanitize<T>(value: T, role: string): T {
  if (["owner", "admin"].includes(role)) return value;
  const clean = (v: any): any => {
    if (
      v === null ||
      typeof v !== "object" ||
      v instanceof Date ||
      ArrayBuffer.isView(v)
    )
      return v;
    if (Array.isArray(v)) return v.map(clean);
    const o: any = {};
    for (const [k, x] of Object.entries(v)) {
      if (
        !canCosts(role) &&
        /(^cost|Cost|^margin|^markup|^estimatedResult|^baseCents|hourlyRateCents|materialCents|unitCostCents|feeBps|taxBps|^assumptions$|^actualCost|^costMode$)/.test(
          k,
        )
      )
        continue;
      if (
        !canPrices(role) &&
        /^(priceCents|total_cents|amount_cents|valueCents|paid_cents|agreedCents|paidCents|laborCents|travelCents|discountCents)$/.test(
          k,
        )
      )
        continue;
      o[k] = clean(x);
    }
    return o;
  };
  return clean(value);
}
