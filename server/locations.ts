import municipalities from "../data/municipalities.json" with { type: "json" };
import { HttpError } from "./service.js";
export const cities = municipalities as {
  id: string;
  name: string;
  state: string;
  stateId: string;
}[];
export function locationById(id: string, state?: string) {
  const city = cities.find((c) => c.id === id && (!state || c.state === state));
  if (!city)
    throw new HttpError(
      400,
      "Selecione um município válido do IBGE para o estado informado",
      {
        cityId:
          "Selecione uma cidade da lista oficial para o estado informado.",
      },
    );
  return city;
}
export function canonicalProfile<
  T extends { city: string; state: string; cityId?: string },
>(profile: T): T & { cityId?: string } {
  if (profile.cityId) {
    const c = locationById(profile.cityId, profile.state);
    return { ...profile, city: c.name, state: c.state };
  }
  if (profile.city) {
    const matches = cities.filter(
      (c) =>
        c.state === profile.state &&
        c.name.localeCompare(profile.city, "pt-BR", { sensitivity: "base" }) ===
          0,
    );
    if (matches.length === 1)
      return { ...profile, city: matches[0].name, cityId: matches[0].id };
    throw new HttpError(400, "Selecione a cidade na lista oficial do IBGE", {
      cityId: "Selecione um município da lista oficial do IBGE.",
    });
  }
  return profile;
}
