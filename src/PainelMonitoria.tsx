import { useMemo, useState, useRef, useEffect } from "react";
import type { Paciente } from "./types";

// ── Tipos auxiliares ──────────────────────────────────────────────────
interface PacienteDias {
  paciente: Paciente;
  diasDesdeConsulta: number;
}

interface KpiCard {
  label: string;
  valor: number;
  cor: string;
  icone: React.ReactNode;
  pulse?: boolean;
  sublabel?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────
function calcularDiasSemConsulta(ultConsulta: string): number {
  if (!ultConsulta) return 9999;
  const m = ultConsulta.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 9999;
  const data = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.floor((hoje.getTime() - data.getTime()) / (1000 * 60 * 60 * 24));
}

function formatarData(dateStr: string): string {
  if (!dateStr) return "—";
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function faixaCor(dias: number): string {
  if (dias >= 120) return "text-rose-600";
  if (dias >= 90) return "text-orange-500";
  if (dias >= 60) return "text-amber-500";
  return "text-yellow-500";
}

function faixaBg(dias: number): string {
  if (dias >= 120) return "bg-rose-50 border-rose-200/60";
  if (dias >= 90) return "bg-orange-50 border-orange-200/60";
  if (dias >= 60) return "bg-amber-50 border-amber-200/60";
  return "bg-yellow-50 border-yellow-200/60";
}

function faixaDot(dias: number): string {
  if (dias >= 120) return "bg-rose-500";
  if (dias >= 90) return "bg-orange-500";
  if (dias >= 60) return "bg-amber-500";
  return "bg-yellow-500";
}

// ── Hook para contagem animada ────────────────────────────────────────
function useContagemAnimada(alvo: number, duracao = 1200): number {
  const [atual, setAtual] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    const inicio = performance.now();
    const from = atual;
    function tick(now: number) {
      const elapsed = now - inicio;
      const progress = Math.min(elapsed / duracao, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAtual(Math.round(from + (alvo - from) * eased));
      if (progress < 1) ref.current = requestAnimationFrame(tick);
    }
    ref.current = requestAnimationFrame(tick);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [alvo, duracao]);

  return atual;
}

// ── Componente KPI Card animado ───────────────────────────────────────
function KpiCardAnimado({ card }: { card: KpiCard }) {
  const valorAnimado = useContagemAnimada(card.valor);
  return (
    <div className={`group relative overflow-hidden rounded-2xl border ${card.cor} p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg`}>
      <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-gradient-to-br from-white/40 to-white/10 blur-2xl transition-all duration-500 group-hover:scale-150" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">{card.label}</p>
          <p className="mt-1 text-3xl font-black tabular-nums text-slate-800 leading-none">
            {valorAnimado.toLocaleString("pt-BR")}
          </p>
          {card.sublabel && (
            <p className="mt-1 text-[10px] font-semibold text-slate-400">{card.sublabel}</p>
          )}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-white/80 to-white/40 text-slate-600 shadow-sm ring-1 ring-black/[0.04] ${card.pulse ? "animate-pulse" : ""}`}>
          {card.icone}
        </div>
      </div>
      {card.pulse && (
        <div className="absolute -bottom-1 -right-1 h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" />
        </div>
      )}
    </div>
  );
}

// ═══ COMPONENTE PRINCIPAL ═════════════════════════════════════════════
export default function PainelMonitoria({
  pacMap,
}: {
  pacMap: Record<string, Paciente>;
}) {
  const [expandido, setExpandido] = useState(true);

  const pacientesDias = useMemo(() => {
    const resultado: PacienteDias[] = [];
    for (const pac of Object.values(pacMap)) {
      const dias = calcularDiasSemConsulta(pac.ult_consulta);
      if (dias >= 30) {
        resultado.push({ paciente: pac, diasDesdeConsulta: dias });
      }
    }
    return resultado.sort((a, b) => b.diasDesdeConsulta - a.diasDesdeConsulta);
  }, [pacMap]);

  const total = pacientesDias.length;
  const faixa30_59 = pacientesDias.filter((p) => p.diasDesdeConsulta >= 30 && p.diasDesdeConsulta < 60).length;
  const faixa60_89 = pacientesDias.filter((p) => p.diasDesdeConsulta >= 60 && p.diasDesdeConsulta < 90).length;
  const faixa90_119 = pacientesDias.filter((p) => p.diasDesdeConsulta >= 90 && p.diasDesdeConsulta < 120).length;
  const faixa120 = pacientesDias.filter((p) => p.diasDesdeConsulta >= 120).length;

  const top10 = pacientesDias.slice(0, 10);

  const kpis: KpiCard[] = [
    {
      label: "Pacientes Atrasados",
      valor: total,
      cor: "bg-gradient-to-br from-slate-50 to-slate-100/80 border-slate-200/80 shadow-slate-200/40",
      icone: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2 2 0 0 1 5 17.119V5a2 2 0 0 1 2-2h6" />
        </svg>
      ),
      sublabel: "≥ 30 dias sem consulta",
    },
    {
      label: "Alerta Vermelho",
      valor: faixa120,
      cor: "bg-gradient-to-br from-rose-50 to-rose-100/80 border-rose-200/80 shadow-rose-200/40",
      icone: (
        <svg className="h-5 w-5 text-rose-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      ),
      pulse: faixa120 > 0,
      sublabel: "≥ 120 dias sem consulta",
    },
    {
      label: "Atenção",
      valor: faixa60_89 + faixa90_119,
      cor: "bg-gradient-to-br from-amber-50 to-amber-100/80 border-amber-200/80 shadow-amber-200/40",
      icone: (
        <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ),
      sublabel: "60–119 dias sem consulta",
    },
    {
      label: "Monitoramento",
      valor: faixa30_59,
      cor: "bg-gradient-to-br from-yellow-50 to-yellow-100/80 border-yellow-200/80 shadow-yellow-200/40",
      icone: (
        <svg className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      ),
      sublabel: "30–59 dias sem consulta",
    },
  ];

  if (total === 0) return null;

  return (
    <div className="mx-auto max-w-[1380px] px-4 pt-6 pb-4 sm:px-6 lg:px-8">
      {/* ── Header do Painel ──────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 shadow-lg shadow-rose-500/25">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
              </svg>
            </div>
            {faixa120 > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-black text-white shadow-sm">
                {faixa120}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight text-slate-800">
              Painel de Monitoria <span className="text-rose-500">— Acompanhamentos Atrasados</span>
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Pacientes com 30 dias ou mais sem consulta registrada
            </p>
          </div>
        </div>
        <button
          onClick={() => setExpandido(!expandido)}
          className="flex items-center gap-1.5 rounded-xl bg-white border border-slate-200/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-700 hover:shadow-md active:scale-95"
        >
          <svg className={`h-3.5 w-3.5 transition-transform duration-300 ${expandido ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
          {expandido ? "Recolher" : "Expandir"}
        </button>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCardAnimado key={kpi.label} card={kpi} />
        ))}
      </div>

      {/* ── Conteúdo expandível ──────────────────────────── */}
      <div
        className="overflow-hidden transition-all duration-500 ease-out"
        style={{ maxHeight: expandido ? "2000px" : "0px", opacity: expandido ? 1 : 0 }}
      >
        {/* ── Tabela de Prioridade (Top 10) ────────────────── */}
        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white shadow-lg shadow-slate-200/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-600">
                Top 10 — Pacientes Mais Urgentes
              </h3>
            </div>
            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-600 border border-rose-200/60">
              {total} total
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="px-4 py-2 text-left text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">#</th>
                  <th className="px-4 py-2 text-left text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Paciente</th>
                  <th className="px-4 py-2 text-left text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Categoria</th>
                  <th className="px-4 py-2 text-left text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Unidade</th>
                  <th className="px-4 py-2 text-left text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Última Consulta</th>
                  <th className="px-4 py-2 text-center text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Dias</th>
                  <th className="px-4 py-2 text-center text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Urgência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {top10.map((item, idx) => (
                  <tr
                    key={item.paciente.id}
                    className="group transition-all duration-200 hover:bg-gradient-to-r hover:from-rose-50/40 hover:via-white hover:to-rose-50/40"
                  >
                    <td className="px-4 py-3">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black ${
                        idx === 0 ? "bg-rose-500 text-white shadow-sm shadow-rose-300/50" :
                        idx === 1 ? "bg-orange-400 text-white shadow-sm shadow-orange-300/50" :
                        idx === 2 ? "bg-amber-400 text-white shadow-sm shadow-amber-300/50" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-[10px] font-black text-white shadow-sm">
                          {item.paciente.nome?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-slate-800">{item.paciente.nome}</p>
                          {item.paciente.equipe && (
                            <p className="text-[8px] font-bold text-slate-400">Eq. {item.paciente.equipe}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider border ${
                        item.paciente.classificacao?.toLowerCase().includes("diabetes")
                          ? "bg-blue-50 text-blue-700 border-blue-200/60"
                          : "bg-bordo-50 text-bordo-700 border-bordo-200/60"
                      }`}>
                        {item.paciente.classificacao?.toLowerCase().includes("diabetes") ? "DM" : "AF"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold text-slate-500 max-w-[120px] truncate block" title={item.paciente.unidade}>
                        {item.paciente.unidade || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold text-slate-600 tabular-nums">{formatarData(item.paciente.ult_consulta)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-black tabular-nums ${faixaBg(item.diasDesdeConsulta)} ${faixaCor(item.diasDesdeConsulta)}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${faixaDot(item.diasDesdeConsulta)}`} />
                        {item.diasDesdeConsulta}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        {Array.from({ length: 5 }, (_, i) => {
                          const maxDias = 180;
                          const preenchido = i < Math.min(5, Math.ceil((item.diasDesdeConsulta / maxDias) * 5));
                          return (
                            <div
                              key={i}
                              className={`h-2 w-2 rounded-sm transition-all duration-300 ${
                                preenchido
                                  ? item.diasDesdeConsulta >= 120 ? "bg-rose-500" :
                                    item.diasDesdeConsulta >= 90 ? "bg-orange-500" :
                                    item.diasDesdeConsulta >= 60 ? "bg-amber-500" :
                                    "bg-yellow-400"
                                  : "bg-slate-100"
                              }`}
                              style={{ animationDelay: `${i * 100}ms` }}
                            />
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Legenda de Urgência ─────────────────────────── */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 rounded-xl bg-white border border-slate-200/80 px-4 py-2.5 shadow-sm">
          <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-slate-400">Legenda:</span>
          {[
            { label: "30–59 dias", cor: "bg-yellow-400", texto: "text-yellow-700" },
            { label: "60–89 dias", cor: "bg-amber-500", texto: "text-amber-700" },
            { label: "90–119 dias", cor: "bg-orange-500", texto: "text-orange-600" },
            { label: "120+ dias", cor: "bg-rose-500", texto: "text-rose-600" },
          ].map(({ label, cor, texto }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${cor}`} />
              <span className={`text-[9px] font-bold ${texto}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
