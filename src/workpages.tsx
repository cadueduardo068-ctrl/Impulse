import {
  BusinessModels,
  RecordExtras,
  RecordTools,
  HistoryModal,
  QuoteHistory,
  useRecordData,
  TeamTransfer,
} from "./operations";
import { allowed, canCosts, canPrices, type Module } from "../shared/access";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Plus,
  Search,
  Pencil,
  Archive,
  ArrowUpRight,
  Download,
  Trash2,
  Link as LinkIcon,
  ShieldCheck,
  ArrowRight,
  Copy,
  AlertCircle,
} from "lucide-react";
import QRCode from "qrcode";
import { Calendar } from "./calendar";
import { api, authClient, download } from "./api";
import {
  Field,
  Modal,
  Empty,
  Loading,
  ErrorBox,
  Submit,
  useAction,
} from "./ui";
import {
  money,
  parseMoney,
  recordSchema,
  quoteTotals,
  type Kind,
} from "../shared/domain";
import { type WorkspaceContext } from "./workspace";
import { CompanyProfile } from "./company-profile";
import { FormValidation } from "./ui";
const statuses: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
  doing: "Em andamento",
  done: "Concluído",
  draft: "Rascunho",
  sent: "Enviado",
  approved: "Aprovado",
  rejected: "Recusado",
  adjustment_requested: "Ajustes solicitados",
  expired: "Expirado",
  trial: "Em teste",
  canceled: "Cancelado",
  past_due: "Em atraso",
};
const status = (s: string) => (
  <span className={`badge ${s}`}>{statuses[s] ?? s}</span>
);
const date = (s: string) =>
  s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const today = () => new Date().toISOString().slice(0, 10);
function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading module-heading">
      <div>
        <div className="date-label">SEU NEGÓCIO, CONECTADO</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function useData(path: string) {
  const [data, setData] = useState<any>(null);
  const a = useAction();
  async function load() {
    await a.run(async () => setData(await api(path)));
  }
  useEffect(() => {
    void load();
  }, [path]);
  return { data, load, ...a };
}
function ToolInfo({ children }: { children: React.ReactNode }) {
  return (
    <div className="notice tool-info">
      <AlertCircle size={17} />
      <div>{children}</div>
    </div>
  );
}
function formText(f: FormData, k: string) {
  return String(f.get(k) ?? "");
}
function ShareCatalog({
  c,
  onClose,
}: {
  c: WorkspaceContext;
  onClose: () => void;
}) {
  const base = `/${c.company.id}/catalog-share`;
  const d = useData(base);
  const a = useAction();
  const [url, setUrl] = useState("");
  return (
    <Modal title="Catálogo compartilhável" onClose={onClose}>
      <p>
        Quem receber o link poderá consultar o nome da empresa e os nomes,
        variações e preços dos itens ativos marcados para publicação.
      </p>
      <ErrorBox message={a.error || d.error} />
      {d.data && (
        <>
          <p>
            {d.data.active
              ? "Link ativo. Gerar outro revoga o anterior."
              : "Catálogo privado."}
          </p>
          {url && (
            <Field label="Link do catálogo">
              <input
                value={url}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
            </Field>
          )}
          <div className="hero-buttons">
            <button
              className="button primary"
              disabled={a.busy}
              onClick={() =>
                void a.run(async () => {
                  const updated = await api(base, "POST", { share: true });
                  setUrl(updated.url);
                  await d.load();
                })
              }
            >
              {d.data.active ? "Gerar novo link" : "Gerar link"}
            </button>
            {d.data.active && (
              <button
                className="button secondary"
                disabled={a.busy}
                onClick={() =>
                  void a.run(async () => {
                    await api(base, "POST", { share: false });
                    setUrl("");
                    await d.load();
                  })
                }
              >
                Revogar link do catálogo
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
export function RecordsPage({
  c,
  module: m,
}: {
  c: WorkspaceContext;
  module: { kind: Kind; title: string; description: string; singular: string };
}) {
  const location = useLocation();
  const base = `/${c.company.id}/records/${m.kind}`;
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<string[]>([]),
    [history, setHistory] = useState("");
  const a = useAction();
  const [edit, setEdit] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const d = useRecordData(c, m.kind, query, filter, page);
  const [deleteId, setDeleteId] = useState("");
  const [shareCatalog, setShareCatalog] = useState(false);
  const [importing, setImporting] = useState(false);
  const [team, setTeam] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [linked, setLinked] = useState<any[]>([]);
  const [privateFiles, setPrivateFiles] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  useEffect(() => {
    void api(`/${c.company.id}/team`).then((v) => setTeam(v.members));
    if (allowed(c.company.role, "files"))
      void api(`/${c.company.id}/files`)
        .then(setPrivateFiles)
        .catch(() => {});
    if (m.kind === "purchases")
      void api(`/${c.company.id}/records/suppliers`).then(setSuppliers);
    if (m.kind === "products")
      void api(`/${c.company.id}/records/products`).then(setMaterials);
    if (["appointments", "tasks", "aftersales"].includes(m.kind))
      void api(`/${c.company.id}/records/clients`).then(setLinked);
  }, [base]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (
      params.has("criar") &&
      allowed(c.company.role, m.kind as Module, "write")
    ) {
      setEdit({});
      return;
    }
    const id = params.get("record");
    if (id)
      void a.run(async () => {
        const row = await api(`/${c.company.id}/operations/record/${id}`);
        if (row.kind === m.kind) setEdit(row);
      });
  }, [base, location.key]);
  const writable = allowed(c.company.role, m.kind as Module, "write");
  const rows = (d.data ?? []).filter(
    (r: any) =>
      JSON.stringify(r.data).toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || r.data.status === filter),
  );
  return (
    <>
      {shareCatalog && (
        <ShareCatalog c={c} onClose={() => setShareCatalog(false)} />
      )}
      <Heading title={m.title} description={m.description}>
        {m.kind === "products" &&
          ["owner", "admin"].includes(c.company.role) && (
            <button
              className="button secondary"
              onClick={() => setShareCatalog(true)}
            >
              Compartilhar catálogo
            </button>
          )}
        {m.kind === "products" &&
          allowed(c.company.role, "products", "write") && (
            <button
              className="button secondary"
              onClick={() => c.go("precificacao")}
            >
              Calcular preço
            </button>
          )}
        {m.kind === "clients" && (
          <button className="button secondary" onClick={() => c.go("crm")}>
            Acompanhamento comercial
          </button>
        )}
        {m.kind === "purchases" && (
          <>
            <button
              className="button primary"
              onClick={() => c.go("materiais")}
            >
              Buscar materiais
            </button>
            <button
              className="button secondary"
              onClick={() => c.go("recebimentos")}
            >
              Recebimento e estoque
            </button>
          </>
        )}
        {["clients", "products"].includes(m.kind) &&
          allowed(c.company.role, "imports") && (
            <button
              className="button secondary"
              onClick={() => c.go("importacoes")}
            >
              <Download size={16} /> Importar / exportar
            </button>
          )}
        {writable && (
          <button className="button primary" onClick={() => setEdit({})}>
            <Plus size={17} /> Novo {m.singular}
          </button>
        )}
      </Heading>
      {m.kind === "suppliers" && (
        <ToolInfo>
          Cadastre seus parceiros manualmente ou use Materiais e fornecedores
          para pesquisar. Preços, atendimento e entrega precisam de confirmação
          direta.
        </ToolInfo>
      )}
      {m.kind === "marketing" && (
        <ToolInfo>
          Planeje seu conteúdo com o formulário. A geração com IA e a publicação
          automática estão indisponíveis. Nenhum material é publicado pelo
          Impulsa.
        </ToolInfo>
      )}
      {m.kind === "purchases" && (
        <ToolInfo>
          Registre uma cotação por fornecedor, usando a mesma especificação e
          quantidade para comparar. Informe preço, frete e prazo na descrição.
          Esses valores são informados por você.
        </ToolInfo>
      )}
      {m.kind === "planning" && (
        <ToolInfo>
          Use categorias para separar checklist inicial, metas, investimento
          inicial, equipamentos e despesas fixas previstas. Valores planejados
          não entram no caixa automaticamente.
        </ToolInfo>
      )}
      {m.kind === "appointments" && (
        <Calendar
          records={d.data ?? []}
          onCreate={(due) => setEdit({ data: { due, status: "pending" } })}
          onSelect={setEdit}
        />
      )}
      <section className="panel record-panel">
        <div className="table-toolbar">
          <label className="search-input">
            <Search size={17} />
            <input
              placeholder={`Buscar em ${m.title.toLowerCase()}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar situação"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todas as situações</option>
            {Object.entries(statuses)
              .slice(0, 5)
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
          <span className="small-muted">
            {d.meta?.total ?? rows.length} registros
          </span>
        </div>
        <ErrorBox message={d.error} />
        {!d.data && !d.error ? (
          <Loading />
        ) : !rows.length ? (
          <Empty
            title={
              query
                ? "Nenhum resultado encontrado"
                : `Seu primeiro ${m.singular} começa aqui`
            }
            description={
              query
                ? "Tente outra palavra ou ajuste os filtros."
                : m.description
            }
            action={writable ? () => setEdit({}) : undefined}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    {writable && (
                      <input
                        type="checkbox"
                        aria-label="Selecionar página"
                        checked={
                          rows.length > 0 &&
                          rows.every((r: any) => selected.includes(r.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked ? rows.map((r: any) => r.id) : [],
                          )
                        }
                      />
                    )}{" "}
                    Nome
                  </th>
                  <th>Categoria / contato</th>
                  <th>
                    {m.kind === "products" ? "Preço / custo" : "Prazo / origem"}
                  </th>
                  <th>Situação</th>
                  <th className="align-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <div className="table-name">
                        <span className="record-avatar">
                          {r.data.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <strong>{r.data.name}</strong>
                          <small>
                            {r.data.description?.slice(0, 75) ||
                              "Sem observações"}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {m.kind === "purchases" ? (
                        <>
                          {r.data.specification || "Sem especificação"}
                          <small className="table-sub">
                            {suppliers.find((s) => s.id === r.data.supplierId)
                              ?.data.name || "Fornecedor não vinculado"}{" "}
                            · {r.data.quantity} un ·{" "}
                            {canPrices(c.company.role)
                              ? money(r.data.priceCents)
                              : "Valor restrito ao seu papel"}{" "}
                            / un
                          </small>
                          <small className="table-sub">
                            Frete {money(r.data.freightCents ?? 0)} ·{" "}
                            {r.data.deliveryDays ?? 0} dias · Total{" "}
                            {money(
                              r.data.priceCents * r.data.quantity +
                                (r.data.freightCents ?? 0),
                            )}
                          </small>
                        </>
                      ) : (
                        r.data.category || "—"
                      )}
                      <small className="table-sub">
                        {r.data.email || r.data.phone}
                      </small>
                    </td>
                    <td>
                      {m.kind === "products" ? (
                        <>
                          {money(r.data.priceCents)}
                          {canCosts(c.company.role) && (
                            <small className="table-sub">
                              Custo: {money(r.data.costCents)}
                            </small>
                          )}
                        </>
                      ) : (
                        <>
                          {date(r.data.due)}
                          {r.data.source && (
                            <small className="table-sub">
                              Informado pelo usuário ·{" "}
                              {r.data.confirmed
                                ? "confirmado por você"
                                : "sem confirmação"}
                            </small>
                          )}
                        </>
                      )}
                    </td>
                    <td>{status(r.data.status)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Editar ${r.data.name}`}
                          onClick={() => setEdit(r)}
                        >
                          <Pencil size={16} />
                        </button>
                        {writable && (
                          <button
                            className="icon-button"
                            aria-label={`Arquivar ${r.data.name}`}
                            onClick={() => setDeleteId(r.id)}
                          >
                            <Archive size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <RecordTools
        c={c}
        kind={m.kind}
        meta={d.meta}
        selected={selected}
        onReload={async () => {
          setSelected([]);
          await d.load();
        }}
        page={page}
        setPage={setPage}
        query={query}
        filter={filter}
        onFilter={(q, status) => {
          setQuery(q);
          setFilter(status);
          setPage(1);
        }}
      />
      {history && (
        <HistoryModal c={c} id={history} onClose={() => setHistory("")} />
      )}
      {edit && (
        <Modal
          title={`${edit.id ? "Editar" : "Novo"} ${m.singular}`}
          onClose={() => setEdit(null)}
        >
          <RecordForm
            kind={m.kind}
            profession={c.company.profile.profession}
            value={edit.data ?? {}}
            team={team}
            products={materials}
            clients={linked}
            files={privateFiles}
            suppliers={suppliers}
            readonly={!writable}
            onSave={async (data) => {
              await api(
                edit.id ? `${base}/${edit.id}` : base,
                edit.id ? "PUT" : "POST",
                { ...data, ...(edit.id ? { version: edit.version } : {}) },
              );
              setEdit(null);
              await d.load();
              c.notify("Registro salvo. Mais um passo organizado.");
            }}
          />
        </Modal>
      )}
      {deleteId && (
        <Modal title="Arquivar este registro?" onClose={() => setDeleteId("")}>
          <p>
            O registro sai da lista e fica preservado no histórico. Propostas e
            ordens anteriores mantêm seus dados originais.
          </p>
          <ErrorBox message={a.error} />
          <button
            className="button danger"
            disabled={a.busy}
            onClick={() =>
              void a.run(async () => {
                await api(`${base}/${deleteId}`, "DELETE");
                setDeleteId("");
                await d.load();
                c.notify("Registro arquivado.");
              })
            }
          >
            Confirmar arquivamento
          </button>
        </Modal>
      )}
      {importing && (
        <Modal
          title="Clientes · importar e exportar"
          onClose={() => setImporting(false)}
        >
          <p>
            Formato JSON, até 200 clientes. Cada registro precisa de um nome;
            e-mail, telefone e descrição são opcionais. A importação inteira é
            validada e transacional.
          </p>
          <button
            className="button secondary"
            onClick={() =>
              download(
                "clientes-impulsa.json",
                (d.data ?? []).map((r: any) => r.data),
              )
            }
          >
            Exportar clientes em JSON
          </button>
          <button
            className="button secondary"
            onClick={() =>
              download("modelo-clientes.json", [
                {
                  name: "Nome do cliente",
                  email: "",
                  phone: "",
                  description: "",
                },
              ])
            }
          >
            Baixar modelo
          </button>
          <Field label="Arquivo JSON">
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void a.run(async () => {
                    if (file.size > 500000) throw new Error("Limite de 500 KB");
                    const values = JSON.parse(await file.text());
                    const result = await api(
                      `/${c.company.id}/import/clients`,
                      "POST",
                      values,
                    );
                    c.notify(`${result.count} clientes importados`);
                    setImporting(false);
                    await d.load();
                  });
              }}
            />
          </Field>
          <ErrorBox message={a.error} />
        </Modal>
      )}
    </>
  );
}
function RecordForm({
  kind,
  profession,
  value,
  team,
  products,
  clients,
  files,
  suppliers,
  onSave,
  readonly = false,
}: {
  kind: Kind;
  profession?: string;
  value: any;
  team: any[];
  products: any[];
  clients: any[];
  files: any[];
  suppliers: any[];
  onSave: (v: any) => Promise<void>;
  readonly?: boolean;
}) {
  const a = useAction();
  const [composition, setComposition] = useState<any[]>(value.materials ?? []);
  const [checklist, setChecklist] = useState<any[]>(value.checklist ?? []);
  const [attachments, setAttachments] = useState<string[]>(
    value.attachments ?? [],
  );
  const isProduct = kind === "products";
  const isContact = ["clients", "suppliers"].includes(kind);
  return (
    <FormValidation errors={a.fieldErrors}>
      <form
        onSubmit={a.onSubmit(async (f) => {
          const data = {
            ...value,
            name: formText(f, "name"),
            description: formText(f, "description"),
            status: formText(f, "status"),
            category: formText(f, "category"),
            email: formText(f, "email"),
            phone: formText(f, "phone"),
            due: formText(f, "due"),
            source: formText(f, "source"),
            confirmed: f.get("confirmed") === "on",
            assignee: formText(f, "assignee"),
            clientId: formText(f, "clientId"),
            materials: composition,
            checklist,
            attachments,
            allowDuplicate: f.get("allowDuplicate") === "on",
            contactType:
              formText(f, "contactType") || value.contactType || "person",
            communication:
              formText(f, "communication") || value.communication || "none",
            tags: f.has("tagsText")
              ? formText(f, "tagsText")
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
              : (value.tags ?? []),
            nextAction: formText(f, "nextAction"),
            productType:
              formText(f, "productType") || value.productType || "product",
            parentProductId: formText(f, "parentProductId"),
            sku: formText(f, "sku"),
            size: formText(f, "size"),
            color: formText(f, "color"),
            trackStock: f.get("trackStock") === "on",
            publicCatalog: f.get("publicCatalog") === "on",
            costKnown: f.get("costKnown") === "on",
            bookingStatus:
              formText(f, "bookingStatus") ||
              value.bookingStatus ||
              "scheduled",
            priority: formText(f, "priority") || value.priority || "normal",
            warrantyConditions: formText(f, "warrantyConditions"),
            warrantyUntil: formText(f, "warrantyUntil"),
            startTime: formText(f, "startTime"),
            endTime: formText(f, "endTime"),
            stage: formText(f, "stage") || "lead",
            specification: formText(f, "specification"),
            supplierId: formText(f, "supplierId"),
            brandTone: formText(f, "brandTone"),
            channel: formText(f, "channel"),
            audience: formText(f, "audience"),
            cta: formText(f, "cta"),
          };
          for (const key of ["priceCents", "costCents", "freightCents"])
            if (f.has(key)) data[key] = parseMoney(formText(f, key) || "0");
          for (const key of [
            "quantity",
            "minimum",
            "durationMinutes",
            "deliveryDays",
          ])
            if (f.has(key)) data[key] = Number(f.get(key));
          for (const key of ["unit", "variants", "expires"])
            if (f.has(key)) data[key] = formText(f, key);
          await onSave(recordSchema.parse(data));
        })}
      >
        <fieldset disabled={readonly}>
          <RecordExtras
            kind={kind}
            value={value}
            team={team}
            products={products}
          />
          <div className="form-helper">
            Comece pela identificação. Campos com * são obrigatórios; os demais
            são opcionais. Detalhes e anexos podem ser adicionados depois.{" "}
            {profession && `Atividade: ${profession}.`}
          </div>
          <Field
            label={
              kind === "marketing" ? "Título / objetivo do conteúdo" : "Nome"
            }
          >
            <input
              name="name"
              required
              maxLength={160}
              defaultValue={value.name}
              placeholder={
                kind === "products" && /marcen/i.test(profession ?? "")
                  ? "Ex.: Armário planejado ou chapa de MDF"
                  : kind === "appointments"
                    ? "Ex.: Visita para orçamento"
                    : undefined
              }
            />
          </Field>
          <div className="form-grid">
            <Field label="Categoria">
              <input
                name="category"
                maxLength={80}
                defaultValue={value.category}
                placeholder={
                  kind === "planning" ? "Ex.: Investimento inicial" : ""
                }
              />
            </Field>
            <Field label="Situação">
              <select
                name="status"
                defaultValue={
                  value.status ??
                  (isContact || isProduct ? "active" : "pending")
                }
              >
                {Object.entries(statuses)
                  .slice(0, 5)
                  .map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </Field>
            {isContact && (
              <>
                <Field label="E-mail (opcional)">
                  <input type="email" name="email" defaultValue={value.email} />
                </Field>
                <Field label="Telefone (opcional)">
                  <input
                    name="phone"
                    maxLength={30}
                    defaultValue={value.phone}
                  />
                </Field>
              </>
            )}
            {isProduct && (
              <>
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="publicCatalog"
                    defaultChecked={value.publicCatalog}
                  />{" "}
                  Incluir no catálogo compartilhável
                </label>
                <Field label="Preço (R$)">
                  <input
                    name="priceCents"
                    inputMode="decimal"
                    required
                    defaultValue={String((value.priceCents ?? 0) / 100).replace(
                      ".",
                      ",",
                    )}
                  />
                </Field>
                <Field label="Custo (R$)">
                  <input
                    name="costCents"
                    inputMode="decimal"
                    required
                    defaultValue={String((value.costCents ?? 0) / 100).replace(
                      ".",
                      ",",
                    )}
                  />
                </Field>
                <Field label="Unidade">
                  <input name="unit" defaultValue={value.unit ?? "un"} />
                </Field>
                <Field label="Estoque mínimo">
                  <input
                    name="minimum"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={value.minimum ?? 0}
                  />
                </Field>
                <Field label="Duração (minutos)">
                  <input
                    name="durationMinutes"
                    type="number"
                    min="0"
                    defaultValue={value.durationMinutes ?? 0}
                  />
                </Field>
                <Field label="Variações">
                  <input
                    name="variants"
                    defaultValue={value.variants}
                    placeholder="Ex.: tamanho, cor, acabamento"
                  />
                </Field>
              </>
            )}
            {!isContact && !isProduct && (
              <>
                <Field label="Data / prazo">
                  <input name="due" type="date" defaultValue={value.due} />
                </Field>
                <Field label="Responsável">
                  <select name="assignee" defaultValue={value.assignee ?? ""}>
                    <option value="">Sem responsável</option>
                    {team.map((t) => (
                      <option value={t.user_id} key={t.user_id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {kind === "clients" && (
              <Field label="Etapa da oportunidade">
                <select name="stage" defaultValue={value.stage ?? "lead"}>
                  {[
                    ["lead", "Novo contato"],
                    ["contact", "Em conversa"],
                    ["proposal", "Proposta enviada"],
                    ["won", "Cliente conquistado"],
                    ["lost", "Sem avanço"],
                  ].map(([v, l]) => (
                    <option value={v} key={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {kind === "appointments" && (
              <>
                <Field label="Horário inicial">
                  <input
                    type="time"
                    name="startTime"
                    required
                    defaultValue={value.startTime}
                  />
                </Field>
                <Field label="Horário final">
                  <input
                    type="time"
                    name="endTime"
                    defaultValue={value.endTime}
                  />
                </Field>
              </>
            )}
            {kind === "purchases" && (
              <>
                <Field label="Fornecedor">
                  <select
                    name="supplierId"
                    defaultValue={value.supplierId ?? ""}
                  >
                    <option value="">Sem vínculo</option>
                    {suppliers.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.data.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Especificação comparável">
                  <input
                    name="specification"
                    maxLength={300}
                    defaultValue={value.specification}
                    placeholder="Ex.: tinta branca 18 L, mesma marca"
                  />
                </Field>
                <Field label="Frete (R$)">
                  <input
                    name="freightCents"
                    defaultValue={String(
                      (value.freightCents ?? 0) / 100,
                    ).replace(".", ",")}
                  />
                </Field>
                <Field label="Prazo de entrega (dias)">
                  <input
                    type="number"
                    min="0"
                    max="3650"
                    name="deliveryDays"
                    defaultValue={value.deliveryDays ?? 0}
                  />
                </Field>
              </>
            )}
            {kind === "marketing" && (
              <>
                <Field label="Canal">
                  <select
                    name="channel"
                    defaultValue={value.channel ?? "instagram"}
                  >
                    <option value="instagram">Instagram</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">E-mail</option>
                    <option value="site">Site</option>
                  </select>
                </Field>
                <Field label="Público">
                  <input
                    name="audience"
                    maxLength={300}
                    defaultValue={value.audience}
                  />
                </Field>
                <Field label="Tom da marca">
                  <input
                    name="brandTone"
                    maxLength={80}
                    defaultValue={value.brandTone}
                    placeholder="Ex.: acolhedor e profissional"
                  />
                </Field>
                <Field label="Chamada para ação">
                  <input name="cta" maxLength={300} defaultValue={value.cta} />
                </Field>
              </>
            )}
            {clients.length > 0 && (
              <Field label="Cliente vinculado">
                <select name="clientId" defaultValue={value.clientId ?? ""}>
                  <option value="">Sem vínculo</option>
                  {clients.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.data.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {["purchases", "planning"].includes(kind) && (
              <>
                <Field label="Valor unitário / previsto (R$)">
                  <input
                    name="priceCents"
                    defaultValue={String((value.priceCents ?? 0) / 100).replace(
                      ".",
                      ",",
                    )}
                  />
                </Field>
                <Field label="Quantidade">
                  <input
                    name="quantity"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={value.quantity ?? 1}
                  />
                </Field>
              </>
            )}
          </div>
          {isProduct && (
            <div className="composition">
              <h3>Composição de materiais</h3>
              <p>
                Na proposta, estes materiais serão preservados. A ordem reserva
                e a conclusão consome.
              </p>
              {composition.map((m, i) => (
                <div className="inline-form" key={i}>
                  <select
                    aria-label="Material"
                    value={m.productId}
                    onChange={(e) =>
                      setComposition(
                        composition.map((v, n) =>
                          n === i ? { ...v, productId: e.target.value } : v,
                        ),
                      )
                    }
                  >
                    <option value="">Selecione</option>
                    {products.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.data.name}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Quantidade de material"
                    type="number"
                    min="1"
                    value={m.quantity}
                    onChange={(e) =>
                      setComposition(
                        composition.map((v, n) =>
                          n === i
                            ? { ...v, quantity: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Remover material"
                    onClick={() =>
                      setComposition(composition.filter((_, n) => n !== i))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  setComposition([
                    ...composition,
                    { productId: "", quantity: 1 },
                  ])
                }
              >
                <Plus size={15} /> Adicionar material
              </button>
            </div>
          )}
          <Field
            label={
              kind === "marketing"
                ? "Briefing: canal, produto, público, tom, chamada para ação e roteiro"
                : "Descrição / histórico / observações"
            }
          >
            <textarea
              name="description"
              rows={4}
              maxLength={5000}
              defaultValue={value.description}
            />
          </Field>
          {["suppliers", "purchases"].includes(kind) && (
            <>
              <Field label="Fonte / link e data da consulta">
                <input
                  name="source"
                  maxLength={500}
                  defaultValue={value.source}
                  placeholder="Cole a fonte e registre a data"
                />
              </Field>
              <label className="check-label">
                <input
                  name="confirmed"
                  type="checkbox"
                  defaultChecked={value.confirmed}
                />{" "}
                Confirmei estes dados diretamente com o fornecedor
              </label>
            </>
          )}
          {["tasks", "planning", "aftersales"].includes(kind) && (
            <div className="composition">
              <h3>Checklist</h3>
              {checklist.map((v, i) => (
                <div className="inline-form" key={i}>
                  <input
                    type="checkbox"
                    aria-label={`Concluir item ${i + 1}`}
                    checked={v.done}
                    onChange={(e) =>
                      setChecklist(
                        checklist.map((x, n) =>
                          n === i ? { ...x, done: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  <input
                    className="checklist-text"
                    aria-label={`Descrição do item ${i + 1}`}
                    required
                    maxLength={300}
                    value={v.text}
                    onChange={(e) =>
                      setChecklist(
                        checklist.map((x, n) =>
                          n === i ? { ...x, text: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Remover item do checklist"
                    onClick={() =>
                      setChecklist(checklist.filter((_, n) => n !== i))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  setChecklist([...checklist, { text: "", done: false }])
                }
              >
                Adicionar etapa
              </button>
            </div>
          )}
          {files.length > 0 && (
            <Field
              label={
                isProduct
                  ? "Imagens e arquivos privados vinculados"
                  : "Anexos privados vinculados"
              }
            >
              <select
                multiple
                size={Math.min(4, files.length)}
                value={attachments}
                onChange={(e) =>
                  setAttachments(
                    Array.from(e.target.selectedOptions).map((o) => o.value),
                  )
                }
              >
                {files.map((f) => (
                  <option value={f.id} key={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <ErrorBox message={a.error} />
          {!readonly && (
            <div className="form-footer">
              <span className="small-muted">
                Salvo somente com conexão ao servidor.
              </span>
              <Submit busy={a.busy} />
            </div>
          )}
        </fieldset>
      </form>
    </FormValidation>
  );
}
export function QuotesPage({ c }: { c: WorkspaceContext }) {
  const d = useData(`/${c.company.id}/overview`);
  const a = useAction();
  const [edit, setEdit] = useState<any>(null);
  const [client, setClient] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [share, setShare] = useState("");
  const [approval, setApproval] = useState("");
  const [quoteHistory, setQuoteHistory] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    void api(`/${c.company.id}/records/clients`).then(setClient);
    void api(`/${c.company.id}/records/products`).then(setProducts);
  }, [c.company.id]);
  const location = useLocation();
  useEffect(() => {
    if (
      new URLSearchParams(location.search).has("criar") &&
      allowed(c.company.role, "quotes", "write")
    )
      setEdit({});
  }, [location.key, c.company.role]);
  async function action(id: string, act: string, extra = {}) {
    const r = await api(`/${c.company.id}/quotes/${id}/action`, "POST", {
      action: act,
      ...extra,
    });
    if (r.url) setShare(r.url);
    else c.notify("Proposta atualizada.");
    await d.load();
  }
  const rows = (d.data?.quotes ?? []).filter(
    (q: any) =>
      q.data.title.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || q.status === filter),
  );
  return (
    <>
      {new URLSearchParams(location.search).get("record") && (
        <button className="link-button" onClick={() => c.go("propostas")}>
          Ver todos os orçamentos
        </button>
      )}
      <Heading
        title="Orçamentos e propostas"
        description="Do primeiro contato à aprovação, cada detalhe preservado."
      >
        {allowed(c.company.role, "quotes", "write") && (
          <button className="button primary" onClick={() => setEdit({})}>
            <Plus size={17} /> Novo orçamento
          </button>
        )}
      </Heading>
      <ErrorBox message={a.error} />
      <section className="panel record-panel">
        <div className="table-toolbar">
          <label className="search-input">
            <Search size={17} />
            <input
              placeholder="Buscar proposta"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Situação da proposta"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todas as situações</option>
            {[
              "draft",
              "sent",
              "adjustment_requested",
              "approved",
              "rejected",
              "expired",
            ].map((v) => (
              <option key={v} value={v}>
                {statuses[v]}
              </option>
            ))}
          </select>
        </div>
        <ErrorBox message={d.error} />
        {!d.data && !d.error ? (
          <Loading />
        ) : !rows.length ? (
          <Empty
            title="A próxima oportunidade começa com uma proposta"
            description="Cadastre um cliente, escolha seus itens e monte um orçamento com condições claras."
            action={() => setEdit({})}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proposta / cliente</th>
                  <th>Validade</th>
                  <th>Total</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter(
                    (q: any) =>
                      !new URLSearchParams(location.search).get("record") ||
                      new URLSearchParams(location.search).get("record") ===
                        q.id,
                  )
                  .map((q: any) => (
                    <tr key={q.id}>
                      <td>
                        <strong>
                          #{String(q.number).padStart(4, "0")} · {q.data.title}
                        </strong>
                        <small className="table-sub">
                          {q.data.client.name}
                        </small>
                      </td>
                      <td>{date(q.data.validUntil)}</td>
                      <td>{money(Number(q.total_cents))}</td>
                      <td>
                        {status(q.status)}
                        {q.adjustment_message && (
                          <details>
                            <summary>Ler pedido de ajuste</summary>
                            <p>
                              <strong>{q.adjustment_contact}</strong> ·{" "}
                              {date(q.adjustment_requested_at)}
                            </p>
                            <p>{q.adjustment_message}</p>
                          </details>
                        )}
                      </td>
                      <td>
                        <div className="quote-actions">
                          <button
                            className="link-button"
                            onClick={() => setQuoteHistory(q.id)}
                          >
                            Versões
                          </button>
                          {allowed(c.company.role, "purchases") &&
                            q.data.items.some(
                              (item: any) => item.materials?.length,
                            ) && (
                              <button
                                className="link-button"
                                onClick={() =>
                                  c.go(
                                    "materiais?orcamento=" +
                                      encodeURIComponent(q.id),
                                  )
                                }
                              >
                                Buscar materiais
                              </button>
                            )}
                          {q.status !== "draft" &&
                            allowed(c.company.role, "quotes", "write") && (
                              <button
                                className="link-button"
                                onClick={() =>
                                  void a.run(async () => {
                                    await api(
                                      `/${c.company.id}/operations/quotes/${q.id}/revision`,
                                      "POST",
                                      {},
                                    );
                                    await d.load();
                                    c.notify(
                                      "Nova revisão criada como rascunho. A versão anterior permanece preservada.",
                                    );
                                  })
                                }
                              >
                                Criar revisão
                              </button>
                            )}
                          <a
                            className="icon-button"
                            href={`/api/${c.company.id}/quotes/${q.id}/pdf`}
                            aria-label="Baixar PDF"
                          >
                            <Download size={16} />
                          </a>
                          {allowed(c.company.role, "quotes", "write") &&
                            q.status === "draft" && (
                              <>
                                <button
                                  onClick={() => setEdit(q)}
                                  className="link-button"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() =>
                                    void a.run(() => action(q.id, "send"))
                                  }
                                  className="link-button"
                                >
                                  Marcar enviado
                                </button>
                              </>
                            )}
                          {allowed(c.company.role, "quotes", "write") &&
                            q.status === "sent" && (
                              <>
                                <button
                                  onClick={() => setApproval(q.id)}
                                  className="link-button"
                                >
                                  Aprovar
                                </button>
                                <button
                                  onClick={() =>
                                    void a.run(() => action(q.id, "reject"))
                                  }
                                  className="link-button"
                                >
                                  Recusar
                                </button>
                              </>
                            )}
                          {allowed(c.company.role, "quotes", "write") &&
                            [
                              "sent",
                              "approved",
                              "adjustment_requested",
                            ].includes(q.status) && (
                              <>
                                {q.status !== "adjustment_requested" && (
                                  <button
                                    onClick={() =>
                                      void a.run(() => action(q.id, "share"))
                                    }
                                    className="icon-button"
                                    aria-label="Criar link de compartilhamento"
                                  >
                                    <LinkIcon size={16} />
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    void a.run(() => action(q.id, "revoke"))
                                  }
                                  className="link-button"
                                >
                                  Revogar link
                                </button>
                              </>
                            )}
                          {allowed(c.company.role, "quotes", "write") &&
                            q.status === "approved" && (
                              <button
                                className="button secondary compact"
                                onClick={() =>
                                  void a.run(() => action(q.id, "convert"))
                                }
                              >
                                Gerar ordem <ArrowRight size={14} />
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ToolInfo>
        Os preços e materiais são copiados para a proposta. Alterações
        posteriores no catálogo não mudam negociações antigas. Margem = (receita
        − custo) ÷ receita; markup = (receita − custo) ÷ custo.
      </ToolInfo>
      {quoteHistory && (
        <QuoteHistory
          c={c}
          id={quoteHistory}
          onClose={() => setQuoteHistory("")}
        />
      )}
      {edit && (
        <Modal
          title={edit.id ? "Editar rascunho" : "Novo orçamento"}
          onClose={() => setEdit(null)}
        >
          <QuoteForm
            showCosts={canCosts(c.company.role)}
            clients={client}
            products={products}
            value={edit.data}
            onSave={async (v) => {
              await api(
                `/${c.company.id}/quotes${edit.id ? `/${edit.id}` : ""}`,
                edit.id ? "PUT" : "POST",
                { ...v, ...(edit.id ? { version: edit.version } : {}) },
              );
              setEdit(null);
              await d.load();
              c.notify("Orçamento salvo como rascunho.");
            }}
          />
        </Modal>
      )}
      {share && (
        <Modal title="Link controlado da proposta" onClose={() => setShare("")}>
          <p>
            Expira em até 7 dias ou ao fim da validade da proposta. Quem tiver o
            link poderá visualizar e registrar a aprovação. Compartilhe com
            cuidado.
          </p>
          <Field label="Link">
            <input readOnly value={share} />
          </Field>
          <button
            className="button primary"
            onClick={() =>
              void navigator.clipboard
                .writeText(share)
                .then(() => c.notify("Link copiado."))
            }
          >
            <Copy size={16} /> Copiar link
          </button>
        </Modal>
      )}
      {approval && (
        <Modal title="Registrar aprovação" onClose={() => setApproval("")}>
          <form
            onSubmit={a.onSubmit(async (f) => {
              await action(approval, "approve", {
                approvalName: String(f.get("name")),
              });
              setApproval("");
            })}
          >
            <Field label="Quem aprovou?">
              <input name="name" required minLength={2} />
            </Field>
            <p>
              Use somente quando o cliente tiver manifestado sua aprovação. Este
              registro não equivale a assinatura digital certificada.
            </p>
            <label className="check-label">
              <input type="checkbox" required /> Confirmo que recebi a
              aprovação.
            </label>
            <Submit busy={a.busy}>Registrar aprovação</Submit>
          </form>
        </Modal>
      )}
    </>
  );
}
function QuoteForm({
  showCosts = true,
  clients,
  products,
  value,
  onSave,
}: {
  showCosts?: boolean;
  clients: any[];
  products: any[];
  value?: any;
  onSave: (v: any) => Promise<void>;
}) {
  const a = useAction();
  const [items, setItems] = useState<any[]>(
    value?.items ?? [
      {
        productId: "",
        name: "",
        quantity: 1,
        priceCents: 0,
        costCents: 0,
        materials: [],
      },
    ],
  );
  const [charges, setCharges] = useState({
    laborCents: value?.laborCents ?? 0,
    travelCents: value?.travelCents ?? 0,
    discountCents: value?.discountCents ?? 0,
  });
  const setItem = (i: number, k: string, v: any) =>
    setItems(items.map((item, n) => (n === i ? { ...item, [k]: v } : item)));
  let totals: any = {};
  try {
    totals = quoteTotals({ ...charges, items } as any);
  } catch {
    /* A validação completa é feita no servidor. */
  }
  return (
    <form
      onSubmit={a.onSubmit((f) =>
        onSave({
          ...charges,
          deliveryDue: f.get("deliveryDue"),
          paymentDue: f.get("paymentDue"),
          items,
          clientId: f.get("clientId"),
          title: f.get("title"),
          validUntil: f.get("validUntil"),
          conditions: f.get("conditions"),
          notes: f.get("notes"),
        }),
      )}
    >
      <Field label="Título">
        <input
          name="title"
          required
          minLength={2}
          defaultValue={value?.title}
        />
      </Field>
      <div className="form-grid">
        <Field label="Cliente">
          <select name="clientId" required defaultValue={value?.clientId ?? ""}>
            <option value="">Selecione um cliente</option>
            {clients.map((cl) => (
              <option value={cl.id} key={cl.id}>
                {cl.data.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Validade">
          <input
            name="validUntil"
            type="date"
            required
            defaultValue={
              value?.validUntil ??
              new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
            }
          />
        </Field>
      </div>
      {!clients.length && (
        <ToolInfo>
          Cadastre pelo menos um cliente no módulo Clientes antes de criar a
          proposta.
        </ToolInfo>
      )}
      <h3>Itens da proposta</h3>
      {items.map((item, i) => (
        <div className="quote-item" key={i}>
          <div className="inline-form">
            <select
              aria-label="Selecionar produto ou serviço"
              value={item.productId}
              onChange={(e) => {
                const p = products.find((p) => p.id === e.target.value);
                if (p)
                  setItems(
                    items.map((v, n) =>
                      n === i
                        ? {
                            productId: p.id,
                            name: p.data.name,
                            quantity: 1,
                            priceCents: p.data.priceCents,
                            costCents: p.data.costCents ?? 0,
                            costKnown: p.data.costKnown ?? false,
                            stockProduct: p.data.trackStock ?? false,
                            materials: p.data.materials,
                          }
                        : v,
                    ),
                  );
                else setItem(i, "productId", "");
              }}
            >
              <option value="">Item personalizado</option>
              {products
                .filter((p) => p.data.status !== "inactive")
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.data.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="icon-button"
              aria-label="Remover item"
              onClick={() => setItems(items.filter((_, n) => n !== i))}
            >
              <Trash2 size={17} />
            </button>
          </div>
          <Field label="Descrição do item">
            <input
              required
              value={item.name}
              onChange={(e) => setItem(i, "name", e.target.value)}
            />
          </Field>
          <div className="form-grid three">
            <Field label="Quantidade">
              <input
                required
                type="number"
                min="1"
                step="1"
                value={item.quantity}
                onChange={(e) => setItem(i, "quantity", Number(e.target.value))}
              />
            </Field>
            <Field label="Preço unitário (R$)">
              <input
                key={`p${item.productId}`}
                required
                defaultValue={String(item.priceCents / 100).replace(".", ",")}
                onBlur={(e) =>
                  void a.run(async () =>
                    setItem(i, "priceCents", parseMoney(e.target.value)),
                  )
                }
              />
            </Field>
            {showCosts && (
              <Field label="Custo unitário (R$)">
                <input
                  key={`c${item.productId}`}
                  required
                  defaultValue={String(item.costCents / 100).replace(".", ",")}
                  onBlur={(e) =>
                    void a.run(async () =>
                      setItem(i, "costCents", parseMoney(e.target.value)),
                    )
                  }
                />
              </Field>
            )}
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={item.stockProduct ?? false}
              onChange={(e) => setItem(i, "stockProduct", e.target.checked)}
            />
            Reservar este item / SKU no estoque ao gerar a ordem
          </label>
          {item.materials.length > 0 && (
            <small>
              {item.materials.length} materiais na composição. Serão reservados
              ao gerar a ordem.
            </small>
          )}
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        onClick={() =>
          setItems([
            ...items,
            {
              productId: "",
              name: "",
              quantity: 1,
              priceCents: 0,
              costCents: 0,
              materials: [],
            },
          ])
        }
      >
        <Plus size={15} /> Adicionar item
      </button>
      <div className="form-grid three">
        {[
          ["laborCents", "Mão de obra"],
          ["travelCents", "Deslocamento"],
          ["discountCents", "Desconto"],
        ].map(([k, l]) => (
          <Field label={`${l} (R$)`} key={k}>
            <input
              defaultValue={String((charges as any)[k] / 100).replace(".", ",")}
              onBlur={(e) =>
                void a.run(async () =>
                  setCharges({ ...charges, [k]: parseMoney(e.target.value) }),
                )
              }
            />
          </Field>
        ))}
      </div>
      <div className="quote-totals">
        <strong>
          Total:{" "}
          {totals.totalCents === undefined
            ? "Confira os valores"
            : money(totals.totalCents)}
        </strong>
        {showCosts && (
          <>
            <span>
              Margem: {totals.margin ?? "—"}% · Markup: {totals.markup ?? "—"}%
            </span>
            <small>
              Custo estimado dos itens: {money(totals.costCents ?? 0)}. Informe
              custos completos para uma estimativa útil.
            </small>
          </>
        )}
      </div>
      <div className="form-grid">
        <Field label="Prazo de entrega combinado (opcional)">
          <input
            name="deliveryDue"
            type="date"
            defaultValue={value?.deliveryDue}
          />
        </Field>
        <Field label="Vencimento previsto do recebimento">
          <input
            name="paymentDue"
            type="date"
            defaultValue={value?.paymentDue}
            required
          />
        </Field>
      </div>
      <Field label="Condições de pagamento">
        <textarea
          name="conditions"
          defaultValue={value?.conditions}
          maxLength={3000}
        />
      </Field>
      <Field label="Observações">
        <textarea name="notes" defaultValue={value?.notes} maxLength={3000} />
      </Field>
      <ErrorBox message={a.error} />
      <div className="form-footer">
        <span>Salvo como rascunho.</span>
        <Submit busy={a.busy} />
      </div>
    </form>
  );
}
export function FinancePage({ c }: { c: WorkspaceContext }) {
  const d = useData(`/${c.company.id}/finance`);
  const a = useAction();
  const [create, setCreate] = useState(false);
  const [editingLedger, setEditingLedger] = useState<any>(null);
  const [payment, setPayment] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  useEffect(() => {
    void api(`/${c.company.id}/operations/accounts`)
      .then((d) => setAccounts(d.accounts))
      .catch(() => {});
  }, [c.company.id]);
  const [remove, setRemove] = useState("");
  const [filter, setFilter] = useState("all");
  const rows = (d.data?.ledger ?? []).filter(
    (r: any) => filter === "all" || r.direction === filter,
  );
  const received = (d.data?.ledger ?? [])
    .filter((r: any) => r.direction === "in")
    .reduce((s: number, r: any) => s + Number(r.paid_cents), 0);
  const paid = (d.data?.ledger ?? [])
    .filter((r: any) => r.direction === "out")
    .reduce((s: number, r: any) => s + Number(r.paid_cents), 0);
  return (
    <>
      {new URLSearchParams(location.search).get("record") && (
        <button className="link-button" onClick={() => c.go("financeiro")}>
          Ver todas as contas
        </button>
      )}
      <Heading
        title="Financeiro"
        description="O que entrou, o que saiu e o que está previsto. Sem misturar os conceitos."
      >
        <button className="button secondary" onClick={() => c.go("contas")}>
          Contas, parcelas e extrato
        </button>
        <button
          className="button secondary"
          onClick={() => download("financeiro-impulsa.json", d.data)}
        >
          Exportar relatório
        </button>
        <button className="button primary" onClick={() => setCreate(true)}>
          <Plus size={17} /> Nova conta
        </button>
      </Heading>
      <div className="finance-summary">
        <div>
          <small>Recebido</small>
          <strong>{money(received)}</strong>
        </div>
        <div>
          <small>Pago</small>
          <strong>{money(paid)}</strong>
        </div>
        <div>
          <small>Saldo realizado</small>
          <strong>{money(received - paid)}</strong>
        </div>
      </div>
      <ToolInfo>
        Registro manual de pagamentos. Saldo de caixa não é lucro nem
        conciliação bancária. As recorrências mensais geram o próximo lançamento
        somente com a ação “Próximo mês”.
      </ToolInfo>
      <ErrorBox message={a.error} />
      <section className="panel record-panel">
        <div className="table-toolbar">
          <h2>Contas a pagar e receber</h2>
          <select
            aria-label="Tipo de conta"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todas as contas</option>
            <option value="in">A receber</option>
            <option value="out">A pagar</option>
          </select>
        </div>
        <ErrorBox message={d.error} />
        {!d.data && !d.error ? (
          <Loading />
        ) : !rows.length ? (
          <Empty
            title="Seu financeiro começa com um registro"
            description="Registre uma receita ou despesa, com valor e vencimento."
            action={() => setCreate(true)}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Vencimento</th>
                  <th>Total</th>
                  <th>Pago / recebido</th>
                  <th>Em aberto</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter(
                    (r: any) =>
                      !new URLSearchParams(location.search).get("record") ||
                      new URLSearchParams(location.search).get("record") ===
                        r.id,
                  )
                  .map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                        <small className="table-sub">
                          {r.direction === "in" ? "Receita" : "Despesa"} ·{" "}
                          {r.category || "Sem categoria"}{" "}
                          {r.recurrence === "monthly" ? "· Mensal" : ""}
                        </small>
                      </td>
                      <td>{date(r.due)}</td>
                      <td>{money(Number(r.amount_cents))}</td>
                      <td>{money(Number(r.paid_cents))}</td>
                      <td>
                        {money(Number(r.amount_cents) - Number(r.paid_cents))}
                      </td>
                      <td>
                        <div className="quote-actions">
                          <button
                            className="link-button"
                            onClick={() => setEditingLedger(r)}
                          >
                            Editar prazo e categoria
                          </button>
                          {Number(r.paid_cents) < Number(r.amount_cents) && (
                            <button
                              className="link-button"
                              onClick={() =>
                                setPayment({ ...r, key: crypto.randomUUID() })
                              }
                            >
                              Registrar pagamento
                            </button>
                          )}
                          {r.recurrence === "monthly" && (
                            <button
                              className="link-button"
                              onClick={() =>
                                void a.run(async () => {
                                  await api(
                                    `/${c.company.id}/finance/${r.id}/next`,
                                    "POST",
                                  );
                                  await d.load();
                                  c.notify("Próxima ocorrência gerada.");
                                })
                              }
                            >
                              Próximo mês
                            </button>
                          )}
                          {!Number(r.paid_cents) && !r.order_id && (
                            <button
                              className="icon-button"
                              aria-label="Excluir conta sem pagamento"
                              onClick={() => setRemove(r.id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {create && (
        <Modal title="Nova conta" onClose={() => setCreate(false)}>
          <form
            onSubmit={a.onSubmit(async (f) => {
              await api(`/${c.company.id}/finance`, "POST", {
                name: f.get("name"),
                direction: f.get("direction"),
                category: f.get("category"),
                amountCents: parseMoney(formText(f, "amount")),
                due: f.get("due"),
                recurrence: f.get("recurrence"),
                accountId: String(f.get("accountId") || ""),
                financialKind: String(f.get("financialKind") || "operating"),
              });
              setCreate(false);
              await d.load();
              c.notify("Conta registrada.");
            })}
          >
            <Field label="Descrição">
              <input name="name" required minLength={2} />
            </Field>
            <div className="form-grid">
              <Field label="Tipo">
                <select name="direction">
                  <option value="in">A receber</option>
                  <option value="out">A pagar</option>
                </select>
              </Field>
              <Field label="Valor (R$)">
                <input
                  name="amount"
                  placeholder="0,00"
                  inputMode="decimal"
                  required
                />
              </Field>
              <Field label="Vencimento">
                <input name="due" type="date" defaultValue={today()} required />
              </Field>
              <Field label="Categoria">
                <input name="category" maxLength={80} />
              </Field>
              <Field label="Conta financeira prevista">
                <select name="accountId">
                  <option value="">Sem conta atribuída</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Natureza do lançamento">
                <select name="financialKind">
                  <option value="operating">Operacional</option>
                  <option value="withdrawal">Retirada de sócio (saída)</option>
                </select>
              </Field>
              <Field label="Recorrência">
                <select name="recurrence">
                  <option value="none">Não recorrente</option>
                  <option value="monthly">
                    Mensal · gerar próxima manualmente
                  </option>
                </select>
              </Field>
            </div>
            <ErrorBox message={a.error} />
            <Submit busy={a.busy} />
          </form>
        </Modal>
      )}
      {editingLedger && (
        <Modal
          title="Atualizar prazo e classificação"
          onClose={() => setEditingLedger(null)}
        >
          <p>
            O valor contratado e os pagamentos registrados não serão alterados.
          </p>
          <form
            onSubmit={a.onSubmit(async (f) => {
              await api(
                "/" + c.company.id + "/operations/ledger/" + editingLedger.id,
                "PUT",
                {
                  version: editingLedger.version,
                  name: String(f.get("name")),
                  due: String(f.get("due")),
                  category: String(f.get("category")),
                  financialKind: String(f.get("financialKind")),
                  reason: String(f.get("reason")),
                },
              );
              setEditingLedger(null);
              await d.load();
              c.notify("Prazo e classificação atualizados com histórico.");
            })}
          >
            <Field label="Descrição da conta">
              <input
                name="name"
                required
                maxLength={160}
                defaultValue={editingLedger.name}
              />
            </Field>
            <Field label="Novo vencimento">
              <input
                name="due"
                type="date"
                required
                defaultValue={String(editingLedger.due).slice(0, 10)}
              />
            </Field>
            <Field label="Categoria">
              <input
                name="category"
                maxLength={80}
                defaultValue={editingLedger.category}
              />
            </Field>
            <Field label="Natureza">
              <select
                name="financialKind"
                defaultValue={editingLedger.financial_kind}
              >
                <option value="operating">Operacional</option>
                {editingLedger.direction === "out" && (
                  <option value="withdrawal">Retirada de sócio</option>
                )}
              </select>
            </Field>
            <Field label="Motivo da alteração">
              <textarea name="reason" required minLength={5} maxLength={500} />
            </Field>
            <ErrorBox message={a.error} />
            <Submit busy={a.busy}>Salvar alteração</Submit>
          </form>
        </Modal>
      )}
      {payment && (
        <Modal
          title="Registrar pagamento manual"
          onClose={() => setPayment(null)}
        >
          <p>
            {payment.name} · saldo{" "}
            {money(Number(payment.amount_cents) - Number(payment.paid_cents))}
          </p>
          <form
            onSubmit={a.onSubmit(async (f) => {
              await api(`/${c.company.id}/finance/${payment.id}/pay`, "POST", {
                amountCents: parseMoney(formText(f, "amount")),
                date: f.get("date"),
                key: payment.key,
                accountId: String(
                  f.get("accountId") || payment.account_id || "",
                ),
              });
              setPayment(null);
              await d.load();
              c.notify("Pagamento registrado e saldo atualizado.");
            })}
          >
            <Field label="Valor pago / recebido (R$)">
              <input
                name="amount"
                required
                defaultValue={String(
                  (Number(payment.amount_cents) - Number(payment.paid_cents)) /
                    100,
                ).replace(".", ",")}
              />
            </Field>
            <Field label="Conta financeira efetiva">
              <select name="accountId" defaultValue={payment.account_id ?? ""}>
                <option value="">Sem conta atribuída</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Data do pagamento">
              <input name="date" type="date" required defaultValue={today()} />
            </Field>
            <ErrorBox message={a.error} />
            <Submit busy={a.busy}>Confirmar registro</Submit>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal
          title="Excluir conta sem pagamento?"
          onClose={() => setRemove("")}
        >
          <p>
            Esta ação remove somente este lançamento. Lançamentos vinculados a
            ordens ou com pagamentos são preservados.
          </p>
          <ErrorBox message={a.error} />
          <button
            className="button danger"
            onClick={() =>
              void a.run(async () => {
                await api(`/${c.company.id}/finance/${remove}`, "DELETE");
                setRemove("");
                await d.load();
              })
            }
          >
            Excluir lançamento
          </button>
        </Modal>
      )}
    </>
  );
}
export function StockPage({ c }: { c: WorkspaceContext }) {
  const d = useData(`/${c.company.id}/stock`);
  const a = useAction();
  const [move, setMove] = useState<any>(null);
  return (
    <>
      <Heading
        title="Estoque"
        description="Saiba o que tem, o que está reservado e o que precisa repor."
      />
      <button className="button secondary" onClick={() => c.go("recebimentos")}>
        Recebimentos de compras
      </button>
      <ToolInfo>
        Disponível = quantidade física − reservas. A ordem reserva materiais; a
        conclusão faz o consumo. Movimentações reprocessadas com a mesma chave
        não são duplicadas.
      </ToolInfo>
      <section className="panel record-panel">
        <ErrorBox message={d.error} />
        {!d.data && !d.error ? (
          <Loading />
        ) : !d.data?.items.length ? (
          <Empty
            title="Seu estoque acompanha seu catálogo"
            description="Cadastre um produto ou material e registre a primeira entrada."
            action={() => c.go("produtos")}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Físico</th>
                  <th>Reservado</th>
                  <th>Disponível</th>
                  <th>Mínimo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {d.data.items
                  .filter(
                    (s: any) =>
                      !new URLSearchParams(location.search).get("record") ||
                      new URLSearchParams(location.search).get("record") ===
                        s.product_id,
                  )
                  .map((s: any) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.data.name}</strong>
                      </td>
                      <td>
                        {s.quantity} {s.data.unit}
                      </td>
                      <td>{s.reserved}</td>
                      <td>
                        <span
                          className={
                            s.quantity - s.reserved < s.data.minimum
                              ? "text-warning"
                              : ""
                          }
                        >
                          {s.quantity - s.reserved}
                        </span>
                      </td>
                      <td>{s.data.minimum}</td>
                      <td>
                        <button
                          className="button secondary compact"
                          onClick={() =>
                            setMove({ ...s, key: crypto.randomUUID() })
                          }
                        >
                          Movimentar
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {!!d.data?.movements.length && (
        <section className="panel record-panel">
          <div className="panel-head">
            <h2>Histórico de movimentos</h2>
            <span className="small-muted">Últimos 200</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Quantidade</th>
                  <th>Reserva</th>
                  <th>Motivo</th>
                  <th>Validade</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {d.data.movements.map((m: any) => (
                  <tr key={m.id}>
                    <td>
                      {d.data.items.find(
                        (s: any) => s.product_id === m.product_id,
                      )?.data.name ?? m.product_id}
                    </td>
                    <td>
                      {m.delta > 0 ? "+" : ""}
                      {m.delta}
                    </td>
                    <td>{m.reserved_delta}</td>
                    <td>{m.reason}</td>
                    <td>{date(m.expires)}</td>
                    <td>{date(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {move && (
        <Modal
          title={`Movimentar · ${move.data.name}`}
          onClose={() => setMove(null)}
        >
          <form
            onSubmit={a.onSubmit(async (f) => {
              await api(`/${c.company.id}/stock/move`, "POST", {
                productId: move.product_id,
                delta: Number(f.get("delta")),
                reason: f.get("reason"),
                key: move.key,
                expires: f.get("expires"),
              });
              setMove(null);
              await d.load();
              c.notify("Movimentação registrada.");
            })}
          >
            <Field label="Quantidade (+ entrada / − saída)">
              <input type="number" step="1" name="delta" required />
            </Field>
            <Field label="Motivo">
              <input name="reason" required minLength={3} maxLength={200} />
            </Field>
            <Field label="Validade do lote (opcional)">
              <input type="date" name="expires" />
            </Field>
            <ErrorBox message={a.error} />
            <Submit busy={a.busy}>Confirmar movimentação</Submit>
          </form>
        </Modal>
      )}
    </>
  );
}

export function workLabel(profile: {
  offer?: string;
  businessModels?: string[];
}) {
  if (profile.businessModels?.includes("custom")) return "Projetos";
  if (
    profile.offer === "products" ||
    (profile.businessModels?.includes("products") &&
      !profile.businessModels?.includes("services"))
  )
    return "Pedidos";
  return "Ordens de serviço";
}

function RetailOrderForm({
  c,
  onSave,
  onClose,
}: {
  c: WorkspaceContext;
  onSave: () => Promise<void>;
  onClose: () => void;
}) {
  const clients = useData(`/${c.company.id}/records/clients`);
  const products = useData(`/${c.company.id}/records/products`);
  const a = useAction();
  const [requestKey] = useState(() => crypto.randomUUID());
  const [items, setItems] = useState([{ productId: "", quantity: 1 }]);
  const catalog = (products.data ?? []).filter(
    (r: any) =>
      r.data.status === "active" &&
      ["product", "variation"].includes(r.data.productType ?? "product"),
  );
  const total = items.reduce(
    (sum, item) =>
      sum +
      item.quantity *
        (catalog.find((p: any) => p.id === item.productId)?.data.priceCents ??
          0),
    0,
  );
  return (
    <Modal title="Novo pedido" onClose={onClose}>
      <ErrorBox message={clients.error || products.error || a.error} />
      <form
        onSubmit={a.onSubmit(async (f) => {
          await api(`/${c.company.id}/orders`, "POST", {
            requestKey,
            items,
            title: formText(f, "title"),
            clientId: formText(f, "clientId"),
            paymentDue: formText(f, "paymentDue"),
          });
          await onSave();
        })}
      >
        <Field label="Título do pedido">
          <input name="title" required maxLength={160} />
        </Field>
        <Field label="Cliente">
          <select name="clientId" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {(clients.data ?? []).map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.data.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vencimento">
          <input name="paymentDue" type="date" required />
        </Field>
        <fieldset>
          <legend>Itens do pedido</legend>
          {items.map((item, index) => (
            <div className="form-grid" key={index}>
              <Field label={`Produto ou variação ${index + 1}`}>
                <select
                  required
                  value={item.productId}
                  onChange={(event) =>
                    setItems(
                      items.map((current, i) =>
                        i === index
                          ? { ...current, productId: event.target.value }
                          : current,
                      ),
                    )
                  }
                >
                  <option value="" disabled>
                    Selecione
                  </option>
                  {catalog.map((r: any) => (
                    <option
                      key={r.id}
                      value={r.id}
                      disabled={items.some(
                        (v, i) => i !== index && v.productId === r.id,
                      )}
                    >
                      {[
                        r.data.name,
                        r.data.size,
                        r.data.color,
                        r.data.sku,
                        money(r.data.priceCents),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Quantidade ${index + 1}`}>
                <input
                  required
                  type="number"
                  min="1"
                  max="100000"
                  value={item.quantity || ""}
                  onChange={(event) =>
                    setItems(
                      items.map((current, i) =>
                        i === index
                          ? { ...current, quantity: Number(event.target.value) }
                          : current,
                      ),
                    )
                  }
                />
              </Field>
              {items.length > 1 && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setItems(items.filter((_, i) => i !== index))}
                >
                  Remover item {index + 1}
                </button>
              )}
            </div>
          ))}
        </fieldset>
        <button
          type="button"
          className="button secondary"
          disabled={items.length >= 50}
          onClick={() => setItems([...items, { productId: "", quantity: 1 }])}
        >
          Adicionar item
        </button>
        <p>
          Total do pedido <strong>{money(total)}</strong>
        </p>
        <p>
          O pedido reserva os produtos com estoque controlado e gera a conta a
          receber.
        </p>
        <Submit busy={a.busy}>Registrar pedido</Submit>
      </form>
    </Modal>
  );
}

function RetailReturnForm({
  c,
  order,
  onSave,
  onClose,
}: {
  c: WorkspaceContext;
  order: any;
  onSave: () => Promise<void>;
  onClose: () => void;
}) {
  const a = useAction();
  const [requestKey] = useState(() => crypto.randomUUID());
  return (
    <Modal title="Registrar devolução" onClose={onClose}>
      <p>
        A devolução repõe o estoque físico. Registre um eventual reembolso
        separadamente no Financeiro.
      </p>
      <form
        onSubmit={a.onSubmit(async (f) => {
          await api(`/${c.company.id}/orders/${order.id}/return`, "POST", {
            requestKey,
            productId: formText(f, "productId"),
            quantity: Number(f.get("quantity")),
          });
          await onSave();
        })}
      >
        <Field label="Produto devolvido">
          <select name="productId" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {order.snapshot.items
              .filter((item: any) => item.stockProduct)
              .map((item: any) => (
                <option key={item.productId} value={item.productId}>
                  {item.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Quantidade devolvida">
          <input name="quantity" required type="number" min="1" max="100000" />
        </Field>
        <ErrorBox message={a.error} />
        <Submit busy={a.busy}>Repor estoque</Submit>
      </form>
    </Modal>
  );
}
export function OrdersPage({ c }: { c: WorkspaceContext }) {
  const d = useData(`/${c.company.id}/overview`);
  const a = useAction();
  const [finish, setFinish] = useState("");
  const [creating, setCreating] = useState(false);
  const [returning, setReturning] = useState<any>(null);
  const location = useLocation();
  const label = workLabel(c.company.profile);
  const retail = label === "Pedidos";
  const writable = allowed(c.company.role, "orders", "write");
  useEffect(() => {
    if (retail && writable && new URLSearchParams(location.search).has("criar"))
      setCreating(true);
  }, [location.key, retail, writable]);
  return (
    <>
      <Heading
        title={label}
        description={
          retail
            ? "Acompanhe reservas, entregas e devoluções do seu comércio."
            : "Os combinados da proposta, preservados até a entrega."
        }
      >
        {retail && writable && (
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={17} /> Novo pedido
          </button>
        )}
      </Heading>
      <ErrorBox message={d.error} />
      {!d.data && !d.error ? (
        <Loading />
      ) : !d.data?.orders.length ? (
        <section className="panel">
          <Empty
            title={
              retail
                ? "Registre seu primeiro pedido"
                : "Uma proposta aprovada é o começo"
            }
            description={
              retail
                ? "Escolha um cliente e os produtos ou variações do catálogo."
                : "Gere uma ordem a partir da proposta para reservar materiais e criar a conta a receber."
            }
            action={
              retail
                ? writable
                  ? () => setCreating(true)
                  : undefined
                : () => c.go("propostas")
            }
          />
        </section>
      ) : (
        <section className="panel record-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Trabalho</th>
                  <th>Cliente</th>
                  <th>Itens e materiais</th>
                  <th>Situação</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {d.data.orders
                  .filter(
                    (o: any) =>
                      !new URLSearchParams(location.search).get("record") ||
                      new URLSearchParams(location.search).get("record") ===
                        o.id,
                  )
                  .map((o: any) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.snapshot.title}</strong>
                        {o.request_key && (
                          <small className="table-sub">
                            {money(o.snapshot.totalCents)}
                          </small>
                        )}
                        <small className="table-sub">
                          Criada em {date(o.created_at)}
                        </small>
                      </td>
                      <td>{o.snapshot.client.name}</td>
                      <td>
                        {o.snapshot.items
                          .map((i: any) => `${i.quantity} × ${i.name}`)
                          .join(", ")}
                      </td>
                      <td>{status(o.status)}</td>
                      <td>
                        {o.status !== "done" && (
                          <button
                            className="button secondary compact"
                            onClick={() =>
                              o.request_key && writable
                                ? setFinish(o.id)
                                : c.go("execucao?id=" + o.id)
                            }
                          >
                            {o.request_key && writable
                              ? "Concluir pedido"
                              : "Acompanhar execução"}
                          </button>
                        )}
                        {o.request_key &&
                          o.status === "done" &&
                          writable &&
                          allowed(c.company.role, "stock", "write") &&
                          o.snapshot.items.some(
                            (item: any) => item.stockProduct,
                          ) && (
                            <button
                              className="button secondary compact"
                              onClick={() => setReturning(o)}
                            >
                              Registrar devolução
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {creating && (
        <RetailOrderForm
          c={c}
          onClose={() => setCreating(false)}
          onSave={async () => {
            setCreating(false);
            await d.load();
            c.notify("Pedido registrado.");
          }}
        />
      )}
      {returning && (
        <RetailReturnForm
          c={c}
          order={returning}
          onClose={() => setReturning(null)}
          onSave={async () => {
            setReturning(null);
            await d.load();
            c.notify("Devolução registrada no estoque.");
          }}
        />
      )}
      {finish && (
        <Modal title="Concluir esta entrega?" onClose={() => setFinish("")}>
          <p>
            Os materiais reservados serão consumidos e será criada uma tarefa de
            acompanhamento em 7 dias. O pagamento continua sendo registrado
            separadamente no financeiro.
          </p>
          <ErrorBox message={a.error} />
          <button
            className="button primary"
            disabled={a.busy}
            onClick={() =>
              void a.run(async () => {
                await api(`/${c.company.id}/orders/${finish}/complete`, "POST");
                setFinish("");
                await d.load();
                c.notify(
                  "Ordem concluída. Acompanhamento criado no pós-venda.",
                );
              })
            }
          >
            Confirmar conclusão
          </button>
        </Modal>
      )}
    </>
  );
}
export function TeamPage({ c }: { c: WorkspaceContext }) {
  const d = useData(`/${c.company.id}/team`);
  const a = useAction();
  const [invite, setInvite] = useState(false);
  const [remove, setRemove] = useState("");
  return (
    <>
      <Heading
        title="Sua equipe"
        description="Pessoas certas, responsabilidades claras e acessos sob controle."
      >
        {["owner", "admin"].includes(c.company.role) && (
          <button className="button primary" onClick={() => setInvite(true)}>
            <Plus size={17} /> Convidar pessoa
          </button>
        )}
      </Heading>
      <ToolInfo>
        Proprietário e administrador gerenciam operações, financeiro e equipe.
        Colaborador atua na rotina, sem financeiro nem exportação geral.
        Financeiro consulta a operação e gerencia contas. Convites expiram em 48
        horas. Comissões e folha não são calculadas nesta versão.
      </ToolInfo>
      <ErrorBox message={d.error || a.error} />
      {d.data && (
        <section className="panel record-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>E-mail</th>
                  <th>Papel</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {d.data.members.map((m: any) => (
                  <tr key={m.user_id}>
                    <td>
                      <strong>{m.name}</strong>
                    </td>
                    <td>{m.email}</td>
                    <td>
                      {
                        (
                          {
                            owner: "Proprietário",
                            admin: "Administrador",
                            member: "Colaborador (legado)",
                            sales: "Comercial",
                            operations: "Operação",
                            readonly: "Leitura",
                            finance: "Financeiro",
                          } as any
                        )[m.role]
                      }
                    </td>
                    <td>
                      {m.role !== "owner" &&
                        m.user_id !== c.me.user.id &&
                        ["owner", "admin"].includes(c.company.role) && (
                          <button
                            className="link-button"
                            onClick={() => setRemove(m.user_id)}
                          >
                            Revogar acesso
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!d.data.invitations.length && (
            <div className="panel-section">
              <h3>Convites</h3>
              {d.data.invitations.map((i: any) => (
                <div className="invitation-row" key={i.id}>
                  <span>
                    {i.email} · {i.role} ·{" "}
                    {i.accepted_at ? "Aceito" : `Expira ${date(i.expires)}`}
                  </span>
                  {!i.accepted_at && (
                    <button
                      className="link-button"
                      onClick={() =>
                        void a.run(async () => {
                          await api(
                            `/${c.company.id}/invitations/${i.id}`,
                            "DELETE",
                          );
                          await d.load();
                        })
                      }
                    >
                      Revogar convite
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {invite && (
        <Modal
          title="Convide alguém para a equipe"
          onClose={() => setInvite(false)}
        >
          <form
            onSubmit={a.onSubmit(async (f) => {
              await api(`/${c.company.id}/team/invite`, "POST", {
                email: f.get("email"),
                role: f.get("role"),
              });
              setInvite(false);
              await d.load();
              c.notify(
                "Convite preparado e enviado ao transporte de e-mail configurado.",
              );
            })}
          >
            <Field label="E-mail">
              <input name="email" type="email" required />
            </Field>
            <Field label="Papel">
              <select name="role">
                <option value="member">Colaborador</option>
                <option value="finance">Financeiro</option>
                <option value="sales">Comercial</option>
                <option value="operations">Operação</option>
                <option value="readonly">Leitura</option>
                {c.company.role === "owner" && (
                  <option value="admin">Administrador</option>
                )}
              </select>
            </Field>
            <ErrorBox message={a.error} />
            <Submit busy={a.busy}>Enviar convite</Submit>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal title="Revogar acesso à empresa?" onClose={() => setRemove("")}>
          <p>
            A associação será removida imediatamente. A pessoa pode continuar
            acessando outras empresas das quais faça parte.
          </p>
          <button
            className="button danger"
            onClick={() =>
              void a.run(async () => {
                await api(`/${c.company.id}/team/${remove}`, "DELETE");
                setRemove("");
                await d.load();
                c.notify("Acesso revogado.");
              })
            }
          >
            Confirmar revogação
          </button>
          <ErrorBox message={a.error} />
        </Modal>
      )}
      {d.data && <TeamTransfer c={c} members={d.data.members} />}
    </>
  );
}
export function FilesPage({ c }: { c: WorkspaceContext }) {
  const d = useData(`/${c.company.id}/files`);
  const a = useAction();
  const [upload, setUpload] = useState(false);
  const [remove, setRemove] = useState("");
  return (
    <>
      <Heading
        title="Documentos"
        description="Arquivos privados, organizados por categoria e vencimento."
      >
        <button className="button primary" onClick={() => setUpload(true)}>
          <Plus size={17} /> Adicionar arquivo
        </button>
      </Heading>
      <ToolInfo>
        PNG, JPEG ou PDF, até 5 MB. Download exige sessão, vínculo com a empresa
        e link assinado de 60 segundos. Compartilhamento público de arquivos e
        análise antivírus ainda não são oferecidos.
      </ToolInfo>
      <ErrorBox message={a.error || d.error} />
      {!d.data && !d.error ? (
        <Loading />
      ) : !d.data?.length ? (
        <section className="panel">
          <Empty
            title="Um lugar para seus documentos"
            description="Organize arquivos do seu negócio sem deixá-los públicos."
            action={() => setUpload(true)}
          />
        </section>
      ) : (
        <section className="panel record-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Categoria</th>
                  <th>Vencimento</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {d.data.map((f: any) => (
                  <tr key={f.id}>
                    <td>
                      <strong>{f.name}</strong>
                      <small className="table-sub">{f.type}</small>
                    </td>
                    <td>{f.category || "—"}</td>
                    <td>{date(f.expires)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label="Baixar arquivo privado"
                          onClick={() =>
                            void a.run(async () => {
                              const r = await api(
                                `/${c.company.id}/files/${f.id}/link`,
                                "POST",
                              );
                              window.location.assign(r.url);
                            })
                          }
                        >
                          <Download size={17} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Excluir arquivo"
                          onClick={() => setRemove(f.id)}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {upload && (
        <Modal
          title="Adicionar documento privado"
          onClose={() => setUpload(false)}
        >
          <form
            onSubmit={a.onSubmit(async (f) => {
              await api(`/${c.company.id}/files`, "POST", f);
              setUpload(false);
              await d.load();
              c.notify("Arquivo guardado na empresa.");
            })}
          >
            <Field label="Arquivo">
              <input
                type="file"
                name="file"
                required
                accept="image/png,image/jpeg,application/pdf"
              />
            </Field>
            <Field label="Categoria">
              <input name="category" maxLength={80} />
            </Field>
            <Field label="Vencimento (opcional)">
              <input type="date" name="expires" />
            </Field>
            <ErrorBox message={a.error} />
            <Submit busy={a.busy}>Enviar arquivo</Submit>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal title="Excluir este arquivo?" onClose={() => setRemove("")}>
          <p>
            O conteúdo será removido do banco desta instalação. A exclusão de
            cópias de backup depende da infraestrutura configurada.
          </p>
          <ErrorBox message={a.error} />
          <button
            className="button danger"
            onClick={() =>
              void a.run(async () => {
                await api(`/${c.company.id}/files/${remove}`, "DELETE");
                setRemove("");
                await d.load();
              })
            }
          >
            Excluir arquivo
          </button>
        </Modal>
      )}
    </>
  );
}
export function SettingsPage({
  c,
  page,
  config,
}: {
  c: WorkspaceContext;
  page: string;
  config: any;
}) {
  if (page === "seguranca") return <SecurityPage c={c} />;
  if (page === "privacidade") return <PrivacyPage c={c} />;
  if (page === "assinatura") return <BillingPage c={c} config={config} />;
  return (
    <>
      <Heading
        title="Configurações"
        description="O seu negócio muda. Sua plataforma acompanha."
      />
      <div className="settings-grid">
        {[
          [
            "seguranca",
            "Minha conta e segurança",
            "Senha, e-mail, sessões e autenticação multifator.",
          ],
          [
            "privacidade",
            "Privacidade e exportação",
            "Suas escolhas, dados e solicitações.",
          ],
          [
            "assinatura",
            "Planos e assinatura",
            "Teste, limites e cobrança, com transparência.",
          ],
        ].map(([p, t, d]) => (
          <button
            className="panel settings-link"
            key={p}
            onClick={() => c.go(p)}
          >
            <ShieldCheck size={24} />
            <h2>{t}</h2>
            <p>{d}</p>
            <ArrowUpRight size={19} />
          </button>
        ))}
      </div>
      {allowed(c.company.role, "settings", "write") && (
        <>
          <BusinessModels c={c} />
          <ProfileEditor c={c} />
        </>
      )}
      <section className="panel panel-section">
        <h2>Integrações</h2>
        <div className="integration-list">
          {Object.entries(config.integrations).map(([k, v]) => (
            <div key={k}>
              <span>
                {
                  (
                    {
                      mail: "Envio de e-mail",
                      billing: "Cobrança em testes",
                      ai: "Geração de conteúdo com IA",
                      search: "Busca externa de fornecedores",
                    } as any
                  )[k]
                }
              </span>
              <span
                className={`badge ${v && k !== "ai" ? "active" : "pending"}`}
              >
                {k === "ai"
                  ? "Indisponível nesta versão"
                  : v
                    ? "Configurada no servidor"
                    : "Não configurada"}
              </span>
            </div>
          ))}
        </div>
        <p>
          Credenciais são definidas somente no servidor. Não cole chaves nesta
          interface.
        </p>
      </section>
    </>
  );
}
function ProfileEditor({ c }: { c: WorkspaceContext }) {
  const [open, setOpen] = useState(false);
  const a = useAction();
  const [audit, setAudit] = useState<any[] | null>(null);
  if (open)
    return (
      <div className="profile-onboarding">
        <CompanyProfile c={c} onClose={() => setOpen(false)} />
      </div>
    );
  return (
    <section className="panel panel-section">
      <h2>Perfil e histórico do negócio</h2>
      <p>
        {c.company.name} · {c.company.profile.profession} ·{" "}
        {c.company.profile.city}/{c.company.profile.state}
      </p>
      <div className="heading-actions">
        <button className="button secondary" onClick={() => setOpen(true)}>
          Editar perfil e objetivos
        </button>
        <button
          className="button secondary"
          onClick={() =>
            void a.run(async () =>
              setAudit(await api(`/${c.company.id}/audit`)),
            )
          }
        >
          Consultar auditoria
        </button>
      </div>
      <ErrorBox message={a.error} />
      {audit && (
        <div className="audit-list">
          {audit.map((r) => (
            <div key={r.id}>
              <span>{r.action}</span>
              <small>
                {new Date(r.created_at).toLocaleString("pt-BR", {
                  timeZone: c.company.profile.timezone,
                })}
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
export function SecurityPage({ c }: { c: WorkspaceContext }) {
  const a = useAction();
  const [sessions, setSessions] = useState<any[]>([]);
  const [mfa, setMfa] = useState<any>(null);
  const [qr, setQr] = useState("");
  useEffect(() => {
    void authClient.listSessions().then((r) => setSessions(r.data ?? []));
  }, []);
  return (
    <>
      <Heading
        title="Minha conta e segurança"
        description="Controle seus acessos e mantenha sua conta protegida."
      />
      <div className="settings-columns">
        <section className="panel panel-section">
          <h2>Alterar senha</h2>
          <form
            onSubmit={a.onSubmit(async (f) => {
              const r = await authClient.changePassword({
                currentPassword: formText(f, "current"),
                newPassword: formText(f, "new"),
                revokeOtherSessions: true,
              });
              if (r.error)
                throw new Error(
                  "Não foi possível alterar a senha. Confira a senha atual.",
                );
              c.notify("Senha alterada. Outras sessões foram revogadas.");
            })}
          >
            <Field label="Senha atual">
              <input
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Nova senha">
              <input
                name="new"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </Field>
            <Submit busy={a.busy}>Alterar senha</Submit>
          </form>
        </section>
        <section className="panel panel-section">
          <h2>Alterar e-mail</h2>
          <p>
            A alteração requer confirmação pelos fluxos da biblioteca. Use uma
            sessão recente; entre novamente se solicitado.
          </p>
          <form
            onSubmit={a.onSubmit(async (f) => {
              const r = await authClient.changeEmail({
                newEmail: formText(f, "email"),
                callbackURL: "/app/seguranca",
              });
              if (r.error)
                throw new Error(
                  "Não foi possível iniciar a alteração. Entre novamente para confirmar sua sessão.",
                );
              c.notify(
                "Verifique as instruções enviadas para confirmar a alteração.",
              );
            })}
          >
            <Field label="Novo e-mail">
              <input name="email" type="email" required />
            </Field>
            <Submit busy={a.busy}>Solicitar alteração</Submit>
          </form>
        </section>
        <section className="panel panel-section">
          <h2>Autenticação em duas etapas</h2>
          <p>
            Obrigatória para ações administrativas em produção. Use um
            aplicativo autenticador e guarde os códigos de recuperação em local
            privado.
          </p>
          <span
            className={`badge ${c.me.user.twoFactorEnabled ? "active" : "pending"}`}
          >
            {c.me.user.twoFactorEnabled ? "Ativa" : "Ainda não ativada"}
          </span>
          {!c.me.user.twoFactorEnabled && (
            <form
              onSubmit={a.onSubmit(async (f) => {
                const r = await authClient.twoFactor.enable({
                  password: formText(f, "password"),
                });
                if (r.error)
                  throw new Error("Confira a senha e tente novamente.");
                setMfa(r.data);
                setQr(
                  await QRCode.toDataURL(
                    (r.data as { totpURI: string }).totpURI,
                  ),
                );
              })}
            >
              <Field label="Confirme sua senha">
                <input name="password" type="password" required />
              </Field>
              <Submit busy={a.busy}>Preparar autenticador</Submit>
            </form>
          )}
          {mfa && (
            <div className="mfa-setup">
              <img src={qr} alt="QR code de configuração do autenticador" />
              <details>
                <summary>Chave alternativa de configuração</summary>
                <code>{mfa.totpURI}</code>
              </details>
              <strong>Códigos de recuperação — guarde agora</strong>
              <pre>{mfa.backupCodes.join("\n")}</pre>
              <form
                onSubmit={a.onSubmit(async (f) => {
                  const r = await authClient.twoFactor.verifyTotp({
                    code: formText(f, "code"),
                  });
                  if (r.error) throw new Error("Código inválido.");
                  setMfa(null);
                  c.refresh();
                  c.notify("Autenticação em duas etapas ativada.");
                })}
              >
                <Field label="Código do autenticador">
                  <input
                    name="code"
                    pattern="[0-9]{6}"
                    inputMode="numeric"
                    required
                  />
                </Field>
                <Submit busy={a.busy}>Ativar e confirmar</Submit>
              </form>
            </div>
          )}
        </section>
        <section className="panel panel-section">
          <h2>Sessões ativas</h2>
          {sessions.map((s) => (
            <div className="session-row" key={s.id}>
              <div>
                <strong>{s.userAgent?.slice(0, 60) || "Navegador"}</strong>
                <small>Expira em {date(s.expiresAt)}</small>
              </div>
              <button
                className="link-button"
                onClick={() =>
                  void a.run(async () => {
                    const r = await authClient.revokeSession({
                      token: s.token,
                    });
                    if (r.error)
                      throw new Error("Não foi possível revogar a sessão");
                    const list = await authClient.listSessions();
                    setSessions(list.data ?? []);
                    c.notify("Sessão revogada.");
                  })
                }
              >
                Revogar
              </button>
            </div>
          ))}
          <button
            className="button secondary"
            onClick={() =>
              void a.run(async () => {
                await authClient.signOut();
                if ("caches" in window)
                  await Promise.all(
                    (await caches.keys())
                      .filter((k) => !k.startsWith("impulsa-public-"))
                      .map((k) => caches.delete(k)),
                  );
                window.location.assign("/entrar");
              })
            }
          >
            Sair da conta
          </button>
        </section>
      </div>
      <ErrorBox message={a.error} />
    </>
  );
}
function PrivacyPage({ c }: { c: WorkspaceContext }) {
  const d = useData(`/${c.company.id}/privacy`);
  const a = useAction();
  return (
    <>
      <Heading
        title="Central de Privacidade"
        description="Suas escolhas e seus dados, com clareza."
      />
      <section className="panel panel-section">
        <h2>Exportar dados da empresa</h2>
        <p>
          Proprietários, administradores e acesso financeiro podem exportar os
          registros estruturados. Arquivos são baixados separadamente.
        </p>
        <button
          className="button secondary"
          onClick={() =>
            void a.run(async () =>
              download(
                "impulsa-exportacao.json",
                await api(`/${c.company.id}/export`),
              ),
            )
          }
        >
          <Download size={17} /> Exportar meus registros
        </button>
      </section>
      <div className="settings-columns">
        <section className="panel panel-section">
          <h2>Solicitar acesso, correção ou exclusão</h2>
          <p>
            A solicitação gera um protocolo para análise humana. Não elimina
            automaticamente os dados e não envia e-mail a um encarregado nesta
            versão.
          </p>
          <form
            onSubmit={a.onSubmit(async (f) => {
              const r = await api(`/${c.company.id}/privacy`, "POST", {
                type: f.get("type"),
                details: f.get("details"),
              });
              await d.load();
              c.notify(`Solicitação registrada: ${r.id}`);
            })}
          >
            <Field label="Tipo">
              <select name="type">
                <option value="access">Acesso</option>
                <option value="correction">Correção</option>
                <option value="deletion">Exclusão</option>
              </select>
            </Field>
            <Field label="Descreva sua solicitação">
              <textarea
                name="details"
                required
                minLength={5}
                maxLength={3000}
              />
            </Field>
            <Submit busy={a.busy}>Registrar solicitação</Submit>
          </form>
        </section>
        <section className="panel panel-section">
          <h2>Minhas escolhas</h2>
          <form
            onSubmit={a.onSubmit(async (f) => {
              await api("/consent", "POST", {
                accepted: true,
                promotional: f.get("promo") === "on",
              });
              c.notify("Preferência atualizada.");
              c.refresh();
            })}
          >
            <label className="check-label">
              <input
                type="checkbox"
                name="promo"
                defaultChecked={c.me.consent?.promotional}
              />{" "}
              Quero receber comunicações promocionais.
            </label>
            <Submit busy={a.busy}>Salvar preferência</Submit>
          </form>
          <button
            className="button secondary"
            onClick={() => window.dispatchEvent(new Event("cookies:open"))}
          >
            Revisar cookies
          </button>
          <p>
            <Link to="/politica-privacidade">Política de Privacidade</Link> ·{" "}
            <Link to="/termos">Termos de Uso</Link>
          </p>
        </section>
      </div>
      <ErrorBox message={a.error || d.error} />
      {d.data?.length > 0 && (
        <section className="panel panel-section">
          <h2>Minhas solicitações</h2>
          {d.data.map((r: any) => (
            <div className="privacy-request" key={r.id}>
              <strong>
                {r.type} · {r.id}
              </strong>
              <p>{r.details}</p>
              <span className="badge pending">Pendente de análise humana</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
function BillingPage({ c, config }: { c: WorkspaceContext; config: any }) {
  const d = useData(`/${c.company.id}/billing`);
  const a = useAction();
  const [plan, setPlan] = useState("");
  return (
    <>
      <Heading
        title="Planos e assinatura"
        description="Um plano para seu momento. Condições claras antes de qualquer cobrança."
      />
      <ErrorBox message={a.error || d.error} />
      {d.data && (
        <section className="panel panel-section">
          <h2>
            Plano atual:{" "}
            {d.data.plan === "trial"
              ? "Teste gratuito"
              : config.plans[d.data.plan]?.name}
          </h2>
          <p>
            Situação: {statuses[d.data.status] ?? d.data.status} · Teste até{" "}
            {date(d.data.trialEnd)}
          </p>
          <p>
            Sem assinatura ativa ao final do teste, novas alterações
            operacionais são bloqueadas; consulta e exportação continuam
            acessíveis.
          </p>
          {d.data.paidUntil && <p>Ciclo pago até {date(d.data.paidUntil)}</p>}
          {d.data.canCancel && (
            <button
              className="button secondary"
              disabled={a.busy}
              onClick={() => {
                if (
                  !window.confirm(
                    "Cancelar a assinatura de teste do Mercado Pago?",
                  )
                )
                  return;
                void a.run(async () => {
                  await api(`/${c.company.id}/billing/cancel`, "POST");
                  await d.load();
                });
              }}
            >
              Cancelar assinatura de teste
            </button>
          )}
        </section>
      )}
      {!d.data?.configured && (
        <ToolInfo>
          Mercado Pago Assinaturas em teste. Configuração do vendedor pendente.
        </ToolInfo>
      )}
      <div className="pricing-grid">
        {Object.entries(config.plans).map(([k, p]: any) => (
          <section className="price-card" key={k}>
            <span className="eyebrow">{p.name}</span>
            <h3>
              {money(p.cents)}
              <small>/mês</small>
            </h3>
            <p>
              Até {p.members} pessoa(s) e {p.records} registros ativos.
            </p>
            <button
              className="button primary"
              disabled={!d.data?.canCheckout}
              onClick={() => setPlan(k)}
            >
              {d.data?.canCheckout
                ? "Contratar em teste"
                : "Checkout de teste indisponível"}
            </button>
          </section>
        ))}
      </div>
      {!!d.data?.history.length && (
        <section className="panel panel-section">
          <h2>Histórico de cobrança</h2>
          {d.data.history.map((h: any) => (
            <div className="invitation-row" key={h.id}>
              <span>{h.type}</span>
              <span>
                {h.status} · {date(h.created_at)}
              </span>
            </div>
          ))}
        </section>
      )}
      {plan && (
        <Modal title="Revise antes de contratar" onClose={() => setPlan("")}>
          <p>
            Plano {config.plans[plan].name}: {money(config.plans[plan].cents)}{" "}
            por mês, com renovação mensal até cancelamento. O preço confirmado é
            apresentado no checkout hospedado. Esta versão aceita somente
            ambiente de testes.
          </p>
          <form
            onSubmit={a.onSubmit(async () => {
              const r = await api(`/${c.company.id}/billing/checkout`, "POST", {
                plan,
                recurringAuthorization: true,
              });
              window.location.assign(r.url);
            })}
          >
            <label className="check-label">
              <input type="checkbox" required /> Autorizo especificamente a
              assinatura recorrente mensal nas condições apresentadas, até
              cancelamento.
            </label>
            <ErrorBox message={a.error} />
            <Submit busy={a.busy}>
              Continuar ao checkout de testes <ArrowUpRight size={16} />
            </Submit>
          </form>
        </Modal>
      )}
    </>
  );
}
