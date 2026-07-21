/**
 * Helpers de UI — cores, labels, metas.
 * Dados mockados removidos; agora viram do PocketBase via pocketbase.ts
 */

import type { CategoriaPaciente, CardCategoria } from "./types";

export function getCoresCategoria(categoria: CategoriaPaciente): string {
  const cores: Record<CategoriaPaciente, string> = {
    diabetes: "bg-blue-50 text-blue-700 border border-blue-100",
    anemia_falciforme: "bg-bordo-50 text-bordo-700 border border-bordo-100",
  };
  return cores[categoria];
}

export function getLabelCategoria(c: CategoriaPaciente): string {
  return { diabetes: "Diabetes", anemia_falciforme: "Anemia Falciforme" }[c];
}

export function getIconeCategoria(c: CategoriaPaciente): string {
  return { diabetes: "\uD83D\uDC8A", anemia_falciforme: "\uD83E\uDEC1" }[c];
}

// ── Config dos cards de resumo (layout fixo) ─────────────────────────────

export const configCardsCategoria: Omit<CardCategoria, "valor" | "percentual" | "comBusca" | "semBusca">[] = [
  { categoria: "diabetes", titulo: "Diabetes Mellitus — pacientes identificados e em acompanhamento", meta: "diminuir", corBorda: "border-l-blue-600", corBadge: "bg-blue-600", corBarra: "bg-blue-600" },
  { categoria: "anemia_falciforme", titulo: "Anemia Falciforme — pacientes identificados e em acompanhamento", meta: "monitorar", corBorda: "border-l-bordo-600", corBadge: "bg-bordo-600", corBarra: "bg-bordo-600" },
];
