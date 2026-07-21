import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Paciente } from "./types";
import { buscarPacientes, buscarFavoritos, removerFavorito, buscarTodosAcompanhamentos } from "./pocketbase";
import { getCoresCategoria } from "./data";
import ModalAcompanhamento from "./ModalAcompanhamento";

// ── Helpers ─────────────────────────────────────────────────────────────

function formatarData(dateStr: string): string {
  if (!dateStr) return "\u2014";
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "\u2014";
  const [, ano, mes, dia] = m;
  return `${dia}/${mes}/${ano}`;
}

function calcularIdade(dataNascimento: string): number | null {
  if (!dataNascimento) return null;
  const m = dataNascimento.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]) - 1;
  const dia = Number(m[3]);
  const hoje = new Date();
  let idade = hoje.getFullYear() - ano;
  if (hoje.getMonth() < mes || (hoje.getMonth() === mes && hoje.getDate() < dia)) {
    idade--;
  }
  return idade >= 0 ? idade : null;
}

// ── Diabetes e Anemia Falciforme ───────────────────────────────────────

/** Coluna unificada de categorias — ícones/avatars por especificação */
function renderCategorias(p: Paciente) {
  const itens: { label: string; title: string; className: string; icon: React.ReactNode }[] = [];
  if (p.classificacao?.toLowerCase().includes("diabetes")) {
    itens.push({
      label: "DM",
      title: "Diabetes Mellitus",
      className: getCoresCategoria("diabetes"),
      icon: <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>,
    });
  }
  if (p.classificacao?.toLowerCase().includes("anemia")) {
    itens.push({
      label: "AF",
      title: "Anemia Falciforme",
      className: getCoresCategoria("anemia_falciforme"),
      icon: <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>,
    });
  }

  if (itens.length === 0) return <span className="text-slate-300 text-xs">—</span>;

  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {itens.map((item) => (
        <span
          key={item.label}
          title={item.title}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${item.className}`}
        >
          {item.icon}
          {item.label}
        </span>
      ))}
    </div>
  );
}

// ── Componente ─────────────────────────────────────────────────────────

function AcompCountBadge({
  count,
  pacienteId,
  onNavigate,
  className,
}: {
  count: number;
  pacienteId: string;
  onNavigate: (id: string) => void;
  className: string;
}) {
  return (
    <span
      className={`${className} cursor-pointer select-none active:scale-90 transition-transform`}
      onClick={(e) => { e.stopPropagation(); onNavigate(pacienteId); }}
      title="Clique para filtrar acompanhamentos"
    >
      {count}
    </span>
  );
}

export default function PaginaFavoritos({ usuarioId, onNavigateAcompFiltered }: { usuarioId: string; onNavigateAcompFiltered: (pacienteId: string) => void }) {
  const [favoritos, setFavoritos] = useState<Paciente[]>([]);
  const [favMap, setFavMap] = useState<Map<string, string>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<string>("todos");
  const [filtroUnidade, setFiltroUnidade] = useState<string>("todas");
  const [filtroEquipe, setFiltroEquipe] = useState<string>("todas");
  const [filtroMicroarea, setFiltroMicroarea] = useState<string>("todas");
  const [mostrarBusca, setMostrarBusca] = useState(false);
  const [mostrarAvancada, setMostrarAvancada] = useState(false);
  const unidades = [...new Set(favoritos.map(p => p.unidade).filter(Boolean))].sort();
  const equipes = [...new Set(favoritos.map(p => p.equipe).filter(Boolean))].sort();
  const microareas = [...new Set(favoritos.map(p => p.microarea).filter(Boolean))].sort();
  const tabelaMobileRef = useRef<HTMLDivElement>(null);
  const [toastScroll, setToastScroll] = useState(false);
  const toastMostrado = useRef(false);
  const [pacienteModal, setPacienteModal] = useState<Paciente | null>(null);
  const [pacienteAcompModal, setPacienteAcompModal] = useState<Paciente | null>(null);
  const [acompCounts, setAcompCounts] = useState<Record<string, number>>({});
  const [pagina, setPagina] = useState(1);

  useEffect(() => { setPagina(1); }, [favoritos, busca, filtroUnidade, filtroEquipe, filtroMicroarea]);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        setCarregando(true);
        const favs = await buscarFavoritos(usuarioId);
        if (cancelado) return;
        // Mapeia paciente_id → favorito_id (para remoção)
        const mapa = new Map<string, string>();
        favs.forEach((f) => mapa.set(f.paciente_id, f.id));
        setFavMap(mapa);
        if (favs.length === 0) {
          setFavoritos([]);
          return;
        }
        const ids = favs.map((f) => f.paciente_id);
        const filtro = ids.map((id) => `id="${id}"`).join(" || ");
        const { items } = await buscarPacientes({ filter: filtro, perPage: 500 });
        if (!cancelado) setFavoritos(items);
      } catch {
        if (!cancelado) setFavoritos([]);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    if (usuarioId) carregar();
    return () => { cancelado = true; };
  }, [usuarioId]);

  // Toast: detecta tabela mobile visível → mostra aviso de scroll
  useEffect(() => {
    if (toastMostrado.current) return;
    const el = tabelaMobileRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !toastMostrado.current) {
          toastMostrado.current = true;
          setToastScroll(true);
          setTimeout(() => setToastScroll(false), 3500);
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [carregando]);

  // Carregar contagem de acompanhamentos
  useEffect(() => {
    let cancel = false;
    buscarTodosAcompanhamentos()
      .then((items) => {
        if (cancel) return;
        const map: Record<string, number> = {};
        items.forEach((a) => { map[a.paciente_id] = (map[a.paciente_id] || 0) + 1; });
        setAcompCounts(map);
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  async function unfavoritar(pacienteId: string) {
    const favId = favMap.get(pacienteId);
    if (!favId) return;
    // Optimistic remove
    setFavoritos((prev) => prev.filter((p) => p.id !== pacienteId));
    setFavMap((prev) => { const n = new Map(prev); n.delete(pacienteId); return n; });
    try {
      await removerFavorito(favId);
    } catch (e) {
      console.error("Erro ao remover favorito:", e);
      // Reverte — recarrega tudo
      if (usuarioId) {
        try {
          const favs = await buscarFavoritos(usuarioId);
          const mapa = new Map<string, string>();
          favs.forEach((f) => mapa.set(f.paciente_id, f.id));
          setFavMap(mapa);
          const ids = favs.map((f) => f.paciente_id);
          if (ids.length > 0) {
            const filtro = ids.map((id) => `id="${id}"`).join(" || ");
            const { items } = await buscarPacientes({ filter: filtro, perPage: 500 });
            setFavoritos(items);
          } else {
            setFavoritos([]);
          }
        } catch { /* fallback */ }
      }
    }
  }

  // Filtragem
  const filtrados = favoritos.filter((p) => {
    const q = busca.toLowerCase();
    const matchBusca =
      busca === "" ||
      p.paciente?.toLowerCase().includes(q) ||
      p.equipe?.toLowerCase().includes(q) ||
      p.unidade?.toLowerCase().includes(q) ||
      p.microarea?.toLowerCase().includes(q);

    let matchFiltro = true;
    if (filtro === "diabetes") matchFiltro = p.classificacao?.toLowerCase().includes("diabetes") ?? false;
    else if (filtro === "anemia_falciforme") matchFiltro = p.classificacao?.toLowerCase().includes("anemia") ?? false;
    else if (filtro === "todos") {
      matchFiltro = true;
    }

    const matchUnidade = filtroUnidade === "todas" || p.unidade === filtroUnidade;
    const matchEquipe = filtroEquipe === "todas" || p.equipe === filtroEquipe;
    const matchMicroarea = filtroMicroarea === "todas" || p.microarea === filtroMicroarea;

    return matchBusca && matchFiltro && matchUnidade && matchEquipe && matchMicroarea;
  });

  const porPagina = 10;
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const paginaAtual = filtrados.slice((pagina - 1) * porPagina, pagina * porPagina);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative overflow-hidden rounded-b-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-bordo-950 px-5 py-5 sm:px-6 shadow-xl shadow-slate-900/30">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-bordo-500/10 blur-3xl" />
        <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-bordo-600/15 blur-2xl" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-bordo-500/40 to-transparent" />

        <div className="relative mx-auto flex max-w-[1380px] flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-bordo-500 to-bordo-700" />
            <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
              FAVORITOS <span className="text-bordo-400 font-bold">Salvos</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {[
              { key: "diabetes", label: "Diabetes", activeColor: "text-blue-300", activeBorder: "border-blue-400", icon: <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg> },
              { key: "anemia_falciforme", label: "Anemia Falc.", activeColor: "text-bordo-300", activeBorder: "border-bordo-400", icon: <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg> },
            ].map(({ key, label, activeColor, activeBorder, icon }) => (
              <button
                key={key}
                onClick={() => setFiltro(filtro === key ? "todos" : key)}
                className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-200 pb-0.5 border-b-2 ${
                  filtro === key
                    ? `${activeColor} ${activeBorder}`
                    : "text-white/40 border-transparent hover:text-white/70"
                }`}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-baseline gap-2">
              <svg className="h-4 w-4 text-amber-300/70" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
              </svg>
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Total</span>
              <span className="text-2xl font-black text-white tabular-nums leading-none">
                {filtrados.length.toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <button
              onClick={() => { setMostrarBusca(!mostrarBusca); setMostrarAvancada(false); }}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200 hover:bg-white/10 hover:text-white/70 ${mostrarBusca ? "bg-white/10 text-white/70" : "text-white/40"}`}
              title="Busca rápida"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            </button>
            <button
              onClick={() => { setMostrarAvancada(!mostrarAvancada); setMostrarBusca(false); }}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200 hover:bg-white/10 hover:text-white/70 ${mostrarAvancada ? "bg-white/10 text-white/70" : "text-white/40"}`}
              title="Busca avançada"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" /></svg>
            </button>
          </div>
        </div>
      </div>

      {mostrarBusca && (
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-bordo-950 px-5 sm:px-6 pb-4">
            <div className="mx-auto flex max-w-[1380px] items-center justify-end gap-3">
            <div className="relative flex-1">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                placeholder="Buscar por nome, equipe, unidade..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                autoFocus
                className="w-full rounded-lg bg-white/[0.07] border border-white/10 py-2 pl-10 pr-4 text-sm font-medium text-white placeholder-white/40 outline-none transition-all duration-200 focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20"
              />
            </div>
            <button onClick={() => { setMostrarBusca(false); setBusca(""); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-all hover:bg-white/10 hover:text-white/70">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      {mostrarAvancada && (
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-bordo-950 px-5 sm:px-6 pb-4">
          <div className="mx-auto max-w-[1380px] rounded-xl bg-white/[0.05] p-4 ring-1 ring-white/10">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/60">Filtros Avançados</h3>
              <button onClick={() => setMostrarAvancada(false)} className="flex h-6 w-6 items-center justify-center rounded-md text-white/40 transition-all hover:bg-white/10 hover:text-white/70">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Unidade</label>
                <select
                  value={filtroUnidade}
                  onChange={(e) => setFiltroUnidade(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white"
                >
                  <option value="todas">Todas</option>
                  {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Equipe</label>
                <select
                  value={filtroEquipe}
                  onChange={(e) => setFiltroEquipe(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white"
                >
                  <option value="todas">Todas</option>
                  {equipes.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Microárea</label>
                <select
                  value={filtroMicroarea}
                  onChange={(e) => setFiltroMicroarea(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white"
                >
                  <option value="todas">Todas</option>
                  {microareas.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Grupo</label>
                <select
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white"
                >
                  <option value="todos">Todos</option>
                  <option value="diabetes">Diabetes</option>
                  <option value="anemia_falciforme">Anemia Falciforme</option>
                </select>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => { setFiltroUnidade("todas"); setFiltroEquipe("todas"); setFiltroMicroarea("todas"); setFiltro("todos"); }}
                className="rounded-lg bg-white/[0.07] border border-white/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white/50 transition-all hover:bg-white/10 hover:text-white/70"
              >
                Limpar Filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTEÚDO ─────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[1380px] px-4 py-8 sm:px-6 lg:px-8">

        {carregando ? (
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm py-20 text-center shadow-lg shadow-slate-200/50">
            <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-blue-500/10 to-bordo-600/10 blur-3xl animate-pulse" />
            <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-gradient-to-tr from-bordo-600/10 to-blue-500/10 blur-3xl animate-pulse" />
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-[3px] border-slate-100" />
              <div className="absolute inset-0 rounded-full border-[3px] border-t-blue-600 border-r-cyan-500 border-b-transparent border-l-transparent animate-spin" />
              <div className="h-3 w-3 rounded-full bg-gradient-to-br from-blue-700 to-bordo-600 animate-pulse" />
            </div>
            <p className="mt-6 text-[15px] font-bold text-slate-700 tracking-tight uppercase">
              CARREGANDO PACIENTES
              <span className="inline-flex gap-1 ml-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" style={{ animationDelay: '300ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '600ms' }} />
              </span>
            </p>
            <p className="mt-2 text-xs font-medium text-slate-400 tracking-widest uppercase">AGUARDE UM MOMENTO</p>
          </div>
        ) : (
          <>
            {/* ═══ TABELA DESKTOP (xl+) ═══════════════════════════════ */}
            <div className="hidden overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-lg shadow-slate-200/80 xl:block" style={{ overflow: "visible" }}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-800 to-slate-700">
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Ação</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Paciente</span>

                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Unidade</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" /></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Escola</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Saúde</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Extras</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginaAtual.map((p) => {
                      const idadeNum = calcularIdade(p.data_de_nascimento);
                      return (
                      <tr key={p.id} className="group transition-colors hover:bg-slate-50/50">
                        <td className="px-2 py-2 text-center align-top">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1 rounded-md bg-slate-50/80 px-1.5 py-0.5 ring-1 ring-slate-100">
                              <button
                                onClick={() => unfavoritar(p.id)}
                                className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 ring-1 ring-amber-200/50 transition-all duration-200 hover:scale-110 hover:bg-amber-100"
                                title="Remover dos favoritos"
                              >
                                <svg className="h-3 w-3 text-amber-400" fill="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
                              </button>
                              {acompCounts[p.id] > 0 && (
                                <AcompCountBadge count={acompCounts[p.id]} pacienteId={p.id} onNavigate={onNavigateAcompFiltered} className="inline-flex h-4 min-w-[16px] cursor-pointer select-none items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 px-1 text-[8px] font-black text-white shadow-sm shadow-red-500/25 ring-1 ring-red-400/30 transition-transform hover:scale-110 active:scale-90" />
                              )}
                            </div>
                            <div className="h-px w-8 bg-gradient-to-r from-transparent via-slate-200/80 to-transparent" />
                            <div className="flex w-full flex-col gap-0.5">
                              <button onClick={() => setPacienteAcompModal(p)} className="group/btn flex w-full items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-bordo-600 to-bordo-700 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm shadow-bordo-200/40 transition-all duration-200 hover:from-bordo-500 hover:to-bordo-600 hover:shadow-md hover:shadow-bordo-400/40 hover:-translate-y-0.5 active:translate-y-0">
                                <svg className="h-3 w-3 flex-shrink-0 transition-transform duration-200 group-hover/btn:scale-110" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/></svg>
                                <span>Acomp.</span>
                              </button>
                              <button onClick={() => setPacienteModal(p)} className="group/btn flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 shadow-sm transition-all duration-200 hover:border-bordo-200 hover:bg-bordo-50/50 hover:text-bordo-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0">
                                <svg className="h-3 w-3 flex-shrink-0 transition-transform duration-200 group-hover/btn:scale-110" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
                                Detalhes
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs font-black text-slate-800 group-hover:text-slate-900 transition-colors duration-200 leading-tight">{p.paciente || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">Nasc {formatarData(p.data_de_nascimento)}</span>
                            {idadeNum !== null && (
                              <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{idadeNum} {idadeNum === 1 ? "ano" : "anos"}</span>
                            )}
                            <div className="flex flex-wrap justify-center gap-1">
                              {renderCategorias(p)}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs font-black text-slate-800 group-hover:text-slate-900 transition-colors duration-200 leading-tight">{p.unidade || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{p.equipe || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">Micro: {p.microarea || "\u2014"}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{p.unidade_escolar || "\u2014"}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{p.estado_nutricional || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{p.recebe_beneficio || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{p.situacao_vacinal || "\u2014"}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{(p.observacoes || "\u2014").length > 30 ? (p.observacoes || "\u2014").slice(0, 30) + "..." : (p.observacoes || "\u2014")}</span>
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{p.unidade_especializada || "\u2014"}</span>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filtrados.length === 0 && (
                <div className="px-6 py-16 text-center text-slate-400">
                  Nenhum paciente encontrado.
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {filtrados.length} registro{filtrados.length !== 1 ? "s" : ""} encontrado{filtrados.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
                  <span className="text-[11px] font-bold text-slate-500">Pág. {pagina} de {totalPaginas}</span>
                  <button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Próximo</button>
                </div>
              </div>
            </div>

            {/* ═══ TABELA TABLET (md-xl) ═══════════════════════════════ */}
            <div className="hidden overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-lg shadow-slate-200/80 md:block xl:hidden" style={{ overflow: "visible" }}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-800 to-slate-700">
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Ação</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Paciente</span>

                        </div>
                      </th>
                      <th className="px-6 py-5 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Unidade</span>

                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" /></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Escola</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Saúde</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Extras</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginaAtual.map((p) => {
                      const idadeNum = calcularIdade(p.data_de_nascimento);
                      return (
                      <tr key={p.id} className="group transition-colors hover:bg-slate-50/50">
                        <td className="px-2 py-2 text-center align-top">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1 rounded-md bg-slate-50/80 px-1.5 py-0.5 ring-1 ring-slate-100">
                              <button
                                onClick={() => unfavoritar(p.id)}
                                className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 ring-1 ring-amber-200/50 transition-all duration-200 hover:scale-110 hover:bg-amber-100"
                                title="Remover dos favoritos"
                              >
                                <svg className="h-3 w-3 text-amber-400" fill="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
                              </button>
                              {acompCounts[p.id] > 0 && (
                                <AcompCountBadge count={acompCounts[p.id]} pacienteId={p.id} onNavigate={onNavigateAcompFiltered} className="inline-flex h-4 min-w-[16px] cursor-pointer select-none items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 px-1 text-[8px] font-black text-white shadow-sm shadow-red-500/25 ring-1 ring-red-400/30 transition-transform hover:scale-110 active:scale-90" />
                              )}
                            </div>
                            <div className="h-px w-8 bg-gradient-to-r from-transparent via-slate-200/80 to-transparent" />
                            <div className="flex w-full flex-col gap-0.5">
                              <button onClick={() => setPacienteAcompModal(p)} className="group/btn flex w-full items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-bordo-600 to-bordo-700 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm shadow-bordo-200/40 transition-all duration-200 hover:from-bordo-500 hover:to-bordo-600 hover:shadow-md hover:shadow-bordo-400/40 hover:-translate-y-0.5 active:translate-y-0">
                                <svg className="h-3 w-3 flex-shrink-0 transition-transform duration-200 group-hover/btn:scale-110" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/></svg>
                                <span>Acomp.</span>
                              </button>
                              <button onClick={() => setPacienteModal(p)} className="group/btn flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 shadow-sm transition-all duration-200 hover:border-bordo-200 hover:bg-bordo-50/50 hover:text-bordo-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0">
                                <svg className="h-3 w-3 flex-shrink-0 transition-transform duration-200 group-hover/btn:scale-110" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
                                Detalhes
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs font-black text-slate-800 group-hover:text-slate-900 transition-colors duration-200 leading-tight">{p.paciente || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">Nasc {formatarData(p.data_de_nascimento)}</span>
                            {idadeNum !== null && (
                              <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{idadeNum} {idadeNum === 1 ? "ano" : "anos"}</span>
                            )}
                            <div className="flex flex-wrap justify-center gap-1">
                              {renderCategorias(p)}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs font-black text-slate-800 group-hover:text-slate-900 transition-colors duration-200 leading-tight">{p.unidade || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{p.equipe || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">Micro: {p.microarea || "\u2014"}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{p.unidade_escolar || "\u2014"}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{p.estado_nutricional || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{p.recebe_beneficio || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{p.situacao_vacinal || "\u2014"}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{(p.observacoes || "\u2014").length > 30 ? (p.observacoes || "\u2014").slice(0, 30) + "..." : (p.observacoes || "\u2014")}</span>
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">{p.unidade_especializada || "\u2014"}</span>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filtrados.length === 0 && (
                <div className="px-6 py-16 text-center text-slate-400">
                  Nenhum paciente encontrado.
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {filtrados.length} registro{filtrados.length !== 1 ? "s" : ""} encontrado{filtrados.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
                  <span className="text-[11px] font-bold text-slate-500">Pág. {pagina} de {totalPaginas}</span>
                  <button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Próximo</button>
                </div>
              </div>
            </div>

            {/* ═══ TABELA MOBILE (< md) — 3 colunas com scroll ═══ */}
            <div ref={tabelaMobileRef} className="overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-lg shadow-slate-200/80 md:hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-800 to-slate-700">
                      <th className="px-2 py-2.5 text-center" style={{ width: '20%' }}>
                        <div className="flex flex-col items-center gap-0.5">
                          <svg className="h-3 w-3 text-cyan-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/></svg>
                          <span className="text-[8px] font-black uppercase tracking-wider text-white/90">Ação</span>
                        </div>
                      </th>
                      <th className="px-2 py-2.5 text-center" style={{ width: '50%' }}>
                        <div className="flex flex-col items-center gap-0.5">
                          <svg className="h-3 w-3 text-cyan-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
                          <span className="text-[8px] font-black uppercase tracking-wider text-white/90">Paciente</span>
                        </div>
                      </th>
                      <th className="px-2 py-2.5 text-center" style={{ width: '30%' }}>
                        <div className="flex flex-col items-center gap-0.5">
                          <svg className="h-3 w-3 text-cyan-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/></svg>
                          <span className="text-[8px] font-black uppercase tracking-wider text-white/90">Unidade</span>
                        </div>
                      </th>
                      <th className="px-2 py-2.5 text-center" style={{ width: '20%' }}>
                        <div className="flex flex-col items-center gap-0.5">
                          <svg className="h-3 w-3 text-cyan-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>
                          <span className="text-[8px] font-black uppercase tracking-wider text-white/90">Info</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginaAtual.map((p) => {
                      const idadeNum = calcularIdade(p.data_de_nascimento);
                      return (
                      <tr key={p.id} className="transition-colors hover:bg-slate-50/50">
                        {/* Col 1: Ação */}
                        <td className="px-1 py-2 text-center align-middle" style={{ width: '20%' }}>
                          <div className="flex flex-col items-center gap-px">
                            <div className="flex items-center gap-px rounded-md bg-slate-50/80 px-1 py-px ring-1 ring-slate-100">
                              <button
                                onClick={() => unfavoritar(p.id)}
                                className="flex h-4 w-4 items-center justify-center rounded bg-amber-50 ring-1 ring-amber-200/50 transition-all duration-200 hover:scale-110"
                                title="Remover dos favoritos"
                              >
                                <svg className="h-2.5 w-2.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
                              </button>
                              {acompCounts[p.id] > 0 && (
                                <AcompCountBadge count={acompCounts[p.id]} pacienteId={p.id} onNavigate={onNavigateAcompFiltered} className="inline-flex h-3.5 min-w-[14px] cursor-pointer select-none items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 px-1 text-[7px] font-black text-white shadow-sm shadow-red-500/25 ring-1 ring-red-400/30 transition-transform hover:scale-110 active:scale-90" />
                              )}
                            </div>
                            <div className="h-px w-6 bg-gradient-to-r from-transparent via-slate-200/80 to-transparent" />
                            <div className="flex w-full flex-col gap-px">
                              <button onClick={() => setPacienteAcompModal(p)} className="group/btn flex w-full items-center justify-center gap-1 rounded bg-gradient-to-r from-bordo-600 to-bordo-700 px-1 py-1 text-[7px] font-bold uppercase tracking-wider text-white shadow-sm shadow-cyan-200/50 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0">
                                <svg className="h-2.5 w-2.5 flex-shrink-0 transition-transform duration-200 group-hover/btn:scale-110" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/></svg>
                                <span>Acomp.</span>
                              </button>
                              <button onClick={() => setPacienteModal(p)} className="group/btn flex w-full items-center justify-center gap-1 rounded border border-slate-200/80 bg-white px-1 py-1 text-[7px] font-bold uppercase tracking-wider text-slate-500 shadow-sm transition-all duration-200 hover:border-bordo-200 hover:bg-bordo-50/50 hover:text-bordo-700 hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0">
                                <svg className="h-2.5 w-2.5 flex-shrink-0 transition-transform duration-200 group-hover/btn:scale-110" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
                                Det.
                              </button>
                            </div>
                          </div>
                        </td>
                        {/* Col 2: Paciente */}
                        <td className="px-2 py-2.5 text-center align-middle" style={{ width: '50%' }}>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[11px] font-black text-slate-800 group-hover:text-slate-900 transition-colors duration-200 leading-tight break-words">{p.paciente || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-400/80 leading-tight">Nasc {formatarData(p.data_de_nascimento)}</span>
                            <div className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">
                              {idadeNum !== null && (
                                <span className={`inline-flex items-center rounded px-1 py-px text-[7px] font-bold leading-none ${
                                  idadeNum <= 2 ? "bg-violet-50 text-violet-700"
                                  : idadeNum < 60 ? "bg-slate-100 text-slate-600"
                                  : "bg-amber-50 text-amber-700"
                                }`}>
                                  {idadeNum}a
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">
                              {p.classificacao?.toLowerCase().includes("diabetes") && <span className="inline-flex items-center rounded-full bg-blue-50 px-1 py-px text-[6px] font-bold text-blue-700 border border-blue-100">DM</span>}
                              {p.classificacao?.toLowerCase().includes("anemia") && <span className="inline-flex items-center rounded-full bg-bordo-50 px-1 py-px text-[6px] font-bold text-bordo-700 border border-bordo-100">AF</span>}
                            </div>
                          </div>
                        </td>
                        {/* Col 3: Unidade */}
                        <td className="px-2 py-2.5 text-center align-middle" style={{ width: '30%' }}>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] font-black text-slate-800 group-hover:text-slate-900 transition-colors duration-200 leading-tight">{p.unidade || "\u2014"}</span>
                            <span className="text-[8px] font-bold text-slate-400/80 leading-tight">{p.equipe || "\u2014"}</span>
                            <span className="text-[7px] font-bold text-slate-400/80 leading-tight">Micro: {p.microarea || "\u2014"}</span>
                          </div>
                        </td>
                        {/* Col 4: Info */}
                        <td className="px-2 py-2.5 text-center align-middle" style={{ width: '20%' }}>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[7px] font-bold text-slate-500 leading-tight">{p.unidade_escolar || ""}</span>
                            <span className="text-[7px] font-bold text-slate-500 leading-tight">{p.estado_nutricional || ""}</span>
                            {p.recebe_beneficio && <span className="inline-flex items-center rounded-full bg-green-50 px-1 py-px text-[6px] font-bold text-green-700 border border-green-100">{p.recebe_beneficio}</span>}
                            <span className="text-[7px] font-bold text-slate-500 leading-tight">{p.unidade_especializada || ""}</span>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Indicador visual de scroll */}
              <div className="pointer-events-none flex items-center justify-center gap-1.5 border-t border-slate-100 bg-gradient-to-r from-slate-50 via-blue-50/50 to-slate-50 px-3 py-1.5">
                <svg className="h-3 w-3 animate-pulse text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
                <span className="text-[8px] font-bold uppercase tracking-wider text-blue-500">Puxe para o lado</span>
                <svg className="h-3 w-3 animate-pulse text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
              </div>
              {filtrados.length === 0 && (
                <div className="px-4 py-10 text-center text-[11px] text-slate-400">Nenhum paciente encontrado.</div>
              )}
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {filtrados.length} registro{filtrados.length !== 1 ? "s" : ""} encontrado{filtrados.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} className="rounded border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
                  <span className="text-[10px] font-bold text-slate-500">Pág. {pagina} de {totalPaginas}</span>
                  <button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas} className="rounded border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Próximo</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ═══ TOAST SCROLL — premium ═══════════════════════════════════ */}
      {toastScroll && (
        <div className="fixed inset-x-0 bottom-6 z-[9999] flex justify-center px-4 pointer-events-none md:hidden">
          <div className="animate-toast-in flex items-center gap-3 rounded-2xl bg-slate-900/95 backdrop-blur-xl px-5 py-3 shadow-2xl shadow-slate-900/30 ring-1 ring-white/10">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/20">
              <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
            </div>
            <p className="text-xs font-semibold text-white/90">
              Puxe para o lado para ver <span className="font-bold text-blue-400">mais dados</span>
            </p>
          </div>
        </div>
      )}

      {/* Modal de detalhes do paciente */}
      {pacienteModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={() => setPacienteModal(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-black/5" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/60">Detalhes do Paciente</p>
                <h2 className="truncate text-lg font-black text-white">{pacienteModal.paciente}</h2>
              </div>
              <button onClick={() => setPacienteModal(null)} className="ml-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Conteúdo */}
            <div className="space-y-5 p-6">
              {/* Identificação */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Identificação</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <InfoRow label="Nome" value={pacienteModal.paciente} />
                </div>
              </div>

              {/* Dados demográficos */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Dados Demográficos</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <InfoRow label="Nascimento" value={formatarData(pacienteModal.data_de_nascimento)} />
                  <InfoRow label="Unidade" value={pacienteModal.unidade} />
                  <InfoRow label="Equipe" value={pacienteModal.equipe} />
                  <InfoRow label="Microárea" value={pacienteModal.microarea} />
                </div>
              </div>

              {/* Indicadores de saúde */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Indicadores de Saúde</p>
                {(() => {
                  const itens: [boolean, string][] = [
                    [pacienteModal.classificacao?.toLowerCase().includes("diabetes") ?? false, "Diabetes"],
                    [pacienteModal.classificacao?.toLowerCase().includes("anemia") ?? false, "Anemia Falciforme"],
                  ];
                  const ativos = itens.filter(([a]) => a);
                  return ativos.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {ativos.map(([, label]) => (
                        <span key={label} className="inline-flex items-center rounded-full bg-gradient-to-r from-bordo-600 to-blue-700 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm shadow-cyan-200/50">
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-slate-400">Não há indicadores de saúde</p>
                  );
                })()}
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de acompanhamento */}
      {pacienteAcompModal && createPortal(
        <ModalAcompanhamento
          paciente={pacienteAcompModal}
          usuarioId={usuarioId}
          onFechar={() => setPacienteAcompModal(null)}
        />,
        document.body
      )}
    </div>
  );
}

/* ── Subcomponentes do modal ──────────────────────────────────────────── */
function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="truncate text-sm font-semibold text-slate-700">{value || "\u2014"}</p>
    </div>
  );
}


