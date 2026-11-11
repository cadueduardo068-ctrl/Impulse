import { useEffect, useId, useState } from "react";
import { api } from "./api";
import { Field } from "./ui";
type City = { id: string; name: string; state: string; stateId: string };
let loaded: Promise<City[]> | null = null;
export function LocationFields({
  value,
  onChange,
  errors = {},
  required = false,
}: {
  value: { state: string; city: string; cityId?: string; cep?: string };
  onChange: (v: any) => void;
  errors?: Record<string, string>;
  required?: boolean;
}) {
  const [list, setList] = useState<City[]>([]);
  const [error, setError] = useState("");
  const id = useId();
  useEffect(() => {
    loaded ??= api("/locations").then((v) => v.cities);
    void loaded.then(setList).catch(() => {
      setError(
        "Não foi possível carregar os municípios. Seus dados foram preservados. Reabra a ferramenta para tentar novamente.",
      );
      loaded = null;
    });
  }, []);
  const options = list.filter((c) => c.state === value.state);
  useEffect(() => {
    if (value.cityId && !value.city) {
      const c = list.find(
        (c) => c.id === value.cityId && c.state === value.state,
      );
      if (c) onChange({ ...value, city: c.name });
    } else if (!value.cityId && value.city) {
      const matches = list.filter(
        (c) =>
          c.state === value.state &&
          c.name.localeCompare(value.city, "pt-BR", { sensitivity: "base" }) ===
            0,
      );
      if (matches.length === 1)
        onChange({ ...value, cityId: matches[0].id, city: matches[0].name });
    }
  }, [list, value.city, value.cityId, value.state]);
  return (
    <>
      <Field label="Estado" error={errors.state}>
        <select
          name="state"
          required={required}
          value={value.state}
          onChange={(e) =>
            onChange({ ...value, state: e.target.value, city: "", cityId: "" })
          }
        >
          <option value="">Selecione</option>
          {"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
            .split(" ")
            .map((s) => (
              <option key={s}>{s}</option>
            ))}
        </select>
      </Field>
      <Field
        label="Cidade"
        hint={
          value.cityId
            ? `Município IBGE ${value.cityId}`
            : "Digite para pesquisar e escolha um município do estado."
        }
        error={errors.cityId || errors.city || error}
      >
        <input
          name="city"
          list={id}
          autoComplete="off"
          required={required}
          value={value.city}
          placeholder={
            value.state ? "Ex.: São Paulo" : "Escolha o estado primeiro"
          }
          disabled={!value.state}
          onChange={(e) => {
            const match = options.find((c) => c.name === e.target.value);
            onChange({
              ...value,
              city: e.target.value,
              cityId: match?.id ?? "",
            });
          }}
        />
      </Field>
      <datalist id={id}>
        {options.map((c) => (
          <option value={c.name} key={c.id}>
            {c.state} · IBGE {c.id}
          </option>
        ))}
      </datalist>
      <Field
        label="CEP (opcional)"
        hint="Usado somente para refinar entrega. Não entra nos links de pesquisa."
        error={errors.cep}
      >
        <input
          name="cep"
          inputMode="numeric"
          maxLength={9}
          pattern="[0-9]{5}-?[0-9]{3}"
          value={value.cep ?? ""}
          placeholder="00000-000"
          onChange={(e) => onChange({ ...value, cep: e.target.value })}
        />
      </Field>
    </>
  );
}
