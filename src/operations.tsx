import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Clock,
  CalendarDays,
  ClipboardList,
  Package,
  Download,
  Plus,
  Search,
  ArrowUpRight,
} from "lucide-react";
import { api, download } from "./api";
import {
  Field,
  Modal,
  Submit,
  ErrorBox,
  Loading,
  FormValidation,
  useAction,
  Empty,
} from "./ui";
import { money, parseMoney } from "../shared/domain";
import { modelOptions, allowed, canCosts, type Module } from "../shared/access";
import { parseCsv, toCsv, pipelineDefault } from "../shared/operations";
import type { WorkspaceContext } from "./workspace";
import "./operations.css";
const date = () => new Date().toLocaleDateString("en-CA");
function useOps(c: WorkspaceContext, path: string) {
  const [data, setData] = useState<any>(null);
  const a = useAction(),
    requestId = useRef(0);
  const base = `/${c.company.id}/operations`;
  async function load() {
    const id = ++requestId.current;
    const data = await api(base + path);
    if (id === requestId.current) setData(data);
  }
  useEffect(() => {
    setData(null);
    a.clear();
    void load().catch((e) =>
      a.run(async () => {
        throw e;
      }),
    );
    return () => {
      requestId.current++;
    };
  }, [base, path]);
  return { data, setData, a, load, base };
}
function Title({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow ?? "OPERAÇÃO DO SEU NEGÓCIO"}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function State({ g }: { g: ReturnType<typeof useOps> }) {
  return (
    <>
      <ErrorBox message={g.a.error} />
      {!g.data && !g.a.error && <Loading />}
    </>
  );
}
type F = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: [string, string][];
  hint?: string;
  max?: number;
  default?: any;
};
function Form({
  fields,
  initial = {},
  onSave,
  submit = "Salvar",
  children,
}: {
  fields: F[];
  initial?: any;
  onSave: (v: any) => Promise<any>;
  submit?: string;
  children?: React.ReactNode;
}) {
  const a = useAction();
  return (
    <FormValidation errors={a.fieldErrors}>
      <form
        onSubmit={a.onSubmit(async (f) => {
          const data: any = { ...initial };
          for (const field of fields) {
            const v = String(f.get(field.key) ?? "");
            data[field.key] =
              field.type === "money"
                ? parseMoney(v || "0")
                : field.type === "number"
                  ? Number(v)
                  : v;
          }
          await onSave(data);
        })}
      >
        <div className="form-grid">
          {fields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              {f.options ? (
                <select
                  name={f.key}
                  defaultValue={initial[f.key] ?? f.default ?? ""}
                >
                  {f.options.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  name={f.key}
                  required={f.required}
                  maxLength={f.max ?? 3000}
                  defaultValue={initial[f.key] ?? f.default ?? ""}
                />
              ) : (
                <input
                  name={f.key}
                  type={f.type === "money" ? "text" : (f.type ?? "text")}
                  step={f.type === "number" ? "0.01" : undefined}
                  inputMode={f.type === "money" ? "decimal" : undefined}
                  required={f.required}
                  min={f.type === "number" ? 0 : undefined}
                  maxLength={f.max ?? 160}
                  defaultValue={
                    f.type === "money"
                      ? String(
                          Number(initial[f.key] ?? f.default ?? 0) / 100,
                        ).replace(".", ",")
                      : (initial[f.key] ?? f.default ?? "")
                  }
                />
              )}
            </Field>
          ))}
        </div>
        {children}
        <ErrorBox message={a.error} />
        <Submit busy={a.busy}>{submit}</Submit>
      </form>
    </FormValidation>
  );
}
export function WorkdayPage({ c }: { c: WorkspaceContext }) {
  const g = useOps(c, "/day"),
    [snooze, setSnooze] = useState<any>(null);
  const data = g.data;
  return (
    <>
      <Title
        eyebrow="SEU PRÓXIMO PASSO COMEÇA AQUI"
        title={`Meu dia · ${c.me.user.name.split(" ")[0]}`}
        description="Sua central de trabalho, com prazos reais e regras que você pode conferir."
      >
        <button
          className="button secondary"
          onClick={() => void g.a.run(g.load)}
        >
          Atualizar
        </button>
      </Title>
      <State g={g} />
      {data && (
        <>
          <section className="day-hero">
            <div>
              <span className="eyebrow">{data.today} · MEU NEGÓCIO</span>
              <h2>
                {data.items.length
                  ? `${data.items.length} pontos para cuidar hoje`
                  : "Um dia para avançar com clareza"}
              </h2>
              <p>
                {data.items.length
                  ? "Prioridades a partir da agenda, prazos e registros da sua empresa."
                  : "Não há lembretes pendentes pelas regras atuais. Confira a agenda e continue seu planejamento."}
              </p>
              <small>
                Atualizado em{" "}
                {new Date(data.updatedAt).toLocaleTimeString("pt-BR")}.
                Lembretes internos; nenhuma mensagem é enviada automaticamente.
              </small>
            </div>
            <div className="day-symbol">
              <ClipboardList size={70} />
            </div>
          </section>
          <div className="operation-columns">
            <section className="panel operation-panel">
              <div className="panel-head">
                <h2>O que pede sua atenção</h2>
                <span className="tag">{data.items.length} pendentes</span>
              </div>
              {!data.items.length ? (
                <Empty
                  title="Tudo conferido por aqui"
                  description="Novos compromissos e prazos aparecerão nesta central."
                />
              ) : (
                data.items.map((item: any) => (
                  <article className="day-item" key={item.id}>
                    <div className="day-icon">
                      {item.module === "appointments" ? (
                        <CalendarDays size={19} />
                      ) : item.module === "stock" ? (
                        <Package size={19} />
                      ) : (
                        <Clock size={19} />
                      )}
                    </div>
                    <div>
                      <button
                        className="link-button strong-link"
                        onClick={() =>
                          c.go(
                            item.target +
                              "?record=" +
                              encodeURIComponent(item.id.split(":")[1]),
                          )
                        }
                      >
                        {item.title} <ArrowUpRight size={14} />
                      </button>
                      <p>{item.reason}</p>
                      <div className="row-actions">
                        {item.completable &&
                          allowed(c.company.role, item.module, "write") && (
                            <button
                              onClick={() =>
                                void g.a.run(async () => {
                                  await api(g.base + "/reminders", "POST", {
                                    id: item.id,
                                    status: "done",
                                  });
                                  await g.load();
                                  c.notify("Registro concluído.");
                                })
                              }
                            >
                              Concluir
                            </button>
                          )}
                        <button onClick={() => setSnooze(item)}>Adiar</button>
                        <button
                          onClick={() =>
                            void g.a.run(async () => {
                              await api(g.base + "/reminders", "POST", {
                                id: item.id,
                                status: "dismissed",
                              });
                              await g.load();
                            })
                          }
                        >
                          Dispensar lembrete
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </section>
            <aside className="panel operation-panel">
              <span className="eyebrow">COMECE COM O QUE É ÚTIL</span>
              <h2>Ativação do seu negócio</h2>
              <p className="small-muted">
                O checklist acompanha registros reais, sem preencher sua conta
                com exemplos.
              </p>
              {data.activation.map((step: any) => (
                <button
                  className="activation-step"
                  key={step.id}
                  onClick={() => c.go(step.target)}
                >
                  <span className={step.done ? "checked" : ""}>
                    {step.done ? <Check size={16} /> : <ArrowRight size={15} />}
                  </span>
                  <strong>{step.title}</strong>
                </button>
              ))}
              <Link className="button secondary" to="/app/ajuda">
                Ajuda e suporte
              </Link>
            </aside>
          </div>
        </>
      )}
      {snooze && (
        <Modal title="Adiar lembrete" onClose={() => setSnooze(null)}>
          <p>{snooze.title}</p>
          <Form
            fields={[
              {
                key: "until",
                label: "Lembrar novamente em",
                type: "date",
                required: true,
              },
            ]}
            onSave={async (v) => {
              await api(g.base + "/reminders", "POST", {
                id: snooze.id,
                status: "snoozed",
                until: v.until,
              });
              setSnooze(null);
              await g.load();
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function BusinessModels({ c }: { c: WorkspaceContext }) {
  const [v, setV] = useState<any>(c.company.profile),
    a = useAction();
  const [version, setVersion] = useState(c.company.profile_version);
  return (
    <section className="panel operation-panel">
      <h2>Ferramentas para o seu modelo de negócio</h2>
      <p>
        Selecione tudo o que faz parte da sua rotina. Você pode ativar qualquer
        ferramenta depois; essas escolhas não concedem permissões.
      </p>
      <form
        onSubmit={a.onSubmit(async () => {
          const r = await api("/" + c.company.id + "/profile", "PUT", {
            ...v,
            version,
          });
          setVersion(r.version);
          c.refresh();
          c.notify("Modelo de negócio e atalhos atualizados.");
        })}
      >
        <div className="goal-grid">
          {modelOptions.map(([id, label]) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={(v.businessModels ?? []).includes(id)}
                onChange={(e) =>
                  setV({
                    ...v,
                    businessModels: e.target.checked
                      ? [...(v.businessModels ?? []), id]
                      : (v.businessModels ?? []).filter(
                          (x: string) => x !== id,
                        ),
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <ErrorBox message={a.error} />
        <Submit busy={a.busy}>Salvar personalização</Submit>
      </form>
    </section>
  );
}
export function CRMPage({ c }: { c: WorkspaceContext }) {
  const g = useOps(c, "/crm"),
    [selected, setSelected] = useState(
      new URLSearchParams(location.search).get("record") ?? "",
    ),
    [modal, setModal] = useState<any>(null),
    [text, setText] = useState(""),
    [q, setQ] = useState("");
  const d = g.data,
    client = d?.clients.find((v: any) => v.id === selected),
    pipeline = d?.pipeline.data.stages ?? pipelineDefault;
  const editable = allowed(c.company.role, "clients", "write");
  async function save(v: any) {
    await api(
      "/" +
        c.company.id +
        "/records/opportunities" +
        (modal?.id ? "/" + modal.id : ""),
      modal?.id ? "PUT" : "POST",
      {
        ...(modal?.data ?? {}),
        ...v,
        stage: [
          "lead",
          "contact",
          "proposal",
          "negotiation",
          "won",
          "lost",
        ].includes(v.pipelineStage)
          ? v.pipelineStage
          : "contact",
        ...(modal?.id ? { version: modal.version } : {}),
      },
    );
    setModal(null);
    await g.load();
    c.notify("Oportunidade salva. Ganho não registra recebimento.");
  }
  return (
    <>
      <Title
        title="Clientes e oportunidades"
        description="Cada conversa tem um próximo passo. Ganhar uma oportunidade não significa receber o pagamento."
      >
        <button className="button secondary" onClick={() => c.go("clientes")}>
          Cadastro de clientes
        </button>
        {editable && (
          <button
            className="button primary"
            onClick={() => setModal({ new: true })}
          >
            <Plus size={16} />
            Nova oportunidade
          </button>
        )}
      </Title>
      <State g={g} />
      {d && (
        <>
          <div className="table-toolbar">
            <label className="search-input">
              <Search size={16} />
              <input
                aria-label="Buscar oportunidades"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar oportunidades…"
              />
            </label>
            {allowed(c.company.role, "settings", "write") && (
              <button
                className="button secondary"
                onClick={() => setModal({ pipeline: true })}
              >
                Configurar funil e modelos
              </button>
            )}
          </div>
          <div className="pipeline-board">
            {pipeline.map((stage: any) => (
              <section key={stage.id}>
                <header>
                  <h3>{stage.label}</h3>
                  <span>
                    {
                      d.opportunities.filter(
                        (o: any) =>
                          (o.data.pipelineStage || o.data.stage) === stage.id,
                      ).length
                    }
                  </span>
                </header>
                {d.opportunities
                  .filter(
                    (o: any) =>
                      (o.data.pipelineStage || o.data.stage) === stage.id &&
                      JSON.stringify(o.data)
                        .toLowerCase()
                        .includes(q.toLowerCase()),
                  )
                  .map((o: any) => (
                    <button
                      className="opportunity-card"
                      key={o.id}
                      onClick={() =>
                        editable ? setModal(o) : setSelected(o.data.clientId)
                      }
                    >
                      <strong>{o.data.name}</strong>
                      <p>
                        {
                          d.clients.find((cl: any) => cl.id === o.data.clientId)
                            ?.data.name
                        }
                      </p>
                      {o.data.valueCents !== undefined && (
                        <b>{money(o.data.valueCents)}</b>
                      )}
                      <small>
                        {o.data.nextAction || "Defina a próxima ação"}
                        {o.data.due ? " · " + o.data.due : ""}
                      </small>
                    </button>
                  ))}
              </section>
            ))}
          </div>
          <section className="panel operation-panel">
            <h2>Histórico do relacionamento</h2>
            <Field label="Cliente">
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Selecione um cliente…</option>
                {d.clients.map((cl: any) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.data.name}
                  </option>
                ))}
              </select>
            </Field>
            {client ? (
              <>
                <p>
                  {client.data.email || "Sem e-mail"} ·{" "}
                  {client.data.phone || "Sem telefone"} · Preferência:{" "}
                  {client.data.communication || "Não informada"}
                </p>
                <div className="operation-columns">
                  <div>
                    <h3>Conversas e retornos</h3>
                    {d.contacts
                      .filter((v: any) => v.data.clientId === selected)
                      .map((e: any) => (
                        <article className="timeline-item" key={e.id}>
                          <small>
                            {e.data.date} · {e.data.channel}
                          </small>
                          <p>{e.data.text}</p>
                        </article>
                      ))}
                    {editable && (
                      <button
                        className="button secondary"
                        onClick={() => setModal({ contact: true })}
                      >
                        Registrar contato
                      </button>
                    )}
                    <h3>Propostas e trabalhos</h3>
                    {d.quotes
                      .filter((v: any) => v.data.clientId === selected)
                      .map((v: any) => (
                        <p key={v.id}>
                          <button
                            className="link-button"
                            onClick={() => c.go("propostas?record=" + v.id)}
                          >
                            Proposta #{v.number} · {v.data.title} · {v.status}
                          </button>
                        </p>
                      ))}
                    {d.orders
                      .filter((v: any) => v.snapshot.clientId === selected)
                      .map((v: any) => (
                        <p key={v.id}>
                          <button
                            className="link-button"
                            onClick={() => c.go("execucao?id=" + v.id)}
                          >
                            {v.snapshot.title} · {v.status}
                          </button>
                        </p>
                      ))}
                  </div>
                  <div>
                    <h3>Acompanhamento por mensagem</h3>
                    <Field label="Modelo editável">
                      <select
                        defaultValue=""
                        onChange={(e) =>
                          setText(
                            e.target.value
                              .replaceAll("{cliente}", client.data.name)
                              .replaceAll("{empresa}", c.company.name),
                          )
                        }
                      >
                        <option value="">Escolha um modelo…</option>
                        {d.pipeline.data.templates.map(
                          (t: string, i: number) => (
                            <option key={i} value={t}>
                              {t}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                    <Field label="Texto para revisar">
                      <textarea
                        rows={5}
                        value={text}
                        maxLength={1500}
                        onChange={(e) => setText(e.target.value)}
                      />
                    </Field>
                    <div className="row-actions">
                      <button
                        className="button secondary"
                        disabled={!text}
                        onClick={() =>
                          void g.a.run(async () => {
                            await navigator.clipboard.writeText(text);
                            c.notify("Mensagem copiada.");
                          })
                        }
                      >
                        Copiar texto
                      </button>
                      {/\d{10,}/.test(client.data.phone.replace(/\D/g, "")) &&
                        text && (
                          <a
                            className="button secondary"
                            href={
                              "https://wa.me/" +
                              client.data.phone.replace(/\D/g, "") +
                              "?text=" +
                              encodeURIComponent(text)
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                          >
                            Abrir WhatsApp <ArrowUpRight size={15} />
                          </a>
                        )}
                    </div>
                    <p className="small-muted">
                      Confira o número com DDI. Abrir o aplicativo não envia a
                      mensagem nem registra contato automaticamente. Use somente
                      contatos autorizados.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p>
                Selecione um cliente para consultar contatos, propostas e
                trabalhos.
              </p>
            )}
          </section>
        </>
      )}
      {modal && (
        <Modal
          title={
            modal.pipeline
              ? "Configurar funil"
              : modal.contact
                ? "Registrar contato"
                : "Oportunidade"
          }
          onClose={() => setModal(null)}
        >
          {modal.pipeline ? (
            <PipelineEditor
              value={d.pipeline}
              onSave={async (v) => {
                await api(g.base + "/pipeline", "PUT", v);
                setModal(null);
                await g.load();
              }}
            />
          ) : modal.contact ? (
            <Form
              fields={[
                {
                  key: "date",
                  label: "Data do contato",
                  type: "date",
                  required: true,
                  default: date(),
                },
                {
                  key: "channel",
                  label: "Canal",
                  options: [
                    ["note", "Anotação"],
                    ["phone", "Telefone"],
                    ["whatsapp", "WhatsApp"],
                    ["email", "E-mail"],
                    ["meeting", "Reunião"],
                  ],
                },
                {
                  key: "text",
                  label: "O que foi combinado?",
                  type: "textarea",
                  required: true,
                },
              ]}
              onSave={async (v) => {
                await api(g.base + "/contact", "POST", {
                  ...v,
                  clientId: selected,
                });
                setModal(null);
                await g.load();
              }}
            />
          ) : (
            <Form
              initial={{
                ...(modal.data ?? {}),
                pipelineStage:
                  modal.data?.pipelineStage || modal.data?.stage || "lead",
              }}
              fields={[
                { key: "name", label: "Nome da oportunidade", required: true },
                {
                  key: "clientId",
                  label: "Cliente",
                  options: [
                    ["", "Selecione…"],
                    ...d.clients.map(
                      (v: any) => [v.id, v.data.name] as [string, string],
                    ),
                  ],
                },
                {
                  key: "pipelineStage",
                  label: "Etapa do funil",
                  options: pipeline.map((v: any) => [v.id, v.label]),
                },
                {
                  key: "valueCents",
                  label: "Valor previsto (R$)",
                  type: "money",
                },
                {
                  key: "assignee",
                  label: "Responsável",
                  options: [
                    ["", "Sem responsável"],
                    ...(d.members ?? []).map(
                      (m: any) => [m.user_id, m.name] as [string, string],
                    ),
                  ],
                },
                { key: "nextAction", label: "Próxima ação", type: "textarea" },
                { key: "due", label: "Data da próxima ação", type: "date" },
                {
                  key: "lossReason",
                  label: "Motivo da perda (obrigatório na etapa Perdido)",
                  type: "textarea",
                },
              ]}
              onSave={save}
            />
          )}
        </Modal>
      )}
    </>
  );
}
function PipelineEditor({
  value,
  onSave,
}: {
  value: any;
  onSave: (v: any) => Promise<any>;
}) {
  const [stages, setStages] = useState<any[]>(value.data.stages),
    [templates, setTemplates] = useState(value.data.templates.join("\n")),
    a = useAction();
  return (
    <form
      onSubmit={a.onSubmit(() =>
        onSave({
          version: value.version,
          stages,
          templates: templates.split("\n").filter(Boolean),
        }),
      )}
    >
      <p>
        Mantenha os identificadores das etapas já utilizadas. Ganho e perdido
        precisam permanecer.
      </p>
      {stages.map((s, i) => (
        <div className="inline-form" key={i}>
          <input
            aria-label={"Identificador da etapa " + (i + 1)}
            required
            value={s.id}
            onChange={(e) =>
              setStages(
                stages.map((v, n) =>
                  n === i ? { ...v, id: e.target.value } : v,
                ),
              )
            }
          />
          <input
            aria-label={"Nome da etapa " + (i + 1)}
            required
            value={s.label}
            onChange={(e) =>
              setStages(
                stages.map((v, n) =>
                  n === i ? { ...v, label: e.target.value } : v,
                ),
              )
            }
          />
          <button
            type="button"
            className="link-button"
            onClick={() => setStages(stages.filter((_, n) => n !== i))}
          >
            Remover
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        onClick={() =>
          setStages([
            ...stages,
            { id: "nova-" + stages.length, label: "Nova etapa" },
          ])
        }
      >
        Adicionar etapa
      </button>
      <Field label="Modelos de acompanhamento (um por linha)">
        <textarea
          value={templates}
          maxLength={10000}
          onChange={(e) => setTemplates(e.target.value)}
        />
      </Field>
      <p className="small-muted">
        Use {"{cliente}"} e {"{empresa}"} nos modelos. Nenhum envio automático.
      </p>
      <ErrorBox message={a.error} />
      <Submit busy={a.busy}>Salvar funil</Submit>
    </form>
  );
}
export function ExecutionPage({ c }: { c: WorkspaceContext }) {
  const id = new URLSearchParams(location.search).get("id") ?? "",
    g = useOps(c, "/orders/" + id),
    options = useOps(c, "/options"),
    [value, setValue] = useState<any>(null),
    [modal, setModal] = useState(""),
    [finish, setFinish] = useState(false);
  useEffect(() => {
    if (g.data)
      setValue(
        g.data.execution?.data ?? {
          due: g.data.order.snapshot.deliveryDue || "",
          assignee: "",
          estimatedMinutes: 0,
          actualMinutes: 0,
          stages: [],
          notes: "",
          incidents: "",
          attachments: [],
          costMode: "unknown",
          actualCostCents: 0,
        },
      );
  }, [g.data?.execution?.version, g.data?.order?.id]);
  const editable = allowed(c.company.role, "orders", "write"),
    v = value;
  return (
    <>
      <Title
        title={g.data?.order.snapshot.title ?? "Execução do trabalho"}
        description="Combinados, etapas e materiais conectados à proposta aprovada."
      >
        <button className="button secondary" onClick={() => c.go("ordens")}>
          Todos os trabalhos
        </button>
      </Title>
      <State g={g} />
      {g.data && v && (
        <>
          <div className="operation-columns">
            <section className="panel operation-panel">
              <h2>Plano de execução</h2>
              <p>
                Cliente: {g.data.order.snapshot.client.name} · Estado:{" "}
                {g.data.order.status === "done" ? "Concluído" : "Em execução"}
              </p>
              <form
                onSubmit={g.a.onSubmit(async () => {
                  await api(g.base + "/orders/" + id, "PUT", {
                    data: v,
                    version: g.data.execution?.version ?? null,
                  });
                  await g.load();
                  c.notify("Execução salva com controle de versão.");
                })}
              >
                <fieldset
                  disabled={!editable || g.data.order.status === "done"}
                >
                  <div className="form-grid">
                    <Field label="Prazo combinado">
                      <input
                        type="date"
                        value={v.due}
                        onChange={(e) =>
                          setValue({ ...v, due: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Responsável">
                      <select
                        value={v.assignee}
                        onChange={(e) =>
                          setValue({ ...v, assignee: e.target.value })
                        }
                      >
                        <option value="">Sem responsável</option>
                        {options.data?.members.map((m: any) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Tempo estimado (min)">
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        value={v.estimatedMinutes}
                        onChange={(e) =>
                          setValue({
                            ...v,
                            estimatedMinutes: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                    <Field label="Tempo realizado (min)">
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        value={v.actualMinutes}
                        onChange={(e) =>
                          setValue({
                            ...v,
                            actualMinutes: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <h3>Etapas e checklist</h3>
                  {v.stages.map((s: any, i: number) => (
                    <div className="execution-stage" key={i}>
                      <input
                        type="checkbox"
                        aria-label={"Concluir etapa " + (i + 1)}
                        checked={s.done}
                        onChange={(e) =>
                          setValue({
                            ...v,
                            stages: v.stages.map((x: any, j: number) =>
                              i === j ? { ...x, done: e.target.checked } : x,
                            ),
                          })
                        }
                      />
                      <input
                        aria-label={"Descrição da etapa " + (i + 1)}
                        required
                        maxLength={200}
                        value={s.text}
                        onChange={(e) =>
                          setValue({
                            ...v,
                            stages: v.stages.map((x: any, j: number) =>
                              i === j ? { ...x, text: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <input
                        aria-label={"Prazo da etapa " + (i + 1)}
                        type="date"
                        value={s.due}
                        onChange={(e) =>
                          setValue({
                            ...v,
                            stages: v.stages.map((x: any, j: number) =>
                              i === j ? { ...x, due: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <select
                        aria-label={"Responsável da etapa " + (i + 1)}
                        value={s.assignee}
                        onChange={(e) =>
                          setValue({
                            ...v,
                            stages: v.stages.map((x: any, j: number) =>
                              i === j ? { ...x, assignee: e.target.value } : x,
                            ),
                          })
                        }
                      >
                        <option value="">Sem responsável</option>
                        {options.data?.members.map((m: any) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() =>
                          setValue({
                            ...v,
                            stages: v.stages.filter(
                              (_: any, j: number) => i !== j,
                            ),
                          })
                        }
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      setValue({
                        ...v,
                        stages: [
                          ...v.stages,
                          { text: "", done: false, due: "", assignee: "" },
                        ],
                      })
                    }
                  >
                    Adicionar etapa
                  </button>
                  <Field label="Observações da execução">
                    <textarea
                      value={v.notes}
                      maxLength={4000}
                      onChange={(e) =>
                        setValue({ ...v, notes: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Ocorrências e ajustes combinados">
                    <textarea
                      value={v.incidents}
                      maxLength={4000}
                      onChange={(e) =>
                        setValue({ ...v, incidents: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Anexos privados">
                    <select
                      multiple
                      value={v.attachments}
                      onChange={(e) =>
                        setValue({
                          ...v,
                          attachments: Array.from(e.target.selectedOptions).map(
                            (o) => o.value,
                          ),
                        })
                      }
                    >
                      {options.data?.files.map((f: any) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {canCosts(c.company.role) && (
                    <>
                      <Field label="Base do resultado estimado">
                        <select
                          value={v.costMode}
                          onChange={(e) =>
                            setValue({ ...v, costMode: e.target.value })
                          }
                        >
                          <option value="unknown">
                            Custos ainda não confirmados
                          </option>
                          <option value="snapshot">
                            Confirmo que os custos dos itens cobrem o trabalho
                            inteiro
                          </option>
                          <option value="total">
                            Informar o custo total real, sem somar os itens
                            novamente
                          </option>
                        </select>
                      </Field>
                      {v.costMode === "total" && (
                        <Field label="Custo total confirmado (R$)">
                          <input
                            inputMode="decimal"
                            defaultValue={String(
                              (v.actualCostCents ?? 0) / 100,
                            ).replace(".", ",")}
                            onChange={(e) => {
                              try {
                                setValue({
                                  ...v,
                                  actualCostCents: parseMoney(e.target.value),
                                });
                                e.target.setCustomValidity("");
                              } catch {
                                e.target.setCustomValidity(
                                  "Use um valor como 49,90.",
                                );
                              }
                            }}
                          />
                        </Field>
                      )}
                    </>
                  )}
                  <ErrorBox message={g.a.error} />
                  <Submit busy={g.a.busy}>Salvar execução</Submit>
                </fieldset>
              </form>
            </section>
            <aside className="panel operation-panel">
              <h2>Materiais e entrega</h2>
              <p>
                A conclusão consome somente a reserva restante deste trabalho.
                Consumos parciais já registrados não serão repetidos.
              </p>
              {g.data.order.snapshot.items.map((i: any, n: number) => (
                <article className="timeline-item" key={n}>
                  <strong>
                    {i.quantity} × {i.name}
                  </strong>
                  <p>{i.materials.length} materiais previstos no item.</p>
                </article>
              ))}
              {g.data.movements.map((m: any) => (
                <p className="small-muted" key={m.id}>
                  {m.reason} · físico {m.delta} · reserva {m.reserved_delta}
                </p>
              ))}
              {editable && g.data.order.status !== "done" && (
                <div className="stack-actions">
                  <button
                    className="button secondary"
                    onClick={() => setModal("material")}
                  >
                    Reservar ou consumir material
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setModal("purchase")}
                  >
                    Criar necessidade de compra
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setFinish(true)}
                  >
                    Concluir trabalho
                  </button>
                </div>
              )}
              <p className="small-muted">
                A conclusão cria um retorno de pós-venda. Não marca pagamentos
                como recebidos.
              </p>
              <Link to="/app/financeiro" className="link-button">
                Consultar recebimentos →
              </Link>
            </aside>
          </div>
        </>
      )}
      {modal && (
        <Modal
          title={
            modal === "material"
              ? "Material do trabalho"
              : "Necessidade de compra"
          }
          onClose={() => setModal("")}
        >
          <Form
            fields={[
              {
                key: "productId",
                label: "Produto / SKU",
                options: [
                  ["", "Selecione…"],
                  ...(options.data?.products ?? []).map(
                    (p: any) => [p.id, p.data.name] as [string, string],
                  ),
                ],
              },
              {
                key: "quantity",
                label: "Quantidade inteira na unidade do SKU",
                type: "number",
                required: true,
                default: 1,
              },
              ...(modal === "material"
                ? [
                    {
                      key: "action",
                      label: "Ação",
                      options: [
                        ["reserve", "Reservar para este trabalho"],
                        ["consume", "Consumir da reserva"],
                      ] as [string, string][],
                    },
                    { key: "note", label: "Motivo", required: true },
                  ]
                : []),
            ]}
            onSave={async (f) => {
              await api(
                g.base +
                  "/orders/" +
                  id +
                  (modal === "material" ? "/material" : "/purchase-list"),
                "POST",
                modal === "material"
                  ? { ...f, key: crypto.randomUUID() }
                  : {
                      items: [{ productId: f.productId, quantity: f.quantity }],
                      key: crypto.randomUUID(),
                    },
              );
              setModal("");
              await g.load();
              c.notify("Movimentação registrada.");
            }}
          />
        </Modal>
      )}
      {finish && (
        <Modal title="Concluir este trabalho?" onClose={() => setFinish(false)}>
          <p>
            As etapas precisam estar concluídas. A reserva restante será
            consumida e será criada uma tarefa de pós-venda. O histórico do
            documento será preservado.
          </p>
          <button
            className="button primary"
            disabled={g.a.busy}
            onClick={() =>
              void g.a.run(async () => {
                await api(
                  "/" + c.company.id + "/orders/" + id + "/complete",
                  "POST",
                  {},
                );
                setFinish(false);
                await g.load();
                c.notify("Trabalho concluído e retorno criado.");
              })
            }
          >
            Confirmar conclusão
          </button>
          <ErrorBox message={g.a.error} />
        </Modal>
      )}
    </>
  );
}

export function PricingPage({ c }: { c: WorkspaceContext }) {
  const options = useOps(c, "/options"),
    g = useOps(c, "/pricing"),
    [result, setResult] = useState<any>(null),
    [product, setProduct] = useState("");
  const fields: F[] = [
    {
      key: "materialCents",
      label: "Materiais · total (R$)",
      type: "money",
      hint: "Inclua somente materiais; mão de obra e outros custos entram separadamente.",
    },
    {
      key: "laborMinutes",
      label: "Mão de obra (minutos)",
      type: "number",
      default: 0,
    },
    {
      key: "hourlyRateCents",
      label: "Custo da hora de trabalho (R$)",
      type: "money",
    },
    {
      key: "variableCents",
      label: "Outras despesas variáveis (R$)",
      type: "money",
    },
    { key: "travelCents", label: "Deslocamento (R$)", type: "money" },
    {
      key: "feePercent",
      label: "Taxas informadas (%)",
      type: "number",
      default: 0,
    },
    {
      key: "taxPercent",
      label: "Impostos informados (%)",
      type: "number",
      default: 0,
    },
    {
      key: "marginPercent",
      label: "Margem desejada (%)",
      type: "number",
      default: 20,
    },
  ];
  return (
    <>
      <Title
        title="Custos e precificação"
        description="Premissas claras para uma decisão sua. Preço sugerido não é garantia de lucro."
      />
      <div className="operation-columns">
        <section className="panel operation-panel">
          <h2>Calcule sem contar custos duas vezes</h2>
          <Form
            fields={fields}
            submit="Calcular preço"
            onSave={async (v) => {
              const assumptions = {
                materialMode: "total",
                materials: [],
                materialCents: v.materialCents,
                laborMinutes: v.laborMinutes,
                hourlyRateCents: v.hourlyRateCents,
                variableCents: v.variableCents,
                travelCents: v.travelCents,
                feeBps: Math.round(v.feePercent * 100),
                taxBps: Math.round(v.taxPercent * 100),
                marginBps: Math.round(v.marginPercent * 100),
              };
              setResult(
                await api(g.base + "/pricing", "POST", { assumptions }),
              );
              await g.load();
            }}
          />
          <p className="small-muted">
            Taxas e impostos são parâmetros fornecidos por você ou seu
            responsável. Não fazemos apuração tributária. Despesas já incluídas
            no custo da hora não devem entrar novamente em despesas variáveis.
          </p>
        </section>
        <section className="panel operation-panel">
          <h2>O que o cálculo mostra</h2>
          {result ? (
            <>
              <div className="price-result">
                <small>Preço sugerido</small>
                <strong>{money(result.priceCents)}</strong>
              </div>
              <dl className="definition-list">
                {[
                  ["Materiais", money(result.materialCents)],
                  ["Mão de obra", money(result.laborCents)],
                  ["Custo base", money(result.baseCents)],
                  ["Taxas e impostos informados", money(result.feesCents)],
                  ["Resultado estimado", money(result.estimatedResultCents)],
                  ["Margem sobre o preço", String(result.marginPercent) + "%"],
                  [
                    "Markup sobre o custo base",
                    String(result.markupPercent) + "%",
                  ],
                ].map(([l, v]) => (
                  <div key={l}>
                    <dt>{l}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="notice">{result.formula}</p>
              <Field label="Aplicar a um produto ou serviço">
                <select
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {options.data?.products.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.data.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="button primary"
                disabled={!product || g.a.busy}
                onClick={() =>
                  void g.a.run(async () => {
                    const p = options.data.products.find(
                      (p: any) => p.id === product,
                    );
                    await api(g.base + "/pricing", "POST", {
                      assumptions: result.assumptions,
                      productId: product,
                      version: p.version,
                      apply: true,
                    });
                    await options.load();
                    c.notify(
                      "Preço e custo aplicados ao catálogo. Documentos antigos permanecem com seus valores históricos.",
                    );
                  })
                }
              >
                Aplicar preço e custo ao catálogo
              </button>
            </>
          ) : (
            <p>
              Preencha as premissas para consultar fórmula, custos, margem e
              markup. Cálculos são salvos no histórico da empresa.
            </p>
          )}
          <ErrorBox message={g.a.error} />
        </section>
      </div>
      <section className="panel operation-panel">
        <h2>Histórico de cálculos</h2>
        {g.data?.slice(0, 20).map((r: any) => (
          <p key={r.id}>
            {new Date(r.created_at).toLocaleString("pt-BR")} ·{" "}
            {money(r.data.priceCents)} ·{" "}
            {r.data.applied ? "Aplicado ao catálogo" : "Simulação salva"}{" "}
            <button className="link-button" onClick={() => setResult(r.data)}>
              Revisar premissas
            </button>
          </p>
        ))}
      </section>
    </>
  );
}
export function ReceiptsPage({ c }: { c: WorkspaceContext }) {
  const g = useOps(c, "/receipts"),
    options = useOps(c, "/options"),
    [item, setItem] = useState<any>(null);
  return (
    <>
      <Title
        title="Compras e recebimento"
        description="Comprado é um compromisso com o fornecedor. Recebido é o que chegou fisicamente."
      >
        <button className="button secondary" onClick={() => c.go("materiais")}>
          Listas e cotações
        </button>
        <button className="button secondary" onClick={() => c.go("estoque")}>
          Consultar estoque
        </button>
      </Title>
      <State g={g} />
      {g.data && (
        <section className="panel record-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Material / lista</th>
                  <th>Compra</th>
                  <th>Recebido</th>
                  <th>Falta receber</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {g.data.items.map((i: any) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.data.material}</strong>
                      <small className="table-sub">{i.list_name}</small>
                    </td>
                    <td>
                      {i.data.purchased
                        ? "Compra registrada"
                        : "Ainda na lista"}{" "}
                      · {i.data.quantity} {i.data.unit}
                    </td>
                    <td>
                      {Number(i.received_milli) / 1000} {i.data.unit}
                    </td>
                    <td>
                      {Number(i.data.quantity.replace(",", ".")) -
                        Number(i.received_milli) / 1000}{" "}
                      {i.data.unit}
                    </td>
                    <td>
                      {i.data.purchased &&
                        Number(i.received_milli) / 1000 <
                          Number(i.data.quantity.replace(",", ".")) &&
                        allowed(c.company.role, "stock", "write") && (
                          <button
                            className="button secondary"
                            onClick={() =>
                              setItem({ ...i, key: crypto.randomUUID() })
                            }
                          >
                            Registrar recebimento
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!g.data.items.length && (
            <Empty
              title="Comece pela lista de compras"
              description="Uma compra registrada poderá ser recebida parcialmente e vinculada ao SKU correto."
              action={() => c.go("materiais")}
            />
          )}
        </section>
      )}
      {item && (
        <Modal
          title="Confirmar recebimento físico"
          onClose={() => setItem(null)}
        >
          <p>
            {item.data.material} · {item.data.quantity} {item.data.unit}. Não
            use preço de pesquisa como custo confirmado.
          </p>
          <Form
            fields={[
              {
                key: "productId",
                label: "SKU que entrará no estoque",
                options: [
                  ["", "Selecione o tamanho/cor correto"],
                  ...(options.data?.products ?? []).map(
                    (p: any) =>
                      [p.id, p.data.name + " · " + p.data.unit] as [
                        string,
                        string,
                      ],
                  ),
                ],
              },
              {
                key: "quantity",
                label: "Quantidade recebida na unidade da compra",
                required: true,
                default: "1",
              },
              {
                key: "stockQuantity",
                label: "Quantidade física inteira na unidade do SKU",
                type: "number",
                required: true,
                default: 1,
              },
              {
                key: "note",
                label: "Conferência, lote ou conversão entre unidades",
                type: "textarea",
                required: true,
                hint: "Se as unidades diferirem, registre a conversão que você conferiu. Não presumimos conteúdo de embalagem.",
              },
            ]}
            onSave={async (v) => {
              await api(g.base + "/receipts", "POST", {
                ...v,
                itemId: item.id,
                key: item.key,
              });
              setItem(null);
              await g.load();
              c.notify("Recebimento registrado e estoque atualizado.");
            }}
          />
        </Modal>
      )}
      <p className="notice">
        Perdas, devoluções e ajustes são registrados no módulo Estoque, sempre
        com motivo. Registrar compra ou consultar preço não movimenta estoque
        nem dinheiro automaticamente.
      </p>
    </>
  );
}
export function ReportsPage({ c }: { c: WorkspaceContext }) {
  const [from, setFrom] = useState(date().slice(0, 8) + "01"),
    [to, setTo] = useState(date()),
    [details, setDetails] = useState<any>(null),
    g = useOps(c, "/reports?from=" + from + "&to=" + to);
  return (
    <>
      <Title
        title="Relatórios para decidir"
        description="Vendas, dinheiro e execução têm significados diferentes. Cada indicador mostra a sua base."
      >
        <a
          className="button secondary"
          href={"/api" + g.base + "/reports/export?from=" + from + "&to=" + to}
        >
          Baixar CSV seguro <Download size={16} />
        </a>
      </Title>
      <div className="period-filter">
        <Field label="De">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Até">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      <State g={g} />
      {g.data && (
        <>
          <div className="report-cards">
            {g.data.indicators.map((i: any) => (
              <button
                className="panel report-card"
                key={i.key}
                onClick={() => setDetails(i)}
              >
                <small>{i.title}</small>
                <strong>
                  {i.value === null
                    ? "Sem informação"
                    : i.unit === "money"
                      ? money(i.value)
                      : i.unit === "percent"
                        ? i.value + "%"
                        : i.value + " dias"}
                </strong>
                <p>{i.definition}</p>
                <span>Ver os registros →</span>
              </button>
            ))}
          </div>
          <p className="small-muted">
            Atualizado em {new Date(g.data.updatedAt).toLocaleString("pt-BR")}.
            Zero é exibido quando há registros com resultado zero; ausência de
            registros aparece como “Sem informação”.
          </p>
          <div className="operation-columns">
            <section className="panel operation-panel">
              <h2>Fluxo de caixa realizado e previsto</h2>
              <p>
                Movimentação líquida realizada no período:{" "}
                <strong>{money(g.data.cash.balanceCents)}</strong>
              </p>
              <p>{g.data.cash.definition}</p>
              {g.data.forecast.map((l: any) => (
                <p key={l.id}>
                  <button
                    className="link-button"
                    onClick={() => c.go("financeiro?record=" + l.id)}
                  >
                    {l.due} · {l.name} ·{" "}
                    {l.direction === "in" ? "a receber" : "a pagar"}{" "}
                    {money(l.remainingCents)}
                  </button>
                </p>
              ))}
            </section>
            <section className="panel operation-panel">
              <h2>Produtos e serviços mais vendidos</h2>
              <p className="small-muted">
                Valor bruto dos itens de ordens criadas no período. Descontos
                globais não são rateados por item.
              </p>
              {g.data.topProducts.map((p: any) => (
                <p key={p.name}>
                  <button
                    className="link-button"
                    onClick={() => c.go("ordens")}
                  >
                    {p.name} · {p.quantity} unidades · {money(p.grossCents)}
                  </button>
                </p>
              ))}
              <h3>Consumo de materiais</h3>
              {g.data.consumption.map((m: any) => (
                <p key={m.id}>
                  <button
                    className="link-button"
                    onClick={() => c.go("execucao?id=" + m.orderId)}
                  >
                    {m.product} · {m.quantity} na unidade cadastrada
                  </button>
                </p>
              ))}
            </section>
          </div>
          <section className="panel operation-panel">
            <h2>Resultado estimado por trabalho</h2>
            {g.data.workResults.map((r: any) => (
              <article className="timeline-item" key={r.id}>
                <button
                  className="link-button"
                  onClick={() => c.go("execucao?id=" + r.id)}
                >
                  {r.name}
                </button>
                <p>
                  {r.resultCents === null
                    ? "Dados de custo insuficientes"
                    : money(r.resultCents)}
                </p>
                <small>{r.explanation}</small>
              </article>
            ))}
          </section>
        </>
      )}
      {details && (
        <Modal title={details.title} onClose={() => setDetails(null)}>
          <p>{details.definition}</p>
          <p>{details.missing}</p>
          {details.rows.map((r: any, i: number) => (
            <p key={i}>
              <button
                className="link-button"
                onClick={() => c.go(r.target + "?record=" + r.id)}
              >
                {r.name}
                {typeof r.value === "number"
                  ? " · " + money(r.value)
                  : r.value
                    ? " · " + r.value
                    : ""}
              </button>
            </p>
          ))}
        </Modal>
      )}
    </>
  );
}

export function AccountsPage({ c }: { c: WorkspaceContext }) {
  const g = useOps(c, "/accounts"),
    [modal, setModal] = useState("");
  const accounts: [string, string][] = (g.data?.accounts ?? []).map(
    (a: any) => [a.id, a.name],
  );
  return (
    <>
      <Title
        title="Contas, parcelas e extrato"
        description="Organize onde o dinheiro está. Transferências entre contas próprias não são receita."
      >
        <button
          className="button secondary"
          onClick={() => setModal("installments")}
        >
          Criar parcelas
        </button>
        <button className="button primary" onClick={() => setModal("account")}>
          Nova conta financeira
        </button>
      </Title>
      <State g={g} />
      {g.data && (
        <>
          <div className="report-cards">
            {g.data.accounts.map((a: any) => (
              <section className="panel report-card" key={a.id}>
                <small>{a.name}</small>
                <strong>{money(a.balanceCents)}</strong>
                <p>
                  Saldo inicial {money(Number(a.opening_cents))} + recebimentos
                  − pagamentos ± transferências.
                </p>
              </section>
            ))}
          </div>
          <section className="panel operation-panel">
            <h2>Transferências e registros sem conta</h2>
            <p>
              Movimentação líquida sem conta financeira atribuída:{" "}
              {money(g.data.unassignedCents)}. O saldo de uma conta não é lucro.
            </p>
            <button
              className="button secondary"
              disabled={accounts.length < 2}
              onClick={() => setModal("transfer")}
            >
              Registrar transferência manual
            </button>
            <p className="small-muted">
              Cadastre pelo menos duas contas para transferir valores. O sistema
              não acessa seu banco nem realiza a transferência.
            </p>
            {g.data.transfers.map((t: any) => (
              <p key={t.id}>
                {String(t.paid_at).slice(0, 10)} ·{" "}
                {accounts.find((a) => a[0] === t.from_id)?.[1]} →{" "}
                {accounts.find((a) => a[0] === t.to_id)?.[1]} ·{" "}
                {money(Number(t.amount_cents))}
              </p>
            ))}
          </section>
          <ImportPage c={c} bank embedded />
        </>
      )}
      {modal && (
        <Modal
          title={
            modal === "account"
              ? "Nova conta financeira"
              : modal === "transfer"
                ? "Registrar transferência entre contas"
                : "Parcelar um valor total"
          }
          onClose={() => setModal("")}
        >
          <Form
            fields={
              modal === "account"
                ? [
                    { key: "name", label: "Nome da conta", required: true },
                    {
                      key: "openingCents",
                      label: "Saldo inicial (R$)",
                      type: "money",
                    },
                  ]
                : modal === "transfer"
                  ? [
                      {
                        key: "fromId",
                        label: "Conta de origem",
                        options: accounts,
                      },
                      {
                        key: "toId",
                        label: "Conta de destino",
                        options: accounts,
                      },
                      {
                        key: "amountCents",
                        label: "Valor transferido (R$)",
                        type: "money",
                        required: true,
                      },
                      {
                        key: "date",
                        label: "Data efetiva",
                        type: "date",
                        required: true,
                        default: date(),
                      },
                    ]
                  : [
                      {
                        key: "name",
                        label: "Descrição do parcelamento",
                        required: true,
                      },
                      {
                        key: "direction",
                        label: "Tipo",
                        options: [
                          ["in", "A receber"],
                          ["out", "A pagar"],
                        ],
                      },
                      {
                        key: "totalCents",
                        label: "Valor total de todas as parcelas (R$)",
                        type: "money",
                        required: true,
                      },
                      {
                        key: "count",
                        label: "Quantidade de parcelas (2 a 48)",
                        type: "number",
                        default: 2,
                        required: true,
                      },
                      {
                        key: "firstDue",
                        label: "Primeiro vencimento",
                        type: "date",
                        required: true,
                        default: date(),
                      },
                      { key: "category", label: "Categoria" },
                    ]
            }
            onSave={async (v) => {
              await api(
                g.base +
                  (modal === "account"
                    ? "/accounts"
                    : modal === "transfer"
                      ? "/transfers"
                      : "/installments"),
                "POST",
                { ...v, key: crypto.randomUUID() },
              );
              setModal("");
              await g.load();
              c.notify("Registro salvo com sucesso.");
            }}
          />
        </Modal>
      )}
    </>
  );
}
const importFields: Record<string, [string, string][]> = {
  clients: [
    ["name", "Nome"],
    ["email", "E-mail"],
    ["phone", "Telefone"],
    ["category", "Categoria"],
    ["description", "Observações"],
  ],
  products: [
    ["name", "Nome"],
    ["sku", "SKU"],
    ["unit", "Unidade"],
    ["price", "Preço (reais)"],
    ["cost", "Custo (reais)"],
    ["category", "Categoria"],
    ["description", "Descrição"],
  ],
  bank: [
    ["name", "Descrição"],
    ["date", "Data"],
    ["amount", "Valor (reais; saída negativa)"],
    ["direction", "Sentido (in/out, opcional)"],
    ["reference", "Referência do banco (opcional)"],
  ],
};
function csvDownload(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ImportPage({
  c,
  bank = false,
  embedded = false,
}: {
  c: WorkspaceContext;
  bank?: boolean;
  embedded?: boolean;
}) {
  const [kind, setKind] = useState(bank ? "bank" : "clients"),
    [csv, setCsv] = useState(""),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [accountId, setAccountId] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [choices, setChoices] = useState<Record<string, any>>({}),
    [job, setJob] = useState<any>(null),
    [confirm, setConfirm] = useState(false),
    [validOnly, setValidOnly] = useState(false),
    [running, setRunning] = useState(false);
  const g = useOps(c, "/imports" + (bank ? "?kind=bank" : "")),
    accounts = useOps(c, bank ? "/accounts" : "/options");
  const fields = importFields[kind];
  async function process(id: string) {
    setRunning(true);
    try {
      let result: any;
      do {
        result = await api(g.base + "/imports/" + id + "/process", "POST", {});
        setJob(result);
      } while (result.status !== "done" && result.status !== "cancelled");
      await g.load();
      c.notify("Importação processada. Revise o relatório de cada linha.");
    } finally {
      setRunning(false);
    }
  }
  return (
    <section className={embedded ? "panel operation-panel" : "import-page"}>
      {!embedded ? (
        <Title
          title="Importar suas informações"
          description="Mapeie, revise e confirme. Linhas inválidas não entram silenciosamente."
        />
      ) : (
        <>
          <h2>Importar extrato CSV</h2>
          <p>
            Importação manual, sem conexão bancária. Sugestões de
            correspondência precisam da sua confirmação.
          </p>
        </>
      )}
      <ErrorBox message={g.a.error} />
      <div className="panel operation-panel import-setup">
        {!bank && (
          <Field label="O que importar?">
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPreview(null);
                setMapping({});
              }}
            >
              <option value="clients">Clientes</option>
              <option value="products">Produtos e serviços</option>
            </select>
          </Field>
        )}
        {bank && (
          <Field label="Conta financeira do extrato">
            <select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setPreview(null);
              }}
            >
              <option value="">Selecione…</option>
              {accounts.data?.accounts.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button
          className="button secondary"
          onClick={() =>
            csvDownload(
              "modelo-" + kind + ".csv",
              toCsv(
                [],
                fields.map((f) => f[0]),
              ),
            )
          }
        >
          Baixar modelo CSV <Download size={15} />
        </button>
        <Field
          label="Arquivo CSV · até 1 MB e 1.000 linhas"
          hint="Separador vírgula ou ponto e vírgula. Campos entre aspas e acentos são aceitos."
        >
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) =>
              void g.a.run(async () => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 1000000)
                  throw new Error("CSV limitado a 1 MB.");
                const text = await file.text();
                const parsed = parseCsv(text);
                setCsv(text);
                setHeaders(parsed.headers);
                setMapping(
                  Object.fromEntries(
                    fields.map(([key]) => [
                      key,
                      parsed.headers.includes(key) ? key : "",
                    ]),
                  ),
                );
                setPreview(null);
                setChoices({});
                setConfirm(false);
              })
            }
          />
        </Field>
        {headers.length > 0 && (
          <>
            <h3>Mapeamento de colunas</h3>
            <div className="form-grid">
              {fields.map(([key, label]) => (
                <Field label={label} key={key}>
                  <select
                    value={mapping[key] ?? ""}
                    onChange={(e) => {
                      setMapping({ ...mapping, [key]: e.target.value });
                      setPreview(null);
                    }}
                  >
                    <option value="">Não importar este campo</option>
                    {headers.map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <button
              className="button primary"
              disabled={g.a.busy}
              onClick={() =>
                void g.a.run(async () => {
                  setPreview(
                    await api(g.base + "/imports/preview", "POST", {
                      kind,
                      csv,
                      mapping,
                      accountId,
                    }),
                  );
                  setConfirm(false);
                })
              }
            >
              Validar e visualizar prévia
            </button>
          </>
        )}
      </div>
      {preview && (
        <section className="panel operation-panel">
          <h2>
            Prévia · {preview.valid} válidas, {preview.invalid} com erro
          </h2>
          <p>
            Duplicidades são dispensadas por padrão. No extrato, cada linha
            exige escolher criar um lançamento, corresponder a uma conta
            existente ou dispensar.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Identificação</th>
                  <th>Validação</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r: any) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>
                      {r.data?.name ?? "—"}
                      {bank && r.data && (
                        <small className="table-sub">
                          {r.data.date} ·{" "}
                          {r.data.direction === "out" ? "Saída" : "Entrada"} ·{" "}
                          {money(r.data.amountCents)}
                        </small>
                      )}
                    </td>
                    <td>
                      {r.error || r.duplicate
                        ? "⚠ " + (r.error || "Possível duplicidade")
                        : "Válida"}
                    </td>
                    <td>
                      {!r.error &&
                        (bank ? (
                          <>
                            <select
                              aria-label={"Ação da linha " + r.line}
                              value={choices[r.line]?.action ?? "skip"}
                              onChange={(e) =>
                                setChoices({
                                  ...choices,
                                  [r.line]: {
                                    action: e.target.value,
                                    allowDuplicate: false,
                                  },
                                })
                              }
                            >
                              <option value="skip">Dispensar</option>
                              <option value="import">
                                Criar lançamento e pagamento manual
                              </option>
                              {r.suggestions.length > 0 && (
                                <option value="match">
                                  Corresponder a conta existente
                                </option>
                              )}
                            </select>
                            {choices[r.line]?.action === "match" && (
                              <select
                                aria-label={
                                  "Correspondência da linha " + r.line
                                }
                                value={choices[r.line]?.ledgerId ?? ""}
                                onChange={(e) =>
                                  setChoices({
                                    ...choices,
                                    [r.line]: {
                                      ...choices[r.line],
                                      ledgerId: e.target.value,
                                    },
                                  })
                                }
                              >
                                <option value="">Confirme a conta…</option>
                                {r.suggestions.map((s: any) => (
                                  <option value={s.id} key={s.id}>
                                    {s.name} · saldo {money(s.remainingCents)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </>
                        ) : (
                          <select
                            aria-label={"Ação da linha " + r.line}
                            value={choices[r.line]?.action ?? "import"}
                            onChange={(e) =>
                              setChoices({
                                ...choices,
                                [r.line]: {
                                  action: e.target.value,
                                  allowDuplicate: false,
                                },
                              })
                            }
                          >
                            <option value="import">
                              Importar, se não duplicada
                            </option>
                            <option value="skip">Dispensar</option>
                          </select>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.invalid > 0 && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={validOnly}
                onChange={(e) => setValidOnly(e.target.checked)}
              />
              Revisei os erros e quero importar somente as linhas válidas.
            </label>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            Revisei os dados, as correspondências e autorizo esta importação.
          </label>
          <button
            className="button primary"
            disabled={
              !confirm ||
              running ||
              g.a.busy ||
              (preview.invalid > 0 && !validOnly)
            }
            onClick={() =>
              void g.a.run(async () => {
                const created = await api(g.base + "/imports", "POST", {
                  kind,
                  csv,
                  mapping,
                  accountId,
                  choices,
                  confirmed: true,
                  validOnly,
                });
                setConfirm(false);
                await process(created.id);
              })
            }
          >
            Confirmar e processar importação
          </button>
        </section>
      )}
      {job && (
        <section className="panel operation-panel">
          <h2>Resultado da importação</h2>
          <progress
            aria-label="Progresso da importação"
            value={job.cursor}
            max={job.total ?? job.rows?.length ?? 1}
          />
          <p>
            {job.cursor} de {job.total ?? job.rows?.length} linhas processadas ·{" "}
            {job.status}
          </p>
          <button
            className="button secondary"
            onClick={() => download("resultado-importacao.json", job.result)}
          >
            Baixar relatório de linhas
          </button>
          {job.result?.map((r: any) => (
            <p key={r.line}>
              Linha {r.line} ·{" "}
              {r.status === "imported"
                ? "Importada"
                : r.status === "skipped"
                  ? "Dispensada"
                  : "Erro"}
              {r.message ? " · " + r.message : ""}
            </p>
          ))}
        </section>
      )}
      <section className="panel operation-panel">
        <h2>Importações recentes e retomada</h2>
        <p>
          O progresso e o resultado ficam no servidor. Recarregar a página não
          perde o que já foi processado.
        </p>
        {g.data?.map((j: any) => (
          <article className="saved-prompt" key={j.id}>
            <div>
              <strong>
                {j.kind === "bank"
                  ? "Extrato"
                  : j.kind === "clients"
                    ? "Clientes"
                    : "Produtos"}{" "}
                · {j.cursor}/{j.total}
              </strong>
              <p>{j.status}</p>
            </div>
            <button
              className="button secondary"
              disabled={running}
              onClick={() => {
                setJob(j);
                if (j.status !== "done") void g.a.run(() => process(j.id));
              }}
            >
              {j.status === "done"
                ? "Consultar resultado"
                : "Retomar processamento"}
            </button>
          </article>
        ))}
      </section>
    </section>
  );
}
const helpArticles = [
  [
    "cadastro",
    "Começar e personalizar",
    "Configure o perfil, modelo do negócio e as ferramentas nas Configurações. Você pode mudar as escolhas depois.",
    "configuracoes",
  ],
  [
    "vendas",
    "Do cliente à entrega",
    "Cadastre o cliente, registre uma oportunidade, prepare um orçamento e obtenha aprovação. A ordem reserva os materiais e cria o valor a receber. Pagamentos precisam de registro próprio.",
    "crm",
  ],
  [
    "materiais",
    "Compra, recebimento e estoque",
    "A consulta de preços não compra nem movimenta estoque. Registre a compra na lista e confira o recebimento físico, inclusive parcial, para o SKU certo.",
    "recebimentos",
  ],
  [
    "financeiro",
    "Saldo, recebimento e resultado",
    "Uma venda cria valor a receber; pagamento manual registra entrada. Transferências próprias e retiradas são separadas. Saldo de caixa não é lucro.",
    "financeiro",
  ],
  [
    "agenda",
    "Evitar conflitos de horário",
    "Defina responsável, data e duração. O servidor verifica horários sobrepostos, inclusive em requisições simultâneas. Use status bloqueio para indisponibilidade.",
    "agenda",
  ],
  [
    "artes",
    "Instagram e ChatGPT",
    "Recursos Premium preparam orientações e permitem edição local. Você faz as alterações e envios nos serviços externos. O link do ChatGPT não transfere texto ou foto.",
    "artes",
  ],
] as const;
export function HelpPage({ c }: { c: WorkspaceContext }) {
  const g = useOps(c, "/support"),
    [q, setQ] = useState(""),
    [create, setCreate] = useState(false);
  return (
    <>
      <Title
        title="Ajuda no seu ritmo"
        description="Orientações para a operação e registro de dúvidas, problemas e sugestões."
      >
        <button className="button primary" onClick={() => setCreate(true)}>
          Registrar solicitação
        </button>
      </Title>
      <label className="search-input help-search">
        <Search size={18} />
        <input
          aria-label="Buscar na ajuda"
          placeholder="Busque por agenda, estoque, pagamentos…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div className="help-grid">
        {helpArticles
          .filter((a) => a.join(" ").toLowerCase().includes(q.toLowerCase()))
          .map(([id, title, body, target]) => (
            <article className="panel operation-panel" key={id}>
              <h2>{title}</h2>
              <p>{body}</p>
              <button className="link-button" onClick={() => c.go(target)}>
                Abrir ferramenta →
              </button>
            </article>
          ))}
      </div>
      <State g={g} />
      <section className="panel operation-panel">
        <h2>Solicitações registradas</h2>
        <p className="small-muted">
          As solicitações ficam privadas nesta empresa. A equipe de suporte
          externo e o prazo de atendimento ainda dependem de implantação; nenhum
          e-mail ou chamado externo é enviado automaticamente.
        </p>
        {g.data?.map((s: any) => (
          <article className="timeline-item" key={s.id}>
            <strong>{s.data.subject}</strong>
            <p>{s.data.description}</p>
            <small>
              Protocolo {s.id} ·{" "}
              {s.data.status === "resolved" ? "Resolvida" : "Aberta"}
            </small>
            {s.data.reply && <p>Resposta registrada: {s.data.reply}</p>}
            {allowed(c.company.role, "settings", "write") && (
              <details>
                <summary>Atualizar atendimento local</summary>
                <Form
                  initial={{ status: s.data.status, reply: s.data.reply ?? "" }}
                  fields={[
                    {
                      key: "status",
                      label: "Situação do atendimento",
                      options: [
                        ["open", "Aberta"],
                        ["resolved", "Resolvida"],
                      ],
                    },
                    {
                      key: "reply",
                      label: "Resposta ou encaminhamento",
                      type: "textarea",
                    },
                  ]}
                  onSave={async (v) => {
                    await api(g.base + "/support/" + s.id, "PUT", {
                      ...v,
                      version: s.version,
                    });
                    await g.load();
                  }}
                />
              </details>
            )}
          </article>
        ))}
      </section>
      {create && (
        <Modal
          title="Registrar solicitação de suporte"
          onClose={() => setCreate(false)}
        >
          <p>
            Descreva o fluxo e o erro. Não envie senhas, tokens, dados bancários
            ou dados de clientes sem necessidade.
          </p>
          <Form
            fields={[
              { key: "subject", label: "Assunto", required: true, max: 120 },
              {
                key: "category",
                label: "Tipo",
                options: [
                  ["question", "Dúvida"],
                  ["problem", "Problema"],
                  ["suggestion", "Sugestão"],
                ],
              },
              {
                key: "description",
                label: "O que aconteceu ou precisa melhorar?",
                type: "textarea",
                required: true,
              },
            ]}
            onSave={async (v) => {
              await api(g.base + "/support", "POST", v);
              setCreate(false);
              await g.load();
              c.notify("Solicitação registrada com protocolo.");
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function TeamTransfer({
  c,
  members,
}: {
  c: WorkspaceContext;
  members: any[];
}) {
  const a = useAction(),
    [open, setOpen] = useState(false),
    transfer = new URLSearchParams(location.search).get("transfer");
  return (
    <>
      {c.company.role === "owner" && (
        <section className="panel operation-panel">
          <h2>Transferência de propriedade</h2>
          <p>
            Exige sua senha, destinatário já integrante com e-mail confirmado e
            aceite pelo link enviado a ele. Seu acesso passa a administrador
            somente após o aceite.
          </p>
          <button className="button secondary" onClick={() => setOpen(true)}>
            Preparar transferência
          </button>
        </section>
      )}
      {transfer && (
        <section className="panel operation-panel">
          <h2>Confirmar recebimento da propriedade</h2>
          <Form
            fields={[
              {
                key: "password",
                label: "Sua senha para confirmar",
                type: "password",
                required: true,
              },
            ]}
            onSave={async (v) => {
              await api(
                "/" + c.company.id + "/operations/ownership/accept",
                "POST",
                { token: transfer, password: v.password },
              );
              c.refresh();
              c.notify("Propriedade transferida e auditada.");
            }}
            submit="Aceitar transferência"
          />
        </section>
      )}
      {open && (
        <Modal
          title="Solicitar transferência de propriedade"
          onClose={() => setOpen(false)}
        >
          <Form
            fields={[
              {
                key: "userId",
                label: "Novo proprietário",
                options: [
                  ["", "Selecione…"],
                  ...members
                    .filter((m) => m.user_id !== c.me.user.id)
                    .map((m) => [m.user_id, m.name] as [string, string]),
                ],
              },
              {
                key: "password",
                label: "Sua senha atual",
                type: "password",
                required: true,
              },
            ]}
            onSave={async (v) => {
              const result: any = await api(
                "/" + c.company.id + "/operations/ownership/request",
                "POST",
                v,
              );
              setOpen(false);
              c.notify(
                result.mailMode === "development-capture"
                  ? "Confirmação registrada na caixa de saída local. SMTP não configurado; nenhum e-mail externo foi enviado."
                  : "Solicitação registrada. O destinatário deve conferir a confirmação de e-mail.",
              );
            }}
            submit="Enviar confirmação ao destinatário"
          />
        </Modal>
      )}
      <ErrorBox message={a.error} />
    </>
  );
}

export function RecordExtras({
  kind,
  value,
  team,
  products,
}: {
  kind: string;
  value: any;
  team: any[];
  products: any[];
}) {
  const [type, setType] = useState(value.productType ?? "product");
  return (
    <div className="form-grid">
      {kind === "clients" && (
        <>
          <Field label="Pessoa ou empresa">
            <select
              name="contactType"
              defaultValue={value.contactType ?? "person"}
            >
              <option value="person">Pessoa</option>
              <option value="company">Empresa</option>
            </select>
          </Field>
          <Field label="Origem do contato">
            <select name="source" defaultValue={value.source ?? ""}>
              <option value="">Não informada</option>
              {[
                "Indicação",
                "Instagram",
                "WhatsApp",
                "Site",
                "Evento",
                "Outro",
                ...(value.source ? [value.source] : []),
              ]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((v) => (
                  <option key={v}>{v}</option>
                ))}
            </select>
          </Field>
          <Field label="Preferência de comunicação">
            <select
              name="communication"
              defaultValue={value.communication ?? "none"}
            >
              <option value="none">Não informada</option>
              <option value="whatsapp">WhatsApp autorizado</option>
              <option value="email">E-mail</option>
              <option value="phone">Telefone</option>
            </select>
          </Field>
          <Field label="Tags (separadas por vírgula)">
            <input
              name="tagsText"
              maxLength={500}
              defaultValue={(value.tags ?? []).join(", ")}
            />
          </Field>
          <Field label="Responsável pelo relacionamento">
            <select name="assignee" defaultValue={value.assignee ?? ""}>
              <option value="">Sem responsável</option>
              {team.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Próxima ação">
            <textarea
              name="nextAction"
              maxLength={500}
              defaultValue={value.nextAction}
            />
          </Field>
          <Field label="Data da próxima ação">
            <input type="date" name="due" defaultValue={value.due} />
          </Field>
          <label className="check-label">
            <input type="checkbox" name="allowDuplicate" />
            Revisei possíveis duplicidades; se houver correspondência, confirmo
            que este é outro cadastro.
          </label>
        </>
      )}
      {kind === "products" && (
        <>
          <Field label="Tipo do item">
            <select
              name="productType"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="product">Produto</option>
              <option value="service">Serviço</option>
              <option value="material">Material ou insumo</option>
              <option value="variation">Variação com SKU próprio</option>
            </select>
          </Field>
          <Field label="SKU / código interno">
            <input name="sku" maxLength={80} defaultValue={value.sku} />
          </Field>
          {type === "variation" && (
            <>
              <Field label="Produto base">
                <select
                  name="parentProductId"
                  required
                  defaultValue={value.parentProductId ?? ""}
                >
                  <option value="">Selecione…</option>
                  {products
                    .filter((p) => p.data.productType !== "variation")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.data.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Tamanho">
                <input name="size" maxLength={80} defaultValue={value.size} />
              </Field>
              <Field label="Cor">
                <input name="color" maxLength={80} defaultValue={value.color} />
              </Field>
              <p className="small-muted">
                Cada SKU possui estoque e histórico próprios. Inclua tamanho e
                cor no nome para identificação em listas e pedidos.
              </p>
            </>
          )}
          <label className="check-label">
            <input
              name="trackStock"
              type="checkbox"
              defaultChecked={value.trackStock ?? false}
            />
            Este item utiliza estoque e deve ser reservado na venda.
          </label>
          <label className="check-label">
            <input
              name="costKnown"
              type="checkbox"
              defaultChecked={value.costKnown ?? false}
            />
            O custo foi informado e revisado, inclusive se for zero.
          </label>
        </>
      )}
      {kind === "appointments" && (
        <>
          <Field label="Situação do agendamento">
            <select
              name="bookingStatus"
              defaultValue={value.bookingStatus ?? "scheduled"}
            >
              <option value="scheduled">Agendado</option>
              <option value="confirmed">Confirmado</option>
              <option value="completed">Concluído</option>
              <option value="cancelled">Cancelado</option>
              <option value="blocked">Bloqueio de horário</option>
            </select>
          </Field>
          <Field label="Duração (minutos, se não informar término)">
            <input
              type="number"
              name="durationMinutes"
              min={1}
              max={1440}
              defaultValue={value.durationMinutes || ""}
            />
          </Field>
          <p className="small-muted">
            O servidor verifica conflitos para o mesmo responsável, incluindo
            bloqueios. Use um responsável por horário.
          </p>
        </>
      )}
      {kind === "aftersales" && (
        <>
          <Field label="Prioridade">
            <select name="priority" defaultValue={value.priority ?? "normal"}>
              <option value="low">Baixa</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </Field>
          <Field label="Condições comerciais de garantia">
            <textarea
              name="warrantyConditions"
              maxLength={2000}
              defaultValue={value.warrantyConditions}
            />
          </Field>
          <Field label="Fim da condição comercial registrada (opcional)">
            <input
              type="date"
              name="warrantyUntil"
              defaultValue={value.warrantyUntil}
            />
          </Field>
          <p className="small-muted">
            Registre somente o que foi combinado. Condições comerciais não
            substituem direitos legais aplicáveis; não calculamos prazos legais
            automaticamente.
          </p>
        </>
      )}
    </div>
  );
}
export function useRecordData(
  c: WorkspaceContext,
  kind: string,
  q: string,
  status: string,
  page: number,
) {
  const [data, setData] = useState<any[] | null>(null),
    [meta, setMeta] = useState<any>(null),
    [error, setError] = useState(""),
    id = useRef(0);
  const path =
    kind === "appointments"
      ? `/${c.company.id}/records/appointments`
      : `/${c.company.id}/operations/search/${kind}?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&page=${page}`;
  async function load() {
    const n = ++id.current;
    try {
      const result = await api(path);
      if (n === id.current) {
        setData(Array.isArray(result) ? result : result.rows);
        setMeta(
          Array.isArray(result)
            ? { total: result.length, page: 1, limit: result.length || 50 }
            : result,
        );
        setError("");
      }
    } catch (e: any) {
      if (n === id.current) setError(e.message);
      throw e;
    }
  }
  useEffect(() => {
    void load().catch(() => {});
    return () => {
      id.current++;
    };
  }, [path]);
  return { data, meta, error, load };
}
export function RecordTools({
  c,
  kind,
  meta,
  selected,
  onReload,
  page,
  setPage,
  query,
  filter,
  onFilter,
}: {
  c: WorkspaceContext;
  kind: string;
  meta: any;
  selected: string[];
  onReload: () => Promise<any>;
  page: number;
  setPage: (n: number) => void;
  query: string;
  filter: string;
  onFilter: (q: string, status: string) => void;
}) {
  const g = useOps(c, "/filters/" + kind),
    [modal, setModal] = useState(""),
    [bulk, setBulk] = useState<any>(null);
  return (
    <>
      <div className="record-tools">
        <button
          className="button secondary"
          disabled={page <= 1 || kind === "appointments"}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </button>
        <span>
          Página {page} · {meta?.total ?? 0} registros
        </span>
        <button
          className="button secondary"
          disabled={
            !meta || page * meta.limit >= meta.total || kind === "appointments"
          }
          onClick={() => setPage(page + 1)}
        >
          Próxima
        </button>
        <select
          aria-label="Aplicar filtro salvo"
          defaultValue=""
          onChange={(e) => {
            const f = g.data?.find((f: any) => f.id === e.target.value);
            if (f) onFilter(f.data.q, f.data.status);
          }}
        >
          <option value="">Filtros salvos</option>
          {g.data?.map((f: any) => (
            <option key={f.id} value={f.id}>
              {f.data.name}
            </option>
          ))}
        </select>
        <button className="link-button" onClick={() => setModal("filter")}>
          Salvar filtro
        </button>
        {selected.length > 0 &&
          allowed(c.company.role, kind as Module, "write") && (
            <button
              className="button secondary"
              onClick={() => setModal("archive")}
            >
              Arquivar {selected.length} selecionado(s)
            </button>
          )}
        {bulk && (
          <button
            className="link-button"
            onClick={() =>
              void g.a.run(async () => {
                await api(g.base + "/bulk/" + bulk.id + "/undo", "POST", {});
                setBulk(null);
                await onReload();
                c.notify("Arquivamento desfeito.");
              })
            }
          >
            Desfazer arquivamento · até 10 minutos
          </button>
        )}
      </div>
      <ErrorBox message={g.a.error} />
      {modal && (
        <Modal
          title={
            modal === "filter"
              ? "Salvar filtro de consulta"
              : "Arquivar registros selecionados?"
          }
          onClose={() => setModal("")}
        >
          {modal === "filter" ? (
            <Form
              fields={[
                {
                  key: "name",
                  label: "Nome do filtro",
                  required: true,
                  max: 80,
                },
              ]}
              onSave={async (v) => {
                await api(g.base + "/filters", "POST", {
                  ...v,
                  kind,
                  q: query,
                  status: filter,
                });
                setModal("");
                await g.load();
                c.notify("Filtro salvo na sua conta.");
              }}
            />
          ) : (
            <>
              <p>
                {selected.length} registros sairão da lista ativa. Documentos e
                histórico permanecem preservados. Produtos com estoque ou
                reservas não podem ser arquivados.
              </p>
              <button
                className="button primary"
                disabled={g.a.busy}
                onClick={() =>
                  void g.a.run(async () => {
                    setBulk(
                      await api(g.base + "/bulk", "POST", {
                        kind,
                        ids: selected,
                        confirmed: true,
                        key: crypto.randomUUID(),
                      }),
                    );
                    setModal("");
                    await onReload();
                    c.notify(
                      "Registros arquivados. Você pode desfazer por dez minutos.",
                    );
                  })
                }
              >
                Confirmar arquivamento de {selected.length} registros
              </button>
              <ErrorBox message={g.a.error} />
            </>
          )}
        </Modal>
      )}
    </>
  );
}
export function HistoryModal({
  c,
  id,
  onClose,
}: {
  c: WorkspaceContext;
  id: string;
  onClose: () => void;
}) {
  const g = useOps(c, "/history/" + id);
  return (
    <Modal title="Histórico do cadastro" onClose={onClose}>
      <State g={g} />
      {g.data?.map((v: any) => (
        <article className="timeline-item" key={v.version}>
          <strong>
            Versão {v.version} · {v.data.name}
          </strong>
          <small className="table-sub">
            {new Date(v.created_at).toLocaleString("pt-BR")}
          </small>
          <p>{v.data.description || "Sem observações."}</p>
          {v.data.priceCents !== undefined && (
            <p>Preço informado: {money(v.data.priceCents)}</p>
          )}
          {v.data.costCents !== undefined && (
            <p>Custo informado: {money(v.data.costCents)}</p>
          )}
        </article>
      ))}
      {g.data?.length === 0 && (
        <p>
          Não há versões registradas. O histórico passa a ser preservado nas
          novas alterações.
        </p>
      )}
    </Modal>
  );
}
export function QuoteHistory({
  c,
  id,
  onClose,
}: {
  c: WorkspaceContext;
  id: string;
  onClose: () => void;
}) {
  const g = useOps(c, "/quotes/" + id + "/history");
  return (
    <Modal title="Versões preservadas da proposta" onClose={onClose}>
      <State g={g} />
      {g.data?.map((v: any) => (
        <article className="timeline-item" key={v.version}>
          <strong>
            Versão {v.version} · {v.data.title}
          </strong>
          <p>
            {v.data.items.length} itens · Validade {v.data.validUntil}
          </p>
          <p>Condições: {v.data.conditions || "Não informadas"}</p>
          <small>{new Date(v.created_at).toLocaleString("pt-BR")}</small>
        </article>
      ))}
    </Modal>
  );
}
