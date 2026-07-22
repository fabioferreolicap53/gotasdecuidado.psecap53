// Cloudflare Pages Function — Proxy de verificação para PocketBase
// Rota: POST /api/verify

export async function onRequestPost(context) {
  const { request } = context;

  let token;
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      token = body.token;
    } else {
      const text = await request.text();
      const params = new URLSearchParams(text);
      token = params.get("token");
    }
  } catch {
    return new Response(JSON.stringify({ message: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!token) {
    return new Response(JSON.stringify({ message: "Token is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const pbUrl =
      "https://centraldedados.dev.br/api/collections/gotas_de_cuidado_users/confirm-verification";

    const pbResp = await fetch(pbUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token }),
    });

    const pbData = await pbResp.json();

    return new Response(JSON.stringify(pbData), {
      status: pbResp.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ message: "Failed to reach verification server" }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
