import { useEffect, useState } from "react";
import { api } from "./api";
import { Field, ErrorBox, Submit, useAction } from "./ui";
import type { WorkspaceContext } from "./workspace";
export function CatalogAdmin({ c }: { c: WorkspaceContext }) {
  const a = useAction(),
    [data, setData] = useState<any>(null),
    [kind, setKind] = useState("product"),
    [value, setValue] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    setData(await api("/catalog/admin"));
  }
  useEffect(() => {
    if (c.me.platformAdmin) void a.run(load);
  }, []);
  function select(node: any) {
    setValue(
      JSON.stringify(
        {
          id: node.id,
          kind: node.kind,
          parentId: node.parent_id,
          name: node.name,
          version: node.version,
          active: node.active,
          data: node.data,
          attributes: data.attributes
            .filter((a: any) => a.product_id === node.id)
            .map((a: any) => a.data),
        },
        null,
        2,
      ),
    );
  }
  if (!c.me.platformAdmin)
    return (
      <ErrorBox message="Área exclusiva para administradores autorizados da plataforma." />
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO DA PLATAFORMA</span>
          <h1>Catálogo e acessos</h1>
          <p>
            Alterações auditadas, com controle de versão. Ser dono de uma
            empresa não concede esta permissão.
          </p>
        </div>
      </div>
      <ErrorBox message={a.error} />
      {message && <p role="status">{message}</p>}
      <div className="art-layout">
        <section className="panel growth-panel">
          <h2>Manutenção do catálogo</h2>
          <Field label="Tipo de item">
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {[
                ["area", "Áreas"],
                ["activity", "Atividades"],
                ["category", "Categorias"],
                ["product", "Produtos"],
              ].map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Escolha um item existente">
            <select
              defaultValue=""
              onChange={(e) => {
                const node = data?.nodes.find(
                  (n: any) => n.id === e.target.value,
                );
                if (node) select(node);
              }}
            >
              <option value="">Selecione…</option>
              {data?.nodes
                .filter((n: any) => n.kind === kind)
                .map((n: any) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                    {!n.active ? " · inativo" : ""}
                  </option>
                ))}
            </select>
          </Field>
          <button
            className="button secondary"
            onClick={() =>
              setValue(
                JSON.stringify(
                  {
                    id: "novo-" + kind,
                    kind,
                    parentId:
                      kind === "product"
                        ? "general"
                        : kind === "activity"
                          ? "area-other"
                          : null,
                    name: "Novo item",
                    version: null,
                    active: true,
                    data:
                      kind === "product"
                        ? { aliases: [], units: ["un"] }
                        : kind === "category"
                          ? { areas: ["other"] }
                          : kind === "area"
                            ? { image: 0 }
                            : {},
                    attributes:
                      kind === "product"
                        ? [
                            {
                              key: "type",
                              label: "Tipo",
                              type: "select",
                              required: true,
                              options: ["Opção 1", "Opção 2"],
                            },
                          ]
                        : [],
                  },
                  null,
                  2,
                ),
              )
            }
          >
            Novo item
          </button>
          <p className="form-guidance">
            O editor estruturado mantém opções, unidades e dependências
            configuráveis. Para ocultar um item, use active=false. Não altere
            identificadores existentes. Tipos de características: select, multi,
            number, text. Dependência: dependsOn com key e value. Versões
            divergentes são rejeitadas.
          </p>
          <form
            onSubmit={a.onSubmit(async () => {
              await api("/catalog/admin", "PUT", JSON.parse(value));
              setValue("");
              await load();
              setMessage(
                "Catálogo salvo. Abra novamente o item para consultar sua versão.",
              );
            })}
          >
            <Field label="Definição do item">
              <textarea
                className="admin-json"
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
            <Submit busy={a.busy}>Salvar catálogo</Submit>
          </form>
          <h3>Unidades de medida</h3>
          <p>{data?.units.map((u: any) => u.id + " · " + u.name).join(", ")}</p>
          <form
            onSubmit={a.onSubmit(async (f) => {
              await api("/catalog/admin/unit", "POST", {
                id: String(f.get("unitId")),
                name: String(f.get("unitName")),
              });
              await load();
              setMessage(
                "Unidade cadastrada. Conversões novas não são presumidas na comparação.",
              );
            })}
          >
            <Field label="Identificador da unidade">
              <input
                name="unitId"
                required
                pattern="[a-z0-9]{1,10}"
                maxLength={10}
              />
            </Field>
            <Field label="Nome da unidade">
              <input name="unitName" required maxLength={80} />
            </Field>
            <Submit busy={a.busy}>Adicionar unidade</Submit>
          </form>
        </section>
        <div>
          <section className="panel growth-panel">
            <h2>Conceder Premium para teste</h2>
            <p>
              Concessão temporária no servidor, com motivo e auditoria. Nenhum
              pagamento é registrado.
            </p>
            <form
              onSubmit={a.onSubmit(async (f) => {
                await api("/growth-admin/grant", "POST", {
                  companyId: String(f.get("companyId")),
                  days: Number(f.get("days")),
                  reason: String(f.get("reason")),
                });
                setMessage("Concessão Premium registrada no servidor.");
              })}
            >
              <Field label="Identificador da empresa">
                <input
                  name="companyId"
                  required
                  maxLength={100}
                  defaultValue={c.company.id}
                />
              </Field>
              <Field label="Dias (1 a 90)">
                <input
                  name="days"
                  type="number"
                  min={1}
                  max={90}
                  defaultValue={7}
                  required
                />
              </Field>
              <Field label="Motivo da concessão">
                <textarea
                  name="reason"
                  required
                  minLength={10}
                  maxLength={500}
                />
              </Field>
              <Submit busy={a.busy}>Registrar concessão temporária</Submit>
            </form>
          </section>
          <section className="panel growth-panel">
            <h2>Solicitações de catálogo</h2>
            {!data?.requests?.length && <p>Nenhuma solicitação pendente.</p>}
            {data?.requests?.map((r: any) => (
              <article key={r.id}>
                <strong>{r.description}</strong>
                <p>
                  Empresa: {r.company_id} · {r.status}
                </p>
                {r.status === "pending" && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      void a.run(async () => {
                        await api("/catalog/admin/request/" + r.id, "PUT", {});
                        await load();
                        setMessage("Solicitação marcada como revisada.");
                      })
                    }
                  >
                    Marcar como revisada
                  </button>
                )}
              </article>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
