import { useState, useEffect, useRef, useMemo } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

// ── Types ─────────────────────────────────────────────────────────────
interface ImportLog {
  id: string;
  fileName: string;
  date: string;
  totalRecords: number;
  imported: number;
  errors: number;
  durationSec: number;
  speedRegSec: number;
  collection: string;
  status: "success" | "partial" | "error";
}

// ── Helpers ───────────────────────────────────────────────────────────
const STORAGE_KEY = "import_history";

function getImportHistory(): ImportLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ImportLog[];
  } catch { return []; }
}

function clearImportHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusColor(status: string): string {
  if (status === "success") return "bg-emerald-50 text-emerald-700 border-emerald-200/60";
  if (status === "partial") return "bg-amber-50 text-amber-700 border-amber-200/60";
  return "bg-rose-50 text-rose-700 border-rose-200/60";
}

function statusLabel(status: string): string {
  if (status === "success") return "Sucesso";
  if (status === "partial") return "Parcial";
  return "Erro";
}

// ── Animated counter hook ─────────────────────────────────────────────
function useContagemAnimada(alvo: number, duracao = 1200): number {
  const [atual, setAtual] = useState(0);
  const ref = useRef<number | null>(null);
  useEffect(() => {
    const inicio = performance.now();
    const from = atual;
    function tick(now: number) {
      const progress = Math.min((now - inicio) / duracao, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAtual(Math.round(from + (alvo - from) * eased));
      if (progress < 1) ref.current = requestAnimationFrame(tick);
    }
    ref.current = requestAnimationFrame(tick);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [alvo, duracao]);
  return atual;
}

// ── KPI Card ──────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, color, sub }: { label: string; value: number; icon: React.ReactNode; color: string; sub?: string }) {
  const animated = useContagemAnimada(value);
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${color} p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg`}>
      <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-gradient-to-br from-white/40 to-white/10 blur-2xl" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-black tabular-nums text-slate-800 leading-none">{animated.toLocaleString("pt-BR")}</p>
          {sub && <p className="mt-1 text-[10px] font-semibold text-slate-400">{sub}</p>}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-white/80 to-white/40 text-slate-600 shadow-sm ring-1 ring-black/[0.04]">
          {icon}
        </div>
      </div>
    </div>
  );
}

// ── ECharts wrapper ───────────────────────────────────────────────────
function Chart({ option, className }: { option: any; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!chartRef.current) {
      chartRef.current = echarts.init(ref.current, undefined, { renderer: "canvas" });
    }
    chartRef.current.setOption(option, true);
    const resize = () => chartRef.current?.resize();
    window.addEventListener("resize", resize);
    const obs = new ResizeObserver(resize);
    obs.observe(ref.current);
    return () => { window.removeEventListener("resize", resize); obs.disconnect(); };
  }, [option]);

  return <div ref={ref} className={className} />;
}

// ═══ COMPONENTE PRINCIPAL ═════════════════════════════════════════════
export default function HistoricoImportacoes({ isAdmin }: { isAdmin?: boolean }) {
  const [history, setHistory] = useState<ImportLog[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setHistory(getImportHistory());
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = history.length;
    const totalRegistros = history.reduce((a, h) => a + h.imported, 0);
    const totalErros = history.reduce((a, h) => a + h.errors, 0);
    const mediaVelocidade = total > 0 ? Math.round(history.reduce((a, h) => a + h.speedRegSec, 0) / total) : 0;
    const sucessoCount = history.filter((h) => h.status === "success").length;
    const taxaSucesso = total > 0 ? Math.round((sucessoCount / total) * 100) : 0;
    return { total, totalRegistros, totalErros, mediaVelocidade, taxaSucesso };
  }, [history]);

  // ── Chart: Records per import (horizontal bar) ────────────────────
  const recordsBarOption = useMemo(() => {
    const recent = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
    const labels = recent.map((h) => h.fileName.length > 20 ? h.fileName.slice(0, 20) + "…" : h.fileName);

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "rgba(15,23,42,0.95)",
        borderColor: "rgba(255,255,255,0.1)",
        textStyle: { color: "#f8fafc", fontSize: 12, fontWeight: "bold" },
        formatter: (params: any) => {
          const p = params[0];
          return `<div style="font-weight:800">${p.name}</div><div style="margin-top:4px;font-size:16px;font-weight:900">${p.value.toLocaleString("pt-BR")} registros</div>`;
        },
      },
      grid: { left: 8, right: 40, bottom: 8, top: 8, containLabel: true },
      xAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" } }, axisLabel: { color: "#94a3b8", fontSize: 10 } },
      yAxis: { type: "category", data: labels.reverse(), axisLabel: { color: "#475569", fontSize: 10, fontWeight: "bold", width: 120, overflow: "truncate" }, axisLine: { show: false }, axisTick: { show: false } },
      animationDuration: 1200,
      animationEasing: "cubicOut",
      series: [{
        type: "bar", barWidth: "60%",
        data: recent.map((h) => ({
          value: h.imported,
          itemStyle: { borderRadius: [0, 8, 8, 0], color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: "#6366f1" }, { offset: 1, color: "#818cf8" }] } },
        })).reverse(),
        label: { show: true, position: "right", fontSize: 11, fontWeight: "900", color: "#475569" },
        animationDelay: (i: number) => i * 100,
      }],
    };
  }, [history]);

  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/60 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
          <svg className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25-2.25M12 13.875V7.5" />
          </svg>
        </div>
        <p className="text-sm font-bold text-slate-500">Nenhuma importação registrada</p>
        <p className="mt-1 text-xs text-slate-400">O histórico aparecerá aqui após a primeira importação de dados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Total de Importações"
          value={stats.total}
          color="bg-gradient-to-br from-slate-50 to-slate-100/80 border-slate-200/80"
          sub="realizadas"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>}
        />
        <KpiCard
          label="Registros Importados"
          value={stats.totalRegistros}
          color="bg-gradient-to-br from-emerald-50 to-emerald-100/80 border-emerald-200/80"
          sub="pacientes adicionados"
          icon={<svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>}
        />
        <KpiCard
          label="Taxa de Sucesso"
          value={stats.taxaSucesso}
          color="bg-gradient-to-br from-blue-50 to-blue-100/80 border-blue-200/80"
          sub="% importações OK"
          icon={<svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KpiCard
          label="Total de Erros"
          value={stats.totalErros}
          color="bg-gradient-to-br from-rose-50 to-rose-100/80 border-rose-200/80"
          sub="registros com falha"
          icon={<svg className="h-5 w-5 text-rose-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}
        />
      </div>

      {/* ── Records per import ──────────────────────────────────── */}
      {history.length >= 2 && (
        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-gradient-to-r from-indigo-400 to-violet-400" />
            <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-600">Registros por Importação (Últimas 8)</h3>
          </div>
          <Chart option={recordsBarOption} className="h-[280px] w-full" />
        </div>
      )}

      {/* ── Tabela de histórico ─────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-slate-400 animate-pulse" />
            <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-600">Histórico Detalhado</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
              {history.length} registros
            </span>
            {history.length > 0 && isAdmin && (
              confirmClear ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => { clearImportHistory(); setHistory([]); setConfirmClear(false); }} className="rounded-lg bg-rose-500 px-2 py-1 text-[9px] font-bold text-white hover:bg-rose-600">Confirmar</button>
                  <button onClick={() => setConfirmClear(false)} className="rounded-lg bg-slate-200 px-2 py-1 text-[9px] font-bold text-slate-500 hover:bg-slate-300">Cancelar</button>
                </div>
              ) : (
                <button onClick={() => setConfirmClear(true)} className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors">Limpar</button>
              )
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Data</th>
                <th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Arquivo</th>
                <th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Registros</th>
                <th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Importados</th>
                <th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Erros</th>
                <th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Duração</th>
                <th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Velocidade</th>
                <th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80">
              {[...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((log) => (
                <tr key={log.id} className="transition-all duration-200 hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-xs font-bold text-slate-600 tabular-nums whitespace-nowrap">{formatDate(log.date)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-slate-700 max-w-[180px] truncate block" title={log.fileName}>{log.fileName}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-black tabular-nums text-slate-700">{log.totalRecords.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-black tabular-nums text-emerald-700 border border-emerald-200/60">
                      {log.imported.toLocaleString("pt-BR")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-black tabular-nums border ${log.errors > 0 ? "bg-rose-50 text-rose-700 border-rose-200/60" : "bg-slate-50 text-slate-400 border-slate-200/60"}`}>
                      {log.errors}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-bold text-slate-500 tabular-nums">{formatDuration(log.durationSec)}</td>
                  <td className="px-4 py-3 text-center text-xs font-bold text-slate-500 tabular-nums">{log.speedRegSec > 0 ? `${log.speedRegSec}/s` : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${statusColor(log.status)}`}>
                      {statusLabel(log.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
