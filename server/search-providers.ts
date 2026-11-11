import { isIP } from "node:net";
import { createHash } from "node:crypto";
import {
  type MaterialQuery,
  type SearchResult,
  queryText,
} from "../shared/materials.js";
import { locationById } from "./locations.js";
import { redact } from "./integrations.js";
export function safePublicUrl(value: string) {
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      (u.port && u.port !== "443" && u.port !== "80") ||
      isIP(host) ||
      !host.includes(".") ||
      /(^|\.)(localhost|local|internal|test|invalid|onion|example|home|lan)$/.test(
        host,
      ) ||
      /^\d+(\.\d+)*$/.test(host)
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
export function safeResultText(value: unknown, max = 1000) {
  return typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, "")
        .split("")
        .filter((c) => c.charCodeAt(0) >= 32 || c === "\n" || c === "\t")
        .join("")
        .slice(0, max)
    : "";
}
export type ProviderOutput = { results: SearchResult[]; warnings: string[] };
export interface SearchProvider {
  id: string;
  storageAllowed: boolean;
  search(q: MaterialQuery): Promise<ProviderOutput>;
}
export async function fetchSearchJson(
  url: URL,
  key: string,
  fetcher: typeof fetch = fetch,
) {
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.search.brave.com" ||
    !["/res/v1/web/search", "/res/v1/local/pois"].includes(url.pathname)
  )
    throw new Error("Destino de busca não permitido");
  let lastError: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      const response = await fetcher(url, {
        headers: { Accept: "application/json", "X-Subscription-Token": key },
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });
      if (!response.ok) {
        if (response.status === 429 || response.status < 500)
          throw new Error(`PROVIDER_${response.status}`);
        throw new Error("Provedor temporariamente indisponível");
      }
      const text = await response.text();
      if (text.length > 1500000) throw new Error("Resposta acima do limite");
      return JSON.parse(text);
    } catch (e) {
      lastError = e;
      if (String(e).includes("PROVIDER_")) break;
    }
  }
  throw lastError;
}
const braveQuery = (value: string) =>
  redact(value).trim().split(/\s+/).slice(0, 75).join(" ").slice(0, 600);
function baseResult(
  raw: any,
  kind: "local" | "online",
  at: string,
  storageAllowed: boolean,
): SearchResult | null {
  const url = safePublicUrl(raw.url ?? raw.website ?? "");
  if (!url) return null;
  const target = new URL(url);
  const searchPage =
    target.hostname === "lista.mercadolivre.com.br" ||
    (target.hostname === "www.amazon.com.br" && target.pathname === "/s");
  return {
    id: createHash("sha256")
      .update(kind + url)
      .digest("hex")
      .slice(0, 24),
    kind,
    name: safeResultText(raw.title ?? raw.name, 200),
    url,
    description: safeResultText(raw.description),
    source: "Brave Search",
    checkedAt: at,
    match:
      kind === "local" ? "category" : searchPage ? "search-link" : "unverified",
    differences:
      kind === "online"
        ? [
            "Especificações, preço, tamanho da embalagem e disponibilidade precisam ser conferidos no anúncio.",
          ]
        : [],
    availability: "unconfirmed",
    storageAllowed,
  };
}
class BraveOnlineProvider implements SearchProvider {
  id = "brave-online";
  constructor(
    private key: string,
    public storageAllowed: boolean,
    private fetcher: typeof fetch,
  ) {}
  async search(q: MaterialQuery): Promise<ProviderOutput> {
    const at = new Date().toISOString();
    const u = new URL("https://api.search.brave.com/res/v1/web/search");
    u.search = new URLSearchParams({
      q: braveQuery(
        `${queryText(q)} comprar (site:mercadolivre.com.br OR site:amazon.com.br OR loja)`,
      ),
      country: "BR",
      search_lang: "pt",
      ui_lang: "pt-BR",
      count: "12",
      safesearch: "strict",
    }).toString();
    const data = await fetchSearchJson(u, this.key, this.fetcher);
    return {
      results: (data.web?.results ?? [])
        .slice(0, 12)
        .map((r: any) => baseResult(r, "online", at, this.storageAllowed))
        .filter(Boolean),
      warnings: [],
    };
  }
}

class BraveLocalProvider implements SearchProvider {
  id = "brave-local";
  constructor(
    private key: string,
    public storageAllowed: boolean,
    private fetcher: typeof fetch,
  ) {}
  async search(q: MaterialQuery): Promise<ProviderOutput> {
    const city = locationById(q.cityId, q.state);
    const at = new Date().toISOString();
    const u = new URL("https://api.search.brave.com/res/v1/web/search");
    u.search = new URLSearchParams({
      q: braveQuery(
        `lojas fornecedores ${q.material} ${city.name} ${city.state} Brasil`,
      ),
      country: "BR",
      search_lang: "pt",
      ui_lang: "pt-BR",
      count: "8",
      safesearch: "strict",
    }).toString();
    const data = await fetchSearchJson(u, this.key, this.fetcher);
    const results: SearchResult[] = (data.web?.results ?? [])
      .slice(0, 8)
      .map((r: any) => baseResult(r, "local", at, this.storageAllowed))
      .filter(Boolean);
    const warnings: string[] = [];
    const ids = (data.locations?.results ?? [])
      .map((p: any) => p.id)
      .filter(
        (v: unknown) =>
          typeof v === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(v as string),
      )
      .slice(0, 8);
    if (ids.length) {
      try {
        const p = new URL("https://api.search.brave.com/res/v1/local/pois");
        for (const id of ids) p.searchParams.append("ids", id);
        p.searchParams.set("units", "metric");
        const details = await fetchSearchJson(p, this.key, this.fetcher);
        for (const place of details.results ?? []) {
          const address = safeResultText(
            place.postal_address?.displayAddress ??
              place.postal_address?.streetAddress ??
              "",
            300,
          );
          const locality = safeResultText(
            place.postal_address?.addressLocality,
            100,
          );
          const name = safeResultText(place.title ?? place.name, 200);
          if (!name) continue;
          const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, address, locality || city.name, city.state].filter(Boolean).join(" "))}`;
          const r = baseResult(
            { ...place, url: safePublicUrl(place.url ?? "") || mapUrl },
            "local",
            at,
            this.storageAllowed,
          );
          if (!r) continue;
          r.address = address;
          r.city = locality;
          r.phone = safeResultText(place.contact?.telephone, 70);
          r.mapUrl = mapUrl;
          results.unshift(r);
        }
      } catch {
        warnings.push(
          "Os detalhes de endereço e contato das lojas estão indisponíveis. Os links encontrados continuam disponíveis.",
        );
      }
    }
    return {
      results: results
        .filter((r, i, a) => a.findIndex((v) => v.url === r.url) === i)
        .slice(0, 12),
      warnings,
    };
  }
}

export class BraveSearchProvider implements SearchProvider {
  id = "brave";
  private local: SearchProvider;
  private online: SearchProvider;
  constructor(
    key: string,
    public storageAllowed = false,
    fetcher: typeof fetch = fetch,
  ) {
    this.local = new BraveLocalProvider(key, storageAllowed, fetcher);
    this.online = new BraveOnlineProvider(key, storageAllowed, fetcher);
  }
  async search(q: MaterialQuery): Promise<ProviderOutput> {
    const providers =
      q.preference === "local"
        ? [this.local]
        : q.preference === "online"
          ? [this.online]
          : [this.online, this.local];
    const settled = await Promise.allSettled(
      providers.map((provider) => provider.search(q)),
    );
    return {
      results: settled.flatMap((r) =>
        r.status === "fulfilled" ? r.value.results : [],
      ),
      warnings: settled.flatMap((r, index) =>
        r.status === "fulfilled"
          ? r.value.warnings
          : [
              providers[index].id === "brave-local"
                ? "A busca de lojas próximas não respondeu. Você pode abrir a pesquisa no mapa."
                : "A busca de produtos online não respondeu. Os atalhos de pesquisa continuam disponíveis.",
            ],
      ),
    };
  }
}
export function configuredSearchProvider() {
  return process.env.BRAVE_SEARCH_API_KEY
    ? new BraveSearchProvider(
        process.env.BRAVE_SEARCH_API_KEY,
        process.env.BRAVE_STORAGE_RIGHTS === "true",
      )
    : undefined;
}
export function searchCacheKey(q: MaterialQuery) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        material: q.material,
        category: q.category,
        specs: Object.fromEntries(Object.entries(q.specs).sort()),
        brand: q.brand,
        description: redact(q.description),
        cityId: q.cityId,
        state: q.state,
        preference: q.preference,
      }),
    )
    .digest("hex");
}
