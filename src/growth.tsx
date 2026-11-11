import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Camera,
  Palette,
  Copy,
  ExternalLink,
  Download,
  LockKeyhole,
  ImagePlus,
  Check,
  CalendarDays,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { api, ApiError } from "./api";
import {
  Field,
  ErrorBox,
  Submit,
  Loading,
  Modal,
  useAction,
  FormValidation,
} from "./ui";
import { preparePrompt, metricAdvice, promptSchema } from "../shared/growth";
import type { WorkspaceContext } from "./workspace";
import "./growth.css";
type Doc = { id: string; kind: string; data: any; version: number };
function useGrowth(c: WorkspaceContext) {
  const [status, setStatus] = useState<any>(null),
    [data, setData] = useState<{ documents: Doc[]; files: any[] }>({
      documents: [],
      files: [],
    });
  const a = useAction(),
    base = `/${c.company.id}/growth`;
  async function load() {
    const s = await api(base + "/status");
    setStatus(s);
    if (s.active) setData(await api(base));
  }
  useEffect(() => {
    void a.run(load);
  }, [base]);
  async function save(kind: string, value: any, doc?: Doc) {
    const r = await api(
      base + "/documents/" + kind + (doc ? "/" + doc.id : ""),
      doc ? "PUT" : "POST",
      { data: value, ...(doc ? { version: doc.version } : {}) },
    );
    await load();
    return r;
  }
  return { a, base, status, data, load, save };
}
function Gate({ status, error }: { status: any; error: string }) {
  if (error) return <ErrorBox message={error} />;
  if (!status) return <Loading />;
  return (
    <section className="growth-lock panel">
      <div className="growth-icon">
        <LockKeyhole />
      </div>
      <span className="eyebrow">PROGRAMA PREMIUM</span>
      <h2>Um próximo passo para sua divulgação</h2>
      <p>
        Camera, prompts e editor de artes fazem parte do Premium, disponível
        para o plano Premium ativo ou por concessão de um administrador
        autorizado.
      </p>
      <p>Não há compra ou liberação automática neste fluxo.</p>
      <Link className="button primary" to="/app/assinatura">
        Consultar minha assinatura <ArrowRight size={16} />
      </Link>
    </section>
  );
}
const steps = [
  ["Perfil do Instagram", Camera],
  ["Identidade visual", Palette],
  ["Plano de 30 dias", CalendarDays],
  ["Resultados", TrendingUp],
] as const;
const checklist = [
  "Nome e categoria revisados",
  "Bio clara e contato revisado",
  "Foto de perfil escolhida",
  "Link testado",
  "Opções de privacidade revisadas",
  "Autenticação em duas etapas ativada",
];
export function InstagramPage({ c }: { c: WorkspaceContext }) {
  const g = useGrowth(c),
    [tab, setTab] = useState(0),
    [editing, setEditing] = useState<Doc | null>(null),
    [metricOpen, setMetricOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const saved = g.data.documents.filter((d) => d.kind === "instagram").at(-1);
  useEffect(() => {
    if (saved) setProfile(saved.data);
  }, [saved?.id, saved?.version]);
  const p = profile ?? {
    handle: "",
    accountType: "undecided",
    publicName: c.company.name,
    bio: "",
    contact: "",
    link: "",
    audience: "",
    objective: "",
    offer: c.company.profile.profession,
    category: c.company.profile.profession,
    region: [c.company.profile.city, c.company.profile.state]
      .filter(Boolean)
      .join(" / "),
    cta: "Converse com a gente",
    style: "Essencial e legível",
    highlights: "Produtos, atendimento, dúvidas e bastidores",
    catalog: "",
    photoGuide: "Fotos próprias com luz suave, fundo limpo e cores fiéis.",
    tone: "acolhedor",
    colors: ["#4145b7", "#f5f4ee", "#242539"],
    checklist: [],
  };
  const set = (key: string, value: any) => setProfile({ ...p, [key]: value });
  const posts = g.data.documents
    .filter((d) => d.kind === "post")
    .sort((a, b) => a.data.day - b.data.day);
  const metrics = g.data.documents.filter((d) => d.kind === "metric");
  return (
    <FormValidation errors={g.a.fieldErrors}>
      <div className="page-heading module-heading">
        <div>
          <span className="eyebrow">CRESCIMENTO COM INTENÇÃO · PREMIUM</span>
          <h1>Seu negócio no Instagram</h1>
          <p>
            Um perfil claro, conteúdo consistente e aprendizado com dados reais.
          </p>
        </div>
        <Camera size={35} />
      </div>
      {!g.status?.active ? (
        <Gate status={g.status} error={g.a.error} />
      ) : (
        <>
          <p className="form-guidance">
            Progresso: {p.checklist.length} de {checklist.length} itens do
            perfil revisados ·{" "}
            {saved ? "configuração salva" : "configuração pendente"} ·{" "}
            {posts.length} dias planejados ·{" "}
            {posts.filter((d) => d.data.status === "published").length}{" "}
            publicações informadas.
          </p>
          <div
            className="growth-tabs"
            role="tablist"
            aria-label="Etapas do Instagram"
          >
            {steps.map(([label, Icon], i) => (
              <button
                key={label}
                role="tab"
                aria-selected={tab === i}
                onClick={() => setTab(i)}
              >
                <span>{i + 1}</span>
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>
          <ErrorBox message={g.a.error} />
          {tab < 2 ? (
            <form
              className="panel growth-panel"
              onSubmit={g.a.onSubmit(async () => {
                await g.save("instagram", p, saved);
                c.notify("Configuração salva.");
              })}
            >
              {tab === 0 ? (
                <>
                  <div className="eyebrow">ETAPA 1 · PREPARE SEU PERFIL</div>
                  <h2>Faça seu negócio ser reconhecido</h2>
                  <p>
                    Configure sua conta diretamente no Instagram. Estes campos
                    organizam suas decisões e não alteram sua conta externa.
                  </p>
                  <div className="form-grid">
                    <Field label="Nome público">
                      <input
                        value={p.publicName}
                        maxLength={120}
                        onChange={(e) => set("publicName", e.target.value)}
                      />
                    </Field>
                    <Field label="Usuário (@)">
                      <input
                        value={p.handle}
                        maxLength={80}
                        onChange={(e) => set("handle", e.target.value)}
                        placeholder="seunegocio"
                      />
                    </Field>
                    <Field label="Tipo de conta pretendido">
                      <select
                        value={p.accountType}
                        onChange={(e) => set("accountType", e.target.value)}
                      >
                        <option value="undecided">Ainda vou decidir</option>
                        <option value="business">Empresa</option>
                        <option value="creator">Criador de conteúdo</option>
                      </select>
                    </Field>
                    <Field label="Contato público (opcional)">
                      <input
                        value={p.contact}
                        maxLength={200}
                        onChange={(e) => set("contact", e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field label="Bio (até 150 caracteres)">
                    <textarea
                      value={p.bio}
                      maxLength={150}
                      onChange={(e) => set("bio", e.target.value)}
                      placeholder="O que você faz, para quem e como entrar em contato."
                    />
                  </Field>
                  <Field label="Link público (opcional)">
                    <input
                      type="url"
                      value={p.link}
                      onChange={(e) => set("link", e.target.value)}
                      maxLength={500}
                    />
                  </Field>
                  <div className="form-grid">
                    {[
                      ["category", "Categoria do perfil"],
                      ["region", "Região de atendimento"],
                      ["cta", "Chamada para contato"],
                    ].map(([key, label]) => (
                      <Field label={label} key={key}>
                        <input
                          value={p[key] ?? ""}
                          maxLength={key === "cta" ? 150 : 120}
                          onChange={(e) => set(key, e.target.value)}
                        />
                      </Field>
                    ))}
                  </div>
                  <div className="notice">
                    Sugestões de usuário, sem consulta de disponibilidade:{" "}
                    {[
                      c.company.name
                        .normalize("NFD")
                        .replace(/\p{Diacritic}/gu, "")
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, "")
                        .slice(0, 23),
                      c.company.name
                        .normalize("NFD")
                        .replace(/\p{Diacritic}/gu, "")
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, "")
                        .slice(0, 18) + ".oficial",
                    ]
                      .filter(Boolean)
                      .map((name) => (
                        <button
                          className="link-button"
                          type="button"
                          key={name}
                          onClick={() => set("handle", name)}
                        >
                          @{name}{" "}
                        </button>
                      ))}
                  </div>
                  <p>
                    Foto de perfil: use seu símbolo ou uma foto própria, com
                    contraste e legibilidade no recorte circular. Faça o envio
                    diretamente no Instagram.
                  </p>
                  <div className="growth-checklist">
                    {checklist.map((label) => (
                      <label key={label}>
                        <input
                          type="checkbox"
                          checked={p.checklist.includes(label)}
                          onChange={(e) =>
                            set(
                              "checklist",
                              e.target.checked
                                ? [...p.checklist, label]
                                : p.checklist.filter(
                                    (v: string) => v !== label,
                                  ),
                            )
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="notice">
                    Revisão de referências: 08/11/2026. A ajuda oficial exigiu
                    login ou limitou o acesso automatizado; confirme os menus na
                    sua conta. Os menus podem variar por versão e tipo de conta.
                    Consulte as instruções oficiais na sua conta antes de mudar
                    a visibilidade. Não conectamos nem solicitamos a senha do
                    Instagram.{" "}
                    <a
                      href="https://help.instagram.com/502981923235522"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ajuda oficial do Instagram <ExternalLink size={13} />
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <div className="eyebrow">ETAPA 2 · IDENTIDADE VISUAL</div>
                  <h2>Uma direção para a sua marca</h2>
                  <div className="form-grid">
                    <Field label="O que você oferece?">
                      <textarea
                        value={p.offer}
                        maxLength={500}
                        onChange={(e) => set("offer", e.target.value)}
                      />
                    </Field>
                    <Field label="Público que quer alcançar">
                      <textarea
                        value={p.audience}
                        maxLength={500}
                        onChange={(e) => set("audience", e.target.value)}
                      />
                    </Field>
                    <Field label="Objetivo da divulgação">
                      <textarea
                        value={p.objective}
                        maxLength={500}
                        onChange={(e) => set("objective", e.target.value)}
                      />
                    </Field>
                    <Field label="Tom de voz">
                      <select
                        value={p.tone}
                        onChange={(e) => set("tone", e.target.value)}
                      >
                        {[
                          "acolhedor",
                          "direto",
                          "elegante",
                          "descontraído",
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="growth-colors">
                    {p.colors.map((color: string, i: number) => (
                      <Field key={i} label={`Cor ${i + 1}`}>
                        <input
                          type="color"
                          value={color}
                          onChange={(e) =>
                            set(
                              "colors",
                              p.colors.map((v: string, j: number) =>
                                i === j ? e.target.value : v,
                              ),
                            )
                          }
                        />
                      </Field>
                    ))}
                  </div>
                  <div className="form-grid">
                    {[
                      ["style", "Estilo visual"],
                      ["highlights", "Destaques do perfil"],
                      ["catalog", "Catálogo e informações reais dos produtos"],
                      ["photoGuide", "Direção para suas fotos"],
                    ].map(([key, label]) => (
                      <Field key={key} label={label}>
                        <textarea
                          value={p[key] ?? ""}
                          maxLength={
                            key === "style"
                              ? 100
                              : key === "highlights"
                                ? 500
                                : 1000
                          }
                          onChange={(e) => set(key, e.target.value)}
                        />
                      </Field>
                    ))}
                  </div>
                  <p>
                    Comece com três publicações: apresentação do negócio, um
                    produto ou serviço real e como funciona o atendimento.
                    Organize destaques com informações que você consegue manter
                    atualizadas.
                  </p>
                  <p>
                    Use uma família de fontes legível, bom contraste, espaços
                    consistentes e fotos que você tem direito de usar. Verifique
                    as cores também em telas pequenas.
                  </p>
                  <Link className="button secondary" to="/app/artes">
                    Preparar uma arte <Palette size={17} />
                  </Link>
                </>
              )}
              <div className="form-footer">
                <span>Suas decisões ficam privadas nesta empresa.</span>
                <Submit busy={g.a.busy}>Salvar configuração</Submit>
              </div>
            </form>
          ) : tab === 2 ? (
            <section className="panel growth-panel">
              <div className="eyebrow">ETAPA 3 · CONSISTÊNCIA</div>
              <h2>Seu plano de 30 dias</h2>
              <p>
                Sugestões locais para adaptar ao seu negócio. A publicação é
                manual e não há promessa de alcance ou vendas.
              </p>
              {!posts.length ? (
                <button
                  className="button primary"
                  disabled={g.a.busy}
                  onClick={() =>
                    void g.a.run(async () => {
                      await api(g.base + "/plan", "POST", {});
                      await g.load();
                    })
                  }
                >
                  Criar sugestões para 30 dias
                </button>
              ) : (
                <div className="post-grid">
                  {posts.map((doc) => (
                    <button
                      key={doc.id}
                      className="post-card"
                      onClick={() => setEditing(doc)}
                    >
                      <span className="post-day">
                        DIA {doc.data.day} <small>{doc.data.format}</small>
                      </span>
                      <strong>{doc.data.topic}</strong>
                      <p>{doc.data.objective}</p>
                      <span className="tag">
                        {
                          {
                            planned: "Planejado",
                            prepared: "Preparado",
                            published: "Publicado",
                          }[doc.data.status as "planned"]
                        }
                      </span>
                      <span className="link-button">Editar conteúdo →</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="form-footer">
                <span>Salve a configuração antes de criar o plano.</span>
                <a
                  className="button secondary"
                  href={"/api" + g.base + "/export"}
                >
                  Exportar plano e registros <Download size={16} />
                </a>
              </div>
            </section>
          ) : (
            <section className="panel growth-panel">
              <div className="eyebrow">ETAPA 4 · APRENDER E AJUSTAR</div>
              <h2>Acompanhe seus resultados</h2>
              <p>
                Transcreva as métricas disponíveis no Camera, com período e
                observações. Nenhuma conta está conectada automaticamente.
              </p>
              <button
                className="button primary"
                onClick={() => setMetricOpen(true)}
              >
                Registrar métricas
              </button>
              <p>
                Alcance: contas alcançadas no período. Visitas: acessos ao
                perfil. Contatos: mensagens ou conversas informadas. Vendas:
                quantidade confirmada por você; não atribuímos vendas
                automaticamente a uma publicação.
              </p>
              <div className="growth-advice">
                {metricAdvice(metrics.map((d) => d.data)).map((s) => (
                  <p key={s}>{s}</p>
                ))}
              </div>
              {metrics.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Alcance</th>
                        <th>Visualizações</th>
                        <th>Salvos</th>
                        <th>Mensagens</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((d) => (
                        <tr key={d.id}>
                          <td>{d.data.date}</td>
                          <td>{d.data.reach}</td>
                          <td>{d.data.views}</td>
                          <td>{d.data.saves}</td>
                          <td>{d.data.messages}</td>
                          <td>
                            <button
                              className="link-button"
                              onClick={() => setEditing(d)}
                            >
                              Editar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {(editing || metricOpen) && (
            <Modal
              title={
                editing?.kind === "post"
                  ? `Editar dia ${editing.data.day}`
                  : "Métricas manuais"
              }
              onClose={() => {
                setEditing(null);
                setMetricOpen(false);
              }}
            >
              <GrowthDocumentForm
                doc={editing}
                kind={editing?.kind ?? "metric"}
                busy={g.a.busy}
                error={g.a.error}
                onSave={(value) =>
                  g.a.run(async () => {
                    await g.save(
                      editing?.kind ?? "metric",
                      value,
                      editing ?? undefined,
                    );
                    setEditing(null);
                    setMetricOpen(false);
                  })
                }
              />
            </Modal>
          )}
        </>
      )}
    </FormValidation>
  );
}
function GrowthDocumentForm({
  doc,
  kind,
  onSave,
  busy,
  error,
}: {
  doc: Doc | null;
  kind: string;
  onSave: (v: any) => Promise<any>;
  busy: boolean;
  error: string;
}) {
  const [v, setV] = useState<any>(
    doc?.data ?? {
      date: new Date().toISOString().slice(0, 10),
      postId: "",
      reach: 0,
      views: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      messages: 0,
      followers: 0,
      visits: 0,
      sales: 0,
      notes: "",
    },
  );
  const set = (key: string, value: any) => setV({ ...v, [key]: value });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(v);
      }}
    >
      {kind === "post" ? (
        <>
          <Field label="Tema">
            <input
              value={v.topic}
              required
              maxLength={200}
              onChange={(e) => set("topic", e.target.value)}
            />
          </Field>
          <Field label="Formato">
            <select
              value={v.format}
              onChange={(e) => set("format", e.target.value)}
            >
              {["feed", "story", "reel", "carrossel"].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label="Objetivo">
            <input
              value={v.objective}
              maxLength={300}
              onChange={(e) => set("objective", e.target.value)}
            />
          </Field>
          <Field label="Legenda">
            <textarea
              rows={7}
              value={v.caption}
              maxLength={3000}
              onChange={(e) => set("caption", e.target.value)}
            />
          </Field>
          <Field label="Chamada para ação">
            <input
              value={v.cta}
              maxLength={200}
              onChange={(e) => set("cta", e.target.value)}
            />
          </Field>
          <Field label="Roteiro de produção">
            <textarea
              value={v.script ?? ""}
              maxLength={2000}
              onChange={(e) => set("script", e.target.value)}
            />
          </Field>
          <div className="growth-checklist">
            {[
              "Foto ou vídeo autorizado",
              "Informações e preços revisados",
              "Legenda e acessibilidade revisadas",
              "Publicação conferida no Instagram",
            ].map((item) => (
              <label key={item}>
                <input
                  type="checkbox"
                  checked={(v.productionChecklist ?? []).includes(item)}
                  onChange={(e) =>
                    set(
                      "productionChecklist",
                      e.target.checked
                        ? [...(v.productionChecklist ?? []), item]
                        : (v.productionChecklist ?? []).filter(
                            (x: string) => x !== item,
                          ),
                    )
                  }
                />
                {item}
              </label>
            ))}
          </div>
          <Field label="Situação">
            <select
              value={v.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="planned">Planejado</option>
              <option value="prepared">Preparado</option>
              <option value="published">Publicado manualmente</option>
            </select>
          </Field>
          <Field label="Data da publicação (opcional)">
            <input
              type="date"
              value={v.publishedAt}
              onChange={(e) => set("publishedAt", e.target.value)}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Data final do período">
            <input
              type="date"
              required
              value={v.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </Field>
          <div className="form-grid">
            {[
              ["reach", "Alcance"],
              ["views", "Visualizações"],
              ["likes", "Curtidas"],
              ["comments", "Comentários"],
              ["saves", "Salvamentos"],
              ["messages", "Mensagens"],
              ["followers", "Seguidores"],
              ["visits", "Visitas ao perfil"],
              ["sales", "Vendas confirmadas"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  min={0}
                  max={1000000000}
                  required
                  value={v[key]}
                  onChange={(e) => set(key, Number(e.target.value))}
                />
              </Field>
            ))}
          </div>
          <Field label="Período e observações">
            <textarea
              maxLength={1000}
              value={v.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Ex.: 1 a 7 de novembro; mesma publicação; números consultados manualmente."
            />
          </Field>
        </>
      )}
      <ErrorBox message={error} />
      <Submit busy={busy}>Salvar alterações</Submit>
    </form>
  );
}
async function downloadRender(url: string, form: FormData) {
  const res = await fetch("/api" + url, {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });
  if (!res.ok) {
    const e = await res.json();
    throw new ApiError(
      e.error ?? "Não foi possível exportar",
      res.status,
      e.fieldErrors ?? {},
    );
  }
  const blob = await res.blob(),
    href = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = href;
  a.download = res.headers.get("Content-Type")?.includes("jpeg")
    ? "arte-impulsa.jpeg"
    : "arte-impulsa.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
export function ArtsPage({ c }: { c: WorkspaceContext }) {
  const g = useGrowth(c),
    [tab, setTab] = useState("prompt"),
    [photo, setPhoto] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [manual, setManual] = useState(false),
    [selected, setSelected] = useState(""),
    [text, setText] = useState("");
  const [inputs, setInputs] = useState({
    business: c.company.name,
    activity: c.company.profile.profession,
    objective: "Apresentar meu produto ou serviço",
    audience: "",
    product: "",
    headline: "",
    cta: "Converse com a gente",
    tone: "acolhedor",
    colors: "#4145b7, #f5f4ee",
    format: "square",
    photoInstructions: "",
    style: "Fotografia comercial natural",
    scene: "Fundo limpo e coerente com o produto",
    lighting: "Luz suave e uniforme",
    price: "",
    restrictions: "",
  });
  const [design, setDesign] = useState({
    template: "clean",
    headline: "Seu próximo passo começa aqui",
    body: "Conte uma informação real sobre o seu negócio.",
    cta: "Vamos conversar?",
    business: c.company.name,
    background: "#f5f4ee",
    foreground: "#242539",
    accent: "#4145b7",
    format: "square",
  });
  const prompts = g.data.documents.filter((d) => d.kind === "prompt"),
    current = prompts.find((d) => d.id === selected);
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const input = (key: string, value: string) => {
    const next = { ...inputs, [key]: value };
    setInputs(next);
    setText(preparePrompt(next as any));
  };
  const dset = (key: string, value: string) =>
    setDesign({ ...design, [key]: value });
  async function savePrompt() {
    const r = await g.save(
      "prompt",
      { inputs, text, status: "prepared" },
      current,
    );
    setSelected(r.id);
    setManual(false);
    return r;
  }
  return (
    <FormValidation errors={g.a.fieldErrors}>
      <div className="page-heading module-heading">
        <div>
          <span className="eyebrow">SUA MARCA, COM CLAREZA · PREMIUM</span>
          <h1>Estúdio de divulgação</h1>
          <p>
            Prepare uma arte com o ChatGPT ou componha com nossos templates.
          </p>
        </div>
        <Palette size={35} />
      </div>
      {!g.status?.active ? (
        <Gate status={g.status} error={g.a.error} />
      ) : (
        <>
          <div
            className="growth-tabs"
            role="tablist"
            aria-label="Ferramentas de arte"
          >
            {[
              ["prompt", "Preparar arte com ChatGPT"],
              ["editor", "Editor com templates"],
              ["library", "Artes e prompts salvos"],
            ].map(([id, name]) => (
              <button
                role="tab"
                aria-selected={tab === id}
                key={id}
                onClick={() => setTab(id)}
              >
                {name}
              </button>
            ))}
          </div>
          <ErrorBox message={g.a.error} />
          {tab === "prompt" ? (
            <div className="art-layout">
              <form
                className="panel growth-panel"
                onSubmit={g.a.onSubmit(savePrompt)}
              >
                <div className="eyebrow">
                  1 · CONTE O QUE SUA ARTE PRECISA DIZER
                </div>
                <h2>Um bom ponto de partida</h2>
                <div className="form-grid">
                  {[
                    ["business", "Nome do negócio", 120],
                    ["activity", "Atividade", 120],
                    ["objective", "Objetivo da arte", 300],
                    ["audience", "Público", 300],
                    ["headline", "Texto principal", 120],
                    ["cta", "Chamada para ação", 150],
                    ["tone", "Tom de voz", 80],
                    ["colors", "Cores da marca", 100],
                    ["style", "Estilo visual", 200],
                    ["scene", "Cenário", 300],
                    ["lighting", "Iluminação", 200],
                    ["price", "Preço real (opcional)", 100],
                  ].map(([key, label, max]) => (
                    <Field key={key} label={String(label)}>
                      <input
                        name={`inputs.${key}`}
                        value={(inputs as any)[key]}
                        maxLength={Number(max)}
                        required={[
                          "business",
                          "objective",
                          "headline",
                        ].includes(String(key))}
                        onChange={(e) => input(String(key), e.target.value)}
                      />
                    </Field>
                  ))}
                </div>
                <Field label="Produto ou serviço e informações reais">
                  <textarea
                    value={inputs.product}
                    maxLength={500}
                    onChange={(e) => input("product", e.target.value)}
                  />
                </Field>
                <Field label="Formato da arte">
                  <select
                    value={inputs.format}
                    onChange={(e) => input("format", e.target.value)}
                  >
                    <option value="square">Quadrado 1:1</option>
                    <option value="feed">Feed 4:5</option>
                    <option value="story">Story 9:16</option>
                  </select>
                </Field>
                <Field label="Como usar a foto de referência (opcional)">
                  <textarea
                    value={inputs.photoInstructions}
                    maxLength={500}
                    onChange={(e) => input("photoInstructions", e.target.value)}
                  />
                </Field>
                <Field label="Restrições adicionais (opcional)">
                  <textarea
                    value={inputs.restrictions}
                    maxLength={500}
                    onChange={(e) => input("restrictions", e.target.value)}
                  />
                </Field>
                <Submit busy={g.a.busy}>Salvar prompt preparado</Submit>
              </form>
              <section className="panel growth-panel prompt-panel">
                <div className="eyebrow">2 · REVISE E LEVE AO CHATGPT</div>
                <h2>Prepare sua arte com o ChatGPT</h2>
                <p>
                  O prompt usa regras locais. Nenhuma imagem foi gerada aqui.
                </p>
                <Field label="Prompt editável">
                  <textarea
                    rows={17}
                    value={text}
                    maxLength={12000}
                    onChange={(e) => {
                      setText(e.target.value);
                      setManual(false);
                    }}
                  />
                </Field>
                <div className="form-footer">
                  <button
                    className="button primary"
                    disabled={g.a.busy}
                    onClick={() =>
                      void g.a.run(async () => {
                        promptSchema.parse({
                          inputs,
                          text,
                          status: "prepared",
                        });
                        let copied = false;
                        try {
                          await navigator.clipboard.writeText(text);
                          copied = true;
                        } catch {
                          /* Manual selection remains available. */
                        }
                        const saved = await savePrompt();
                        if (!copied) {
                          setManual(true);
                          return;
                        }
                        await g.save(
                          "prompt",
                          { inputs, text, status: "copied" },
                          {
                            id: saved.id,
                            kind: "prompt",
                            version: saved.version,
                            data: saved.data,
                          },
                        );
                        c.notify(
                          "Prompt copiado para a área de transferência.",
                        );
                      })
                    }
                  >
                    <Copy size={16} />
                    Copiar instruções
                  </button>
                  <a
                    className="button secondary"
                    href="https://chatgpt.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    Abrir ChatGPT <ExternalLink size={16} />
                  </a>
                </div>
                {manual && (
                  <div role="status" className="notice">
                    A cópia automática não funcionou. Selecione o texto no campo
                    acima e copie manualmente. O prompt continua como preparado.
                    <button
                      className="link-button"
                      onClick={() => {
                        const el = document.querySelector<HTMLTextAreaElement>(
                          'textarea[aria-label="Prompt editável"]',
                        );
                        el?.focus();
                        el?.select();
                      }}
                    >
                      Selecionar texto
                    </button>
                  </div>
                )}
                <ol className="art-instructions">
                  <li>Copie e revise o prompt.</li>
                  <li>Abra o ChatGPT e cole o texto em uma conversa.</li>
                  <li>
                    Se quiser usar sua foto, anexe-a manualmente nessa conversa.
                  </li>
                  <li>Revise o resultado, baixe e importe a arte abaixo.</li>
                </ol>
                <p className="form-guidance">
                  O site não envia prompt ou foto ao abrir o link. A geração
                  depende dos recursos e limites da sua conta no ChatGPT.{" "}
                  <a
                    href="https://learn.chatgpt.com/docs/image-generation"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Orientação oficial
                  </a>
                </p>
                <LocalPhoto
                  photo={photo}
                  setPhoto={setPhoto}
                  preview={preview}
                />
                {current && (
                  <div className="notice">
                    <Check size={16} /> Etapa:{" "}
                    {
                      {
                        prepared: "Prompt preparado",
                        copied: "Prompt copiado",
                        imported: "Arte importada",
                      }[current.data.status as "prepared"]
                    }
                    . Abrir o ChatGPT não altera essa etapa.
                  </div>
                )}
                <ImportArt
                  prompt={current}
                  base={g.base}
                  busy={g.a.busy}
                  onImport={(f) =>
                    g.a.run(async () => {
                      await api(g.base + "/import", "POST", f);
                      await g.load();
                      c.notify("Arte importada na biblioteca privada.");
                    })
                  }
                />
              </section>
            </div>
          ) : tab === "editor" ? (
            <div className="art-layout">
              <form
                className="panel growth-panel"
                onSubmit={g.a.onSubmit(async (f) => {
                  const body = new FormData();
                  body.set("design", JSON.stringify(design));
                  body.set("format", String(f.get("exportFormat")));
                  if (photo) body.set("photo", photo);
                  await downloadRender(g.base + "/render", body);
                  await g.load();
                  c.notify("Arte exportada e salva na biblioteca privada.");
                })}
              >
                <div className="eyebrow">
                  COMPOSIÇÃO COM TEMPLATE · SEM GERAÇÃO POR IA
                </div>
                <h2>Monte sua arte</h2>
                <Field label="Template">
                  <select
                    value={design.template}
                    onChange={(e) => dset("template", e.target.value)}
                  >
                    <option value="clean">Essencial</option>
                    <option value="bold">Destaque</option>
                    <option value="editorial">Editorial</option>
                  </select>
                </Field>
                {[
                  ["headline", "Título", 100],
                  ["body", "Texto de apoio", 240],
                  ["cta", "Chamada", 70],
                  ["business", "Assinatura da marca", 100],
                ].map(([key, label, max]) => (
                  <Field key={key} label={String(label)}>
                    <textarea
                      name={String(key)}
                      value={(design as any)[key]}
                      maxLength={Number(max)}
                      required={key === "headline"}
                      onChange={(e) => dset(String(key), e.target.value)}
                    />
                  </Field>
                ))}
                <div className="growth-colors">
                  {[
                    ["background", "Fundo"],
                    ["foreground", "Texto"],
                    ["accent", "Destaque"],
                  ].map(([key, label]) => (
                    <Field label={label} key={key}>
                      <input
                        type="color"
                        value={(design as any)[key]}
                        onChange={(e) => dset(key, e.target.value)}
                      />
                    </Field>
                  ))}
                </div>
                <Field label="Proporção">
                  <select
                    value={design.format}
                    onChange={(e) => dset("format", e.target.value)}
                  >
                    <option value="square">Quadrado · 1080 × 1080</option>
                    <option value="story">Story · 1080 × 1920</option>
                  </select>
                </Field>
                <LocalPhoto
                  photo={photo}
                  setPhoto={setPhoto}
                  preview={preview}
                />
                <Field label="Formato de exportação">
                  <select name="exportFormat">
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                  </select>
                </Field>
                <p className="form-guidance">
                  Ao exportar, a foto selecionada será enviada ao servidor para
                  compor o arquivo privado. A foto original não é guardada
                  separadamente. Revise o arquivo final antes de publicar.
                </p>
                <Submit busy={g.a.busy}>
                  Exportar arte <Download size={16} />
                </Submit>
              </form>
              <section className="panel growth-panel">
                <div className="eyebrow">PRÉVIA DA COMPOSIÇÃO</div>
                <div
                  className={`design-preview design-${design.template} ${design.format === "story" ? "design-story" : ""}`}
                  style={
                    {
                      background: design.background,
                      color: design.foreground,
                      "--art-accent": design.accent,
                    } as any
                  }
                >
                  <small>{design.business}</small>
                  {preview && (
                    <img src={preview} alt="Foto escolhida para a composição" />
                  )}
                  <div>
                    <h2>{design.headline}</h2>
                    <p>{design.body}</p>
                  </div>
                  <strong>{design.cta}</strong>
                </div>
                <p className="form-guidance">
                  A prévia ajuda a revisar cores, foto e mensagem. A composição
                  final usa fontes do servidor e pode variar ligeiramente.
                </p>
              </section>
            </div>
          ) : (
            <section className="panel growth-panel">
              <h2>Sua biblioteca privada</h2>
              <p>
                Artes importadas e composições exportadas ficam nesta empresa. O
                acesso exige Premium vigente.
              </p>
              <div className="library-grid">
                {g.data.files.map((f) => (
                  <article key={f.id}>
                    <img
                      src={"/api" + g.base + "/files/" + f.id}
                      alt={f.name}
                    />
                    <a
                      className="button secondary"
                      href={"/api" + g.base + "/files/" + f.id}
                      download={f.name}
                    >
                      Baixar {f.name}
                    </a>
                    <button
                      className="link-button"
                      onClick={() =>
                        void g.a.run(async () => {
                          await api(
                            g.base + "/documents/" + f.document_id,
                            "DELETE",
                          );
                          await g.load();
                        })
                      }
                    >
                      Excluir arte
                    </button>
                  </article>
                ))}
              </div>
              <h3>Prompts salvos</h3>
              {!prompts.length && <p>Nenhum prompt salvo.</p>}
              {prompts.map((d) => (
                <div className="saved-prompt" key={d.id}>
                  <div>
                    <strong>{d.data.inputs.headline}</strong>
                    <p>
                      {
                        {
                          prepared: "Preparado",
                          copied: "Copiado",
                          imported: "Arte importada",
                        }[d.data.status as "prepared"]
                      }
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setInputs(d.data.inputs);
                      setText(d.data.text);
                      setSelected(d.id);
                      setTab("prompt");
                    }}
                  >
                    Abrir prompt
                  </button>
                  <button
                    className="link-button"
                    onClick={() =>
                      void g.a.run(async () => {
                        await api(g.base + "/documents/" + d.id, "DELETE");
                        if (selected === d.id) setSelected("");
                        await g.load();
                      })
                    }
                  >
                    Excluir prompt
                  </button>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </FormValidation>
  );
}
function LocalPhoto({
  photo,
  setPhoto,
  preview,
}: {
  photo: File | null;
  setPhoto: (v: File | null) => void;
  preview: string;
}) {
  const [error, setError] = useState("");
  return (
    <div className="local-photo">
      <Field
        label="Foto própria para referência (opcional)"
        hint="PNG ou JPEG, até 5 MB. Prévia local; escolher o arquivo não envia a foto."
      >
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (
              f &&
              (!["image/png", "image/jpeg"].includes(f.type) ||
                f.size > 5 * 1024 * 1024)
            ) {
              setError("Escolha PNG ou JPEG de até 5 MB.");
              e.target.value = "";
              return;
            }
            setError("");
            setPhoto(f ?? null);
          }}
        />
      </Field>
      <ErrorBox message={error} />
      {preview && (
        <>
          <img src={preview} alt="Prévia local da foto de referência" />
          <button
            type="button"
            className="link-button"
            onClick={() => setPhoto(null)}
          >
            Remover {photo?.name}
          </button>
          <a
            className="button secondary"
            href={preview}
            download={photo?.name ?? "referencia.png"}
          >
            Baixar referência
          </a>
        </>
      )}
    </div>
  );
}
function ImportArt({
  prompt,
  base: _base,
  busy,
  onImport,
}: {
  prompt: Doc | undefined;
  base: string;
  busy: boolean;
  onImport: (f: FormData) => Promise<any>;
}) {
  return (
    <section className="art-import">
      <ImagePlus size={24} />
      <h3>Já terminou no ChatGPT?</h3>
      <p>
        Importe o arquivo final para guardar na sua biblioteca. O envio é uma
        ação manual.
      </p>
      {prompt ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            f.set("promptId", prompt.id);
            f.set("version", String(prompt.version));
            void onImport(f);
          }}
        >
          <Field label="Arte final (PNG ou JPEG, até 5 MB)">
            <input
              type="file"
              name="photo"
              required
              accept="image/png,image/jpeg"
            />
          </Field>
          <Submit busy={busy}>Importar arte</Submit>
        </form>
      ) : (
        <p>Salve um prompt antes de importar a arte correspondente.</p>
      )}
    </section>
  );
}
