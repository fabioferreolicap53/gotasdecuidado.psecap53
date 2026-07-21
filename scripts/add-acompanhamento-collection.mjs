/**
 * Script para CRIAR a coleção "painelsorriso53_acompanhamentos" no PocketBase.
 *
 * Uso:
 *   node scripts/add-acompanhamento-collection.mjs
 *
 * Requer:
 *   - Node.js 18+ (com fetch nativo)
 *   - .env configurado com VITE_POCKETBASE_URL
 *   - Credenciais de admin do PocketBase
 */

import { createInterface } from "readline";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Carrega .env ──────────────────────────────────────────────────────────

const envPath = join(__dirname, "..", ".env");
let PB_URL = "https://centraldedados.dev.br";

if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf-8");
  const urlMatch = env.match(/VITE_POCKETBASE_URL=(.+)/);
  if (urlMatch) PB_URL = urlMatch[1].trim().replace(/\/+$/, "");
}

const API_URL = `${PB_URL}/api`;
const COLLECTION_NAME = "painelsorriso53_acompanhamentos";

// ── Readline helper ───────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

// ── Tenta autenticar admin PocketBase ─────────────────────────────────────

async function authAdmin(email, password) {
  const endpoints = [
    { url: `${API_URL}/admins/auth-with-password`, label: "admins (v0.22-)" },
    { url: `${API_URL}/superusers/auth-with-password`, label: "superusers (v0.23+)" },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        return { token: data.token, endpoint: ep.label };
      }
      if (res.status !== 404) {
        const text = await res.text();
        console.warn(`  ${ep.label}: ${res.status} ${text}`);
      }
    } catch {
      // tenta próximo
    }
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log("=".repeat(60));
  console.log(` PocketBase — Criar coleção "${COLLECTION_NAME}"`);
  console.log(` URL: ${PB_URL}`);
  console.log("=".repeat(60));
  console.log("");

  const email = await ask(" Email do admin PocketBase: ");
  const password = await ask(" Senha do admin PocketBase: ");

  console.log("\n Autenticando...\n");

  const auth = await authAdmin(email, password);

  if (!auth) {
    console.error(
      "✗ Não foi possível autenticar via API remota (admins/superusers retornaram 404)."
    );
    console.error("  O proxy Caddy pode estar bloqueando o endpoint de admin.");
    console.error("\n  Para criar a coleção manualmente:");
    console.error(`  1. Acesse ${PB_URL}/_/`);
    console.error("  2. Faça login como admin");
    console.error('  3. Vá em "Collections" → "New collection"');
    console.error(`  4. Name: ${COLLECTION_NAME}`);
    console.error("     Type: Base (default)");
    console.error("  5. Adicione os campos:");
    console.error("     ┌──────────────────────┬────────────┬────────────┐");
    console.error("     │ Name                 │ Type       │ Required   │");
    console.error("     ├──────────────────────┼────────────┼────────────┤");
    console.error("     │ paciente_id          │ Text       │ Sim (✓)    │");
    console.error("     │ usuario_id           │ Text       │ Sim (✓)    │");
    console.error("     │ data_da_busca        │ Date       │ Sim (✓)    │");
    console.error("     │ tipo_busca           │ Text       │ Sim (✓)    │");
    console.error("     │ tipo_contato         │ Text       │ Sim (✓)    │");
    console.error("     │ entrave_informado_por│ Text       │            │");
    console.error("     │ situacao_pos_busca   │ Text       │ Sim (✓)    │");
    console.error("     │ entraves_identificados│ Text      │            │");
    console.error("     │ observacoes          │ Text       │            │");
    console.error("     └──────────────────────┴────────────┴────────────┘");
    console.error("  6. Clique em Save");
    console.error("");
    return;
  }

  console.log(`✓ Autenticado via ${auth.endpoint}`);

  // Verifica se a coleção já existe
  const listRes = await fetch(
    `${API_URL}/collections?filter=${encodeURIComponent(`name="${COLLECTION_NAME}"`)}`,
    { headers: { Authorization: `Bearer ${auth.token}` } }
  );

  if (listRes.ok) {
    const list = await listRes.json();
    if (list.items?.length > 0) {
      console.log(`→ Coleção "${COLLECTION_NAME}" já existe.`);
      return;
    }
  }

  // Cria a coleção
  const novaColecao = {
    name: COLLECTION_NAME,
    type: "base",
    schema: [
      { id: "acp001", name: "paciente_id", type: "text", required: true, system: false },
      { id: "acp002", name: "usuario_id", type: "text", required: true, system: false },
      { id: "acp003", name: "data_da_busca", type: "date", required: true, system: false },
      { id: "acp004", name: "tipo_busca", type: "text", required: true, system: false },
      { id: "acp005", name: "tipo_contato", type: "text", required: true, system: false },
      { id: "acp006", name: "entrave_informado_por", type: "text", required: false, system: false },
      { id: "acp007", name: "situacao_pos_busca", type: "text", required: true, system: false },
      { id: "acp008", name: "entraves_identificados", type: "text", required: false, system: false },
      { id: "acp009", name: "observacoes", type: "text", required: false, system: false },
    ],
    indexes: [],
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: null,
    deleteRule: "",
  };

  const createRes = await fetch(`${API_URL}/collections`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify(novaColecao),
  });

  if (!createRes.ok) {
    throw new Error(
      `Erro ao criar coleção (${createRes.status}): ${await createRes.text()}`
    );
  }

  const result = await createRes.json();
  console.log(`\n✓ Coleção "${COLLECTION_NAME}" criada com sucesso!`);
  console.log(`  ID: ${result.id}`);
  console.log("  Campos:");
  console.log("  - paciente_id (text, required)");
  console.log("  - usuario_id (text, required)");
  console.log("  - data_da_busca (date, required)");
  console.log("  - tipo_busca (text, required)");
  console.log("  - tipo_contato (text, required)");
  console.log("  - entrave_informado_por (text)");
  console.log("  - situacao_pos_busca (text, required)");
  console.log("  - entraves_identificados (text)");
  console.log("  - observacoes (text)");
  console.log("");
  console.log("  Regras de acesso: ABERTAS (sem autenticação)");
  console.log("");
  console.log("✓ Coleção de acompanhamentos pronta!");
  console.log("");
}

main()
  .catch((err) => {
    console.error("\n✗ Erro inesperado:", err.message);
    process.exit(1);
  })
  .finally(() => rl.close());
