/**
 * Servico PocketBase para a collection gotas_de_cuidado_pacientes.
 * Usa REST API direta — sem SDK externo.
 *
 * Suporta autenticacao via:
 *   1. Token salvo em localStorage (pb_auth_token) — login via app
 *   2. VITE_POCKETBASE_TOKEN — token fixo via env var
 *
 * Se nenhum token existir, busca como anonimo (requer API rules publicas).
 */

import type { Paciente, Acompanhamento } from "./types";

const PB_URL = ((import.meta.env.VITE_POCKETBASE_URL as string) || "").trim() || "https://centraldedados.dev.br";
const PB_COLLECTION = (import.meta.env.VITE_POCKETBASE_COLLECTION as string) || "gotas_de_cuidado_pacientes";
const PB_FAVORITOS_COLLECTION = "gotas_de_cuidado_favoritos";
const PB_ACOMPANHAMENTOS_COLLECTION = "gotas_de_cuidado_acompanhamentos";
const PB_TOKEN_STATIC = import.meta.env.VITE_POCKETBASE_TOKEN as string | undefined;

function baseUrl(): string {
  return `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_COLLECTION}/records`;
}

function favoritosBaseUrl(): string {
  return `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_FAVORITOS_COLLECTION}/records`;
}

function acompanhamentosBaseUrl(): string {
  return `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_ACOMPANHAMENTOS_COLLECTION}/records`;
}

export interface FavoritoRecord {
  id: string;
  usuario_id: string;
  paciente_id: string;
  created?: string;
  updated?: string;
}

/**
 * Obtem token de autenticacao.
 * Prioridade: localStorage > env var > vazio (anonimo).
 */
function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem("pb_auth_token");
    if (stored) return stored;
  } catch { /* ignore */ }
  if (PB_TOKEN_STATIC) return PB_TOKEN_STATIC;
  return null;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Accept": "application/json" };
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function buscarPacientes(opts?: {
  page?: number;
  perPage?: number;
  filter?: string;
}): Promise<{ items: Paciente[]; totalItems: number; totalPages: number }> {
  const params = new URLSearchParams({
    page: String(opts?.page ?? 1),
    perPage: String(opts?.perPage ?? 500),
    sort: "-created",
    fields: "id,unidade,nome,sexo,raca,idade,data_de_nascimento,equipe,microarea,ult_consulta,classificacao,unidade_escolar,estado_nutricional,recebe_algum_beneficio,situacao_vacinal,observacoes,unidade_especializada,collectionId,collectionName,created,updated",
  });

  if (opts?.filter) {
    params.set("filter", opts.filter);
  }

  const url = `${baseUrl()}?${params.toString()}`;
  const res = await fetch(url, { headers: buildHeaders() });

  if (!res.ok) {
    throw new Error(`PocketBase erro ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();

  return {
    items: data.items as Paciente[],
    totalItems: data.totalItems as number,
    totalPages: data.totalPages as number,
  };
}

export async function buscarPacientePorId(id: string): Promise<Paciente> {
  const fields = "id,unidade,nome,sexo,raca,idade,data_de_nascimento,equipe,microarea,ult_consulta,classificacao,unidade_escolar,estado_nutricional,recebe_algum_beneficio,situacao_vacinal,observacoes,unidade_especializada,collectionId,collectionName,created,updated";
  const url = `${baseUrl()}/${id}?fields=${encodeURIComponent(fields)}`;
  const res = await fetch(url, { headers: buildHeaders() });

  if (!res.ok) {
    throw new Error(`PocketBase erro ${res.status}: ${res.statusText}`);
  }

  return (await res.json()) as Paciente;
}

export async function atualizarPaciente(id: string, dados: Partial<Paciente>): Promise<Paciente> {
  const url = `${baseUrl()}/${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...buildHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PocketBase erro ${res.status}: ${text}`);
  }
  return (await res.json()) as Paciente;
}

// ── Favoritos (gotas_de_cuidado_favoritos) ──────────────────────────────

export async function buscarFavoritos(
  usuarioId: string
): Promise<FavoritoRecord[]> {
  const url = `${favoritosBaseUrl()}?filter=${encodeURIComponent(
    `usuario_id="${usuarioId}"`
  )}&perPage=500&sort=-created`;
  const res = await fetch(url, { headers: buildHeaders() });
  if (!res.ok) {
    throw new Error(`PocketBase erro favoritos ${res.status}: ${res.statusText}`);
  }
  const data = await res.json();
  return data.items as FavoritoRecord[];
}

export async function adicionarFavorito(
  usuarioId: string,
  pacienteId: string
): Promise<FavoritoRecord> {
  const headers = { ...buildHeaders(), "Content-Type": "application/json" };
  const res = await fetch(favoritosBaseUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({ usuario_id: usuarioId, paciente_id: pacienteId }),
  });
  if (!res.ok) {
    throw new Error(`PocketBase erro favoritos ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as FavoritoRecord;
}

export async function removerFavorito(favoritoId: string): Promise<void> {
  const res = await fetch(`${favoritosBaseUrl()}/${favoritoId}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
  if (!res.ok) {
    throw new Error(`PocketBase erro favoritos ${res.status}: ${res.statusText}`);
  }
}

// ── Acompanhamentos ────────────────────────────────────────────────────

export async function buscarAcompanhamentos(
  pacienteId: string
): Promise<Acompanhamento[]> {
  const url = `${acompanhamentosBaseUrl()}?filter=${encodeURIComponent(
    `paciente_id="${pacienteId}"`
  )}&perPage=200&sort=-data_da_busca`;
  const res = await fetch(url, { headers: buildHeaders() });
  if (!res.ok) {
    throw new Error(`PocketBase erro ${res.status}: ${res.statusText}`);
  }
  const data = await res.json();
  return data.items as Acompanhamento[];
}

export async function criarAcompanhamento(
  dados: Omit<Acompanhamento, "id" | "created" | "updated">
): Promise<Acompanhamento> {
  const headers = { ...buildHeaders(), "Content-Type": "application/json" };
  const res = await fetch(acompanhamentosBaseUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify(dados),
  });
  if (!res.ok) {
    throw new Error(`PocketBase erro ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as Acompanhamento;
}

export async function atualizarAcompanhamento(
  id: string,
  dados: Partial<Omit<Acompanhamento, "id" | "created" | "updated">>
): Promise<Acompanhamento> {
  const headers = { ...buildHeaders(), "Content-Type": "application/json" };
  const res = await fetch(`${acompanhamentosBaseUrl()}/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(dados),
  });
  if (!res.ok) {
    throw new Error(`PocketBase erro ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as Acompanhamento;
}

export async function buscarTodosPacientes(): Promise<Paciente[]> {
  const all: Paciente[] = [];
  let page = 1;
  const perPage = 500;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await buscarPacientes({ page, perPage });
    all.push(...result.items);
    if (page >= result.totalPages) break;
    page++;
  }
  return all;
}

export async function buscarTodosAcompanhamentos(): Promise<Acompanhamento[]> {
  const all: Acompanhamento[] = [];
  let page = 1;
  const perPage = 500;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `${acompanhamentosBaseUrl()}?page=${page}&perPage=${perPage}&sort=-created`;
    const res = await fetch(url, { headers: buildHeaders() });
    if (!res.ok) {
      throw new Error(`PocketBase erro ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    all.push(...(data.items as Acompanhamento[]));
    if (page >= data.totalPages) break;
    page++;
  }
  return all;
}

export async function excluirAcompanhamento(id: string): Promise<void> {
  const res = await fetch(`${acompanhamentosBaseUrl()}/${id}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
  if (!res.ok) {
    throw new Error(`PocketBase erro ${res.status}: ${res.statusText}`);
  }
}
