type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  IMPULSA_API_ORIGIN?: string;
};

function unavailable(status: 502 | 503) {
  return Response.json(
    {
      error:
        "O serviço do Impulsa está indisponível. Tente novamente em instantes.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function backendOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    if (
      url.protocol === "https:" &&
      url.pathname === "/" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
      return url;
  } catch {
    // The API requires an explicit HTTPS origin.
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/api" && !url.pathname.startsWith("/api/"))
      return env.ASSETS.fetch(request);

    const upstream = backendOrigin(env.IMPULSA_API_ORIGIN);
    if (!upstream || upstream.origin === url.origin) return unavailable(503);
    upstream.pathname = url.pathname;
    upstream.search = url.search;

    const headers = new Headers(request.headers);
    // Resolve the browser's opaque same-origin value at the public URL,
    // before Better Auth sees the Render URL as the request URL.
    if (
      headers.get("origin") === "null" &&
      headers.get("sec-fetch-site") === "same-origin"
    ) {
      headers.set("origin", url.origin);
    }
    headers.delete("host");
    headers.delete("forwarded");
    headers.delete("x-forwarded-for");
    headers.delete("x-forwarded-host");
    headers.delete("x-forwarded-proto");
    headers.delete("x-impulsa-client-ip");
    const clientIp = request.headers.get("cf-connecting-ip");
    if (clientIp) headers.set("x-forwarded-for", clientIp);
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", url.protocol.slice(0, -1));

    try {
      // Return redirects and Set-Cookie headers to the browser intact.
      return await fetch(new Request(upstream, request), {
        headers,
        redirect: "manual",
        cache: "no-store",
      });
    } catch {
      return unavailable(502);
    }
  },
};
