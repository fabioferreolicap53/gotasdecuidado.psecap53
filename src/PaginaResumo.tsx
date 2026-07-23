import { useState, useEffect, useRef } from "react";
import * as echarts from "echarts";
import { buscarTodosPacientes, buscarTodosAcompanhamentos } from "./pocketbase";
import type { Paciente, Acompanhamento } from "./types";
import { calcularIdade } from "./PaginaPacientes";

// ── ECharts wrapper ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Chart({ option, className = "" }: { option: Record<string, any>; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!chartRef.current) {
      chartRef.current = echarts.init(ref.current, undefined, { renderer: "svg" });
    }
    chartRef.current.setOption(option as echarts.EChartsOption, true);
    const handleResize = () => chartRef.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("resize", handleResize); };
  }, [option]);

  useEffect(() => {
    return () => { chartRef.current?.dispose(); chartRef.current = null; };
  }, []);

  return <div ref={ref} className={className} />;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function mesAno(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m] = dateStr.split("-");
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${meses[parseInt(m, 10) - 1]}/${y?.slice(2)}`;
}

// ── Chart Card Icons ────────────────────────────────────────────────────

const I = {
  pizza:     <svg className="h-[18px] w-[18px] text-cyan-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 3a7.5 7.5 0 0 1 7.5 7.5h-7.5V3Z" /></svg>,
  shield:    <svg className="h-[18px] w-[18px] text-bordo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>,
  busca:     <svg className="h-[18px] w-[18px] text-cyan-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>,
  timeline:  <svg className="h-[18px] w-[18px] text-cyan-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.334-4.581 3 3 0 0 1 4.025 3.44 11.95 11.95 0 0 1-2.14 6.07" /><path strokeLinecap="round" strokeLinejoin="round" d="M18 6V3h-3m4.5 3-6 6" /></svg>,
  building:  <svg className="h-[18px] w-[18px] text-bordo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>,
  users:     <svg className="h-[18px] w-[18px] text-bordo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>,
  clipboard: <svg className="h-[18px] w-[18px] text-cyan-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" /></svg>,
  heart:     <svg className="h-[18px] w-[18px] text-bordo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>,
  phone:     <svg className="h-[18px] w-[18px] text-cyan-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>,
  warning:   <svg className="h-[18px] w-[18px] text-bordo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>,
  calendar:  <svg className="h-[18px] w-[18px] text-bordo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>,
  pin:       <svg className="h-[18px] w-[18px] text-bordo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>,
};

// ── Chart Card Wrapper ──────────────────────────────────────────────────

function ChartCard({ titulo, subtitulo, children, icone, className = "" }: { titulo: string; subtitulo?: string; children: React.ReactNode; icone?: React.ReactNode; className?: string }) {
  return (
    <div className={`group rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm shadow-[0_4px_12px_rgba(0,0,0,0.05),0_0_0_1px_rgba(226,232,240,0.6)] transition-all duration-500 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25),0_8px_24px_-6px_rgba(0,0,0,0.1),0_0_0_1px_rgba(226,232,240,0.6)] hover:-translate-y-1.5 ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100/80 px-6 py-4">
        <div>
          <p className="text-[12px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-700 transition-colors">{titulo}</p>
          {subtitulo && <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider group-hover:text-slate-400 transition-colors">{subtitulo}</p>}
        </div>
        {icone && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-bordo-50 to-blue-50 ring-1 ring-bordo-200/50 shadow-sm opacity-80 transition-all duration-300 group-hover:opacity-100 group-hover:scale-110 group-hover:shadow-md group-hover:ring-bordo-400/70">
            {icone}
          </div>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── KPI Stat Card ───────────────────────────────────────────────────────

function KpiCard({ titulo, valor, icone, cor, corHex, subtitulo, delay = 0 }: { titulo: string; valor: string | number; icone: React.ReactNode; cor: string; corHex: string; subtitulo?: string; delay?: number }) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.8),0_0_0_1px_rgba(226,232,240,0.6)] transition-all duration-500 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25),0_8px_24px_-6px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] hover:-translate-y-1.5 animate-[fadeInUp_0.6s_ease-out_both]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top accent bar */}
      <div className={`absolute inset-x-0 top-0 h-1 ${cor} transition-all duration-300 group-hover:h-1.5`} />
      {/* Hover glow */}
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-700 group-hover:opacity-30" style={{ backgroundColor: corHex }} />
      <div className="absolute -left-4 -bottom-4 h-16 w-16 rounded-full opacity-0 blur-xl transition-opacity duration-700 group-hover:opacity-20" style={{ backgroundColor: corHex }} />
      {/* Content */}
      <div className="relative px-6 pt-6 pb-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-slate-500 transition-colors">{titulo}</p>
            <p className="mt-2.5 text-[2.25rem] font-black tracking-tight text-slate-900 tabular-nums leading-none">{valor}</p>
            {subtitulo && <p className="mt-1.5 text-[10px] font-semibold text-slate-400">{subtitulo}</p>}
          </div>
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3" style={{ backgroundColor: `${corHex}12`, color: corHex, boxShadow: `0 0 0 1px ${corHex}18` }}>
            {icone}
          </div>
        </div>
      </div>
      {/* Bottom subtle line */}
      <div className="h-px mx-6 bg-gradient-to-r from-transparent via-slate-100 to-transparent" />
      <div className="px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: corHex }} />
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-300">Ativo</span>
        </div>
        <svg className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
      </div>
    </div>
  );
}

// ── Pagina Resumo ───────────────────────────────────────────────────────

export default function PaginaResumo({ usuarioUnidade }: { usuarioUnidade: string }) {
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [acomps, setAcomps] = useState<Acompanhamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancel = false;
    async function carregar() {
      try {
        const [pacs, ac] = await Promise.all([
          buscarTodosPacientes(),
          buscarTodosAcompanhamentos(),
        ]);
        if (!cancel) {
          const filtrados = usuarioUnidade ? pacs.filter((p) => p.unidade === usuarioUnidade) : pacs;
          const idsPacs = new Set(filtrados.map((p) => p.id));
          const acompsFiltrados = usuarioUnidade ? ac.filter((a) => idsPacs.has(a.paciente_id)) : ac;
          setPacientes(filtrados);
          setAcomps(acompsFiltrados);
        }
      } catch { /* ignore */ }
      finally { if (!cancel) setCarregando(false); }
    }
    carregar();
    return () => { cancel = true; };
  }, []);

  // ── Métricas ────────────────────────────────────────────────────────

  const totalPacientes = pacientes.length;

  const isPrioritario = (p: Paciente) => {
    return p.classificacao?.toLowerCase().includes("diabetes") || p.classificacao?.toLowerCase().includes("anemia");
  };
  const pacientesPrioritarios = pacientes.filter(isPrioritario);
  const idsPrioritarios = new Set(pacientesPrioritarios.map((p) => p.id));
  const acompsPrioritarios = acomps.filter((a) => idsPrioritarios.has(a.paciente_id));

  const totalAcomps = acompsPrioritarios.length;

  const agora = new Date();
  const mesAtual = agora.getMonth();
  const anoAtual = agora.getFullYear();
  const acompsMesAtual = acompsPrioritarios.filter((a) => {
    const [y, m] = (a.data_da_busca || "").split("-");
    return parseInt(y, 10) === anoAtual && parseInt(m, 10) === mesAtual + 1;
  }).length;

  const diabetes = pacientesPrioritarios.filter((p) => p.classificacao?.toLowerCase().includes("diabetes")).length;
  const anemiaFalciforme = pacientesPrioritarios.filter((p) => p.classificacao?.toLowerCase().includes("anemia")).length;

  // ── Sexo ──────────────────────────────────────────────────────────────
  const sexoMap = pacientesPrioritarios.reduce<Record<string, number>>((acc, p) => {
    const s = p.sexo || "N\u00e3o informado";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  // ── Raça ──────────────────────────────────────────────────────────────
  const racaMap = pacientesPrioritarios.reduce<Record<string, number>>((acc, p) => {
    const r = p.raca || "N\u00e3o informado";
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {});
  const topRacas = Object.entries(racaMap).sort((a, b) => b[1] - a[1]);
  const maxRaca = topRacas[0]?.[1] || 1;

  // ── Estado Nutricional ────────────────────────────────────────────────
  const nutMap = pacientesPrioritarios.reduce<Record<string, number>>((acc, p) => {
    const n = p.estado_nutricional || "N\u00e3o informado";
    acc[n] = (acc[n] || 0) + 1;
    return acc;
  }, {});
  const topNut = Object.entries(nutMap).sort((a, b) => b[1] - a[1]);
  const maxNut = topNut[0]?.[1] || 1;

  // ── Situação Vacinal ─────────────────────────────────────────────────
  const vacMap = pacientesPrioritarios.reduce<Record<string, number>>((acc, p) => {
    const v = p.situacao_vacinal || "N\u00e3o informado";
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
  const topVac = Object.entries(vacMap).sort((a, b) => b[1] - a[1]);

  // ── Benefício ──────────────────────────────────────────────────────────
  const benefMap = pacientesPrioritarios.reduce<Record<string, number>>((acc, p) => {
    const b = p.recebe_algum_beneficio || "N\u00e3o informado";
    acc[b] = (acc[b] || 0) + 1;
    return acc;
  }, {});
  const topBenef = Object.entries(benefMap).sort((a, b) => b[1] - a[1]);

  // ── Top Escolas ────────────────────────────────────────────────────────
  const escolasMap = pacientesPrioritarios.reduce<Record<string, number>>((acc, p) => {
    const e = p.unidade_escolar || "Sem escola";
    acc[e] = (acc[e] || 0) + 1;
    return acc;
  }, {});
  const topEscolas = Object.entries(escolasMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxEscola = topEscolas[0]?.[1] || 1;

  // ── Gráfico Pizza: Categorias ────────────────────────────────────────

  const tooltipPremium = {
    backgroundColor: "rgba(15,23,42,0.95)", borderColor: "rgba(255,255,255,0.08)", borderWidth: 1,
    textStyle: { color: "#f8fafc", fontSize: 14, fontWeight: "bold", fontFamily: "Inter, sans-serif" },
    extraCssText: "backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,0.3);border-radius:12px;padding:14px 20px;",
  };

  const pizzaOption = {
    tooltip: { ...tooltipPremium, trigger: "item", formatter: "{b}<br/><span style='font-size:18px;font-weight:900'>{c}</span> <span style='color:#94a3b8'>({d}%)</span>" },
    legend: { bottom: 0, textStyle: { color: "#64748b", fontSize: 12, fontWeight: "bold" }, itemGap: 24, itemWidth: 14, itemHeight: 14, icon: "roundRect" },
    animationDuration: 1200, animationEasing: "elasticOut",
    series: [{
      type: "pie", radius: ["40%", "72%"], center: ["50%", "42%"],
      itemStyle: { borderRadius: 10, borderColor: "#fff", borderWidth: 3 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 12, label: { show: true, fontSize: 15, fontWeight: "900", color: "#1e293b", formatter: "{b}\n{d}%" }, itemStyle: { shadowBlur: 20, shadowColor: "rgba(0,0,0,0.15)" } },
      animationType: "scale", animationDelay: (i: number) => i * 150,
      data: [
        { value: diabetes, name: "Diabetes", itemStyle: { color: { type: "linear", x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: "#3b82f6" }, { offset: 1, color: "#1d4ed8" }] } } },
        { value: anemiaFalciforme, name: "Anemia Falciforme", itemStyle: { color: { type: "linear", x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: "#b91c3a" }, { offset: 1, color: "#9b1630" }] } } },
      ].filter((d) => d.value > 0),
    }],
  };

  // ── Gráfico Donut: Situação pós-busca ───────────────────────────────

  const situacoes = acompsPrioritarios.reduce<Record<string, number>>((acc, a) => {
    const s = a.situacao_pos_busca || "Não informado";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const donutCores = [
    { type: "linear", x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: "#22d3ee" }, { offset: 1, color: "#0891b2" }] },
    { type: "linear", x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: "#34d399" }, { offset: 1, color: "#059669" }] },
    { type: "linear", x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: "#fbbf24" }, { offset: 1, color: "#d97706" }] },
    { type: "linear", x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: "#fb7185" }, { offset: 1, color: "#e11d48" }] },
    { type: "linear", x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: "#a78bfa" }, { offset: 1, color: "#7c3aed" }] },
    { type: "linear", x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: "#94a3b8" }, { offset: 1, color: "#64748b" }] },
  ];

  const donutOption = {
    tooltip: { ...tooltipPremium, trigger: "item", formatter: "{b}<br/><span style='font-size:18px;font-weight:900'>{c}</span> <span style='color:#94a3b8'>({d}%)</span>" },
    legend: { bottom: 0, textStyle: { color: "#64748b", fontSize: 11, fontWeight: "bold" }, itemGap: 18, itemWidth: 14, itemHeight: 14, icon: "roundRect" },
    animationDuration: 1400, animationEasing: "cubicOut",
    series: [{
      type: "pie", radius: ["44%", "72%"], center: ["50%", "40%"],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 10, label: { show: true, fontSize: 13, fontWeight: "900", color: "#1e293b" }, itemStyle: { shadowBlur: 20, shadowColor: "rgba(0,0,0,0.12)" } },
      animationType: "scale", animationDelay: (i: number) => i * 120,
      data: Object.entries(situacoes).map(([name, value], i) => ({ name, value, itemStyle: { color: donutCores[i % donutCores.length] } })).sort((a, b) => b.value - a.value).slice(0, 8),
    }],
  };

  // ── Gráfico Barra: Tipo de busca ────────────────────────────────────

  const tiposBusca = acompsPrioritarios.reduce<Record<string, number>>((acc, a) => {
    const t = a.tipo_busca || "Não informado";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const barraOption = {
    tooltip: { ...tooltipPremium, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(6,182,212,0.06)" } } },
    grid: { left: 8, right: 20, bottom: 90, top: 24, containLabel: true },
    xAxis: {
      type: "category", data: Object.keys(tiposBusca),
      axisLabel: {
        color: "#64748b", fontSize: 11, fontWeight: "bold", rotate: 0, interval: 0,
        formatter: (v: string) => {
          const words = v.split(/\s+/);
          if (words.length <= 3) return words.join("\n");
          const lines: string[] = [];
          let line = "";
          words.forEach((w) => { if ((line + " " + w).trim().length > 16) { if (line) lines.push(line); line = w; } else { line = (line + " " + w).trim(); } });
          if (line) lines.push(line);
          return lines.join("\n");
        },
      },
      axisLine: { lineStyle: { color: "#e2e8f0" } }, axisTick: { show: false },
    },
    yAxis: {
      type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" } },
      axisLabel: { color: "#94a3b8", fontSize: 11, fontWeight: "bold" },
    },
    animationDuration: 1000, animationEasing: "elasticOut",
    series: [{
      type: "bar", barWidth: "58%",
      data: Object.entries(tiposBusca).map(([, v], i) => ({
        value: v,
        itemStyle: { borderRadius: [8, 8, 0, 0], color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: ["#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e"][i % 5] }, { offset: 1, color: ["#0891b2", "#7c3aed", "#059669", "#d97706", "#e11d48"][i % 5] }] } },
      })),
      animationDelay: (i: number) => i * 200,
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.15)" } },
      label: { show: true, position: "top", fontSize: 13, fontWeight: "900", color: "#475569", formatter: "{c}" },
    }],
  };

  // ── Gráfico Área: Timeline de acompanhamentos ───────────────────────

  const mesesMap: Record<string, number> = {};
  acompsPrioritarios.forEach((a) => {
    const k = mesAno(a.data_da_busca || a.created || "");
    if (k) mesesMap[k] = (mesesMap[k] || 0) + 1;
  });
  const mesesLabels: string[] = [];
  const mesesValores: number[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(anoAtual, mesAtual - i, 1);
    const label = `${["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
    mesesLabels.push(label);
    mesesValores.push(mesesMap[label] || 0);
  }

  const areaOption = {
    tooltip: { ...tooltipPremium, trigger: "axis", formatter: (params: Array<{ axisValue: string; value: number }>) => {
      const p = params[0];
      return `<span style='color:#94a3b8;font-size:11px'>${p.axisValue}</span><br/><span style='font-size:20px;font-weight:900;color:#8b5cf6'>${p.value}</span> <span style='color:#94a3b8'>registros</span>`;
    } },
    grid: { left: 8, right: 16, bottom: 30, top: 12, containLabel: true },
    xAxis: {
      type: "category", data: mesesLabels, boundaryGap: false,
      axisLabel: { color: "#94a3b8", fontSize: 11, fontWeight: "bold" },
      axisLine: { lineStyle: { color: "#e2e8f0" } }, axisTick: { show: false },
    },
    yAxis: {
      type: "value", splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" } },
      axisLabel: { color: "#94a3b8", fontSize: 11, fontWeight: "bold" },
    },
    animationDuration: 1600, animationEasing: "cubicOut",
    series: [{
      type: "line", data: mesesValores, smooth: 0.4, symbol: "circle", symbolSize: 10,
      lineStyle: { color: "#8b5cf6", width: 3, shadowColor: "rgba(139,92,246,0.3)", shadowBlur: 8, shadowOffsetY: 4 },
      itemStyle: { color: "#8b5cf6", borderColor: "#fff", borderWidth: 3 },
      emphasis: { itemStyle: { shadowBlur: 12, shadowColor: "rgba(139,92,246,0.4)" }, scale: true },
      areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(139,92,246,0.30)" }, { offset: 0.5, color: "rgba(139,92,246,0.08)" }, { offset: 1, color: "rgba(139,92,246,0.01)" }] } },
    }],
  };

  // ── Gráfico Pizza: Tipo de Contato ──────────────────────────────────

  const tiposContato = acompsPrioritarios.reduce<Record<string, number>>((acc, a) => {
    const t = a.tipo_contato || "Não informado";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const contatoOption = {
    tooltip: { ...tooltipPremium, trigger: "item", formatter: "{b}<br/><span style='font-size:18px;font-weight:900'>{c}</span> <span style='color:#94a3b8'>({d}%)</span>" },
    legend: { bottom: 0, textStyle: { color: "#64748b", fontSize: 11, fontWeight: "bold" }, itemGap: 18, itemWidth: 12, itemHeight: 12, icon: "circle" },
    animationDuration: 1200, animationEasing: "elasticOut",
    series: [{
      type: "pie", radius: ["35%", "65%"], center: ["50%", "42%"],
      roseType: "radius",
      itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 10, label: { show: true, fontSize: 13, fontWeight: "900", color: "#1e293b" }, itemStyle: { shadowBlur: 15, shadowColor: "rgba(0,0,0,0.1)" } },
      animationType: "scale", animationDelay: (i: number) => i * 100,
      data: Object.entries(tiposContato).map(([name, value], i) => ({
        name, value,
        itemStyle: { color: { type: "linear", x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#64748b"][i % 6] }, { offset: 1, color: ["#0891b2", "#7c3aed", "#059669", "#d97706", "#e11d48", "#475569"][i % 6] }] } },
      })).sort((a, b) => b.value - a.value),
    }],
  };

  // ── Gráfico Barras Horizontais: Entraves ────────────────────────────

  const entravesMap = acompsPrioritarios.reduce<Record<string, number>>((acc, a) => {
    if (a.entraves_identificados) {
      a.entraves_identificados.split(/[;,]/).map((e) => e.trim()).filter(Boolean).forEach((e) => { acc[e] = (acc[e] || 0) + 1; });
    }
    return acc;
  }, {});
  const topEntraves = Object.entries(entravesMap).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const entravesOption = {
    tooltip: { ...tooltipPremium, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 8, right: 40, bottom: 8, top: 8, containLabel: true },
    xAxis: {
      type: "value", minInterval: 1,
      splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" } },
      axisLabel: { color: "#94a3b8", fontSize: 11, fontWeight: "bold" },
    },
    yAxis: {
      type: "category", data: topEntraves.map(([k]) => k).reverse(),
      axisLabel: { color: "#475569", fontSize: 11, fontWeight: "bold", width: 160, overflow: "truncate" },
      axisLine: { show: false }, axisTick: { show: false },
    },
    animationDuration: 1200, animationEasing: "cubicOut",
    series: [{
      type: "bar", barWidth: "65%",
      data: topEntraves.map(([, v]) => v).reverse(),
      itemStyle: { borderRadius: [0, 8, 8, 0], color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: "#f43f5e" }, { offset: 1, color: "#fb7185" }] } },
      label: { show: true, position: "right", fontSize: 12, fontWeight: "900", color: "#e11d48", formatter: "{c}" },
      animationDelay: (i: number) => i * 150,
    }],
  };

  // ── Faixas Etárias ──────────────────────────────────────────────────

  const faixas = [
    { label: "0-1a", min: 0, max: 1, color: "violet" },
    { label: "1-2a", min: 1, max: 2, color: "purple" },
    { label: "3-5a", min: 3, max: 5, color: "blue" },
    { label: "6-12a", min: 6, max: 12, color: "cyan" },
    { label: "13-17a", min: 13, max: 17, color: "teal" },
    { label: "18-39a", min: 18, max: 39, color: "green" },
    { label: "40-59a", min: 40, max: 59, color: "amber" },
    { label: "60+", min: 60, max: 999, color: "rose" },
  ];
  const faixaCounts = faixas.map((f) => ({
    ...f,
    count: pacientesPrioritarios.filter((p) => {
      const id = calcularIdade(p.data_de_nascimento);
      return id !== null && id >= f.min && id <= f.max;
    }).length,
  }));

  const faixaOption = {
    tooltip: { ...tooltipPremium, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 8, right: 20, bottom: 8, top: 16, containLabel: true },
    xAxis: {
      type: "category", data: faixaCounts.map((f) => f.label),
      axisLabel: { color: "#475569", fontSize: 11, fontWeight: "bold" },
      axisLine: { lineStyle: { color: "#e2e8f0" } }, axisTick: { show: false },
    },
    yAxis: {
      type: "value", minInterval: 1,
      splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" } },
      axisLabel: { color: "#94a3b8", fontSize: 11, fontWeight: "bold" },
    },
    animationDuration: 1000, animationEasing: "elasticOut",
    series: [{
      type: "bar", barWidth: "65%",
      data: faixaCounts.map((f, i) => ({
        value: f.count,
        itemStyle: { borderRadius: [8, 8, 0, 0], color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: ["#a78bfa", "#8b5cf6", "#3b82f6", "#06b6d4", "#14b8a6", "#10b981", "#f59e0b", "#f43f5e"][i] }, { offset: 1, color: ["#7c3aed", "#6d28d9", "#2563eb", "#0891b2", "#0d9488", "#059669", "#d97706", "#e11d48"][i] }] } },
      })),
      animationDelay: (i: number) => i * 100,
      label: { show: true, position: "top", fontSize: 12, fontWeight: "900", color: "#475569" },
    }],
  };

  // ── Top Microáreas ──────────────────────────────────────────────────

  const microMap = pacientesPrioritarios.reduce<Record<string, number>>((acc, p) => {
    const m = p.microarea || "Sem microárea";
    acc[m] = (acc[m] || 0) + 1;
    return acc;
  }, {});
  const topMicro = Object.entries(microMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // ── Top Unidades ────────────────────────────────────────────────────

  const unidadesMap = pacientesPrioritarios.reduce<Record<string, number>>((acc, p) => {
    const u = p.unidade || "Sem unidade";
    acc[u] = (acc[u] || 0) + 1;
    return acc;
  }, {});
  const topUnidades = Object.entries(unidadesMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxUnidade = topUnidades[0]?.[1] || 1;

  // ── Top Equipes ─────────────────────────────────────────────────────

  const equipesMap = pacientesPrioritarios.reduce<Record<string, number>>((acc, p) => {
    const e = p.equipe || "Sem equipe";
    acc[e] = (acc[e] || 0) + 1;
    return acc;
  }, {});
  const topEquipes = Object.entries(equipesMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-b-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-bordo-950 px-5 py-5 sm:px-6 shadow-xl shadow-slate-900/30">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-bordo-500/10 blur-3xl" />
        <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-bordo-600/15 blur-2xl" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-bordo-500/40 to-transparent" />

        <div className="relative mx-auto flex max-w-[1380px] flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-bordo-500 to-bordo-700" />
            <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
              RESUMO <span className="text-bordo-400 font-bold">GERAL</span>
            </h1>
          </div>
          <div className="flex items-baseline gap-2">
            <svg className="h-4 w-4 text-amber-300/70" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Total Pacientes</span>
            <span className="text-2xl font-black text-white tabular-nums leading-none">{totalPacientes.toLocaleString("pt-BR")}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1380px] px-4 py-8 sm:px-6 lg:px-8" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.10) 1px, transparent 0)', backgroundSize: '28px 28px' }}>

        {/* ── Loading ───────────────────────────────────────────────── */}
        {carregando && (
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm py-14 text-center shadow-lg shadow-slate-200/50">
            <div className="absolute -right-16 -top-16 h-36 w-36 rounded-full bg-gradient-to-br from-blue-500/10 to-bordo-600/10 blur-[60px] animate-pulse" />
            <div className="absolute -bottom-16 -left-16 h-36 w-36 rounded-full bg-gradient-to-tr from-bordo-600/10 to-blue-500/10 blur-[60px] animate-pulse" />
            <div className="relative mx-auto flex h-14 w-14 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-slate-100" />
              <div className="absolute inset-0 rounded-full border-2 border-t-blue-600 border-r-bordo-600 border-b-transparent border-l-transparent animate-spin" />
              <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-blue-600 to-bordo-500 animate-pulse" />
            </div>
            <p className="mt-5 text-sm font-black text-slate-700 tracking-[0.15em] uppercase flex items-center justify-center gap-2">
              <span>Carregando Registros</span>
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-bordo-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </p>
            <p className="mt-1.5 text-[10px] font-semibold text-slate-400 tracking-[0.25em] uppercase">Aguarde um momento</p>
          </div>
        )}

        {/* ── KPI Cards ────────────────────────────────────────────── */}
        {!carregando && (<>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <KpiCard titulo="Acompanhamentos" valor={totalAcomps} cor="bg-violet-500" corHex="#8b5cf6" subtitulo="registros" delay={0}
            icone={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" /></svg>}
          />
          <KpiCard titulo="Este Mês" valor={acompsMesAtual} cor="bg-emerald-500" corHex="#10b981" subtitulo="acompanhamentos" delay={100}
            icone={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>}
          />
          <KpiCard titulo="Diabetes" valor={diabetes} cor="bg-blue-600" corHex="#2563eb" subtitulo="pacientes" delay={200}
            icone={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m15-3.379a48.474 48.474 0 0 0-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 0 1 3 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 0 1 6 13.12M12.265 3.11a.375.375 0 1 1-.53 0L12 2.845l.265.265Zm-3 0a.375.375 0 1 1-.53 0L9 2.845l.265.265Zm6 0a.375.375 0 1 1-.53 0L15 2.845l.265.265Z" /></svg>}
          />
          <KpiCard titulo="Anemia Falciforme" valor={anemiaFalciforme} cor="bg-bordo-500" corHex="#b91c3a" subtitulo="pacientes" delay={300}
            icone={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>}
          />
        </div>

        {/* ── Gráficos Linha 1 ─────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ChartCard titulo="Diabetes e Anemia Falciforme" subtitulo="Distribuição por categoria" icone={I.pizza}>
            <div className="h-[380px]">
              <Chart option={pizzaOption} className="h-full w-full" />
            </div>
          </ChartCard>
          <ChartCard titulo="Situação Pós-Busca" subtitulo="Resultado dos acompanhamentos">
            <div className="h-[380px]">
              <Chart option={donutOption} className="h-full w-full" />
            </div>
          </ChartCard>
        </div>

        {/* ── Gráficos Linha 2 ─────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ChartCard titulo="Tipos de Busca" subtitulo="Volume por modalidade" icone={I.busca}>
            <div className="h-[350px]">
              <Chart option={barraOption} className="h-full w-full" />
            </div>
          </ChartCard>
          <ChartCard titulo="Evolução Mensal" subtitulo="Acompanhamentos nos últimos 12 meses">
            <div className="h-[350px]">
              <Chart option={areaOption} className="h-full w-full" />
            </div>
          </ChartCard>
        </div>

        {/* ── Tabelas ──────────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">

          {/* Top Unidades */}
          <ChartCard titulo="Top Unidades" subtitulo="Pacientes por unidade de saúde">
            <div className="space-y-3">
              {topUnidades.map(([nome, count], i) => (
                <div key={nome} className="group/row flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 hover:bg-slate-50">
                  <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${i === 0 ? "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700 ring-1 ring-amber-300/50" : i === 1 ? "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 ring-1 ring-slate-300/50" : i === 2 ? "bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600 ring-1 ring-orange-200/50" : "bg-slate-100 text-slate-500"}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-700 truncate uppercase group-hover/row:text-slate-900 transition-colors">{nome}</span>
                      <span className="text-[11px] font-black text-slate-900 ml-2 tabular-nums">{count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-bordo-500 to-blue-600 transition-all duration-1000 ease-out shadow-sm shadow-bordo-200/50" style={{ width: `${(count / maxUnidade) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>

          {/* Top Equipes */}
          <ChartCard titulo="Top Equipes" subtitulo="Pacientes por equipe" icone={I.users}>
            <div className="space-y-3">
              {topEquipes.map(([nome, count], i) => (
                <div key={nome} className="group/row flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 hover:bg-slate-50">
                  <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${i === 0 ? "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700 ring-1 ring-amber-300/50" : i === 1 ? "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 ring-1 ring-slate-300/50" : i === 2 ? "bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600 ring-1 ring-orange-200/50" : "bg-slate-100 text-slate-500"}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-700 truncate uppercase group-hover/row:text-slate-900 transition-colors">{nome}</span>
                      <span className="text-[11px] font-black text-slate-900 ml-2 tabular-nums">{count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-500 transition-all duration-1000 ease-out shadow-sm shadow-violet-200/50" style={{ width: `${(count / (topEquipes[0]?.[1] || 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        {/* ── Tabela: Indicadores de Saúde ─────────────────────────── */}
        <div className="mt-6">
          <ChartCard titulo="Indicadores de Saúde" subtitulo="Prevalência em diabetes e anemia falciforme" icone={I.heart}>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-2 lg:grid-cols-2">
              {[
                { label: "Diabetes", count: diabetes, color: "blue", bgGrad: "from-blue-50 to-blue-100/50", ringGrad: "ring-blue-200/50", textGrad: "from-blue-500 to-blue-600" },
                { label: "Anemia Falciforme", count: anemiaFalciforme, color: "bordo", bgGrad: "from-bordo-50 to-bordo-100/50", ringGrad: "ring-bordo-200/50", textGrad: "from-bordo-500 to-bordo-600" },
              ].map((item, i) => (
                <div key={item.label} className="group/card flex flex-col items-center rounded-2xl border border-slate-100 bg-white/60 p-6 shadow-[0_4px_10px_rgba(0,0,0,0.04),0_0_0_1px_rgba(226,232,240,0.5)] transition-all duration-500 hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.18),0_0_0_1px_rgba(226,232,240,0.8)] hover:-translate-y-1.5 animate-[fadeInUp_0.5s_ease-out_both]" style={{ animationDelay: `${i * 100 + 200}ms` }}>
                  <div className={`relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${item.bgGrad} ring-1 ${item.ringGrad} transition-all duration-300 group-hover/card:scale-110 group-hover/card:shadow-md`}>
                    <span className={`text-2xl font-black bg-gradient-to-br ${item.textGrad} bg-clip-text text-transparent`}>{item.count}</span>
                  </div>
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center">{item.label}</p>
                  <div className="mt-1.5 h-1 w-8 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${item.textGrad} transition-all duration-1000`} style={{ width: `${totalPacientes > 0 ? Math.min((item.count / totalPacientes) * 100 * 4, 100) : 0}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] font-black text-slate-400 tabular-nums">{totalPacientes > 0 ? Math.round((item.count / totalPacientes) * 100) : 0}%</p>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        {/* ── Gráficos Linha 3 ─────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ChartCard titulo="Tipo de Contato" subtitulo="Como os pacientes foram contatados">
            <div className="h-[370px]">
              <Chart option={contatoOption} className="h-full w-full" />
            </div>
          </ChartCard>
          <ChartCard titulo="Entraves Identificados" subtitulo="Barreiras encontradas nos acompanhamentos" icone={I.warning}>
            <div className="h-[370px]">
              {topEntraves.length > 0 ? <Chart option={entravesOption} className="h-full w-full" /> : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">Nenhum entrave registrado.</div>
              )}
            </div>
          </ChartCard>
        </div>

        {/* ── Gráficos Linha 4 ─────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ChartCard titulo="Faixas Etárias" subtitulo="Distribuição por idade dos pacientes prioritários">
            <div className="h-[350px]">
              <Chart option={faixaOption} className="h-full w-full" />
            </div>
          </ChartCard>

          {/* Top Microáreas */}
          <ChartCard titulo="Top Microáreas" subtitulo="Pacientes por microárea" icone={I.pin}>
            <div className="space-y-3">
              {topMicro.map(([nome, count], i) => (
                <div key={nome} className="group/row flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 hover:bg-slate-50">
                  <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${i === 0 ? "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700 ring-1 ring-amber-300/50" : i === 1 ? "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 ring-1 ring-slate-300/50" : i === 2 ? "bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600 ring-1 ring-orange-200/50" : "bg-slate-100 text-slate-500"}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-700 truncate uppercase group-hover/row:text-slate-900 transition-colors">{nome}</span>
                      <span className="text-[11px] font-black text-slate-900 ml-2 tabular-nums">{count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-1000 ease-out shadow-sm shadow-emerald-200/50" style={{ width: `${(count / (topMicro[0]?.[1] || 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        {/* ── Divider: Perfil dos Pacientes ────────────────────────── */}
        <div className="mt-8 mb-5 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-700">Perfil dos Pacientes</h2>
            <p className="text-[10px] font-semibold text-slate-400 tracking-wider">Sexo, ra&ccedil;a, estado nutricional e vacina&ccedil;&atilde;o</p>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
        </div>

        {/* ── Sexo + Raça ───────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">

          {/* Sexo */}
          <ChartCard titulo="Sexo" subtitulo="Distribui&ccedil;&atilde;o por sexo" icone={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
          }>
            <div className="flex items-center justify-center gap-8 py-4">
              {(["M", "F"] as const).map((s) => {
                const v = sexoMap[s] || 0;
                const total = Object.values(sexoMap).reduce((a, b) => a + b, 0) || 1;
                const pct = Math.round((v / total) * 100);
                return (
                  <div key={s} className="flex flex-col items-center gap-3">
                    <div className={`flex h-24 w-24 items-center justify-center rounded-full ring-4 ring-white shadow-xl ${s === "M" ? "bg-gradient-to-br from-blue-400 to-blue-600" : "bg-gradient-to-br from-pink-400 to-rose-500"}`}>
                      <span className="text-4xl font-black text-white">{pct}%</span>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-black text-slate-800 uppercase">{s === "M" ? "Masculino" : "Feminino"}</p>
                      <p className="text-[11px] font-bold text-slate-400 tabular-nums">{v} pacientes</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>

          {/* Raça */}
          <ChartCard titulo="Ra&ccedil;a" subtitulo="Distribui&ccedil;&atilde;o racial" icone={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          }>
            <div className="space-y-2.5">
              {topRacas.map(([nome, count], i) => {
                const total = Object.values(racaMap).reduce((a, b) => a + b, 0) || 1;
                const pct = Math.round((count / total) * 100);
                const cores = ["#3b82f6","#8b5cf6","#06b6d4","#f59e0b","#10b981","#f43f5e","#64748b"];
                return (
                  <div key={nome} className="group/row flex items-center gap-3 rounded-xl px-3 py-1.5 transition-all duration-200 hover:bg-slate-50">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-black text-white" style={{ backgroundColor: cores[i % cores.length] }}>
                      {pct}%
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-700 truncate uppercase group-hover/row:text-slate-900 transition-colors">{nome}</span>
                        <span className="text-[10px] font-black text-slate-900 ml-2 tabular-nums">{count}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(count / maxRaca) * 100}%`, backgroundColor: cores[i % cores.length] }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>

        {/* ── Estado Nutricional + Situação Vacinal ────────────────── */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">

          {/* Estado Nutricional */}
          <ChartCard titulo="Estado Nutricional" subtitulo="Classifica&ccedil;&atilde;o nutricional" icone={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>
          }>
            <div className="space-y-2.5">
              {topNut.map(([nome, count], i) => {
                const pct = Math.round((count / maxNut) * 100);
                const corNut = ["#10b981","#34d399","#fbbf24","#f59e0b","#f97316","#ef4444","#64748b"];
                return (
                  <div key={nome} className="group/row flex items-center gap-3 rounded-xl px-3 py-1.5 transition-all duration-200 hover:bg-slate-50">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-black text-white tabular-nums" style={{ backgroundColor: corNut[i % corNut.length] }}>{count}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] font-bold text-slate-700 truncate uppercase group-hover/row:text-slate-900 transition-colors">{nome}</span>
                        <span className="text-[9px] font-bold text-slate-400 ml-2 tabular-nums">{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: corNut[i % corNut.length] }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {topNut.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Nenhum dado nutricional registrado.</p>}
            </div>
          </ChartCard>

          {/* Situação Vacinal */}
          <ChartCard titulo="Situa&ccedil;&atilde;o Vacinal" subtitulo="Status de vacina&ccedil;&atilde;o" icone={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
          }>
            <div className="space-y-2.5">
              {topVac.map(([nome, count], i) => {
                const total = Object.values(vacMap).reduce((a, b) => a + b, 0) || 1;
                const pct = Math.round((count / total) * 100);
                const corVac = ["#22c55e","#ef4444","#3b82f6","#f59e0b","#a855f7","#64748b"];
                return (
                  <div key={nome} className="group/row flex items-center gap-3 rounded-xl px-3 py-1.5 transition-all duration-200 hover:bg-slate-50">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ backgroundColor: corVac[i % corVac.length] }}>
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] font-bold text-slate-700 truncate uppercase group-hover/row:text-slate-900 transition-colors">{nome}</span>
                        <span className="text-[10px] font-black text-slate-900 ml-2 tabular-nums">{count}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: corVac[i % corVac.length] }} />
                      </div>
                    </div>
                    <span className="text-[9px] font-bold text-slate-400 tabular-nums">{pct}%</span>
                  </div>
                );
              })}
              {topVac.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Nenhum dado vacinal registrado.</p>}
            </div>
          </ChartCard>
        </div>

        {/* ── Divider: Benefícios e Escolas ──────────────────────────── */}
        <div className="mt-8 mb-5 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-700">Benef&iacute;cios e Escolas</h2>
            <p className="text-[10px] font-semibold text-slate-400 tracking-wider">Programas sociais e unidades de ensino</p>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
        </div>

        {/* ── Benefícios + Top Escolas ──────────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">

          {/* Benefícios */}
          <ChartCard titulo="Benef&iacute;cios Sociais" subtitulo="Programas que os pacientes recebem" icone={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          }>
            <div className="space-y-2.5">
              {topBenef.map(([nome, count], i) => {
                const total = Object.values(benefMap).reduce((a, b) => a + b, 0) || 1;
                const pct = Math.round((count / total) * 100);
                const corBen = ["#22d3ee","#a78bfa","#34d399","#fbbf24","#fb7185","#f97316","#64748b","#94a3b8"];
                return (
                  <div key={nome} className="group/row flex items-center gap-3 rounded-xl px-3 py-1.5 transition-all duration-200 hover:bg-slate-50">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-black text-white tabular-nums" style={{ backgroundColor: corBen[i % corBen.length] }}>{count}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] font-bold text-slate-700 truncate uppercase group-hover/row:text-slate-900 transition-colors">{nome}</span>
                        <span className="text-[9px] font-bold text-slate-400 ml-2 tabular-nums">{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: corBen[i % corBen.length] }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {topBenef.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Nenhum benef&iacute;cio registrado.</p>}
            </div>
          </ChartCard>

          {/* Top Escolas */}
          <ChartCard titulo="Top Escolas" subtitulo="Unidades de ensino com mais pacientes" icone={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" /></svg>
          }>
            <div className="space-y-2.5">
              {topEscolas.map(([nome, count], i) => (
                <div key={nome} className="group/row flex items-center gap-3 rounded-xl px-3 py-1.5 transition-all duration-200 hover:bg-slate-50">
                  <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${i === 0 ? "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700 ring-1 ring-amber-300/50" : i === 1 ? "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 ring-1 ring-slate-300/50" : i === 2 ? "bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600 ring-1 ring-orange-200/50" : "bg-slate-100 text-slate-500"}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-700 truncate uppercase group-hover/row:text-slate-900 transition-colors">{nome}</span>
                      <span className="text-[10px] font-black text-slate-900 ml-2 tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-1000 ease-out shadow-sm shadow-amber-200/50" style={{ width: `${(count / maxEscola) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
              {topEscolas.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Nenhuma escola registrada.</p>}
            </div>
          </ChartCard>
        </div>
        </>)}
      </div>
    </>
  );
}
