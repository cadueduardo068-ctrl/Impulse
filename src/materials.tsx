import { useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import {
  Search,
  ArrowUpRight,
  MapPin,
  ShoppingBag,
  Bookmark,
  Star,
  Plus,
  RefreshCw,
  Check,
  Trash2,
  SlidersHorizontal,
  Package,
  ExternalLink,
} from "lucide-react";
import { api, ApiError } from "./api";
import {
  Field,
  FormValidation,
  Submit,
  ErrorBox,
  Modal,
  Empty,
  Loading,
  useAction,
} from "./ui";
import { AttributeFields, useCatalog } from "./catalog-fields";
import { relevantCategories, attributeIssues } from "../shared/catalog";
import { LocationFields } from "./location";
import { type WorkspaceContext } from "./workspace";
import {
  units,
  materialQuerySchema,
  offerSchema,
  compareOffer,
  type Offer,
} from "../shared/materials";
import { money, parseMoney } from "../shared/domain";
import "./materials.css";
const labels: Record<string, string> = {
  "search-link": "Link de pesquisa · não é anúncio verificado",
  exact: "Correspondência exata",
  similar: "Alternativa incompatível",
  unverified: "Correspondência não confirmada",
  category: "Loja encontrada para a categoria",
};
const dateTime = (v: string) => new Date(v).toLocaleString("pt-BR");
const emptyQuery = (p: any) => ({
  material: "",
  category: "other",
  specs: {},
  description: "",
  quantity: "1",
  unit: "un",
  brand: "",
  minPriceCents: null,
  maxPriceCents: null,
  state: p.state ?? "",
  city: p.city ?? "",
  cityId: p.cityId ?? "",
  cep: p.cep ?? "",
  preference: "both",
  radiusKm: null,
  deadline: "",
});
function External({
  href,
  children,
  className = "button secondary",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
    >
      {children}
      <ArrowUpRight size={15} />
    </a>
  );
}
function validatedQuery(q: any) {
  const values = { ...q };
  for (const [text, key] of [
    ["minText", "minPriceCents"],
    ["maxText", "maxPriceCents"],
  ]) {
    if (values[text] !== undefined) {
      try {
        values[key] = values[text] ? parseMoney(values[text]) : null;
      } catch {
        throw new ApiError("Revise a faixa de preço.", 400, {
          [key]: "Use um valor como 49,90 ou deixe em branco.",
        });
      }
    }
  }
  return materialQuerySchema.parse(values);
}
function parsedMoney(v: FormDataEntryValue | null) {
  return v ? parseMoney(String(v)) : null;
}
export function MaterialsPage({ c }: { c: WorkspaceContext }) {
  const { catalog, error: catalogError } = useCatalog();
  const [purpose, setPurpose] = useState(
    c.company.profile.purchasePurposes?.[0] ?? "",
  );
  const [categoryFilter, setCategoryFilter] = useState(
    c.company.profile.purchaseCategories?.[0] ?? "",
  );
  const base = `/${c.company.id}/materials`;
  const quoteId = new URLSearchParams(useLocation().search).get("orcamento");
  const action = useAction();
  const search = useAction();
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [overview, setOverview] = useState<any>({ quotes: [], orders: [] });
  const [q, setQ] = useState<any>(() => emptyQuery(c.company.profile));
  const [result, setResult] = useState<any>(null);
  const [tab, setTab] = useState("local");
  const [dialog, setDialog] = useState("");
  const [selectedList, setSelectedList] = useState("");
  const [item, setItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [compare, setCompare] = useState<string[]>([]);
  async function load() {
    const [values, state, overview] = await Promise.all([
      api(base),
      api(`${base}/status`),
      api(`/${c.company.id}/overview`),
    ]);
    setData(values);
    setStatus(state);
    setOverview(overview);
    setSelectedList((prev) =>
      prev && values.lists.some((l: any) => l.id === prev)
        ? prev
        : (values.lists[0]?.id ?? ""),
    );
  }
  useEffect(() => {
    void action.run(load);
  }, [base]);
  async function runSearch(refresh = false) {
    await search.run(async () => {
      const query = validatedQuery(q);
      const product = catalog?.products.find((p) => p.id === q.category);
      if (!product) throw new Error("Aguarde o catálogo e escolha o produto.");
      const errors = attributeIssues(product, q.specs);
      if (Object.keys(errors).length)
        throw new ApiError(
          "Revise as características do produto.",
          400,
          errors,
        );
      const found = await api(`${base}/search`, "POST", { query, refresh });
      setResult(found);
      setTab(query.preference === "online" ? "online" : "local");
    });
  }

  const sourceQuote = overview.quotes.find(
    (quote: any) => quote.id === quoteId,
  );
  const materialCounts = new Map<string, number>();
  for (const line of sourceQuote?.data.items ?? []) {
    for (const material of line.materials ?? []) {
      materialCounts.set(
        material.productId,
        (materialCounts.get(material.productId) ?? 0) +
          material.quantity * line.quantity,
      );
    }
  }
  const [quoteProducts, setQuoteProducts] = useState<any[]>([]);
  useEffect(() => {
    if (!quoteId) return;
    let active = true;
    void api(`/${c.company.id}/records/products`)
      .then((products) => {
        if (active) setQuoteProducts(products);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [c.company.id, quoteId]);
  const quoteMaterials = quoteProducts.filter((product) =>
    materialCounts.has(product.id),
  );
  const parsed = materialQuerySchema.safeParse(q);
  const chosenOffers = (data?.offers ?? []).filter((o: any) =>
    compare.includes(o.id),
  );
  const canWrite = ["owner", "admin", "member"].includes(c.company.role);
  return (
    <>
      {dialog === "catalog-request" && (
        <Modal
          onClose={() => setDialog("")}
          title="Solicitar produto ou categoria"
        >
          <form
            onSubmit={action.onSubmit(async (f) => {
              await api("/catalog/request/" + c.company.id, "POST", {
                description: String(f.get("description")),
              });
              setDialog("");
              c.notify(
                "Solicitação registrada. Use pesquisa geral enquanto aguarda.",
              );
            })}
          >
            <Field label="Produto e características necessárias">
              <textarea
                name="description"
                required
                minLength={5}
                maxLength={1000}
              />
            </Field>
            <ErrorBox message={action.error} />
            <Submit busy={action.busy}>Enviar solicitação</Submit>
          </form>
        </Modal>
      )}
      <div className="page-heading module-heading">
        <div>
          <div className="date-label">DA NECESSIDADE À COMPRA</div>
          <h1>Materiais e fornecedores</h1>
          <p>Especifique, encontre caminhos de compra e compare com clareza.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            setDialog("list");
          }}
        >
          <Plus size={16} /> Criar lista de compras
        </button>
      </div>
      <div className="materials-layout">
        <section className="panel materials-form">
          <div className="panel-head">
            <div>
              <h2>O que seu negócio precisa?</h2>
              <p>Campos com * são obrigatórios. Os demais são opcionais.</p>
            </div>
            <SlidersHorizontal size={20} />
          </div>
          <FormValidation errors={search.fieldErrors}>
            <form
              noValidate
              onSubmit={search.onSubmit(async () => {
                const query = validatedQuery(q);
                const found = await api(`${base}/search`, "POST", {
                  query,
                  refresh: false,
                });
                setResult(found);
                setTab(query.preference === "online" ? "online" : "local");
              })}
            >
              <div className="material-section">
                {quoteMaterials.length > 0 && (
                  <Field label="Material do orçamento">
                    <select
                      defaultValue=""
                      onChange={(event) => {
                        const product = quoteMaterials.find(
                          (record) => record.id === event.target.value,
                        );
                        if (!product) return;
                        const details = [
                          product.data.specification,
                          product.data.size,
                          product.data.color,
                        ].filter(Boolean);
                        setQ({
                          ...emptyQuery(c.company.profile),
                          ...q,
                          category: "other",
                          specs: {},
                          material: product.data.name,
                          description: details.join(" · ").slice(0, 1000),
                          quantity: String(materialCounts.get(product.id)),
                          unit: /^[a-z0-9]{1,10}$/.test(product.data.unit)
                            ? product.data.unit
                            : "un",
                        });
                        setPurpose("");
                        setCategoryFilter("");
                        setResult(null);
                      }}
                    >
                      <option value="">Selecione um material</option>
                      {quoteMaterials.map((record) => (
                        <option key={record.id} value={record.id}>
                          {record.data.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="form-step-title">
                  <span>1</span>
                  <h3>Identifique o material</h3>
                </div>
                <Field
                  label="Material ou produto"
                  error={search.fieldErrors.material}
                  hint={
                    "Selecione o produto do catálogo ou use pesquisa geral para um produto não cadastrado."
                  }
                >
                  <input
                    name="material"
                    required
                    value={q.material}
                    list="material-suggestions"
                    onChange={(e) => {
                      const found = catalog?.products.find((p) =>
                        [p.name, ...p.aliases].some(
                          (v) =>
                            v.toLowerCase() === e.target.value.toLowerCase(),
                        ),
                      );
                      setQ({
                        ...q,
                        material: e.target.value,
                        ...(found
                          ? {
                              category: found.id,
                              specs: {},
                              unit: found.units[0],
                            }
                          : {}),
                      });
                    }}
                    placeholder="Ex.: MDF, parafuso, tinta…"
                    maxLength={160}
                  />
                </Field>
                <datalist id="material-suggestions">
                  {(
                    catalog?.products
                      .filter((p) => p.id !== "other")
                      .map((p) => p.name) ?? []
                  ).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </datalist>
                <ErrorBox message={catalogError} />
                {c.company.profile.materialsNotes && (
                  <p className="form-guidance">
                    Suas preferências: {c.company.profile.materialsNotes}
                  </p>
                )}
                <div className="goal-grid">
                  {catalog?.products
                    .filter((p) =>
                      (c.company.profile.purchaseProducts ?? []).includes(p.id),
                    )
                    .map((p) => (
                      <button
                        className="button secondary"
                        type="button"
                        key={p.id}
                        onClick={() =>
                          setQ({
                            ...q,
                            material: p.name,
                            category: p.id,
                            specs: {},
                            unit: p.units[0],
                          })
                        }
                      >
                        {p.name}
                      </button>
                    ))}
                </div>
                <Field label="Finalidade da compra">
                  <select
                    value={purpose}
                    onChange={(e) => {
                      setPurpose(e.target.value);
                      setQ({
                        ...q,
                        category: "other",
                        material: "",
                        specs: {},
                        unit: "un",
                      });
                      setCategoryFilter("");
                    }}
                  >
                    <option value="">Todas as finalidades</option>
                    <option value="resale">Revenda</option>
                    <option value="manufacturing">Fabricação</option>
                    <option value="packaging">Embalagens</option>
                    <option value="equipment">Equipamentos</option>
                  </select>
                </Field>
                <Field label="Categoria de interesse">
                  <select
                    value={categoryFilter}
                    onChange={(e) => {
                      setCategoryFilter(e.target.value);
                      setQ({
                        ...q,
                        category: "other",
                        material: "",
                        specs: {},
                        unit: "un",
                      });
                    }}
                  >
                    <option value="">Todas as categorias sugeridas</option>
                    {catalog &&
                      relevantCategories(
                        catalog,
                        c.company.profile.area,
                        purpose,
                      ).map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Produto do catálogo">
                  <select
                    name="category"
                    value={q.category}
                    onChange={(e) => {
                      const p = catalog?.products.find(
                        (p) => p.id === e.target.value,
                      );
                      setQ({
                        ...q,
                        category: e.target.value,
                        material:
                          p?.id === "other"
                            ? q.material
                            : (p?.name ?? q.material),
                        specs: {},
                        unit: p?.units[0] ?? "un",
                      });
                    }}
                  >
                    <option value="">Selecione…</option>
                    {catalog?.products
                      .filter(
                        (p) =>
                          p.id === q.category ||
                          p.id === "other" ||
                          (categoryFilter
                            ? p.categoryId === categoryFilter
                            : relevantCategories(
                                catalog,
                                c.company.profile.area,
                                purpose,
                              ).some((c) => c.id === p.categoryId)),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setDialog("catalog-request")}
                >
                  Não encontrei o produto · solicitar inclusão
                </button>
                <div className="form-grid">
                  <Field
                    label="Quantidade necessária"
                    error={search.fieldErrors.quantity}
                  >
                    <input
                      name="quantity"
                      required
                      inputMode="decimal"
                      value={q.quantity}
                      onChange={(e) => setQ({ ...q, quantity: e.target.value })}
                    />
                  </Field>
                  <Field label="Unidade">
                    <select
                      name="unit"
                      value={q.unit}
                      onChange={(e) => setQ({ ...q, unit: e.target.value })}
                    >
                      {(
                        catalog?.products.find((p) => p.id === q.category)
                          ?.units ?? units
                      ).map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
              <div className="material-section">
                <div className="form-step-title">
                  <span>2</span>
                  <h3>Defina as especificações</h3>
                </div>
                <p className="form-guidance">
                  Uma característica pode mudar o produto. Não presumimos
                  medidas, cor ou aplicação.
                </p>
                {catalog?.products.find((p) => p.id === q.category) && (
                  <AttributeFields
                    product={catalog.products.find((p) => p.id === q.category)!}
                    specs={q.specs}
                    onChange={(specs) => setQ({ ...q, specs })}
                    errors={search.fieldErrors}
                  />
                )}
                <Field label="Outras especificações (opcional)">
                  <textarea
                    name="description"
                    value={q.description}
                    maxLength={1000}
                    placeholder="Informe material, uso, modelo ou detalhes que diferenciam o produto."
                    onChange={(e) =>
                      setQ({ ...q, description: e.target.value })
                    }
                  />
                </Field>
                <Field label="Marca preferida (opcional)">
                  <input
                    name="brand"
                    maxLength={100}
                    value={q.brand}
                    onChange={(e) => setQ({ ...q, brand: e.target.value })}
                  />
                </Field>
              </div>
              <div className="material-section">
                <div className="form-step-title">
                  <span>3</span>
                  <h3>Escolha como comprar</h3>
                </div>
                <Field label="Preferência">
                  <select
                    name="preference"
                    value={q.preference}
                    onChange={(e) => setQ({ ...q, preference: e.target.value })}
                  >
                    <option value="both">Retirada local e compra online</option>
                    <option value="local">Retirada local</option>
                    <option value="online">Compra online</option>
                  </select>
                </Field>
                <LocationFields
                  required
                  value={q}
                  onChange={setQ}
                  errors={search.fieldErrors}
                />
                <details className="optional-filters">
                  <summary>
                    Preço, prazo e região <SlidersHorizontal size={14} />
                  </summary>
                  <div className="form-grid">
                    <Field
                      label="Preço mínimo (R$, opcional)"
                      error={search.fieldErrors.minPriceCents}
                    >
                      <input
                        name="minPriceCents"
                        inputMode="decimal"
                        value={q.minText ?? ""}
                        onChange={(e) =>
                          setQ({ ...q, minText: e.target.value })
                        }
                        onBlur={(e) => {
                          try {
                            setQ({
                              ...q,
                              minPriceCents: e.target.value
                                ? parseMoney(e.target.value)
                                : null,
                            });
                          } catch {
                            /* validação feita ao enviar */
                          }
                        }}
                      />
                    </Field>
                    <Field
                      label="Preço máximo (R$, opcional)"
                      error={search.fieldErrors.maxPriceCents}
                    >
                      <input
                        name="maxPriceCents"
                        inputMode="decimal"
                        value={q.maxText ?? ""}
                        onChange={(e) =>
                          setQ({ ...q, maxText: e.target.value })
                        }
                        onBlur={(e) => {
                          try {
                            setQ({
                              ...q,
                              maxPriceCents: e.target.value
                                ? parseMoney(e.target.value)
                                : null,
                            });
                          } catch {
                            /* validação feita ao enviar */
                          }
                        }}
                      />
                    </Field>
                  </div>
                  <Field label="Prazo desejado (opcional)">
                    <input
                      type="date"
                      name="deadline"
                      value={q.deadline}
                      onChange={(e) => setQ({ ...q, deadline: e.target.value })}
                    />
                  </Field>
                  <Field
                    label="Raio de distância"
                    hint="A integração atual busca por município e não calcula distância nem trajeto. Amplie a região alterando a cidade."
                  >
                    <select disabled aria-label="Raio indisponível">
                      <option>Indisponível nesta integração</option>
                    </select>
                  </Field>
                </details>
              </div>
              <div className="notice">
                Você está buscando: {q.material || "selecione um produto"} ·{" "}
                {Object.values(q.specs).filter(Boolean).join(" · ")} ·{" "}
                {q.quantity} {q.unit} · {q.city || c.company.profile.city} /{" "}
                {q.state}. Revise ou edite os campos acima antes de pesquisar.
              </div>
              <div className="materials-search-action">
                <ErrorBox message={search.error} />
                <Submit busy={search.busy}>
                  <Search size={17} /> Buscar onde comprar
                </Submit>
                <small>
                  Produto, especificações e município são enviados ao provedor
                  configurado. O CEP não entra nos links externos.
                </small>
              </div>
            </form>
          </FormValidation>
        </section>
        <div className="materials-results">
          <div className="materials-provider">
            <span
              className={`badge ${status?.configured ? "active" : "pending"}`}
            >
              {status?.configured
                ? "Busca integrada configurada"
                : "Busca integrada não configurada"}
            </span>
            <span>Sem compras automáticas</span>
          </div>
          <div
            className="material-tabs"
            role="tablist"
            aria-label="Materiais e fornecedores"
          >
            {[
              ["local", "Lojas próximas", MapPin],
              ["online", "Comprar online", ShoppingBag],
              ["list", "Minha lista", Package],
              ["saved", "Salvos", Bookmark],
            ].map(([id, label, I]) => {
              const Icon = I as typeof Search;
              return (
                <button
                  role="tab"
                  aria-selected={tab === id}
                  key={String(id)}
                  onClick={() => setTab(String(id))}
                >
                  <Icon size={16} />
                  {String(label)}
                </button>
              );
            })}
          </div>
          <ErrorBox message={action.error} />
          {!data && action.busy ? <Loading /> : null}
          {["local", "online"].includes(tab) && (
            <>
              {result && (
                <div className="search-summary">
                  <div>
                    <strong>{result.query.material}</strong>
                    <p>
                      {result.query.quantity} {result.query.unit} ·{" "}
                      {result.city.name}/{result.city.state} ·{" "}
                      {Object.values(result.query.specs).join(" · ") ||
                        "Especificações livres"}
                    </p>
                    <small>
                      {result.queriedAt
                        ? `${result.cached ? "Resultado em cache · consulta original" : "Consulta"} ${dateTime(result.queriedAt)}`
                        : "Nenhuma consulta a anúncios foi realizada."}
                    </small>
                  </div>
                  <div>
                    <button
                      className="icon-button"
                      aria-label="Atualizar resultados"
                      disabled={search.busy}
                      onClick={() => void runSearch(true)}
                    >
                      <RefreshCw size={17} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Salvar busca"
                      onClick={() =>
                        void action.run(async () => {
                          await api(`${base}/searches`, "POST", result.query);
                          await load();
                          c.notify("Busca salva para sua empresa.");
                        })
                      }
                    >
                      <Bookmark size={18} />
                    </button>
                  </div>
                </div>
              )}
              {search.busy ? (
                <div className="panel">
                  <Loading />
                </div>
              ) : !result ? (
                <section className="panel material-start">
                  <div className="material-start-icon">
                    <Search size={28} />
                  </div>
                  <span className="eyebrow">ESCOLHAS MAIS BEM INFORMADAS</span>
                  <h2>
                    O material certo começa
                    <br />
                    com uma boa especificação.
                  </h2>
                  <p>
                    Preencha o formulário para encontrar lojas, abrir pesquisas
                    online e guardar opções para comparar.
                  </p>
                  <div className="material-start-notes">
                    <span>
                      <Check size={15} /> Fontes e datas explícitas
                    </span>
                    <span>
                      <Check size={15} /> Sem preços inventados
                    </span>
                    <span>
                      <Check size={15} /> Listas vinculadas ao trabalho
                    </span>
                  </div>
                </section>
              ) : (
                <>
                  {result.warnings.map((w: string) => (
                    <div key={w} className="notice">
                      {w}
                    </div>
                  ))}
                  <div className="result-explanation">
                    {tab === "local"
                      ? "Lojas encontradas por categoria e município. Trabalhar com a categoria não confirma estoque do produto solicitado."
                      : "Páginas recuperadas pelo provedor. Abra o anúncio para conferir produto, embalagem, preço, frete e disponibilidade."}
                  </div>
                  <div className="material-result-grid">
                    {result.results
                      .filter((r: any) => r.kind === tab)
                      .map((r: any) => (
                        <article className="panel supplier-result" key={r.id}>
                          <div className="result-head">
                            <span className="movement-icon tone-0">
                              {tab === "local" ? (
                                <MapPin size={20} />
                              ) : (
                                <ShoppingBag size={20} />
                              )}
                            </span>
                            <span className="badge">{labels[r.match]}</span>
                            <button
                              className="icon-button"
                              aria-label={`Favoritar ${r.name}`}
                              disabled={!canWrite || !r.storageAllowed}
                              title={
                                !r.storageAllowed
                                  ? "O plano do provedor não autoriza guardar o resultado. Salve a busca."
                                  : "Favoritar"
                              }
                              onClick={() =>
                                void action.run(async () => {
                                  await api(`${base}/favorites`, "POST", {
                                    resultToken: r.resultToken,
                                  });
                                  await load();
                                  c.notify("Favorito salvo.");
                                })
                              }
                            >
                              <Star size={18} />
                            </button>
                          </div>
                          <h3>{r.name}</h3>
                          <p>{r.description}</p>
                          {r.city && <p>{r.city}</p>}
                          {r.address ? (
                            <p className="business-address">
                              <MapPin size={14} />
                              {r.address}
                            </p>
                          ) : r.kind === "local" ? (
                            <small>
                              Endereço comercial não informado pela fonte.
                            </small>
                          ) : null}
                          {r.phone && <p>Contato comercial: {r.phone}</p>}
                          <div className="result-facts">
                            <span>Preço não informado</span>
                            <span>Estoque não confirmado</span>
                            <span>
                              Frete e prazo não confirmados para o CEP
                            </span>
                          </div>
                          <div className="source-line">
                            {r.source} · {dateTime(r.checkedAt)}
                          </div>
                          <div className="result-actions">
                            <External href={r.url}>
                              {tab === "local"
                                ? r.url === r.mapUrl
                                  ? "Abrir no mapa"
                                  : "Abrir site encontrado"
                                : "Ver página encontrada"}
                            </External>
                            {r.mapUrl && r.mapUrl !== r.url && (
                              <External className="text-link" href={r.mapUrl}>
                                Abrir no mapa
                              </External>
                            )}
                          </div>
                        </article>
                      ))}
                  </div>
                  {!result.results.some((r: any) => r.kind === tab) && (
                    <div className="panel">
                      <Empty
                        title={
                          result.configured
                            ? "Nenhum resultado recuperado nesta aba"
                            : "Abra uma pesquisa com seus filtros"
                        }
                        description={
                          result.configured
                            ? "Ajuste a especificação, troque o município ou use uma pesquisa externa."
                            : "Os links abaixo abrem páginas de pesquisa. Nenhum anúncio, preço ou estoque foi verificado pelo Impulsa."
                        }
                      />
                    </div>
                  )}
                  <section className="panel marketplace-links">
                    <h3>Continuar sua pesquisa</h3>
                    <p>
                      Links de pesquisa, não anúncios verificados. O CEP não é
                      incluído.
                    </p>
                    {result.links
                      .filter((l: any) =>
                        tab === "local"
                          ? l.name === "Google Maps"
                          : l.name !== "Google Maps",
                      )
                      .map((l: any) => (
                        <External key={l.name} href={l.url}>
                          Pesquisar{" "}
                          {l.name === "Google Maps"
                            ? "no mapa"
                            : l.name === "Amazon"
                              ? "na Amazon"
                              : "no Mercado Livre"}
                        </External>
                      ))}
                  </section>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setDialog("offer");
                    }}
                  >
                    Registrar oferta conferida manualmente <Plus size={15} />
                  </button>
                </>
              )}
              <section className="panel comparison-panel">
                <div className="panel-head">
                  <div>
                    <h2>Compare o que é compatível</h2>
                    <p>
                      Valores manuais, com fonte e data. Não alteram propostas
                      antigas.
                    </p>
                  </div>
                  <button
                    className="button secondary compact"
                    onClick={() => setDialog("offer")}
                  >
                    Adicionar oferta
                  </button>
                </div>
                {data?.offers.length ? (
                  <>
                    <div className="comparison-options">
                      {data.offers.map((o: any) => (
                        <label key={o.id}>
                          <input
                            type="checkbox"
                            checked={compare.includes(o.id)}
                            onChange={(e) =>
                              setCompare(
                                e.target.checked
                                  ? [...compare, o.id].slice(-4)
                                  : compare.filter((id) => id !== o.id),
                              )
                            }
                          />
                          {o.data.name} ·{" "}
                          {o.data.supplier || "Fornecedor não informado"}
                        </label>
                      ))}
                    </div>
                    {!parsed.success ? (
                      <p className="comparison-hint">
                        Complete a especificação e a localização do formulário
                        para calcular a comparação.
                      </p>
                    ) : chosenOffers.length ? (
                      <div className="table-wrap">
                        <table className="comparison-table">
                          <thead>
                            <tr>
                              <th>Oferta / compatibilidade</th>
                              <th>Embalagem</th>
                              <th>Preço do pacote</th>
                              <th>Unitário equivalente</th>
                              <th>Pacotes necessários</th>
                              <th>Subtotal</th>
                              <th>Total com frete confirmado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {chosenOffers.map((o: any) => {
                              const v = compareOffer(parsed.data, o.data);
                              return (
                                <tr key={o.id}>
                                  <td>
                                    <strong>{o.data.name}</strong>
                                    <small className="table-sub">
                                      {labels[v.match]}
                                    </small>
                                    {v.differences.map((s) => (
                                      <small key={s} className="table-sub">
                                        {s}
                                      </small>
                                    ))}
                                    <small className="table-sub">
                                      {o.data.source} ·{" "}
                                      {dateTime(o.data.checkedAt)}
                                    </small>
                                  </td>
                                  <td>
                                    {o.data.packageQuantity} {o.data.unit}
                                  </td>
                                  <td>
                                    {o.data.priceCents === null
                                      ? "Não informado"
                                      : money(o.data.priceCents)}
                                  </td>
                                  <td>
                                    {v.unitPriceCents === null
                                      ? "—"
                                      : `${money(v.unitPriceCents)} / ${parsed.data.unit}`}
                                  </td>
                                  <td>{v.packages ?? "—"}</td>
                                  <td>
                                    {v.subtotalCents === null ? (
                                      "Não calculável"
                                    ) : (
                                      <>
                                        {money(v.subtotalCents)}
                                        <small className="table-sub">
                                          Subtotal sem frete
                                        </small>
                                      </>
                                    )}
                                  </td>
                                  <td>
                                    {v.totalCents === null
                                      ? "Frete não confirmado"
                                      : money(v.totalCents)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="comparison-hint">
                        Selecione até 4 ofertas. Alternativas incompatíveis
                        ficam identificadas e não recebem total comparável.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="comparison-hint">
                    Depois de conferir uma oferta na loja, registre preço,
                    embalagem e especificações para comparar.
                  </div>
                )}
              </section>
            </>
          )}
          {tab === "list" && (
            <section className="panel purchase-list-panel">
              <div className="panel-head">
                <div>
                  <h2>Compras por projeto ou serviço</h2>
                  <p>
                    Valor pesquisado e valor efetivamente pago são registros
                    distintos.
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label="Criar lista"
                  onClick={() => setDialog("list")}
                >
                  <Plus size={19} />
                </button>
              </div>
              {data?.lists.length ? (
                <>
                  <div className="list-selector">
                    <Field label="Lista de compras">
                      <select
                        value={selectedList}
                        onChange={(e) => setSelectedList(e.target.value)}
                      >
                        {data.lists.map((l: any) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button
                      className="button primary"
                      onClick={() => {
                        setItem({
                          data: {
                            material: q.material,
                            specification: Object.values(q.specs).join(" · "),
                            quantity: q.quantity,
                            unit: q.unit,
                          },
                        });
                        setDialog("item");
                      }}
                    >
                      <Plus size={16} /> Material manual
                    </button>
                  </div>
                  {(() => {
                    const list = data.lists.find(
                      (l: any) => l.id === selectedList,
                    );
                    return (
                      <div className="list-link-summary">
                        {list?.quote_id && (
                          <span>
                            Orçamento #
                            {
                              overview.quotes.find(
                                (p: any) => p.id === list.quote_id,
                              )?.number
                            }
                          </span>
                        )}
                        {list?.order_id && (
                          <span>
                            Ordem:{" "}
                            {
                              overview.orders.find(
                                (p: any) => p.id === list.order_id,
                              )?.snapshot.title
                            }
                          </span>
                        )}
                        {!list?.quote_id && !list?.order_id && (
                          <span>
                            Lista independente · sem vínculo com orçamento ou
                            ordem
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <div className="shopping-items">
                    {data.items
                      .filter((i: any) => i.list_id === selectedList)
                      .map((i: any) => (
                        <article
                          className={`shopping-item ${i.data.purchased ? "purchased" : ""}`}
                          key={i.id}
                        >
                          <span className="shopping-item-icon">
                            {i.data.purchased ? (
                              <Check size={19} />
                            ) : (
                              <Package size={19} />
                            )}
                          </span>
                          <div>
                            <h3>{i.data.material}</h3>
                            <p>
                              {i.data.quantity} {i.data.unit} ·{" "}
                              {i.data.specification ||
                                "Sem especificações adicionais"}
                            </p>
                            <small>
                              {i.data.purchased
                                ? `Comprado · valor pago ${money(i.data.paidCents)}`
                                : "Ainda não comprado"}{" "}
                              {i.data.supplier ? `· ${i.data.supplier}` : ""}
                            </small>
                          </div>
                          <div className="shopping-item-actions">
                            <button
                              className="button secondary compact"
                              onClick={() => {
                                setItem(i);
                                setDialog("item");
                              }}
                            >
                              {i.data.purchased
                                ? "Editar registro"
                                : "Registrar compra"}
                            </button>
                            {i.data.offerUrl && (
                              <External
                                href={i.data.offerUrl}
                                className="icon-button"
                              >
                                <ExternalLink size={17} />
                              </External>
                            )}
                            <button
                              className="icon-button"
                              aria-label={`Excluir ${i.data.material}`}
                              onClick={() =>
                                setDeleteTarget({ kind: "items", id: i.id })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </article>
                      ))}
                    {!data.items.some(
                      (i: any) => i.list_id === selectedList,
                    ) && (
                      <Empty
                        title="O primeiro material começa aqui"
                        description="Adicione o que precisa, mesmo sem uma oferta encontrada."
                        action={() => {
                          setItem(null);
                          setDialog("item");
                        }}
                      />
                    )}
                  </div>
                  <div className="list-paid-total">
                    Efetivamente pago nesta lista{" "}
                    <strong>
                      {money(
                        data.items
                          .filter(
                            (i: any) =>
                              i.list_id === selectedList && i.data.purchased,
                          )
                          .reduce(
                            (s: number, i: any) => s + i.data.paidCents,
                            0,
                          ),
                      )}
                    </strong>
                    <small>
                      Não lança pagamentos ou estoque automaticamente.
                    </small>
                  </div>
                  <button
                    className="link-button delete-list"
                    onClick={() =>
                      setDeleteTarget({ kind: "lists", id: selectedList })
                    }
                  >
                    Excluir esta lista e seus itens
                  </button>
                </>
              ) : (
                <Empty
                  title="Uma lista para cada trabalho"
                  description="Organize compras independentes ou vincule uma lista a um orçamento ou ordem de serviço."
                  action={() => setDialog("list")}
                />
              )}
            </section>
          )}
          {tab === "saved" && (
            <>
              <section className="panel saved-materials">
                <div className="panel-head">
                  <div>
                    <h2>Buscas salvas</h2>
                    <p>
                      Filtros privados da sua empresa. Não são cópias de
                      anúncios.
                    </p>
                  </div>
                </div>
                {data?.history.map((h: any) => (
                  <div className="saved-search" key={h.id}>
                    <Bookmark size={19} />
                    <div>
                      <strong>{h.query.material}</strong>
                      <small>
                        {h.query.quantity} {h.query.unit} ·{" "}
                        {Object.values(h.query.specs).join(" · ")} ·{" "}
                        {dateTime(h.created_at)}
                      </small>
                    </div>
                    <button
                      className="link-button"
                      onClick={() => {
                        setQ({
                          ...h.query,
                          city: "",
                          minText:
                            h.query.minPriceCents === null
                              ? ""
                              : String(h.query.minPriceCents / 100).replace(
                                  ".",
                                  ",",
                                ),
                          maxText:
                            h.query.maxPriceCents === null
                              ? ""
                              : String(h.query.maxPriceCents / 100).replace(
                                  ".",
                                  ",",
                                ),
                        });
                        setTab("local");
                        setResult(null);
                      }}
                    >
                      Usar filtros
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Excluir busca salva"
                      onClick={() =>
                        setDeleteTarget({ kind: "searches", id: h.id })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {!data?.history.length && (
                  <Empty
                    title="Repita boas pesquisas com menos esforço"
                    description="Após buscar, use o botão de marcador para guardar os filtros."
                  />
                )}
              </section>
              <section className="panel saved-materials">
                <div className="panel-head">
                  <div>
                    <h2>Fornecedores e produtos favoritos</h2>
                    <p>
                      Sites cadastrados por você e resultados cuja licença
                      permite armazenamento.
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Adicionar favorito manual"
                    onClick={() => setDialog("favorite")}
                  >
                    <Plus size={18} />
                  </button>
                </div>
                {data?.favorites.map((f: any) => (
                  <div className="saved-search" key={f.id}>
                    <Star size={18} />
                    <div>
                      <strong>{f.data.name}</strong>
                      <small>
                        {f.data.source} ·{" "}
                        {f.data.kind === "local"
                          ? "Fornecedor"
                          : "Produto / página"}
                      </small>
                    </div>
                    <External href={f.data.url} className="link-button">
                      Abrir site
                    </External>
                    <button
                      className="icon-button"
                      aria-label="Excluir favorito"
                      onClick={() =>
                        setDeleteTarget({ kind: "favorites", id: f.id })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {!data?.favorites.length && (
                  <Empty
                    title="Guarde quem pode ajudar na próxima compra"
                    description="Cadastre um site de fornecedor ou produto. Isso não confirma estoque, preço ou entrega."
                    action={() => setDialog("favorite")}
                  />
                )}
              </section>
            </>
          )}
        </div>
      </div>
      {dialog === "list" && (
        <Modal title="Nova lista de compras" onClose={() => setDialog("")}>
          <form
            onSubmit={action.onSubmit(async (f) => {
              const created = await api(`${base}/lists`, "POST", {
                name: f.get("name"),
                quoteId: f.get("quoteId") || null,
                orderId: f.get("orderId") || null,
              });
              await load();
              setSelectedList(created.id);
              setDialog("");
              setTab("list");
              c.notify("Lista de compras criada.");
            })}
          >
            <Field label="Nome do projeto ou lista">
              <input
                name="name"
                required
                minLength={2}
                maxLength={160}
                placeholder="Ex.: Armário da cozinha · materiais"
              />
            </Field>
            <Field label="Vincular orçamento (opcional)">
              <select name="quoteId" defaultValue={sourceQuote?.id ?? ""}>
                <option value="">Sem vínculo</option>
                {overview.quotes.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    #{p.number} · {p.data.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vincular ordem de serviço (opcional)">
              <select name="orderId">
                <option value="">Sem vínculo</option>
                {overview.orders.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.snapshot.title}
                  </option>
                ))}
              </select>
            </Field>
            <p>
              O vínculo não altera valores, materiais ou custos de propostas e
              ordens existentes.
            </p>
            <ErrorBox message={action.error} />
            <Submit busy={action.busy}>Criar lista</Submit>
          </form>
        </Modal>
      )}
      {dialog === "item" && (
        <Modal
          title={
            item?.id
              ? "Registrar ou editar compra"
              : "Adicionar material manualmente"
          }
          onClose={() => setDialog("")}
        >
          <ShoppingItemForm
            value={
              item?.data ?? {
                material: q.material,
                quantity: q.quantity,
                unit: q.unit,
              }
            }
            onSave={async (values) => {
              await api(
                `${base}/lists/${selectedList}/items${item?.id ? "/" + item.id : ""}`,
                item?.id ? "PUT" : "POST",
                { ...values, ...(item?.id ? { version: item.version } : {}) },
              );
              await load();
              setDialog("");
              c.notify("Material salvo na lista.");
            }}
          />
        </Modal>
      )}
      {dialog === "offer" && (
        <Modal
          title="Registrar uma oferta conferida por você"
          onClose={() => setDialog("")}
        >
          <OfferForm
            query={q}
            onSave={async (values) => {
              const r = await api(`${base}/offers`, "POST", values);
              await load();
              setCompare((prev) => [...prev, r.id].slice(-4));
              setDialog("");
              c.notify(
                "Referência de preço registrada, sem alterar propostas.",
              );
            }}
          />
        </Modal>
      )}
      {dialog === "favorite" && (
        <Modal
          title="Favorito informado por você"
          onClose={() => setDialog("")}
        >
          <form
            onSubmit={action.onSubmit(async (f) => {
              await api(`${base}/favorites`, "POST", {
                name: f.get("name"),
                url: f.get("url"),
                kind: f.get("kind"),
              });
              await load();
              setDialog("");
            })}
          >
            <Field label="Nome">
              <input name="name" required minLength={2} />
            </Field>
            <Field label="Site ou link do produto">
              <input name="url" type="url" placeholder="https://" required />
            </Field>
            <Field label="Tipo">
              <select name="kind">
                <option value="local">Fornecedor</option>
                <option value="online">Produto / página</option>
              </select>
            </Field>
            <ErrorBox message={action.error} />
            <Submit busy={action.busy} />
          </form>
        </Modal>
      )}
      {deleteTarget && (
        <Modal
          title="Excluir este registro?"
          onClose={() => setDeleteTarget(null)}
        >
          <p>
            {deleteTarget.kind === "lists"
              ? "A lista e seus itens serão removidos. Propostas, ordens, pagamentos e estoque permanecem preservados."
              : "O registro será removido somente desta empresa."}
          </p>
          <ErrorBox message={action.error} />
          <button
            className="button danger"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await api(
                  `${base}/${deleteTarget.kind}/${deleteTarget.id}`,
                  "DELETE",
                );
                setDeleteTarget(null);
                await load();
              })
            }
          >
            Confirmar exclusão
          </button>
        </Modal>
      )}
    </>
  );
}
function ShoppingItemForm({
  value,
  onSave,
}: {
  value: any;
  onSave: (v: any) => Promise<void>;
}) {
  const a = useAction();
  const [bought, setBought] = useState(value.purchased ?? false);
  return (
    <FormValidation errors={a.fieldErrors}>
      <form
        onSubmit={a.onSubmit(async (f) => {
          await onSave({
            material: f.get("material"),
            specification: f.get("specification"),
            quantity: f.get("quantity"),
            unit: f.get("unit"),
            supplier: f.get("supplier"),
            offerUrl: f.get("offerUrl"),
            purchased: bought,
            paidCents: parsedMoney(f.get("paidCents")),
          });
        })}
      >
        <Field label="Material">
          <input
            name="material"
            required
            minLength={2}
            maxLength={160}
            defaultValue={value.material}
          />
        </Field>
        <Field label="Especificação (opcional)">
          <textarea
            name="specification"
            maxLength={1000}
            defaultValue={value.specification}
          />
        </Field>
        <div className="form-grid">
          <Field label="Quantidade">
            <input
              name="quantity"
              inputMode="decimal"
              required
              defaultValue={value.quantity ?? "1"}
            />
          </Field>
          <Field label="Unidade">
            <select name="unit" defaultValue={value.unit ?? "un"}>
              {units.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Fornecedor (opcional)">
          <input
            name="supplier"
            maxLength={200}
            defaultValue={value.supplier}
          />
        </Field>
        <Field label="Link da oferta (opcional)">
          <input type="url" name="offerUrl" defaultValue={value.offerUrl} />
        </Field>
        <label className="check-label">
          <input
            type="checkbox"
            checked={bought}
            onChange={(e) => setBought(e.target.checked)}
          />{" "}
          Material comprado
        </label>
        <Field
          label="Valor total efetivamente pago (R$)"
          hint={
            bought
              ? "Opcional. Comprar não significa pagar. Informe apenas o que efetivamente pagou."
              : "Opcional até realizar a compra."
          }
        >
          <input
            name="paidCents"
            inputMode="decimal"
            required={false}
            defaultValue={
              value.paidCents === null || value.paidCents === undefined
                ? ""
                : String(value.paidCents / 100).replace(".", ",")
            }
          />
        </Field>
        <ErrorBox message={a.error} />
        <Submit busy={a.busy} />
      </form>
    </FormValidation>
  );
}
function OfferForm({
  query,
  onSave,
}: {
  query: any;
  onSave: (v: Offer) => Promise<void>;
}) {
  const a = useAction();
  const { catalog } = useCatalog();
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<string>(query.category);
  return (
    <FormValidation errors={a.fieldErrors}>
      <form
        onSubmit={a.onSubmit(async (f) => {
          const data = offerSchema.parse({
            name: f.get("name"),
            supplier: f.get("supplier"),
            url: f.get("url"),
            category,
            specs,
            brand: f.get("brand"),
            packageQuantity: f.get("packageQuantity"),
            unit: f.get("unit"),
            priceCents: parsedMoney(f.get("priceCents")),
            freightCents: parsedMoney(f.get("freightCents")),
            freightCep: f.get("freightCep"),
            delivery: f.get("delivery"),
            availability: f.get("availability"),
            evidence: f.get("evidence"),
            source: f.get("source"),
            checkedAt: new Date(String(f.get("checkedAt"))).toISOString(),
          });
          await onSave(data);
        })}
      >
        <p>
          Use somente informações conferidas na fonte. Deixe em branco o que não
          foi informado. Preço por pacote e quantidade da embalagem são
          separados.
        </p>
        <Field label="Nome do produto">
          <input
            name="name"
            required
            minLength={2}
            defaultValue={query.material}
          />
        </Field>
        <div className="form-grid">
          <Field label="Loja / vendedor">
            <input name="supplier" maxLength={200} />
          </Field>
          <Field label="Marca (opcional)">
            <input
              name="brand"
              placeholder={
                query.brand
                  ? `Solicitada: ${query.brand}`
                  : "Marca informada na oferta"
              }
            />
          </Field>
        </div>
        <Field label="Link direto (opcional)">
          <input type="url" name="url" />
        </Field>
        <Field label="Categoria">
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setSpecs({});
            }}
          >
            {(catalog?.products ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          {catalog?.products.find((p) => p.id === category) && (
            <AttributeFields
              product={{
                ...catalog.products.find((p) => p.id === category)!,
                attributes: catalog.products
                  .find((p) => p.id === category)!
                  .attributes.map((a) => ({ ...a, required: false })),
              }}
              specs={specs}
              onChange={setSpecs}
            />
          )}
        </div>
        <div className="form-grid">
          <Field label="Quantidade na embalagem">
            <input
              name="packageQuantity"
              required
              inputMode="decimal"
              defaultValue="1"
            />
          </Field>
          <Field label="Unidade da embalagem">
            <select name="unit" defaultValue={query.unit}>
              {units.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
          <Field label="Preço da embalagem (R$, opcional)">
            <input name="priceCents" inputMode="decimal" />
          </Field>
          <Field label="Frete (R$, só se confirmado)">
            <input name="freightCents" inputMode="decimal" />
          </Field>
          <Field label="CEP usado para confirmar frete">
            <input name="freightCep" maxLength={9} />
          </Field>
          <Field label="Prazo confirmado (opcional)">
            <input name="delivery" maxLength={200} />
          </Field>
        </div>
        <Field label="Disponibilidade">
          <select name="availability">
            <option value="unconfirmed">Estoque não confirmado</option>
            <option value="confirmed">
              Confirmado na fonte · informar evidência
            </option>
          </select>
        </Field>
        <Field label="Condições do preço / confirmação (opcional)">
          <textarea
            name="evidence"
            maxLength={1000}
            placeholder="Ex.: preço à vista; contato da loja confirmou 5 unidades nesta data."
          />
        </Field>
        <div className="form-grid">
          <Field label="Fonte">
            <input
              name="source"
              required
              minLength={2}
              placeholder="Site da loja ou contato comercial"
            />
          </Field>
          <Field label="Data e hora da consulta">
            <input
              name="checkedAt"
              type="datetime-local"
              required
              defaultValue={new Date(
                Date.now() - new Date().getTimezoneOffset() * 60000,
              )
                .toISOString()
                .slice(0, 16)}
            />
          </Field>
        </div>
        <ErrorBox message={a.error} />
        <Submit busy={a.busy}>Guardar referência de preço</Submit>
      </form>
    </FormValidation>
  );
}
