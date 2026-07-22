// Cloudflare Worker — Proxy para PocketBase (evita CORS)
// Deploy: npx wrangler deploy

const PB_URL = "https://centraldedados.dev.br";
const ALLOWED_ORIGINS = [
  "https://gotasdecuidado-psecap53.pages.dev",
  "http://localhost:5173",
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Proxy apenas para /api/* do PocketBase
    if (!url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    const pbUrl = PB_URL + url.pathname + url.search;

    const headers = new Headers(request.headers);
    headers.delete("Origin");
    headers.delete("Host");
    headers.set("Accept", "application/json");

    // Manter Content-Type original
    if (!headers.has("Content-Type") && request.method !== "GET") {
      headers.set("Content-Type", "application/json");
    }

    try {
      const resp = await fetch(pbUrl, {
        method: request.method,
        headers,
        body: request.method !== "GET" && request.method !== "HEAD"
          ? await request.text()
          : undefined,
      });

      const respHeaders = corsHeaders(origin);
      respHeaders["Content-Type"] = resp.headers.get("Content-Type") || "application/json";

      return new Response(resp.body, {
        status: resp.status,
        headers: respHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }
  },
};
