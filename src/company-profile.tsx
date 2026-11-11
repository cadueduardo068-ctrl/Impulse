import { modelOptions } from "../shared/access";
import { useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { api } from "./api";
import { Field, FormValidation, ErrorBox, Submit, useAction } from "./ui";
import { LocationFields } from "./location";
import { useCatalog, PurchasePreferences } from "./catalog-fields";
import { type WorkspaceContext } from "./workspace";
export function CompanyProfile({
  c,
  onClose,
}: {
  c: WorkspaceContext;
  onClose: () => void;
}) {
  const a = useAction();
  const { catalog, error: catalogError } = useCatalog();
  const areas: Record<string, string[]> = Object.fromEntries(
    (catalog?.areas ?? []).map((a) => [a.name, a.activities]),
  );
  const [p, setP] = useState({ ...c.company.profile });
  const [version, setVersion] = useState(c.company.profile_version);
  const [section, setSection] = useState("activity");
  const [filter, setFilter] = useState("");
  const [latest, setLatest] = useState<any>(null);
  const set = (key: string, value: any) =>
    setP((v: any) => ({ ...v, [key]: value }));
  const professions = [...(areas[p.area] ?? []), "Outra atividade"].filter(
    (v, i, arr) =>
      arr.indexOf(v) === i && v.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <section className="panel company-profile-editor">
      <div className="panel-head">
        <div>
          <h2>Seu negócio, do seu jeito</h2>
          <p>Edite somente o que mudou. Os demais dados ficam preenchidos.</p>
        </div>
        <button className="link-button" onClick={onClose}>
          Fechar
        </button>
      </div>
      <div
        className="profile-section-tabs"
        role="tablist"
        aria-label="Dados da empresa"
      >
        {[
          ["activity", "Atividade"],
          ["location", "Localização e atendimento"],
          ["needs", "Necessidades"],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorBox message={catalogError} />
      <FormValidation errors={a.fieldErrors}>
        <form
          noValidate
          onSubmit={a.onSubmit(async () => {
            const r = await api(`/${c.company.id}/profile`, "PUT", {
              ...p,
              version,
            });
            setVersion(r.version);
            c.refresh();
            c.notify(
              "Perfil atualizado. Suas próximas buscas usam essa localização.",
            );
          })}
        >
          <div hidden={section !== "activity"}>
            <div className="form-grid">
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
              <Field label="Área de atuação">
                <select
                  name="area"
                  value={p.area}
                  onChange={(e) =>
                    setP({
                      ...p,
                      area: e.target.value,
                      profession: "Outra atividade",
                    })
                  }
                >
                  {Object.keys(areas).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Pesquisar profissão">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Ex.: marcenaria"
              />
            </Field>
            <Field label="Profissão ou atividade">
              <select
                name="profession"
                value={p.profession}
                onChange={(e) => set("profession", e.target.value)}
              >
                {!professions.includes(p.profession) && (
                  <option>{p.profession}</option>
                )}
                {professions.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            {p.profession === "Outra atividade" && (
              <Field label="Descreva sua atividade (opcional)">
                <input
                  maxLength={100}
                  onBlur={(e) => {
                    if (e.target.value) set("profession", e.target.value);
                  }}
                />
              </Field>
            )}
            <p className="form-guidance">
              Não exigimos CNPJ nem endereço completo para organizar o negócio.
            </p>
          </div>
          <div hidden={section !== "location"}>
            <div className="form-grid">
              <LocationFields
                value={p}
                onChange={setP}
                errors={a.fieldErrors}
              />
              <Field label="Região de atendimento (opcional)">
                <input
                  name="serviceRegion"
                  maxLength={300}
                  value={p.serviceRegion ?? ""}
                  onChange={(e) => set("serviceRegion", e.target.value)}
                  placeholder="Ex.: São Paulo e municípios do ABC"
                />
              </Field>
              <Field label="Forma de atendimento">
                <select
                  name="attendance"
                  value={p.attendance}
                  onChange={(e) => set("attendance", e.target.value)}
                >
                  <option value="local">Presencial</option>
                  <option value="online">Online</option>
                  <option value="home">Em domicílio</option>
                  <option value="mixed">Misto</option>
                </select>
              </Field>
              <Field label="Fuso horário">
                <select
                  name="timezone"
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
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="notice">
              Sua cidade usa o identificador oficial do IBGE. Não solicitamos a
              localização precisa do dispositivo.
            </div>
          </div>
          <div hidden={section !== "needs"}>
            <fieldset className="profile-models">
              <legend>Modelo do negócio</legend>
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
            </fieldset>
            {catalog && (
              <PurchasePreferences
                value={p}
                onChange={setP}
                catalog={catalog}
              />
            )}
            <h3>O que deseja organizar?</h3>
            <div className="goal-grid">
              {[
                "Finanças",
                "Clientes",
                "Orçamentos",
                "Materiais e fornecedores",
                "Estoque",
                "Instagram e divulgação",
                "Agenda e tarefas",
                "Equipe",
                "Organização do negócio",
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
          </div>
          <ErrorBox message={a.error} />
          {a.error.includes("outra aba") && (
            <div className="notice">
              <p>
                Seu formulário foi preservado. Consulte a versão mais recente
                antes de decidir quais informações manter.
              </p>
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  void api(`/${c.company.id}/profile`).then(setLatest)
                }
              >
                <RefreshCw size={15} /> Consultar versão do servidor
              </button>
              {latest && (
                <>
                  <pre>{JSON.stringify(latest.profile, null, 2)}</pre>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => {
                      setP(latest.profile);
                      setVersion(latest.version);
                      setLatest(null);
                    }}
                  >
                    Usar a versão atual do servidor
                  </button>
                </>
              )}
            </div>
          )}
          <div className="form-footer">
            <span className="small-muted">
              <Check size={13} /> Alterações protegidas por versão no servidor.
            </span>
            <Submit busy={a.busy}>Salvar alterações</Submit>
          </div>
        </form>
      </FormValidation>
    </section>
  );
}
