import { ThemeButton } from "./theme";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ShieldCheck,
  Layers,
  Menu,
  ChartNoAxesCombined,
  Users,
  Package,
  CalendarDays,
  ChevronDown,
} from "lucide-react";
import { api, authClient } from "./api";
import { Field, ErrorBox, Submit, useAction, Loading } from "./ui";
import { areas, money } from "../shared/domain";
export const photos = [
  "photo-1504307651254-35680f356dfd",
  "photo-1486262715619-67b85e0b08d3",
  "photo-1560066984-138dadb4c035",
  "photo-1441986300917-64674bd600d8",
  "photo-1452860606245-08befc0ff44b",
  "photo-1497366754035-f200968a6e72",
  "photo-1454165804606-c3d57bc86b40",
  "photo-1416879595882-3373a0480b5b",
  "photo-1621905251189-08b45d6a269e",
  "photo-1497366811353-6870744d04b2",
];
export const photoUrl = (i: number) => `/images/area-${i}.jpg`;
export function Logo() {
  const [brand, setBrand] = useState({ name: "Impulsa", logo: "/icon.svg" });
  useEffect(() => {
    void api("/config")
      .then(setBrand)
      .catch(() => {});
  }, []);
  return (
    <Link className="logo" to="/" aria-label={brand.name + ", início"}>
      {brand.logo !== "/icon.svg" ? (
        <img
          src={brand.logo}
          alt=""
          width="28"
          height="28"
          style={{ marginRight: 9 }}
        />
      ) : (
        <span className="logo-mark">
          <i />
          <i />
          <i />
        </span>
      )}
      {brand.name.toLowerCase()}
      <span className="logo-dot">.</span>
    </Link>
  );
}
function PublicHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="public-header">
      <Logo />
      <nav className={open ? "public-nav open" : "public-nav"}>
        <a href="/#funcionalidades">Funcionalidades</a>
        <a href="/#solucoes">Para seu negócio</a>
        <a href="/#como-funciona">Como funciona</a>
        <a href="/#planos">Planos</a>
      </nav>
      <div className="public-actions">
        <ThemeButton />
        <Link to="/entrar">Entrar</Link>
        <Link className="button primary" to="/cadastro">
          Experimentar grátis <ArrowUpRight size={16} />
        </Link>
        <button
          className="icon-button mobile-only"
          aria-label="Abrir menu"
          onClick={() => setOpen(!open)}
        >
          <Menu />
        </button>
      </div>
    </header>
  );
}
export function PublicSite() {
  const [config, setConfig] = useState<any>(null);
  useEffect(() => {
    void api("/config").then(setConfig);
  }, []);
  return (
    <>
      <PublicHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> MENOS IMPROVISO. MAIS POSSIBILIDADES.
            </div>
            <h1>
              Organize seus clientes, orçamentos e recebimentos{" "}
              <span>em um só lugar</span>
            </h1>
            <p>
              Do primeiro orçamento ao próximo passo: conecte clientes, rotina e
              finanças em um só lugar. Do seu jeito, no ritmo do seu negócio.
            </p>
            <div className="hero-buttons">
              <Link className="button primary large" to="/cadastro">
                Criar minha conta <ArrowUpRight size={18} />
              </Link>
              <Link className="text-link" to="/demonstracao">
                Conhecer o painel <ArrowRight size={17} />
              </Link>
            </div>
            <div className="hero-notes">
              <span>
                <Check size={15} /> Sem cartão de crédito
              </span>
              <span>
                <Check size={15} /> Para várias profissões
              </span>
            </div>
          </div>
          <div className="hero-preview">
            <div className="preview-label">
              <span className="status-dot" /> UMA VISÃO DO SEU DIA{" "}
              <span>Demonstração ilustrativa</span>
            </div>
            <div className="mini-app">
              <aside>
                <span className="mini-logo">i.</span>
                {[
                  Layers,
                  Users,
                  Package,
                  CalendarDays,
                  ChartNoAxesCombined,
                ].map((Icon, i) => (
                  <span key={i} className={i === 0 ? "selected" : ""}>
                    <Icon size={18} />
                  </span>
                ))}
              </aside>
              <div className="mini-body">
                <div className="mini-heading">
                  <div>
                    <small>SEU NEGÓCIO, EM MOVIMENTO</small>
                    <h3>Mais clareza para começar.</h3>
                  </div>
                  <span className="mini-avatar">VC</span>
                </div>
                <div className="mini-stats">
                  <div>
                    <small>Saldo realizado</small>
                    <strong>R$ 0,00</strong>
                    <span>Você constrói a partir daqui</span>
                  </div>
                  <div>
                    <small>Próximos passos</small>
                    <strong>Seu primeiro cliente</strong>
                    <span>Organize cada oportunidade</span>
                  </div>
                </div>
                <div className="mini-chart">
                  <div>
                    <strong>Tudo começa com um passo.</strong>
                    <small>
                      Seus registros se transformam em uma visão real.
                    </small>
                  </div>
                  <div className="chart-empty">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="mini-months">
                    <span>CLIENTES</span>
                    <span>PROPOSTAS</span>
                    <span>ROTINA</span>
                    <span>FINANÇAS</span>
                  </div>
                </div>
                <div className="mini-task">
                  <span className="check-ring">
                    <Check size={17} />
                  </span>
                  <div>
                    <strong>Um fluxo que faz sentido</strong>
                    <small>Orçamento → execução → financeiro</small>
                  </div>
                  <ArrowUpRight size={19} />
                </div>
              </div>
            </div>
            <div className="preview-float">
              <span>
                <ShieldCheck size={21} />
              </span>
              <div>
                <strong>Seu negócio no centro</strong>
                <small>Ferramentas que se conectam à sua rotina</small>
              </div>
            </div>
          </div>
        </section>
        <div className="profession-strip">
          <span>PARA QUEM FAZ ACONTECER</span>
          <span>Autônomos</span>
          <i />
          <span>Pequenos negócios</span>
          <i />
          <span>Equipes que crescem</span>
          <span className="strip-end">
            Uma plataforma. Muitas possibilidades. <ArrowUpRight size={17} />
          </span>
        </div>
        <section id="funcionalidades" className="section">
          <div className="section-head">
            <div>
              <div className="eyebrow">DA IDEIA À ROTINA</div>
              <h2>
                As partes do seu negócio.
                <br />
                <span>Finalmente conectadas.</span>
              </h2>
            </div>
            <p>
              Menos informações espalhadas. Mais tempo para cuidar do que você
              faz bem.
            </p>
          </div>
          <div className="feature-grid">
            {[
              [
                Users,
                "Relacionamentos que continuam",
                "Clientes, oportunidades e retornos em um histórico que acompanha você.",
              ],
              [
                Layers,
                "Do orçamento à entrega",
                "Propostas que viram trabalho, reservam materiais e geram valores a receber.",
              ],
              [
                ChartNoAxesCombined,
                "Finanças com clareza",
                "Separe o que entrou, o que está previsto e o que ainda precisa ser pago.",
              ],
              [
                CalendarDays,
                "Uma rotina sob controle",
                "Agenda, tarefas e próximos passos para não deixar o importante para depois.",
              ],
            ].map(([I, t, d], i) => {
              const Icon = I as typeof Users;
              return (
                <article className="feature" key={i}>
                  <span className={`feature-icon tone-${i}`}>
                    <Icon size={24} />
                  </span>
                  <h3>{String(t)}</h3>
                  <p>{String(d)}</p>
                  <Link to="/cadastro">
                    Conhecer ferramenta <ArrowUpRight size={15} />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
        <section id="solucoes" className="section solutions">
          <div className="section-head">
            <div>
              <div className="eyebrow">FEITO PARA A SUA REALIDADE</div>
              <h2>
                Seu trabalho é único.
                <br />
                <span>Sua gestão também pode ser.</span>
              </h2>
            </div>
            <Link className="text-link" to="/cadastro">
              Encontre sua atividade <ArrowRight size={17} />
            </Link>
          </div>
          <div className="profession-grid">
            {Object.keys(areas)
              .slice(0, 4)
              .map((a, i) => (
                <Link to="/cadastro" className="profession-card" key={a}>
                  <img
                    src={photoUrl(i)}
                    alt={`Área de ${a.toLowerCase()}`}
                    loading="lazy"
                  />
                  <div>
                    <h3>{a}</h3>
                    <span>
                      Organização para quem faz <ArrowUpRight size={19} />
                    </span>
                  </div>
                </Link>
              ))}
          </div>
          <div className="business-examples">
            <h3>Exemplos com dados fictícios</h3>
            <details>
              <summary>Marcenaria · orçamento de um armário</summary>
              <p>
                Chapas de MDF e ferragens: R$ 480. Fabricação e instalação: R$
                720. O orçamento de R$ 1.200 segue por link para aprovação antes
                de virar um projeto.
              </p>
            </details>
            <details>
              <summary>Loja · reposição de camisetas</summary>
              <p>
                A loja tem 12 camisetas M no estoque físico e 4 reservadas. Com
                8 disponíveis e um mínimo de 10, a grade precisa de reposição.
              </p>
            </details>
            <details>
              <summary>Prestador de serviços · agenda da semana</summary>
              <p>
                O instalador agenda uma visita às 14h e registra as ferramentas
                e materiais na ordem de serviço. O sinal recebido aparece no
                caixa e o restante fica em contas a receber.
              </p>
            </details>
          </div>
          <p className="solutions-more">
            E também artesanato, tecnologia, serviços profissionais, jardinagem,
            manutenção e muito mais.
          </p>
        </section>
        <section id="como-funciona" className="section how">
          <div>
            <div className="eyebrow">SIMPLES DESDE O PRIMEIRO ACESSO</div>
            <h2>
              Comece pelo que
              <br />
              faz sentido para você.
            </h2>
            <p>
              Conte um pouco sobre seu negócio. O Impulsa organiza seu ponto de
              partida, sem exigir que você conheça todas as ferramentas.
            </p>
            <Link className="button primary" to="/cadastro">
              Organizar meu negócio <ArrowUpRight size={17} />
            </Link>
          </div>
          <ol>
            {[
              [
                "Seu perfil, em poucos passos",
                "Escolha sua área, atividade, momento e objetivos.",
              ],
              [
                "Uma visão da sua rotina",
                "Cadastre seus primeiros clientes, produtos e compromissos.",
              ],
              [
                "Próximos passos com contexto",
                "Acompanhe pendências a partir dos dados que você registrou.",
              ],
            ].map(([t, d], i) => (
              <li key={t}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section id="planos" className="section pricing">
          <div className="eyebrow">ESPAÇO PARA COMEÇAR E CRESCER</div>
          <h2>Uma escolha clara para cada momento.</h2>
          <p>
            Preços provisórios. Teste de {config?.trialDays ?? 7} dias, até 500
            registros e 10 pessoas. Sem cartão e sem renovação automática do
            teste.
          </p>
          <div className="pricing-grid">
            {Object.entries(
              config?.plans ?? {
                essencial: {
                  name: "Básico",
                  cents: 4900,
                  members: 1,
                  records: 500,
                },
                completo: {
                  name: "Premium",
                  cents: 9900,
                  members: 10,
                  records: 10000,
                },
              },
            ).map(([key, p]: any) => (
              <article
                key={key}
                className={`price-card ${key === "completo" ? "highlight" : ""}`}
              >
                <span className="eyebrow">{p.name}</span>
                <h3>
                  {money(p.cents)}
                  <small>/mês</small>
                </h3>
                <p>
                  {key === "essencial"
                    ? "Para organizar seu trabalho com autonomia."
                    : "Para conectar a rotina de uma equipe."}
                </p>
                <ul>
                  <li>
                    <Check size={16} /> Clientes, propostas e ordens
                  </li>
                  <li>
                    <Check size={16} /> Estoque, agenda e financeiro
                  </li>
                  {key === "completo" && (
                    <li>
                      <Check size={16} /> Instagram, editor de artes e equipe
                    </li>
                  )}
                  <li>
                    <Check size={16} /> Até {p.records.toLocaleString("pt-BR")}{" "}
                    registros ativos
                  </li>
                  <li>
                    <Check size={16} /> Até {p.members}{" "}
                    {p.members === 1 ? "pessoa" : "pessoas"}
                  </li>
                </ul>
                <Link
                  to="/cadastro"
                  className={`button ${key === "completo" ? "primary" : "secondary"}`}
                >
                  Experimentar grátis <ArrowRight size={16} />
                </Link>
                <small>
                  Checkout disponível apenas em teste, mediante configuração.
                </small>
              </article>
            ))}
          </div>

          <div className="table-wrap plan-comparison">
            <table>
              <caption>Comparação dos planos</caption>
              <thead>
                <tr>
                  <th scope="col">Área</th>
                  <th scope="col">Básico</th>
                  <th scope="col">Premium</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Clientes e agenda</th>
                  <td>Histórico e agenda individual</td>
                  <td>Equipe, responsáveis e papéis</td>
                </tr>
                <tr>
                  <th scope="row">Orçamentos e pedidos</th>
                  <td>PDF, aprovação por link e pedidos</td>
                  <td>Inclui os mesmos fluxos</td>
                </tr>
                <tr>
                  <th scope="row">Compras e estoque</th>
                  <td>Listas, saldo e pesquisa de fornecedores</td>
                  <td>Inclui os mesmos fluxos</td>
                </tr>
                <tr>
                  <th scope="row">Financeiro</th>
                  <td>Contas, pagamentos parciais e caixa</td>
                  <td>Inclui os mesmos fluxos</td>
                </tr>
                <tr>
                  <th scope="row">Divulgação</th>
                  <td>Catálogo compartilhável</td>
                  <td>Instagram, calendário de conteúdo e editor de artes</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section className="section faq">
          <div>
            <div className="eyebrow">SEM PONTAS SOLTAS</div>
            <h2>Antes do próximo passo.</h2>
            <Link to="/ajuda" className="text-link">
              Acesse a central de ajuda <ArrowUpRight size={16} />
            </Link>
          </div>
          <div>
            {[
              [
                "Preciso ter uma empresa formalizada?",
                "Você pode organizar sua atividade como autônomo ou pequeno negócio. O Impulsa não substitui contabilidade, orientação jurídica ou emissão fiscal.",
              ],
              [
                "Meus dados começam preenchidos?",
                "Não. Sua empresa começa vazia. A demonstração é identificada e não altera contas reais.",
              ],
              [
                "O que acontece depois do teste?",
                "Novos registros são bloqueados após o teste sem assinatura ativa. Consulta e exportação continuam acessíveis. Nenhuma cobrança é feita sem contratação explícita.",
              ],
              [
                "Posso usar no celular?",
                "Sim. A interface é responsiva e pode ser instalada como PWA quando o navegador permitir. Alterações de dados precisam de internet.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <ChevronDown size={17} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="final-cta">
          <div className="eyebrow">O PRÓXIMO PASSO É SEU</div>
          <h2>
            Seu negócio merece
            <br />
            um pouco mais de clareza.
          </h2>
          <Link to="/cadastro" className="button light large">
            Começar agora <ArrowUpRight size={18} />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
export function Footer() {
  return (
    <footer>
      <div className="footer-top">
        <div>
          <Logo />
          <p>
            Seu negócio organizado,
            <br />
            do primeiro orçamento ao próximo passo.
          </p>
        </div>
        <div>
          <strong>Plataforma</strong>
          <a href="/#funcionalidades">Funcionalidades</a>
          <a href="/#solucoes">Soluções por atividade</a>
          <a href="/#planos">Planos</a>
          <Link to="/instalar">Instalar aplicativo</Link>
        </div>
        <div>
          <strong>Podemos ajudar</strong>
          <Link to="/ajuda">Ajuda e contato</Link>
          <Link to="/privacidade">Central de Privacidade</Link>
          <Link to="/termos">Termos de Uso</Link>
        </div>
        <div>
          <strong>Transparência</strong>
          <Link to="/politica-privacidade">Política de Privacidade</Link>
          <Link to="/cookies">Política de Cookies</Link>
          <button
            className="link-button"
            onClick={() => window.dispatchEvent(new Event("cookies:open"))}
          >
            Preferências de cookies
          </button>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} Impulsa · Versão de desenvolvimento
        </span>
        <span>Feito para quem faz acontecer.</span>
      </div>
    </footer>
  );
}
function authFormError(
  error: { status?: number; code?: string },
  signup: boolean,
) {
  if (
    error.code === "INVALID_ORIGIN" ||
    error.code === "MISSING_OR_NULL_ORIGIN"
  )
    return "Este endereço não está autorizado para acessar sua conta. Abra o Impulsa pelo endereço configurado no servidor.";
  if (error.status === 429)
    return "Muitas tentativas. Aguarde um minuto e tente novamente.";
  if (signup && error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")
    return "Já existe uma conta com este e-mail. Entre ou use Esqueci minha senha.";
  if (
    !signup &&
    (error.code === "INVALID_EMAIL_OR_PASSWORD" || error.status === 401)
  )
    return "E-mail ou senha incorretos. Se esqueceu a senha, use o link abaixo.";
  return signup
    ? "Não foi possível criar a conta agora. Confira os dados e tente novamente."
    : "O serviço de login está indisponível no momento. Tente novamente em instantes.";
}
export function AuthPage({
  signup = false,
  recovery = false,
  reset = false,
}: {
  signup?: boolean;
  recovery?: boolean;
  reset?: boolean;
}) {
  const action = useAction();
  const [message, setMessage] = useState("");
  const [twoFactor, setTwoFactor] = useState(false);
  const [backup, setBackup] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <Logo />
        <div>
          <div className="eyebrow">SEU PRÓXIMO PASSO COMEÇA AQUI</div>
          <h1>
            Você cuida
            <br />
            do seu talento.
            <br />
            <span>
              A gente conecta
              <br />o resto.
            </span>
          </h1>
          <p>
            Clientes, propostas, rotina e finanças.
            <br />
            Um lugar para fazer seu negócio acontecer.
          </p>
        </div>
        <small>Impulsa · Organização que acompanha você.</small>
      </div>
      <main className="auth-form">
        <Link to="/" className="back-link">
          ← Voltar ao início
        </Link>
        <div>
          <span className="eyebrow">BEM-VINDO AO IMPULSA</span>
          <h2>
            {twoFactor
              ? "Confirme seu acesso"
              : signup
                ? "Dê espaço ao próximo passo."
                : recovery
                  ? "Vamos recuperar seu acesso."
                  : reset
                    ? "Defina uma nova senha."
                    : "Bom ter você por aqui."}
          </h2>
          <p>
            {signup
              ? "Experimente por 7 dias. Sem cartão de crédito."
              : recovery
                ? "Você receberá instruções se houver uma conta para o e-mail informado."
                : "Entre para continuar cuidando do seu negócio."}
          </p>
          <form
            onSubmit={action.onSubmit(async (f) => {
              if (twoFactor) {
                const r = backup
                  ? await authClient.twoFactor.verifyBackupCode({
                      code: String(f.get("code")),
                    })
                  : await authClient.twoFactor.verifyTotp({
                      code: String(f.get("code")),
                    });
                if (r.error) throw new Error("Código inválido ou expirado");
                navigate("/app");
                return;
              }
              if (reset) {
                const r = await authClient.resetPassword({
                  newPassword: String(f.get("password")),
                  token:
                    new URLSearchParams(location.search).get("token") ?? "",
                });
                if (r.error)
                  throw new Error(
                    "Não foi possível redefinir a senha. Solicite um novo link.",
                  );
                setMessage("Senha alterada. Entre com a nova senha.");
                return;
              }
              const email = String(f.get("email")).trim();
              if (recovery) {
                const result = await authClient.requestPasswordReset({
                  email,
                  redirectTo: `${location.origin}/redefinir-senha`,
                });
                if (result.error)
                  throw new Error(
                    result.error.status === 429
                      ? "Aguarde um minuto antes de solicitar outro link."
                      : "Não foi possível solicitar a redefinição. Tente novamente.",
                  );
                const settings = await api("/config").catch(() => null);
                setMessage(
                  settings?.integrations.mail === false
                    ? "Se houver uma conta, o link ficará na caixa de saída local do Impulsa."
                    : "Se houver uma conta, confira as instruções na caixa de entrada e no spam.",
                );
                return;
              }
              if (signup) {
                const r = await authClient.signUp.email({
                  email,
                  password: String(f.get("password")),
                  name: String(f.get("name")),
                  callbackURL: "/app",
                  ...({
                    termsAccepted: true,
                    promotional: f.get("promo") === "on",
                  } as any),
                });
                if (r.error) throw new Error(authFormError(r.error, true));
                navigate("/app");
              } else {
                const r = await authClient.signIn.email({
                  email,
                  password: String(f.get("password")),
                });
                if (r.error) throw new Error(authFormError(r.error, false));
                if ((r.data as any)?.twoFactorRedirect) {
                  setTwoFactor(true);
                  return;
                }
                navigate("/app");
              }
            })}
          >
            {twoFactor ? (
              <>
                <Field
                  label={
                    backup ? "Código de recuperação" : "Código do autenticador"
                  }
                >
                  <input
                    name="code"
                    inputMode={backup ? "text" : "numeric"}
                    pattern={backup ? undefined : "[0-9]{6}"}
                    autoComplete="one-time-code"
                    required
                  />
                </Field>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setBackup(!backup)}
                >
                  {backup
                    ? "Usar aplicativo autenticador"
                    : "Usar código de recuperação"}
                </button>
              </>
            ) : (
              <>
                {signup && (
                  <Field label="Seu nome">
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      minLength={2}
                    />
                  </Field>
                )}
                {!reset && (
                  <Field label="E-mail">
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="voce@seunegocio.com.br"
                      required
                    />
                  </Field>
                )}
                {!recovery && (
                  <Field
                    label="Senha"
                    hint={
                      signup || reset
                        ? "Pelo menos 12 caracteres. Use uma senha exclusiva."
                        : undefined
                    }
                  >
                    <input
                      name="password"
                      type="password"
                      minLength={signup || reset ? 12 : 1}
                      maxLength={128}
                      autoComplete={
                        signup || reset ? "new-password" : "current-password"
                      }
                      required
                    />
                  </Field>
                )}
                {signup && (
                  <div className="consent-fields">
                    <label>
                      <input name="terms" type="checkbox" required /> Aceito os{" "}
                      <Link to="/termos" target="_blank">
                        Termos de Uso
                      </Link>
                      .
                    </label>
                    <p>
                      Conheça o tratamento dos seus dados na{" "}
                      <Link to="/politica-privacidade" target="_blank">
                        Política de Privacidade
                      </Link>
                      .
                    </p>
                    <label>
                      <input name="promo" type="checkbox" /> Quero receber
                      comunicações promocionais (opcional).
                    </label>
                  </div>
                )}
              </>
            )}
            <ErrorBox message={action.error} />
            {message && (
              <div className="success" role="status">
                {message}
              </div>
            )}
            <Submit busy={action.busy}>
              {twoFactor
                ? "Confirmar acesso"
                : signup
                  ? "Criar minha conta"
                  : recovery
                    ? "Enviar instruções"
                    : reset
                      ? "Salvar nova senha"
                      : "Entrar na minha conta"}{" "}
              <ArrowRight size={17} />
            </Submit>
          </form>
          {!signup && !recovery && !reset && (
            <Link className="auth-extra" to="/recuperar">
              Esqueci minha senha
            </Link>
          )}
          <div className="auth-divider" />
          <p className="auth-extra">
            {signup ? "Já tem uma conta?" : "Ainda não tem uma conta?"}{" "}
            <Link to={signup ? "/entrar" : "/cadastro"}>
              {signup ? "Entrar" : "Comece grátis"}
            </Link>
          </p>
        </div>
        <small className="auth-security">
          <ShieldCheck size={15} /> Seus dados ficam organizados por empresa.
        </small>
      </main>
    </div>
  );
}
const legal: Record<
  string,
  { title: string; intro: string; sections: [string, string][] }
> = {
  termos: {
    title: "Termos de Uso",
    intro:
      "Versão de revisão · 9 de novembro de 2026. Revisão jurídica e identificação do operador são necessárias antes do lançamento comercial.",
    sections: [
      [
        "O serviço",
        "O Impulsa organiza informações de pequenos negócios. Instagram e estúdio de artes exigem Premium ativo ou concessão administrativa temporária. Prompts usam regras locais; composições de templates não são geração por IA. A criação no ChatGPT depende da conta do usuário, e o envio é manual. Não há promessa de vendas, seguidores ou resultados. O usuário deve revisar informações e ter direitos sobre fotos, marcas e textos. Indicadores dependem dos registros informados. Saldo de caixa não é lucro, importação de extrato não é conciliação bancária e parâmetros de impostos não representam apuração tributária. Recursos especializados, como emissão fiscal, folha e tributos, não são oferecidos. IA, buscas e cobrança exigem configurações e podem estar indisponíveis.",
      ],
      [
        "Conta e responsabilidade",
        "Use e-mail válido, proteja suas credenciais e conceda acesso somente a pessoas autorizadas. Você é responsável pela legitimidade e exatidão dos dados que registra. As regras de equipe são verificadas pelo servidor.",
      ],
      [
        "Teste, assinatura e cancelamento",
        "O teste não exige cartão nem renova automaticamente. Os preços mensais e os limites constam na página de planos. A integração Mercado Pago Assinaturas aceita somente credenciais e contas de teste nesta versão.",
      ],
      [
        "Fim do teste e inadimplência",
        "Sem assinatura ativa ao fim do teste, novas alterações operacionais são bloqueadas. Consulta e exportação continuam acessíveis. Suspensão, encerramento definitivo e prazos de eliminação devem ser informados pelo operador antes da operação comercial.",
      ],
      [
        "Limitações e propostas",
        "Registros financeiros manuais não são conciliação bancária. Saldo de caixa não é lucro. Aprovação por link registra a manifestação indicada por quem detém o link; não equivale a assinatura digital certificada nem comprova a identidade de forma independente.",
      ],
      [
        "Dados, disponibilidade e encerramento",
        "Exportações autorizadas e solicitações de privacidade estão no aplicativo. Não há garantia de disponibilidade contínua. A infraestrutura de produção, suporte e prazos contratuais devem ser definidos antes do lançamento. Não insira dados reais de terceiros nesta instalação de revisão.",
      ],
    ],
  },
  "politica-privacidade": {
    title: "Política de Privacidade",
    intro:
      "Texto próprio baseado na funcionalidade implementada. Versão de 9 de novembro de 2026. O operador, fornecedores e local de hospedagem precisam ser definidos antes de tratar dados reais em produção.",
    sections: [
      [
        "Papéis no tratamento",
        "A plataforma trata dados de conta para operar o serviço. Sobre dados de clientes e colaboradores inseridos por uma empresa, essa empresa define as finalidades e deve identificar a hipótese legal adequada; a plataforma os processa para prestar o serviço conforme suas instruções. A definição contratual dos papéis exige revisão.",
      ],
      [
        "Dados e finalidades",
        "Nome, e-mail, senha protegida pela biblioteca de autenticação, sessões, IP e agente de navegação para acesso e segurança; perfil do negócio, localização e preferências de compras para personalização; configurações de Instagram, conteúdo, métricas manuais, prompts e artes para divulgação; cadastros, contatos de CRM, oportunidades, versões de propostas, execução, agenda, compras, recebimentos, estoque, contas e registros financeiros manuais para gestão; CSVs e mapeamentos para importação confirmada, com progresso e resultado privados; solicitações e respostas de atendimento local para suporte; versões de termos e preferências para registro das escolhas. Não solicitamos endereço completo no cadastro guiado.",
      ],
      [
        "Bases legais",
        "A prestação solicitada e a gestão da conta se relacionam à execução contratual e procedimentos preliminares. Obrigações legais podem justificar retenções específicas. Segurança pode demandar avaliação documentada de legítimo interesse. Comunicações promocionais dependem de escolha opcional e revogável. Cada finalidade precisa de base adequada antes da operação comercial.",
      ],
      [
        "Fornecedores e transferência",
        "Na instalação local, os registros ficam no PostgreSQL embarcado e os arquivos são privados no mesmo banco. SMTP recebe destinatário e mensagens quando configurado; Mercado Pago recebe os dados da assinatura de teste quando habilitado. Se o operador configurar Brave Search, a busca envia somente material, especificações, marca e município/estado; não envia nomes de clientes, documentos, finanças ou CEP completo. Abrir o WhatsApp encaminha número e texto revisado ao serviço somente por ação explícita; copiar um modelo não o envia. Os links de Mercado Livre, Amazon e mapas abrem pesquisas externas por escolha do usuário, sem afiliados ou rastreamento promocional adicionado. Histórico, favoritos e listas são privados por empresa. Cache e armazenamento de resultados dependem dos direitos do plano do provedor. A lista oficial de municípios IBGE é servida localmente. Os prompts são preparados por regras locais. O link para o ChatGPT não transfere dados; texto e foto só são enviados ao ChatGPT se o usuário os colar ou anexar manualmente, sob os termos desse serviço. As fotos escolhidas para prévia ficam no navegador. Exportar um template envia a foto ao servidor para compor uma arte privada; importar a arte também envia um arquivo ao servidor. Não acessamos conversas, cookies ou senhas do ChatGPT ou Instagram. Hospedagem, regiões, contratos e eventuais transferências internacionais precisam ser revisados na implantação.",
      ],
      [
        "Retenção e proteção",
        "Registros arquivados permanecem no banco para preservar vínculos e histórico. Arquivos podem ser excluídos por quem tem permissão. Pedidos de exclusão são encaminhados para análise, não executados automaticamente. Prazos finais, rotina de expurgo, criptografia em repouso e backups de produção ainda não estão configurados. Sessões, isolamento por empresa e trilha de ações sensíveis são implementados; isso não constitui garantia absoluta.",
      ],
      [
        "Direitos e contato",
        "Acesse a Central de Privacidade para pedir acesso, correção ou exclusão. Revogue a preferência promocional nas configurações de privacidade e as escolhas de cookies pelo rodapé. Identidade e legitimidade podem precisar de confirmação antes da resposta. O canal e a identidade do operador precisam ser configurados antes do lançamento. Referências: LGPD, especialmente arts. 6, 7, 18 e 46, e orientações da ANPD.",
      ],
    ],
  },
  cookies: {
    title: "Política de Cookies",
    intro:
      "Somente recursos necessários são utilizados nesta versão. Não há analytics, publicidade, pixels ou rastreamento de marketing ativos.",
    sections: [
      [
        "Necessários",
        "Cookies HttpOnly do Better Auth mantêm a sessão e o desafio de autenticação multifator. A duração de sessão é de até 7 dias, com atualização pela biblioteca. Cookies de desafio têm duração curta. O cookie de sessão é Secure em produção e usa as proteções da biblioteca.",
      ],
      [
        "Preferências locais",
        "impulsa.cookies no armazenamento local guarda versão, escolha e data das preferências. Ele não guarda token de sessão, clientes ou finanças. A escolha permanece até você alterá-la ou apagar os dados do navegador.",
      ],
      [
        "Opcionais",
        "As opções aceitar, rejeitar e personalizar têm o mesmo destaque. Recusar opcionais não impede o serviço. Nenhum recurso opcional é carregado. Novas finalidades ou fornecedores exigirão informação e escolha adequada antes de ativação.",
      ],
      [
        "Alterar e revogar",
        "Use Preferências de cookies no rodapé a qualquer momento. No logout, caches são limpos; respostas autenticadas não são armazenadas pelo service worker.",
      ],
    ],
  },
  privacidade: {
    title: "Central de Privacidade",
    intro:
      "Controle suas escolhas e acompanhe solicitações dentro da sua conta.",
    sections: [
      [
        "Acesso, correção e exclusão",
        "Entre no aplicativo e abra Configurações → Privacidade. Solicitações são registradas com protocolo e ficam pendentes para tratamento humano. Não há envio automático a um encarregado nesta versão.",
      ],
      [
        "Exportação",
        "Proprietário e administrador podem baixar dados estruturados gerais da empresa. O papel financeiro acessa exportações financeiras; a operação não recebe automaticamente receitas, margens ou exportação de clientes. Arquivos privados são baixados separadamente. O programa Instagram possui exportação própria protegida por Premium. Sem acesso vigente, solicite acesso ou portabilidade pela central de privacidade para tratamento humano.",
      ],
      [
        "Preferências",
        "Você pode atualizar a opção de comunicações promocionais na conta e revisar cookies pelo rodapé.",
      ],
      [
        "Contato institucional",
        "O canal do responsável pelo tratamento ainda precisa ser configurado. A falta desses dados bloqueia o lançamento público.",
      ],
    ],
  },
  ajuda: {
    title: "Como podemos ajudar?",
    intro:
      "Um guia para transformar seus primeiros registros em uma rotina organizada.",
    sections: [
      [
        "Primeiros passos",
        "Crie a conta e preencha as seis etapas do seu perfil enquanto aguarda a confirmação do e-mail. Os módulos ficam bloqueados até confirmar. Sem SMTP, a instalação captura mensagens em .data/mail e não entrega e-mails externos. Os links expiram em uma hora; a tela pendente permite reenvio e correção do endereço com sua senha.",
      ],
      [
        "Seu primeiro fluxo",
        "Cadastre um cliente e um produto ou serviço. Crie uma proposta, envie, registre a aprovação e gere uma ordem. A conversão reserva os materiais e gera uma conta a receber. Ao concluir a ordem, os materiais são consumidos e uma tarefa de pós-venda é criada.",
      ],
      [
        "Financeiro e estoque",
        "Pagamentos podem ser parciais; o saldo é calculado pelos registros efetivos. Reservas reduzem o disponível, não a quantidade física. A baixa acontece na conclusão da ordem.",
      ],
      [
        "Integrações e contato",
        "Serviços indisponíveis são identificados e não retornam dados simulados. O contato institucional está pendente de configuração; use o projeto local para revisar a implementação.",
      ],
    ],
  },
  instalar: {
    title: "Seu negócio, mais perto.",
    intro:
      "Instale o Impulsa como aplicativo no seu dispositivo, quando o navegador suportar PWA.",
    sections: [
      [
        "Chrome e Edge",
        "Abra o menu do navegador e escolha Instalar aplicativo ou use o botão de instalação no aplicativo quando disponível. Em produção, HTTPS é obrigatório.",
      ],
      [
        "iPhone e iPad",
        "No Safari, toque em Compartilhar e em Adicionar à Tela de Início. A disponibilidade depende da versão do sistema.",
      ],
      [
        "Quando estiver offline",
        "Apenas recursos públicos estáticos e a página offline são armazenados. Clientes, finanças, documentos e respostas autenticadas não são colocados em cache persistente. Pagamentos, buscas e alterações exigem conexão.",
      ],
      [
        "Atualizações",
        "Quando uma nova versão estiver disponível, o aplicativo informa e oferece recarregar. Salve os formulários antes de atualizar. Não há promessa de publicação em lojas.",
      ],
    ],
  },
};
export function LegalPage() {
  const { page = "" } = useParams();
  const v = legal[page];
  const [config, setConfig] = useState<any>(null);
  useEffect(() => {
    void api("/config").then(setConfig);
  }, []);
  return (
    <>
      <PublicHeader />
      <main className="legal-page">
        <div className="eyebrow">IMPULSA · INFORMAÇÃO E TRANSPARÊNCIA</div>
        <h1>{v?.title ?? "Página não encontrada"}</h1>
        <p className="lead">
          {v?.intro ??
            "Esse endereço não está disponível. Volte ao início para continuar."}
        </p>
        {v?.sections.map(([h, p]) => (
          <section key={h}>
            <h2>{h}</h2>
            <p>{p}</p>
          </section>
        ))}
        {["termos", "politica-privacidade", "privacidade", "ajuda"].includes(
          page,
        ) && (
          <div className="notice">
            <strong>Dados institucionais</strong>
            <p>
              {config?.institution.entity || "Razão social pendente"} ·{" "}
              {config?.institution.cnpj || "CNPJ pendente"}
              <br />
              {config?.institution.contactEmail || "Contato pendente"} ·{" "}
              {config?.institution.privacyEmail ||
                "Canal de privacidade pendente"}
            </p>
          </div>
        )}
        {page === "politica-privacidade" && (
          <p>
            Fontes oficiais:{" "}
            <a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm">
              Lei Geral de Proteção de Dados
            </a>
            ,{" "}
            <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados">
              direitos do titular — ANPD
            </a>{" "}
            e{" "}
            <a href="https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais">
              guia de cookies — ANPD
            </a>
            .
          </p>
        )}
        <Link to="/" className="button secondary">
          Voltar ao início <ArrowRight size={16} />
        </Link>
      </main>
      <Footer />
    </>
  );
}
export function SharedQuote() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const action = useAction();
  useEffect(() => {
    void action.run(async () => setData(await api(`/shared/${token}`)));
  }, [token]);
  if (!data)
    return (
      <main className="legal-page">
        <ErrorBox message={action.error} />
        {!action.error && <Loading />}
      </main>
    );
  return (
    <main className="shared-quote">
      <Logo />
      <div className="eyebrow">PROPOSTA #{data.number}</div>
      <h1>{data.data.title}</h1>
      <p>
        {data.data.companyName} · Validade{" "}
        {data.data.validUntil.split("-").reverse().join("/")}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qtd.</th>
              <th>Valor unitário</th>
            </tr>
          </thead>
          <tbody>
            {data.data.items.map((i: any, n: number) => (
              <tr key={n}>
                <td>{i.name}</td>
                <td>{i.quantity}</td>
                <td>{money(i.priceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Mão de obra: {money(data.data.laborCents)} · Deslocamento:{" "}
        {money(data.data.travelCents)} · Desconto:{" "}
        {money(data.data.discountCents)}
      </p>
      <h2>Total {money(data.totalCents)}</h2>
      <p>{data.data.conditions}</p>
      {data.status === "sent" ? (
        <>
          <form
            onSubmit={action.onSubmit(async (f) => {
              await api(`/shared/${token}/approve`, "POST", {
                name: String(f.get("name")),
              });
              setData({ ...data, status: "approved" });
            })}
          >
            <Field label="Nome de quem aprova">
              <input name="name" minLength={2} required />
            </Field>
            <label className="check-label">
              <input type="checkbox" required /> Confirmo a aprovação dos itens
              e condições desta proposta.
            </label>
            <p>
              O registro por link não equivale a assinatura digital certificada
              nem verifica sua identidade de forma independente.
            </p>
            <ErrorBox message={action.error} />
            <Submit busy={action.busy}>Registrar aprovação</Submit>
          </form>
          <details className="quote-adjustment">
            <summary>Pedir ajustes</summary>
            <form
              onSubmit={action.onSubmit(async (f) => {
                await api(`/shared/${token}/adjustment`, "POST", {
                  name: f.get("adjustmentName"),
                  message: f.get("message"),
                });
                setData({ ...data, status: "adjustment_requested" });
              })}
            >
              <Field label="Seu nome">
                <input
                  name="adjustmentName"
                  required
                  minLength={2}
                  maxLength={160}
                />
              </Field>
              <Field label="O que precisa mudar?">
                <textarea
                  name="message"
                  required
                  minLength={5}
                  maxLength={1500}
                />
              </Field>
              <Submit busy={action.busy}>Enviar pedido de ajuste</Submit>
            </form>
          </details>
        </>
      ) : (
        <div className="notice">
          Situação:{" "}
          {data.status === "approved"
            ? "Aprovada"
            : data.status === "adjustment_requested"
              ? "Ajustes solicitados"
              : data.status}
        </div>
      )}
    </main>
  );
}
export function Invitation() {
  const { token } = useParams();
  const action = useAction();
  const [done, setDone] = useState(false);
  return (
    <main className="legal-page">
      <Logo />
      <h1>Vamos trabalhar juntos?</h1>
      <p>
        Entre com o e-mail que recebeu o convite e confirme sua participação.
        Convites expiram em 48 horas.
      </p>
      <Link to="/entrar" className="button secondary">
        Entrar na conta
      </Link>
      <button
        className="button primary"
        disabled={done || action.busy}
        onClick={() =>
          void action.run(async () => {
            await api("/invitations/accept", "POST", { token });
            setDone(true);
          })
        }
      >
        {done ? "Convite aceito" : "Aceitar convite"}
      </button>
      <ErrorBox message={action.error} />
      {done && (
        <Link to="/app">
          Abrir meu negócio <ArrowRight size={16} />
        </Link>
      )}
    </main>
  );
}

type CatalogItem = {
  name: string;
  size?: string;
  color?: string;
  priceCents: number;
};
export function SharedCatalog() {
  const { token } = useParams();
  const action = useAction();
  const [catalog, setCatalog] = useState<{
    companyName: string;
    items: CatalogItem[];
  } | null>(null);
  useEffect(() => {
    setCatalog(null);
    void action.run(async () =>
      setCatalog(
        await api("/public-catalog/" + encodeURIComponent(token ?? "")),
      ),
    );
  }, [token]);
  return (
    <>
      <PublicHeader />
      <main className="legal-page">
        <ErrorBox message={action.error} />
        {!catalog && !action.error && <Loading />}
        {catalog && (
          <>
            <h1>{catalog.companyName}</h1>
            <p>Catálogo</p>
            {catalog.items.length ? (
              <div className="feature-grid">
                {catalog.items.map((item, index) => (
                  <article key={index} className="feature">
                    <h2>{item.name}</h2>
                    {(item.size || item.color) && (
                      <p>
                        {[item.size, item.color].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <strong>{money(item.priceCents)}</strong>
                  </article>
                ))}
              </div>
            ) : (
              <p>Nenhum item foi disponibilizado neste catálogo.</p>
            )}
          </>
        )}
      </main>
    </>
  );
}
