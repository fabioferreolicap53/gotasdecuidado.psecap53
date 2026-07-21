import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Acompanhamento, Paciente } from "./types";
import { buscarTodosAcompanhamentos, buscarAcompanhamentos, buscarPacientes, excluirAcompanhamento } from "./pocketbase";
import { getCoresCategoria } from "./data";
import ModalAcompanhamento from "./ModalAcompanhamento";

function formatarData(dateStr: string): string {
  if (!dateStr) return "";
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  return `${m[3]}/${m[2]}/${m[1]}`;
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
  if (hoje.getMonth() < mes || (hoje.getMonth() === mes && hoje.getDate() < dia)) idade--;
  return idade >= 0 ? idade : null;
}

function renderGrupos(p: Paciente) {
  const itens: { label: string; className: string }[] = [];
  if (p.classificacao?.toLowerCase().includes("diabetes")) itens.push({ label: "DM", className: getCoresCategoria("diabetes") });
  if (p.classificacao?.toLowerCase().includes("anemia")) itens.push({ label: "AF", className: getCoresCategoria("anemia_falciforme") });
  if (itens.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {itens.map((item) => (
        <span key={item.label} className={`inline-flex items-center rounded-full px-2 py-[1px] text-[8px] font-bold uppercase tracking-wider ${item.className}`}>
          {item.label}
        </span>
      ))}
    </div>
  );
}

export default function PaginaAcompanhamentos({ selectedPacienteId }: { selectedPacienteId?: string | null }) {
  const [acompanhamentos, setAcompanhamentos] = useState<Acompanhamento[]>([]);
  const [pacMap, setPacMap] = useState<Record<string, Paciente>>({});
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [mostrarBusca, setMostrarBusca] = useState(false);
  const [mostrarAvancada, setMostrarAvancada] = useState(false);
  const [filtro, setFiltro] = useState<string>("todos");
  const [filtroUnidade, setFiltroUnidade] = useState<string>("todas");
  const [filtroEquipe, setFiltroEquipe] = useState<string>("todas");
  const [filtroMicroarea, setFiltroMicroarea] = useState<string>("todas");
  const unidades = [...new Set(Object.values(pacMap).map(p => p.unidade).filter(Boolean))].sort();
  const equipes = [...new Set(Object.values(pacMap).map(p => p.equipe).filter(Boolean))].sort();
  const microareas = [...new Set(Object.values(pacMap).map(p => p.microarea).filter(Boolean))].sort();
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);

  function handleExcluir(id: string) {
    if (excluindo) return;
    if (!window.confirm("Tem certeza que deseja excluir este registro de acompanhamento?")) return;
    setExcluindo(id);
    excluirAcompanhamento(id)
      .then(() => {
        setAcompanhamentos((prev) => prev.filter((a) => a.id !== id));
        setExcluindo(null);
        setToast({ tipo: "ok", msg: "Registro excluído com sucesso." });
        setTimeout(() => setToast(null), 3000);
      })
      .catch(() => {
        setExcluindo(null);
        setToast({ tipo: "erro", msg: "Erro ao excluir registro." });
        setTimeout(() => setToast(null), 3000);
      });
  }

  const [editandoAcomp, setEditandoAcomp] = useState<Acompanhamento | null>(null);
  const [detalheAcomp, setDetalheAcomp] = useState<Acompanhamento | null>(null);

  useEffect(() => {
    let cancel = false;
    async function carregar() {
      try {
        const pacsPromise = buscarPacientes({ perPage: 500 });
        const acompsPromise = selectedPacienteId
          ? buscarAcompanhamentos(selectedPacienteId)
          : buscarTodosAcompanhamentos();
        const [acomps, pacs] = await Promise.all([acompsPromise, pacsPromise]);
        if (cancel) return;
        setAcompanhamentos(acomps);
        const map: Record<string, Paciente> = {};
        pacs.items.forEach((p) => { map[p.id] = p; });
        setPacMap(map);
      } catch { /* ignore */ }
      finally { if (!cancel) setCarregando(false); }
    }
    carregar();
    return () => { cancel = true; };
  }, [selectedPacienteId]);

  const tabelaMobileRef = useRef<HTMLDivElement>(null);
  const [toastScroll, setToastScroll] = useState(false);
  const toastMostrado = useRef(false);

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

  const buscaLower = busca.toLowerCase().trim();
  const filtrados = buscaLower
    ? acompanhamentos.filter((a) => {
        const pac = pacMap[a.paciente_id];
        return (
          (pac?.nome?.toLowerCase() ?? "").includes(buscaLower)
        );
      })
    : acompanhamentos;

  const filtradosComGrupo = (() => {
    let resultado = filtrados;
    if (filtro !== "todos") {
      resultado = resultado.filter((a) => {
        const pac = pacMap[a.paciente_id];
        if (!pac) return false;
        if (filtro === "diabetes") return pac.classificacao?.toLowerCase().includes("diabetes") ?? false;
        if (filtro === "anemia_falciforme") return pac.classificacao?.toLowerCase().includes("anemia") ?? false;
        return true;
      });
    }
    if (filtroUnidade !== "todas") {
      resultado = resultado.filter((a) => {
        const pac = pacMap[a.paciente_id];
        return pac?.unidade === filtroUnidade;
      });
    }
    if (filtroEquipe !== "todas") {
      resultado = resultado.filter((a) => {
        const pac = pacMap[a.paciente_id];
        return pac?.equipe === filtroEquipe;
      });
    }
    if (filtroMicroarea !== "todas") {
      resultado = resultado.filter((a) => {
        const pac = pacMap[a.paciente_id];
        return pac?.microarea === filtroMicroarea;
      });
    }
    return resultado;
  })();

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
              ACOMPANHAMENTOS <span className="text-bordo-400 font-bold">Registrados</span>
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
              <svg className="h-4 w-4 text-emerald-300/70" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Registros</span>
              <span className="text-2xl font-black text-white tabular-nums leading-none">
                {carregando ? "\u2026" : filtradosComGrupo.length.toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <button onClick={() => { setMostrarBusca(!mostrarBusca); setMostrarAvancada(false); }} className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200 ${mostrarBusca ? 'bg-white/10 text-white/70' : 'text-white/40 hover:bg-white/10 hover:text-white/70'}`} title="Busca rápida">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            </button>
            <button onClick={() => { setMostrarAvancada(!mostrarAvancada); setMostrarBusca(false); }} className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200 ${mostrarAvancada ? 'bg-white/10 text-white/70' : 'text-white/40 hover:bg-white/10 hover:text-white/70'}`} title="Busca avançada">
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
                placeholder="Buscar por paciente..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                autoFocus
                className="w-full rounded-lg bg-white/[0.07] border border-white/10 py-2 pl-10 pr-4 text-sm font-medium text-white placeholder-white/40 outline-none transition-all duration-200 focus:border-bordo-400/40 focus:ring-1 focus:ring-bordo-400/20"
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
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20 [&>option]:bg-slate-800 [&>option]:text-white"
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
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20 [&>option]:bg-slate-800 [&>option]:text-white"
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
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20 [&>option]:bg-slate-800 [&>option]:text-white"
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
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20 [&>option]:bg-slate-800 [&>option]:text-white"
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

      <div className="mx-auto max-w-[1380px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Loading */}
        {carregando && (
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm py-14 text-center shadow-lg shadow-slate-200/50">
            <div className="absolute -right-16 -top-16 h-36 w-36 rounded-full bg-gradient-to-br from-blue-500/10 to-cyan-500/10 blur-[60px] animate-pulse" />
            <div className="absolute -bottom-16 -left-16 h-36 w-36 rounded-full bg-gradient-to-tr from-cyan-500/10 to-blue-500/10 blur-[60px] animate-pulse" />
            <div className="relative mx-auto flex h-14 w-14 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-slate-100" />
              <div className="absolute inset-0 rounded-full border-2 border-t-blue-600 border-r-cyan-500 border-b-transparent border-l-transparent animate-spin" />
              <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 animate-pulse" />
            </div>
            <p className="mt-5 text-sm font-black text-slate-700 tracking-[0.15em] uppercase flex items-center justify-center gap-2">
              <span>Carregando Registros</span>
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </p>
            <p className="mt-1.5 text-[10px] font-semibold text-slate-400 tracking-[0.25em] uppercase">Aguarde um momento</p>
          </div>
        )}

        {/* Empty */}
        {!carregando && filtradosComGrupo.length === 0 && (
          <div className="rounded-[2.5rem] border-2 border-dashed border-slate-200 bg-white/50 py-20 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-300">
              <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.375M9 18h3.375m4.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
            <p className="text-2xl font-black uppercase tracking-tight text-slate-400">
              {busca ? "Nenhum resultado encontrado" : "Nenhum acompanhamento ainda"}
            </p>
            <p className="mt-2 text-sm font-bold uppercase tracking-widest text-slate-300">
              {busca ? "Tente ajustar sua busca." : "Inicie um acompanhamento para acompanhar o progresso do paciente."}
            </p>
          </div>
        )}

        {/* Toast de feedback */}
        {toast && (
          <div className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold uppercase tracking-wider shadow-lg transition-all ${
            toast.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-emerald-200/30"
              : "border-rose-200 bg-rose-50 text-rose-700 shadow-rose-200/30"
          }`}>
            {toast.tipo === "ok" ? (
              <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
            ) : (
              <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>
            )}
            {toast.msg}
          </div>
        )}

        {/* ═══ TABELA ═══════════════════════════════════════ */}
            <div ref={tabelaMobileRef} className="-mx-4 sm:mx-0 overflow-hidden rounded-2xl bg-white border border-slate-200/80 shadow-xl shadow-slate-200/60 ring-1 ring-black/[0.02]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-800 to-slate-700">
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Data</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Paciente</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Busca</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Situação</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Entraves</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-cyan-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Unidade</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-rose-300 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Ações</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/80">
                    {filtradosComGrupo.map((a) => {
                      const pac = pacMap[a.paciente_id];
                      const entraves = a.entraves_identificados?.split(";").map((e) => e.trim()).filter(Boolean) ?? [];
                      return (
                        <tr key={a.id} className="group transition-all duration-200 even:bg-slate-50/30 hover:bg-gradient-to-r hover:from-slate-50/80 hover:via-white hover:to-slate-50/80 hover:shadow-[inset_0_1px_0_0_rgba(148,163,184,0.06),0_1px_3px_0_rgba(0,0,0,0.04)]">
                          <td className="px-5 py-4 text-center align-middle">
                            <span className="inline-flex items-center gap-1.5 text-xs font-black text-slate-700">
                              <svg className="h-3.5 w-3.5 text-slate-400 group-hover:text-cyan-500 transition-colors duration-200" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
                              {formatarData(a.data_da_busca)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center align-middle">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-xs font-black text-slate-800 group-hover:text-slate-900 transition-colors duration-200 leading-tight">
                                {pac?.nome ?? "—"}
                              </span>
                              {pac?.data_de_nascimento && (
                                <span className="text-[9px] font-bold text-slate-400/80 leading-tight">
                                  Nasc {formatarData(pac.data_de_nascimento)}
                                </span>
                              )}
                              {pac && (
                                (() => {
                                  const idade = calcularIdade(pac.data_de_nascimento);
                                  return idade !== null ? (
                                    <span className="text-[9px] font-bold text-slate-400/80 leading-tight">
                                      {idade} {idade === 1 ? "ano" : "anos"}
                                    </span>
                                  ) : null;
                                })()
                              )}
                              {pac && renderGrupos(pac)}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center align-middle">
                            <div className="flex flex-col items-center gap-1">
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-blue-50 to-blue-100/60 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-blue-700 border border-blue-200/60 shadow-sm shadow-blue-200/10">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-400/50" />
                                {a.tipo_busca}
                              </span>
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-purple-50 to-purple-100/60 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-purple-700 border border-purple-200/60 shadow-sm shadow-purple-200/10">
                                <span className="h-1.5 w-1.5 rounded-full bg-purple-500 shadow-sm shadow-purple-400/50" />
                                {a.tipo_contato}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center align-middle">
                            {a.situacao_pos_busca ? (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-emerald-50 to-emerald-100/60 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-700 border border-emerald-200/60 shadow-sm shadow-emerald-200/10">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-400/50" />
                                {a.situacao_pos_busca}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center align-middle">
                            {entraves.length > 0 ? (
                              <div className="flex flex-wrap justify-center gap-1">
                                {entraves.map((e) => (
                                  <span key={e} className="inline-flex items-center rounded-lg bg-gradient-to-b from-amber-50 to-amber-100/60 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-amber-700 border border-amber-200/60 shadow-sm shadow-amber-200/10">
                                    {e}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center align-middle">
                            <div className="flex flex-col items-center gap-0.5">
                              {pac?.unidade ? (
                                <span className="text-[9px] font-bold text-slate-600 leading-tight break-words whitespace-normal text-balance" title={pac.unidade}>
                                  {pac.unidade}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-300">—</span>
                              )}
                              {pac?.equipe && (
                                <span className="text-[8px] font-bold text-slate-400/70 uppercase tracking-widest leading-tight">
                                  Eq {pac.equipe}
                                </span>
                              )}
                              {pac?.microarea && (
                                <span className="text-[8px] font-bold text-slate-400/70 uppercase tracking-widest leading-tight">
                                  μÁrea {pac.microarea}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center align-middle">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => setDetalheAcomp(a)}
                                className="inline-flex items-center justify-center rounded-lg p-2 text-slate-400 bg-white border border-slate-200/60 shadow-sm transition-all duration-200 hover:text-slate-600 hover:bg-slate-50 hover:border-slate-300/80 active:scale-95"
                                title="Detalhes"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditandoAcomp(a)}
                                className="inline-flex items-center justify-center rounded-lg p-2 text-cyan-500 bg-white border border-slate-200/60 shadow-sm transition-all duration-200 hover:text-cyan-600 hover:bg-cyan-50 hover:border-cyan-200/80 active:scale-95"
                                title="Editar"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/></svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExcluir(a.id)}
                                disabled={excluindo === a.id}
                                className="inline-flex items-center justify-center rounded-lg p-2 text-rose-400 bg-white border border-slate-200/60 shadow-sm transition-all duration-200 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200/80 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                                title="Excluir"
                              >
                                {excluindo === a.id ? (
                                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-300 border-t-rose-600" />
                                ) : (
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
      </div>

      {/* Modal de edição */}
      {editandoAcomp && pacMap[editandoAcomp.paciente_id] && createPortal(
        <ModalAcompanhamento
          paciente={pacMap[editandoAcomp.paciente_id]}
          usuarioId={editandoAcomp.usuario_id}
          onFechar={() => setEditandoAcomp(null)}
          acompanhamentoEdit={editandoAcomp}
          onEditSalvo={() => {
            setEditandoAcomp(null);
            // Recarregar dados
            buscarTodosAcompanhamentos().then((items) => setAcompanhamentos(items)).catch(() => {});
          }}
        />,
        document.body
      )}

      {/* Modal de detalhes */}
      {detalheAcomp && createPortal(
        <DetalhesAcompanhamento
          acompanhamento={detalheAcomp}
          paciente={detalheAcomp ? pacMap[detalheAcomp.paciente_id] : undefined}
          onFechar={() => setDetalheAcomp(null)}
        />,
        document.body
      )}

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
    </div>
  );
}

// ─── Componente de Detalhes ───────────────────────────────────────────
function DetalhesAcompanhamento({
  acompanhamento,
  paciente,
  onFechar,
}: {
  acompanhamento: Acompanhamento;
  paciente?: Paciente;
  onFechar: () => void;
}) {
  function formatarData(dateStr: string): string {
    if (!dateStr) return "";
    const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return dateStr;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  const entraves = acompanhamento.entraves_identificados?.split(";").map((e) => e.trim()).filter(Boolean) ?? [];

  return (
    <div className="fixed inset-0 z-[99999] flex items-start justify-center overflow-y-auto p-2 sm:p-4" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative mt-4 sm:mt-8 mb-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 px-5 py-4 sm:px-6 rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="truncate text-base sm:text-lg font-black text-white tracking-tight">Detalhes do Registro</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/60 truncate">
              {paciente?.nome ?? "Paciente removido"}
            </p>
          </div>
          <button onClick={onFechar} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 backdrop-blur-md transition-all duration-200 hover:bg-white/20 hover:text-white ring-1 ring-white/10">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* Data */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/60 px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Data da Busca</p>
            <p className="text-sm font-black text-slate-800">{formatarData(acompanhamento.data_da_busca)}</p>
          </div>

          {/* Tipo Busca + Tipo Contato */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 border border-slate-200/60 px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Tipo de Busca</p>
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 border border-blue-200/60">
                {acompanhamento.tipo_busca}
              </span>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200/60 px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Tipo de Contato</p>
              <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-purple-700 border border-purple-200/60">
                {acompanhamento.tipo_contato}
              </span>
            </div>
          </div>

          {/* Entrave Informado Por */}
          {acompanhamento.entrave_informado_por && (
            <div className="rounded-xl bg-slate-50 border border-slate-200/60 px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Entrave Informado Por</p>
              <p className="text-sm font-bold text-slate-700">{acompanhamento.entrave_informado_por}</p>
            </div>
          )}

          {/* Situação */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/60 px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Situação Pós Busca</p>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 border border-emerald-200/60">
              {acompanhamento.situacao_pos_busca}
            </span>
          </div>

          {/* Entraves Identificados */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/60 px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Entraves Identificados</p>
            {entraves.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {entraves.map((e) => (
                  <span key={e} className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-700 border border-amber-200/60">
                    {e}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm font-bold text-slate-400 italic">Nenhum entrave identificado</p>
            )}
          </div>

          {/* Observações */}
          {acompanhamento.observacoes && (
            <div className="rounded-xl bg-slate-50 border border-slate-200/60 px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Observações</p>
              <p className="text-sm font-medium text-slate-600 italic leading-relaxed">"{acompanhamento.observacoes}"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
