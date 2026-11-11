import { useEffect, useState } from "react";
import { api } from "./api";
import { Field } from "./ui";
import {
  activeAttributes,
  purchasePurposes,
  relevantCategories,
  type Catalog,
  type CatalogProduct,
} from "../shared/catalog";
export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api("/catalog")
      .then(setCatalog)
      .catch((e) => setError(e.message));
  }, []);
  return { catalog, error };
}
export function AttributeFields({
  product,
  specs,
  onChange,
  errors = {},
}: {
  product: CatalogProduct;
  specs: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  errors?: Record<string, string>;
}) {
  return (
    <>
      {activeAttributes(product, specs).map((a) => (
        <div key={a.key}>
          <Field
            label={a.label}
            error={errors[`specs.${a.key}`]}
            hint={
              a.unit
                ? `Unidade: ${a.unit}`
                : a.example
                  ? `Ex.: ${a.example}`
                  : undefined
            }
          >
            {["select", "multi"].includes(a.type) ? (
              <select
                name={`specs.${a.key}`}
                required={a.required}
                multiple={a.type === "multi"}
                value={
                  a.type === "multi"
                    ? (specs[a.key] ?? "").split(",").filter(Boolean)
                    : (specs[a.key] ?? "")
                }
                onChange={(e) =>
                  onChange({
                    ...specs,
                    [a.key]:
                      a.type === "multi"
                        ? Array.from(e.target.selectedOptions)
                            .map((o) => o.value)
                            .join(",")
                        : e.target.value,
                  })
                }
              >
                {a.type !== "multi" && <option value="">Selecione…</option>}
                {a.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                name={`specs.${a.key}`}
                type="text"
                inputMode={a.type === "number" ? "decimal" : undefined}
                required={a.required}
                value={specs[a.key] ?? ""}
                maxLength={150}
                onChange={(e) =>
                  onChange({ ...specs, [a.key]: e.target.value })
                }
              />
            )}
          </Field>
          {/^outr[oa]/i.test(specs[a.key] ?? "") && (
            <Field
              label={`Detalhe: ${a.label}`}
              error={errors[`specs.${a.key}Detail`]}
            >
              <input
                name={`specs.${a.key}Detail`}
                required
                maxLength={150}
                value={specs[a.key + "Detail"] ?? ""}
                onChange={(e) =>
                  onChange({ ...specs, [a.key + "Detail"]: e.target.value })
                }
              />
            </Field>
          )}
        </div>
      ))}
    </>
  );
}
export function PurchasePreferences({
  value,
  onChange,
  catalog,
}: {
  value: any;
  onChange: (v: any) => void;
  catalog: Catalog;
}) {
  const purposes: string[] = value.purchasePurposes ?? [];
  const chosen: string[] = value.purchaseCategories ?? [];
  const products: string[] = value.purchaseProducts ?? [];
  const categories = relevantCategories(catalog, value.area);
  const toggle = (
    key: string,
    values: string[],
    id: string,
    checked: boolean,
  ) =>
    onChange({
      ...value,
      [key]: checked ? [...values, id] : values.filter((v) => v !== id),
    });
  return (
    <>
      <Field label="Sua empresa compra materiais, produtos ou equipamentos?">
        <select
          name="buysMaterials"
          value={value.buysMaterials ?? "unsure"}
          onChange={(e) =>
            onChange({ ...value, buysMaterials: e.target.value })
          }
        >
          <option value="unsure">Vou configurar depois</option>
          <option value="yes">Sim</option>
          <option value="no">Não preciso comprar materiais</option>
        </select>
      </Field>
      {value.buysMaterials !== "no" ? (
        <>
          <p>
            O que você pretende comprar? Você pode selecionar mais de uma opção.
          </p>
          <div className="goal-grid">
            {purchasePurposes.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={purposes.includes(p.id)}
                  onChange={(e) =>
                    toggle("purchasePurposes", purposes, p.id, e.target.checked)
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
          <p>Categorias de interesse</p>
          <div className="goal-grid">
            {categories.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={chosen.includes(p.id)}
                  onChange={(e) =>
                    toggle("purchaseCategories", chosen, p.id, e.target.checked)
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
          <p>Materiais habituais (opcional)</p>
          <div className="goal-grid">
            {catalog.products
              .filter(
                (p) =>
                  p.id !== "other" &&
                  categories.some((c) => c.id === p.categoryId) &&
                  (chosen.length === 0 || chosen.includes(p.categoryId)),
              )
              .map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={products.includes(p.id)}
                    onChange={(e) =>
                      toggle(
                        "purchaseProducts",
                        products,
                        p.id,
                        e.target.checked,
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
          </div>
          <Field
            label="Preferências iniciais (opcional)"
            hint="Marcas ou observações para consultar nas próximas compras; não iniciam buscas."
          >
            <textarea
              maxLength={500}
              value={value.materialsNotes ?? ""}
              onChange={(e) =>
                onChange({ ...value, materialsNotes: e.target.value })
              }
            />
          </Field>
        </>
      ) : (
        <p>
          Materiais e fornecedores ficará fora dos atalhos. Você poderá ativá-lo
          depois nas configurações.
        </p>
      )}
    </>
  );
}
