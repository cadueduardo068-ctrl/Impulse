import { ThemeButton } from "./theme";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  Package,
  CalendarDays,
  CheckSquare,
  ShoppingBag,
  Truck,
  Wallet,
  CircleDollarSign,
  Megaphone,
  HeartHandshake,
  FolderLock,
  Settings,
  ChevronDown,
  Search,
  Bell,
  HelpCircle,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowUpRight as Out,
  ArrowRight,
  Menu,
  X,
  ShieldCheck,
  Target,
  MonitorSmartphone,
  Check,
  Clock,
  ChevronRight,
  TrendingUp,
  Boxes,
  RefreshCw,
} from "lucide-react";
import {
  WorkdayPage,
  CRMPage,
  PricingPage,
  ReceiptsPage,
  ExecutionPage,
  ReportsPage,
  ImportPage,
  AccountsPage,
  HelpPage,
} from "./operations";
import { allowed, pageModules, modelOptions } from "../shared/access";
import { InstagramPage, ArtsPage } from "./growth";
import { CatalogAdmin } from "./catalog-admin";
import { EmailPending } from "./email-pending";
import { useCatalog, PurchasePreferences } from "./catalog-fields";
import { api } from "./api";
import { LocationFields } from "./location";
import { MaterialsPage } from "./materials";
import { FormValidation } from "./ui";
import { Logo, photoUrl } from "./public";
import {
  Field,
  ErrorBox,
  Submit,
  Modal,
  Empty,
  Loading,
  useAction,
} from "./ui";
import { money, type Kind } from "../shared/domain";
import {
  RecordsPage,
  QuotesPage,
  FinancePage,
  StockPage,
  OrdersPage,
  workLabel,
  TeamPage,
  FilesPage,
  SettingsPage,
  SecurityPage,
} from "./workpages";
export type WorkspaceContext = {
  company: any;
  me: any;
  refresh: () => void;
  notify: (s: string) => void;
  demo: boolean;
  go: (page: string) => void;
};
const groups = [
  {
    label: "MEU DIA",
    items: [
      ["inicio", "Meu dia", LayoutDashboard],
      ["planejamento", "Planejamento", Target],
      ["tarefas", "Tarefas", CheckSquare],
    ],
  },
  {
    label: "CLIENTES E VENDAS",
    items: [
      ["clientes", "Clientes", Users],
      ["crm", "Oportunidades", TrendingUp],
      ["propostas", "Orçamentos", FileText],
    ],
  },
  {
    label: "OPERAÇÃO",
    items: [
      ["agenda", "Agenda", CalendarDays],
      ["produtos", "Catálogo", Package],
      ["ordens", "Ordens de serviço", Boxes],
      ["compras", "Compras", ShoppingBag],
      ["materiais", "Materiais e fornecedores", Search],
      ["fornecedores", "Fornecedores", Truck],
      ["estoque", "Estoque", Package],
    ],
  },
  {
    label: "FINANCEIRO",
    items: [
      ["financeiro", "Financeiro", Wallet],
      ["relatorios", "Relatórios", TrendingUp],
      ["importacoes", "Importações", FolderLock],
    ],
  },
  {
    label: "CRESCIMENTO",
    items: [
      ["divulgacao", "Divulgação", Megaphone],
      ["instagram", "Instagram · Premium", TrendingUp],
      ["artes", "Estúdio de artes · Premium", Megaphone],
      ["pos-venda", "Pós-venda", HeartHandshake],
    ],
  },
  {
    label: "CONFIGURAÇÕES",
    items: [
      ["ajuda", "Ajuda e suporte", HelpCircle],
      ["equipe", "Equipe", Users],
      ["documentos", "Documentos", FolderLock],
    ],
  },
];
export const moduleMap: Record<
  string,
  { kind: Kind; title: string; description: string; singular: string }
> = {
  clientes: {
    kind: "clients",
    title: "Clientes",
    description:
      "Cada relacionamento tem uma história. Mantenha a sua por perto.",
    singular: "cliente",
  },
  produtos: {
    kind: "products",
    title: "Produtos e serviços",
    description:
      "Seu catálogo, com preços, custos e materiais que fazem sentido.",
    singular: "produto ou serviço",
  },
  tarefas: {
    kind: "tasks",
    title: "Tarefas",
    description: "Transforme pendências em próximos passos claros.",
    singular: "tarefa",
  },
  agenda: {
    kind: "appointments",
    title: "Agenda",
    description: "Dê espaço ao que importa no seu dia.",
    singular: "compromisso",
  },
  planejamento: {
    kind: "planning",
    title: "Planejamento do negócio",
    description: "Da ideia ao próximo objetivo, um passo de cada vez.",
    singular: "etapa",
  },
  compras: {
    kind: "purchases",
    title: "Compras",
    description:
      "Registre necessidades e compare cotações informadas por você.",
    singular: "compra",
  },
  fornecedores: {
    kind: "suppliers",
    title: "Fornecedores",
    description: "Seus parceiros e fontes, organizados com transparência.",
    singular: "fornecedor",
  },
  divulgacao: {
    kind: "marketing",
    title: "Divulgação",
    description: "Objetivo, público e mensagem. Comece com um bom briefing.",
    singular: "conteúdo",
  },
  "pos-venda": {
    kind: "aftersales",
    title: "Pós-venda",
    description: "O relacionamento continua depois da entrega.",
    singular: "acompanhamento",
  },
};
export function Workspace({ demo = false }: { demo?: boolean }) {
  const [editPending, setEditPending] = useState(false);
  const [allTools, setAllTools] = useState(false);
  const [me, setMe] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [companyId, setCompanyId] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [createMenu, setCreateMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState(false);
  const [searchData, setSearchData] = useState<any[]>([]);
  const [notifications, setNotifications] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [update, setUpdate] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const location = useLocation();
  const navigate = useNavigate();
  const page = demo ? "inicio" : location.pathname.split("/")[2] || "inicio";
  useEffect(() => {
    void api("/config").then(setConfig);
    if (demo) {
      setMe({
        user: {
          id: "demo",
          name: "Visitante",
          email: "Demonstração",
          twoFactorEnabled: false,
        },
        companies: [
          {
            id: "demo",
            name: "Seu negócio",
            role: "owner",
            profile: { complete: true, profession: "Seu próximo passo" },
            trial_end: new Date(Date.now() + 7 * 86400000).toISOString(),
          },
        ],
        consent: {},
      });
      setCompanyId("demo");
      return;
    }
    void api("/me")
      .then((data) => {
        setMe(data);
        const intended = new URLSearchParams(location.search).get("company");
        setCompanyId((prev) =>
          intended && data.companies.some((c: any) => c.id === intended)
            ? intended
            : data.companies.some((c: any) => c.id === prev)
              ? prev
              : (data.companies[0]?.id ?? ""),
        );
      })
      .catch((e) => {
        if (e.message.includes("Entre")) navigate("/entrar");
        else setError(e.message);
      });
  }, [version, demo]);
  useEffect(() => {
    const p = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const u = () => setUpdate(true);
    const o = () => setOnline(navigator.onLine);
    window.addEventListener("beforeinstallprompt", p);
    window.addEventListener("pwa:update", u);
    window.addEventListener("online", o);
    window.addEventListener("offline", o);
    return () => {
      window.removeEventListener("beforeinstallprompt", p);
      window.removeEventListener("pwa:update", u);
      window.removeEventListener("online", o);
      window.removeEventListener("offline", o);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const company = me?.companies.find((c: any) => c.id === companyId);
  const refresh = () => setVersion((v) => v + 1);
  const go = (p: string) => {
    setSidebar(false);
    if (demo) {
      setToast(
        "A demonstração é somente leitura. Crie sua conta para usar esta ferramenta.",
      );
      return;
    }
    if (
      document.querySelector('form[data-dirty="true"]') &&
      !window.confirm("Há alterações não salvas. Deseja sair desta tela?")
    )
      return;
    navigate(`/app/${p}`);
  };
  const c: WorkspaceContext = {
    company,
    me,
    refresh,
    notify: setToast,
    demo,
    go,
  };
  useEffect(() => {
    if (!companyId || demo) return;
    void api(`/${companyId}/overview`)
      .then((d) => setSearchData(d.records))
      .catch(() => {});
  }, [companyId, version, demo]);
  if (error)
    return (
      <main className="legal-page">
        <ErrorBox message={error} />
        <Link to="/">Voltar</Link>
      </main>
    );
  if (!me || !config) return <Loading />;
  if (!me.consent && !demo)
    return (
      <main className="legal-page">
        <Logo />
        <h1>Antes de começar.</h1>
        <p>
          Registre sua aceitação dos termos vigentes. A Política de Privacidade
          explica as finalidades e seus direitos.
        </p>
        <Consent onDone={refresh} />
      </main>
    );
  if (
    company &&
    me.user.emailVerified !== false &&
    config.enforceMfa &&
    !me.user.twoFactorEnabled &&
    ["owner", "admin"].includes(company.role)
  )
    return (
      <main className="security-gate">
        <Logo />
        <div className="notice">
          Antes de continuar, ative a autenticação em duas etapas exigida para
          sua conta administrativa.
        </div>
        <SecurityPage c={c} />
      </main>
    );
  if (
    !demo &&
    me.user.emailVerified === false &&
    company?.profile.complete &&
    !editPending
  )
    return (
      <EmailPending
        email={me.user.email}
        onRefresh={refresh}
        onEdit={() => setEditPending(true)}
      />
    );
  if (!company || !company.profile.complete || editPending)
    return (
      <Onboarding
        existing={company}
        onDone={() => {
          setEditPending(false);
          refresh();
        }}
        onCreated={
          config.enforceMfa && me.user.emailVerified !== false
            ? refresh
            : undefined
        }
      />
    );
  const title =
    page === "inicio"
      ? "Meu dia"
      : (moduleMap[page]?.title ??
        (
          {
            ordens: workLabel(company.profile),
            financeiro: "Financeiro",
            equipe: "Equipe",
            documentos: "Documentos",
            instagram: "Instagram",
            artes: "Estúdio de artes",
            catalogo: "Administração",
            crm: "Oportunidades",
            precificacao: "Custos e precificação",
            recebimentos: "Recebimentos",
            execucao: "Execução",
            relatorios: "Relatórios",
            importacoes: "Importações",
            contas: "Contas e extrato",
            ajuda: "Ajuda e suporte",
            materiais: "Materiais e fornecedores",
            configuracoes: "Configurações",
            seguranca: "Segurança",
            privacidade: "Privacidade",
            assinatura: "Assinatura",
          } as any
        )[page] ??
        "Meu negócio");
  return (
    <div className={collapsed ? "app-layout nav-collapsed" : "app-layout"}>
      <aside
        id="workspace-sidebar"
        className={`sidebar ${sidebar ? "visible" : ""}`}
      >
        <div className="sidebar-logo">
          <Logo />
          <button
            className="icon-button mobile-only"
            onClick={() => setSidebar(false)}
            aria-label="Fechar menu"
          >
            <X size={19} />
          </button>
        </div>
        <label className="company-selector">
          <span className="company-avatar">
            {company.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <small>MEU NEGÓCIO</small>
            <select
              aria-label="Alternar empresa"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              {me.companies.map((co: any) => (
                <option value={co.id} key={co.id}>
                  {co.name}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown size={15} />
        </label>
        <button className="tools-switch" onClick={() => setAllTools(!allTools)}>
          {allTools
            ? "Mostrar atalhos do meu modelo"
            : "Ver todas as ferramentas"}
        </button>
        <nav>
          {me.platformAdmin && (
            <button className="nav-item" onClick={() => go("catalogo")}>
              <Settings size={18} />
              Administração da plataforma
            </button>
          )}
          {groups.map((g) => (
            <div className="nav-group" key={g.label}>
              <span>{g.label}</span>
              {g.items.map(([key, label, I]) => {
                if (
                  !demo &&
                  pageModules[String(key)] &&
                  !allowed(company.role, pageModules[String(key)])
                )
                  return null;
                const models = company.profile.businessModels ?? [];
                if (
                  !demo &&
                  !allTools &&
                  models.length &&
                  ((key === "agenda" && !models.includes("appointments")) ||
                    (key === "estoque" && !models.includes("stock")) ||
                    (key === "equipe" && !models.includes("team")))
                )
                  return null;
                if (
                  !allTools &&
                  key === "materiais" &&
                  company.profile.buysMaterials === "no"
                )
                  return null;
                const Icon = I as typeof Users;
                return (
                  <button
                    onClick={() => go(String(key))}
                    className={`nav-item ${page === key ? "active" : ""}`}
                    key={String(key)}
                  >
                    <Icon size={18} />
                    <span>
                      {key === "ordens"
                        ? workLabel(company.profile)
                        : String(label)}
                    </span>
                    {key === "inicio" && <span className="active-dot" />}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="nav-group">
            <button
              onClick={() => go("configuracoes")}
              className={`nav-item ${page === "configuracoes" ? "active" : ""}`}
            >
              <Settings size={18} /> Configurações
            </button>
          </div>
        </nav>
        <div className="sidebar-bottom">
          <div className="trial-box">
            <div>
              <span className="trial-spark">↗</span>
              <strong>Um próximo passo para crescer</strong>
            </div>
            <p>
              {demo
                ? "Conheça seu novo jeito de organizar."
                : `Teste até ${new Date(company.trial_end).toLocaleDateString("pt-BR")}`}
            </p>
            <button
              onClick={() => (demo ? navigate("/cadastro") : go("assinatura"))}
            >
              {demo ? "Criar minha conta" : "Conhecer os planos"}{" "}
              <ArrowUpRight size={15} />
            </button>
          </div>
          <button className="profile-button" onClick={() => go("seguranca")}>
            <span className="user-avatar">
              {me.user.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{me.user.name}</strong>
              <small>
                {
                  (
                    {
                      owner: "Proprietário",
                      admin: "Administrador",
                      member: "Colaborador",
                      finance: "Financeiro",
                    } as any
                  )[company.role]
                }
              </small>
            </div>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>
      {sidebar && (
        <button
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setSidebar(false)}
        />
      )}
      <div className="app-main">
        <header className="app-header">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-only"
              onClick={() => setSidebar(true)}
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </button>
            <button
              type="button"
              className="icon-button desktop-nav-toggle"
              aria-label={
                collapsed ? "Mostrar barra lateral" : "Recolher barra lateral"
              }
              aria-controls="workspace-sidebar"
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              <Menu size={19} />
            </button>
            <Building2 size={15} />
            <span>Meu negócio</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <ThemeButton />
            <button
              aria-label="Buscar no seu negócio"
              className="global-search"
              onClick={() => setSearch(true)}
            >
              <Search size={17} />
              <span>Buscar no seu negócio</span>
              <kbd>/</kbd>
            </button>
            <Link
              to="/ajuda"
              className="icon-button"
              aria-label="Central de ajuda"
            >
              <HelpCircle size={19} />
            </Link>
            <button
              className="icon-button notification-trigger"
              onClick={() => setNotifications(!notifications)}
              aria-label="Notificações"
            >
              <Bell size={19} />
            </button>
            <span className="header-divider" />
            <button
              className="user-avatar small"
              onClick={() => go("seguranca")}
              aria-label="Minha conta"
            >
              {me.user.name.slice(0, 2).toUpperCase()}
            </button>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <ShieldCheck size={15} /> Demonstração somente leitura · nenhum
              dado de conta real
            </span>
            <Link to="/cadastro">
              Criar minha conta <ArrowRight size={14} />
            </Link>
          </div>
        )}
        {!online && (
          <div className="offline-banner">
            Você está offline. Os dados na tela não foram confirmados novamente.
            Conecte-se para alterar registros.
          </div>
        )}
        {update && (
          <div className="offline-banner">
            Atualização disponível. Salve seus formulários.{" "}
            <button
              onClick={() =>
                void navigator.serviceWorker.getRegistration().then((reg) => {
                  if (reg?.waiting) {
                    navigator.serviceWorker.addEventListener(
                      "controllerchange",
                      () => window.location.reload(),
                      { once: true },
                    );
                    reg.waiting.postMessage("ACTIVATE");
                  } else window.location.reload();
                })
              }
            >
              Recarregar aplicativo
            </button>
          </div>
        )}
        <main className="workspace-content">
          {page === "inicio" ? (
            demo ? (
              <Overview c={c} />
            ) : (
              <WorkdayPage key={companyId} c={c} />
            )
          ) : page === "crm" ? (
            <CRMPage key={companyId} c={c} />
          ) : page === "precificacao" ? (
            <PricingPage key={companyId} c={c} />
          ) : page === "recebimentos" ? (
            <ReceiptsPage key={companyId} c={c} />
          ) : page === "execucao" ? (
            <ExecutionPage key={location.search} c={c} />
          ) : page === "relatorios" ? (
            <ReportsPage key={companyId} c={c} />
          ) : page === "importacoes" ? (
            <ImportPage key={companyId} c={c} />
          ) : page === "contas" ? (
            <AccountsPage key={companyId} c={c} />
          ) : page === "ajuda" ? (
            <HelpPage key={companyId} c={c} />
          ) : page === "materiais" ? (
            <MaterialsPage key={companyId} c={c} />
          ) : page === "instagram" ? (
            <InstagramPage key={companyId} c={c} />
          ) : page === "artes" ? (
            <ArtsPage key={companyId} c={c} />
          ) : page === "catalogo" ? (
            <CatalogAdmin key={companyId} c={c} />
          ) : moduleMap[page] ? (
            <RecordsPage
              key={`${companyId}:${page}`}
              c={c}
              module={moduleMap[page]}
            />
          ) : page === "propostas" ? (
            <QuotesPage c={c} />
          ) : page === "financeiro" ? (
            <FinancePage c={c} />
          ) : page === "estoque" ? (
            <StockPage c={c} />
          ) : page === "ordens" ? (
            <OrdersPage c={c} />
          ) : page === "equipe" ? (
            <TeamPage c={c} />
          ) : page === "documentos" ? (
            <FilesPage c={c} />
          ) : (
            <SettingsPage c={c} page={page} config={config} />
          )}
        </main>
        <div className="app-footer">
          <span>Um passo de cada vez. Seu negócio em movimento.</span>
          <button
            className="link-button"
            onClick={() =>
              installPrompt
                ? void installPrompt.prompt()
                : navigate("/instalar")
            }
          >
            <MonitorSmartphone size={14} /> Instalar aplicativo
          </button>
        </div>
      </div>
      {!sidebar && (
        <nav className="mobile-quick-nav" aria-label="Atalhos principais">
          <button
            type="button"
            aria-current={page === "inicio" ? "page" : undefined}
            onClick={() => go("inicio")}
          >
            <LayoutDashboard size={18} />
            Meu dia
          </button>
          {allowed(company.role, "clients") && (
            <button
              type="button"
              aria-current={page === "clientes" ? "page" : undefined}
              onClick={() => go("clientes")}
            >
              <Users size={18} />
              Clientes
            </button>
          )}
          <button type="button" onClick={() => setCreateMenu(true)}>
            <Plus size={18} />
            Criar
          </button>
          <button type="button" onClick={() => setSidebar(true)}>
            <Menu size={18} />
            Mais
          </button>
        </nav>
      )}
      {createMenu && (
        <Modal title="Criar" onClose={() => setCreateMenu(false)}>
          <div className="hero-buttons">
            {(
              [
                workLabel(company.profile) === "Pedidos"
                  ? (["ordens", "orders", "Pedido"] as const)
                  : (["propostas", "quotes", "Orçamento"] as const),
                ["clientes", "clients", "Cliente"],
                ["produtos", "products", "Produto ou serviço"],
                ["tarefas", "tasks", "Tarefa"],
              ] as const
            )
              .filter(([, module]) => allowed(company.role, module, "write"))
              .map(([path, , label]) => (
                <button
                  type="button"
                  className="button secondary"
                  key={path}
                  onClick={() => {
                    setCreateMenu(false);
                    go(path + "?criar=1");
                  }}
                >
                  {label}
                </button>
              ))}
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {search && (
        <Modal title="Encontre no seu negócio" onClose={() => setSearch(false)}>
          <Field label="Buscar">
            <input
              autoFocus
              placeholder="Nome, descrição, atividade…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          <div className="search-results">
            {query.length < 2 ? (
              <p>
                Digite pelo menos 2 caracteres. Os resultados respeitam sua
                empresa atual.
              </p>
            ) : (
              searchData
                .filter((r) =>
                  JSON.stringify(r.data)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .slice(0, 20)
                .map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      const key = Object.keys(moduleMap).find(
                        (k) => moduleMap[k].kind === r.kind,
                      );
                      if (key) go(key);
                      setSearch(false);
                    }}
                  >
                    <Search size={16} />
                    <span>
                      {r.data.name}
                      <small>
                        {
                          Object.values(moduleMap).find(
                            (m) => m.kind === r.kind,
                          )?.title
                        }
                      </small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))
            )}
            {query.length >= 2 &&
              !searchData.some((r) =>
                JSON.stringify(r.data)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              ) && <p>Nenhum registro encontrado.</p>}
          </div>
        </Modal>
      )}
      {notifications && (
        <Modal
          title="O que merece sua atenção"
          onClose={() => setNotifications(false)}
        >
          <p>Os alertas usam seus registros, sem mensagens promocionais.</p>
          {searchData
            .filter((r) => r.data.due && r.data.status !== "done")
            .slice(0, 10)
            .map((r) => (
              <div className="notification-row" key={r.id}>
                <Clock size={18} />
                <div>
                  <strong>{r.data.name}</strong>
                  <small>{r.data.due}</small>
                </div>
              </div>
            ))}
          {!searchData.some((r) => r.data.due && r.data.status !== "done") && (
            <Empty
              title="Tudo tranquilo por aqui"
              description="Compromissos e pendências com prazo aparecem nesta central."
            />
          )}
        </Modal>
      )}
    </div>
  );
}
function Consent({ onDone }: { onDone: () => void }) {
  const a = useAction();
  return (
    <form
      onSubmit={a.onSubmit(async (f) => {
        await api("/consent", "POST", {
          accepted: true,
          promotional: f.get("promotional") === "on",
        });
        onDone();
      })}
    >
      <label className="check-label">
        <input type="checkbox" required /> Aceito os{" "}
        <Link to="/termos" target="_blank">
          Termos de Uso
        </Link>
        .
      </label>
      <p>
        Saiba como tratamos dados na{" "}
        <Link to="/politica-privacidade" target="_blank">
          Política de Privacidade
        </Link>
        .
      </p>
      <label className="check-label">
        <input type="checkbox" name="promotional" /> Quero receber comunicações
        promocionais.
      </label>
      <ErrorBox message={a.error} />
      <Submit busy={a.busy}>Continuar</Submit>
    </form>
  );
}
export function Onboarding({
  existing,
  onDone,
  onCreated,
  initialStep,
}: {
  existing?: any;
  onDone: () => void;
  onCreated?: () => void;
  initialStep?: number;
}) {
  const a = useAction();
  const { catalog, error: catalogError } = useCatalog();
  const areas: Record<string, string[]> = Object.fromEntries(
    (catalog?.areas ?? []).map((a) => [a.name, a.activities]),
  );
  const [p, setP] = useState<any>(
    existing?.profile
      ? { ...existing.profile, step: initialStep ?? existing.profile.step }
      : {
          name: "Meu negócio",
          area: "",
          profession: "",
          state: "",
          city: "",
          cep: "",
          stage: "starting",
          offer: "both",
          team: "solo",
          attendance: "mixed",
          goals: [],
          timezone: "America/Sao_Paulo",
          step: 1,
          complete: false,
        },
  );
  const [id, setId] = useState(existing?.id ?? "");
  const [version, setVersion] = useState(existing?.profile_version ?? 1);
  const [remote, setRemote] = useState<any>(null);
  const [filter, setFilter] = useState("");
  const steps = [
    "Sua área",
    "Sua atividade",
    "Onde você está",
    "Seu momento",
    "Suas compras",
    "Seus objetivos",
  ];
  const set = (k: string, v: any) => setP((prev: any) => ({ ...prev, [k]: v }));
  async function save(final = false, target?: number) {
    const data = {
      ...p,
      area: p.area || "Outras",
      profession: p.profession || "Outra atividade",
      step: target ?? (final ? 6 : Math.min(6, p.step + 1)),
      complete: final || !!existing?.profile.complete,
    };
    if (id) {
      const updated = await api(`/${id}/profile`, "PUT", { ...data, version });
      setVersion(updated.version);
    } else {
      const r = await api("/companies", "POST", data);
      setId(r.id);
      setVersion(r.version);
      onCreated?.();
    }
    setP(data);
    if (final) onDone();
  }
  return (
    <div className="onboarding">
      <header>
        <Logo />
        <span>UM COMEÇO COM A SUA CARA</span>
        <Link to="/ajuda">Precisa de ajuda?</Link>
      </header>
      <div className="onboarding-layout">
        <aside>
          <div className="eyebrow">VAMOS CONHECER SEU NEGÓCIO</div>
          <h1>
            Seu jeito de fazer.
            <br />
            <span>Seu jeito de organizar.</span>
          </h1>
          <p>
            Algumas escolhas para preparar seu ponto de partida. Você pode mudar
            tudo depois.
          </p>
          <ol>
            {steps.map((s, i) => (
              <li
                className={
                  p.step === i + 1
                    ? "current"
                    : p.step > i + 1
                      ? "complete"
                      : ""
                }
                key={s}
              >
                <span>{p.step > i + 1 ? <Check size={16} /> : i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <small>Seu progresso é salvo ao avançar.</small>
        </aside>
        <main>
          <div className="eyebrow">PASSO {p.step} DE 6</div>
          <h2>
            {
              [
                "Qual é a sua área de atuação?",
                "O que você faz no dia a dia?",
                "Onde seu negócio acontece?",
                "Conte um pouco do seu momento.",
                "O que sua empresa precisa comprar?",
                "O que você quer organizar primeiro?",
              ][p.step - 1]
            }
          </h2>
          <p>
            {p.step === 1
              ? "Escolha a área que mais se aproxima do seu trabalho."
              : "Essas escolhas podem ser alteradas nas configurações."}
          </p>
          <ErrorBox message={catalogError} />
          <FormValidation errors={a.fieldErrors}>
            <form onSubmit={a.onSubmit(() => save(p.step === 6))}>
              {p.step === 1 ? (
                <div className="area-grid">
                  {Object.keys(areas).map((area, i) => (
                    <button
                      type="button"
                      className={`area-card ${p.area === area ? "selected" : ""}`}
                      key={area}
                      onClick={() => {
                        set("area", area);
                        set("profession", "");
                      }}
                    >
                      <img
                        src={photoUrl(
                          catalog?.areas.find((a) => a.name === area)?.image ??
                            i,
                        )}
                        alt=""
                      />
                      <span>{area}</span>
                      {p.area === area && <Check size={17} />}
                    </button>
                  ))}
                </div>
              ) : p.step === 2 ? (
                <>
                  <Field label="Pesquisar atividade">
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Encontre sua profissão"
                    />
                  </Field>
                  <div className="profession-options">
                    {[...(areas[p.area] ?? []), "Outra atividade"]
                      .filter(
                        (v, i, arr) =>
                          arr.indexOf(v) === i &&
                          v.toLowerCase().includes(filter.toLowerCase()),
                      )
                      .map((v) => (
                        <label
                          className={p.profession === v ? "selected" : ""}
                          key={v}
                        >
                          <input
                            type="radio"
                            name="profession"
                            checked={p.profession === v}
                            onChange={() => set("profession", v)}
                          />
                          {v}
                        </label>
                      ))}
                  </div>
                  {p.profession === "Outra atividade" && (
                    <Field label="Sua atividade (opcional)">
                      <input
                        maxLength={100}
                        onBlur={(e) =>
                          e.target.value && set("profession", e.target.value)
                        }
                      />
                    </Field>
                  )}
                </>
              ) : p.step === 3 ? (
                <div className="form-grid">
                  <LocationFields
                    value={p}
                    onChange={setP}
                    errors={a.fieldErrors}
                    required
                  />
                  <Field
                    label="Região de atendimento (opcional)"
                    hint="Ex.: cidade inteira, bairros ou municípios vizinhos."
                  >
                    <input
                      name="serviceRegion"
                      value={p.serviceRegion ?? ""}
                      maxLength={300}
                      onChange={(e) => set("serviceRegion", e.target.value)}
                    />
                  </Field>
                  <Field label="Fuso horário">
                    <select
                      value={p.timezone}
                      onChange={(e) => set("timezone", e.target.value)}
                    >
                      {[
                        "America/Sao_Paulo",
                        "America/Manaus",
                        "America/Belem",
                        "America/Cuiaba",
                        "America/Rio_Branco",
                        "America/Noronha",
                      ].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              ) : p.step === 4 ? (
                <>
                  <Field label="Nome do negócio">
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={120}
                      value={p.name}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  </Field>
                  <fieldset className="profile-models">
                    <legend>Como seu negócio funciona?</legend>
                    <div className="goal-grid">
                      {modelOptions.map(([id, label]) => (
                        <label key={id}>
                          <input
                            type="checkbox"
                            checked={(p.businessModels ?? []).includes(id)}
                            onChange={(e) =>
                              set(
                                "businessModels",
                                e.target.checked
                                  ? [...(p.businessModels ?? []), id]
                                  : (p.businessModels ?? []).filter(
                                      (v: string) => v !== id,
                                    ),
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="small-muted">
                      Selecione vários modelos. Você pode ativar outras
                      ferramentas depois.
                    </p>
                  </fieldset>
                  <div className="form-grid">
                    {[
                      [
                        "stage",
                        "Em que momento você está?",
                        [
                          ["starting", "Estou começando"],
                          ["operating", "Já estou funcionando"],
                        ],
                      ],
                      [
                        "offer",
                        "O que você oferece?",
                        [
                          ["products", "Produtos"],
                          ["services", "Serviços"],
                          ["both", "Produtos e serviços"],
                        ],
                      ],
                      [
                        "team",
                        "Como você trabalha?",
                        [
                          ["solo", "Por conta própria"],
                          ["team", "Com uma equipe"],
                        ],
                      ],
                      [
                        "attendance",
                        "Como atende?",
                        [
                          ["local", "Presencial"],
                          ["online", "Online"],
                          ["home", "Em domicílio"],
                          ["mixed", "Misto"],
                        ],
                      ],
                    ].map(([key, label, options]: any) => (
                      <Field label={label} key={key}>
                        <select
                          value={p[key]}
                          onChange={(e) => set(key, e.target.value)}
                        >
                          {options.map(([v, t]: string[]) => (
                            <option value={v} key={v}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ))}
                  </div>
                </>
              ) : p.step === 5 ? (
                catalog ? (
                  <PurchasePreferences
                    value={p}
                    onChange={setP}
                    catalog={catalog}
                  />
                ) : (
                  <ErrorBox message={catalogError || "Carregando catálogo…"} />
                )
              ) : (
                <div className="goal-grid">
                  <p>
                    O programa de Instagram e o estúdio de artes pertencem ao
                    Premium. Você pode concluir seu cadastro em qualquer plano.
                  </p>
                  {[
                    "Materiais e fornecedores",
                    "Clientes",
                    "Orçamentos",
                    "Finanças",
                    "Estoque",
                    "Agenda e tarefas",
                    "Organização do negócio",
                    "Instagram e divulgação",
                  ].map((g) => (
                    <label
                      className={p.goals.includes(g) ? "selected" : ""}
                      key={g}
                    >
                      <input
                        type="checkbox"
                        checked={p.goals.includes(g)}
                        onChange={(e) =>
                          set(
                            "goals",
                            e.target.checked
                              ? [...p.goals, g]
                              : p.goals.filter((v: string) => v !== g),
                          )
                        }
                      />
                      {g}
                    </label>
                  ))}
                </div>
              )}
              <ErrorBox message={a.error} />
              {a.error.includes("outra aba") && (
                <div className="notice">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => void api(`/${id}/profile`).then(setRemote)}
                  >
                    Consultar perfil mais recente
                  </button>
                  {remote && (
                    <>
                      <p>
                        Versão atual no servidor. Os seus campos só serão
                        substituídos se você escolher carregar esta versão.
                      </p>
                      <pre>{JSON.stringify(remote.profile, null, 2)}</pre>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          setP(remote.profile);
                          setVersion(remote.version);
                          setRemote(null);
                        }}
                      >
                        Carregar versão atual
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="form-footer">
                {p.step > 1 ? (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={a.busy}
                    onClick={() => void a.run(() => save(false, p.step - 1))}
                  >
                    Voltar
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  disabled={
                    a.busy ||
                    (p.step === 1 && !p.area) ||
                    (p.step === 2 && !p.profession)
                  }
                  className="button primary"
                >
                  {a.busy
                    ? "Salvando…"
                    : p.step === 6
                      ? "Abrir meu negócio"
                      : "Salvar e continuar"}{" "}
                  <ArrowRight size={17} />
                </button>
              </div>
            </form>
          </FormValidation>
        </main>
      </div>
    </div>
  );
}
function Overview({ c }: { c: WorkspaceContext }) {
  const [data, setData] = useState<any>(null);
  const a = useAction();
  const [period, setPeriod] = useState("all");
  useEffect(() => {
    if (c.demo) {
      setData({ records: [], quotes: [], stock: [], finance: [], orders: [] });
      return;
    }
    void a.run(async () => setData(await api(`/${c.company.id}/overview`)));
  }, [c.company.id]);
  if (!data)
    return (
      <>
        <ErrorBox message={a.error} />
        {!a.error && <Loading />}
      </>
    );
  const incoming = data.finance?.find((v: any) => v.direction === "in");
  const outgoing = data.finance?.find((v: any) => v.direction === "out");
  const received = Number(incoming?.paid ?? 0),
    paid = Number(outgoing?.paid ?? 0);
  const rec = Number(incoming?.planned ?? 0) - received,
    payable = Number(outgoing?.planned ?? 0) - paid;
  const tasks = data.records.filter(
    (r: any) =>
      ["tasks", "planning", "aftersales"].includes(r.kind) &&
      r.data.status !== "done",
  );
  const appointments = data.records
    .filter((r: any) => r.kind === "appointments" && r.data.status !== "done")
    .sort((a: any, b: any) => a.data.due.localeCompare(b.data.due));
  const waiting = data.quotes.filter((q: any) => q.status === "sent");
  const low = data.stock.filter(
    (s: any) => s.quantity - s.reserved < s.data.minimum,
  );
  const unfinished = data.orders.filter((o: any) => o.status !== "done");
  const firstName = c.me.user.name.split(" ")[0];
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hour12: false,
      timeZone: c.company.profile.timezone ?? "America/Sao_Paulo",
    }).format(new Date()),
  );
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const date = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: c.company.profile.timezone ?? "America/Sao_Paulo",
  }).format(new Date());
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="date-label">{date.toUpperCase()}</div>
          <h1>
            {c.demo ? "Seu negócio começa aqui." : `${greeting}, ${firstName}.`}{" "}
            <span className="heading-accent">↗</span>
          </h1>
          <p>Um olhar para o seu dia. E espaço para o próximo passo.</p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={() => c.go("agenda")}>
            <CalendarDays size={16} /> Minha agenda
          </button>
          <button className="button primary" onClick={() => c.go("propostas")}>
            <Plus size={17} /> Novo orçamento
          </button>
        </div>
      </div>
      <section className="welcome-panel">
        <div>
          <div className="eyebrow">CADA PASSO CONTA</div>
          <h2>
            {data.records.length
              ? "Seu negócio ganha forma a cada registro."
              : "Vamos tirar os planos do papel?"}
          </h2>
          <p>
            {data.records.length
              ? "Mantenha seus registros em dia para enxergar o que vem a seguir."
              : "Comece com um cliente ou serviço. O resto se conecta ao seu ritmo."}
          </p>
          <button
            onClick={() =>
              c.go(data.records.length ? "planejamento" : "clientes")
            }
          >
            {data.records.length
              ? "Ver meu planejamento"
              : "Cadastrar meu primeiro cliente"}{" "}
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="art-card art-back">
            <span />
            <span />
          </div>
          <div className="art-card art-front">
            <span className="art-icon">
              <TrendingUp size={28} />
            </span>
            <i />
            <i />
            <div>
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <span className="art-check">
            <Check size={23} />
          </span>
          <span className="art-star">✦</span>
        </div>
      </section>
      {c.company.profile.buysMaterials !== "no" && (
        <section className="panel materials-entry">
          <span className="feature-icon tone-0">
            <Search size={23} />
          </span>
          <div>
            <div className="eyebrow">DA NECESSIDADE À COMPRA</div>
            <h2>Materiais e fornecedores</h2>
            <p>
              Especifique o que precisa, pesquise onde comprar e organize sua
              lista por trabalho. Preços e estoque sempre com origem explícita.
            </p>
          </div>
          <button className="button primary" onClick={() => c.go("materiais")}>
            Buscar onde comprar <ArrowUpRight size={16} />
          </button>
        </section>
      )}
      <div className="section-title-row">
        <div>
          <h2>Seu negócio em números</h2>
          <span>Valores dos registros da empresa, em reais.</span>
        </div>
        <select
          aria-label="Período"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="all">Todo o período</option>
        </select>
      </div>
      {data.finance === null ? (
        <div className="notice">
          Seu papel não inclui indicadores financeiros.
        </div>
      ) : (
        <div className="stats-grid">
          {[
            [
              ArrowDownLeft,
              "Receitas recebidas",
              received,
              "Entradas registradas",
              "green",
            ],
            [Out, "Despesas pagas", paid, "Saídas registradas", "rose"],
            [
              CircleDollarSign,
              "A receber",
              rec,
              "Previsto, ainda não recebido",
              "purple",
            ],
            [Wallet, "A pagar", payable, "Previsto, ainda não pago", "amber"],
          ].map(([I, label, value, sub, tone], i) => {
            const Icon = I as typeof Wallet;
            return (
              <button
                onClick={() => c.go("financeiro")}
                className="stat-card"
                key={i}
              >
                <div>
                  <span className={`stat-icon ${tone}`}>
                    <Icon size={18} />
                  </span>
                  <small>{String(label)}</small>
                  <ArrowUpRight size={15} />
                </div>
                <strong>{money(Number(value))}</strong>
                <span>{String(sub)}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="overview-columns">
        <section className="panel cash-panel">
          <div className="panel-head">
            <div>
              <h2>Fluxo do seu negócio</h2>
              <p>O que já aconteceu e o que está por vir.</p>
            </div>
            <button className="link-button" onClick={() => c.go("financeiro")}>
              Ver financeiro <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="cash-balance">
            <div>
              <small>Saldo realizado</small>
              <strong>
                {data.finance === null
                  ? "Sem permissão"
                  : money(received - paid)}
              </strong>
              <span>Recebido − pago. Não representa lucro.</span>
            </div>
            <span className="cash-label">
              <span className="status-dot" /> BASEADO NOS SEUS REGISTROS
            </span>
          </div>
          {received || paid ? (
            <div className="real-bars">
              <div>
                <span>Recebido</span>
                <i
                  style={{
                    width: `${Math.max(3, (received / Math.max(received, paid)) * 100)}%`,
                  }}
                />
                <strong>{money(received)}</strong>
              </div>
              <div>
                <span>Pago</span>
                <i
                  className="expense"
                  style={{
                    width: `${Math.max(3, (paid / Math.max(received, paid)) * 100)}%`,
                  }}
                />
                <strong>{money(paid)}</strong>
              </div>
            </div>
          ) : (
            <div className="cash-empty">
              <div className="chart-grid">
                <span>R$ 0</span>
                <i />
                <i />
                <i />
                <div className="chart-zero" />
              </div>
              <p>
                Seu fluxo aparece quando você registra a primeira movimentação.
              </p>
              <button className="text-link" onClick={() => c.go("financeiro")}>
                Registrar receita ou despesa <Plus size={14} />
              </button>
            </div>
          )}
          <div className="cash-summary">
            <span>
              <i /> Recebido <strong>{money(received)}</strong>
            </span>
            <span>
              <i /> Pago <strong>{money(paid)}</strong>
            </span>
            <span>
              Saldo previsto{" "}
              <strong>{money(received - paid + rec - payable)}</strong>
            </span>
          </div>
        </section>
        <section className="panel next-steps">
          <div className="panel-head">
            <div>
              <h2>Seus próximos passos</h2>
              <p>Pequenas ações, mais organização.</p>
            </div>
            <Target size={20} />
          </div>
          {[
            [
              data.records.some((r: any) => r.kind === "clients"),
              "Cadastre seu primeiro cliente",
              "Construa sua base de relacionamentos.",
              "clientes",
            ],
            [
              data.records.some((r: any) => r.kind === "products"),
              "Organize seu catálogo",
              "Conte ao Impulsa o que você oferece.",
              "produtos",
            ],
            [
              data.quotes.length > 0,
              "Prepare um orçamento",
              "Transforme uma oportunidade em proposta.",
              "propostas",
            ],
          ].map(([done, t, d, go], i) => (
            <button
              className={`next-step ${done ? "done" : ""}`}
              onClick={() => c.go(String(go))}
              key={i}
            >
              <span>{done ? <Check size={15} /> : i + 1}</span>
              <div>
                <strong>{String(t)}</strong>
                <small>{String(d)}</small>
              </div>
              <ChevronRight size={16} />
            </button>
          ))}
          {low.length > 0 && (
            <button className="next-step" onClick={() => c.go("estoque")}>
              <span>!</span>
              <div>
                <strong>{low.length} materiais para repor</strong>
                <small>Disponível abaixo do estoque mínimo.</small>
              </div>
              <ChevronRight size={16} />
            </button>
          )}
          <div className="next-foot">
            <ShieldCheck size={15} /> Sugestões baseadas nos seus registros.
          </div>
        </section>
      </div>
      <div className="overview-columns lower">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Na sua agenda</h2>
              <p>Compromissos e tarefas que pedem atenção.</p>
            </div>
            <button className="link-button" onClick={() => c.go("agenda")}>
              Ver agenda <ArrowUpRight size={15} />
            </button>
          </div>
          {appointments.length || tasks.length ? (
            <div className="agenda-list">
              {[...appointments, ...tasks].slice(0, 4).map((r: any) => (
                <button
                  key={r.id}
                  onClick={() =>
                    c.go(r.kind === "appointments" ? "agenda" : "tarefas")
                  }
                >
                  <span className="agenda-day">
                    {r.data.due
                      ? new Date(r.data.due + "T12:00:00").getDate()
                      : "—"}
                  </span>
                  <div>
                    <strong>{r.data.name}</strong>
                    <small>
                      {r.data.due || "Sem prazo"} ·{" "}
                      {r.data.status === "doing" ? "Em andamento" : "Pendente"}
                    </small>
                  </div>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="Sua agenda está aberta"
              description="Cadastre um compromisso ou tarefa e planeje seu próximo dia."
              action={() => c.go("agenda")}
            />
          )}
        </section>
        <section className="panel movement-panel">
          <div className="panel-head">
            <div>
              <h2>Em movimento</h2>
              <p>Uma visão do que continua acontecendo.</p>
            </div>
            <span className="subtle-icon">
              <RefreshCw size={18} />
            </span>
          </div>
          {[
            [
              FileText,
              "Propostas aguardando resposta",
              waiting.length,
              "propostas",
            ],
            [Boxes, "Trabalhos em andamento", unfinished.length, "ordens"],
            [CheckSquare, "Tarefas e pendências", tasks.length, "tarefas"],
            [Package, "Materiais para reposição", low.length, "estoque"],
          ].map(([I, t, n, go], i) => {
            const Icon = I as typeof FileText;
            return (
              <button
                className="movement-row"
                key={i}
                onClick={() => c.go(String(go))}
              >
                <span className={`movement-icon tone-${i}`}>
                  <Icon size={18} />
                </span>
                <span>{String(t)}</span>
                <strong>{Number(n)}</strong>
                <ChevronRight size={14} />
              </button>
            );
          })}
        </section>
      </div>
      <section className="quick-section">
        <div className="section-title-row">
          <div>
            <h2>O que você precisa fazer agora?</h2>
            <span>Atalhos para a rotina fluir.</span>
          </div>
          <span className="small-muted">SEU NEGÓCIO. SEU RITMO.</span>
        </div>
        <div className="quick-actions">
          {[
            [Users, "Adicionar cliente", "clientes"],
            [FileText, "Criar orçamento", "propostas"],
            [Wallet, "Registrar movimentação", "financeiro"],
            [CalendarDays, "Agendar compromisso", "agenda"],
          ].map(([I, t, p], i) => {
            const Icon = I as typeof Users;
            return (
              <button key={i} onClick={() => c.go(String(p))}>
                <Icon size={20} />
                <span>{String(t)}</span>
                <Plus size={16} />
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
