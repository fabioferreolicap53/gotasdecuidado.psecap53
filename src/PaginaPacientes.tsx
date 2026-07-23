import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Paciente, Acompanhamento } from "./types";
import { buscarPacientes, buscarFavoritos, adicionarFavorito, removerFavorito, buscarTodosAcompanhamentos, buscarAcompanhamentos, atualizarPaciente } from "./pocketbase";
import { getCoresCategoria } from "./data";
import ModalAcompanhamento from "./ModalAcompanhamento";

// ── Helpers ─────────────────────────────────────────────────────────────

function formatarData(dateStr: string): string {
  if (!dateStr) return "\u2014";
  // Extrair YYYY-MM-DD de qualquer formato (ISO, com hora, com espaço, com Z)
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "\u2014";
  const [, ano, mes, dia] = m;
  return `${dia}/${mes}/${ano}`;
}

/** Calcula idade a partir da data de nascimento — parse manual robusto */
export function calcularIdade(dataNascimento: string): number | null {
  if (!dataNascimento) return null;
  // Extrair YYYY-MM-DD de qualquer formato (ISO, com hora, com Z, etc.)
  const m = dataNascimento.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]) - 1; // 0-indexed
  const dia = Number(m[3]);
  const hoje = new Date();
  let idade = hoje.getFullYear() - ano;
  if (hoje.getMonth() < mes || (hoje.getMonth() === mes && hoje.getDate() < dia)) {
    idade--;
  }
  return idade >= 0 ? idade : null;
}

/** YYYY-MM-DD → DD/MM/YYYY (display) */
function toDisplayDate(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** DD/MM/YYYY → YYYY-MM-DD (storage). Se já vier ISO, retorna como está. */
function toStorageDate(display: string): string {
  if (!display) return "";
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return display;
}

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

// ── Componente ──────────────────────────────────────────────────────────

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

export default function PaginaPacientes({ usuarioId, usuarioUnidade, usuarioRole, onNavigateAcompFiltered }: { usuarioId: string; usuarioUnidade: string; usuarioRole: string; onNavigateAcompFiltered: (pacienteId: string) => void }) {
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<string>("todos");
  const [filtroUnidade, setFiltroUnidade] = useState<string>("todas");
  const [filtroEquipe, setFiltroEquipe] = useState<string>("todas");
  const [filtroMicroarea, setFiltroMicroarea] = useState<string>("todas");
  const [mostrarBusca, setMostrarBusca] = useState(false);
  const [mostrarAvancada, setMostrarAvancada] = useState(false);

  // Novos filtros avançados dos modais
  const [filtroSexo, setFiltroSexo] = useState<string>("todas");
  const [filtroRaca, setFiltroRaca] = useState<string>("todas");
  const [filtroNutricional, setFiltroNutricional] = useState<string>("todas");
  const [filtroVacinal, setFiltroVacinal] = useState<string>("todas");
  const [filtroBeneficio, setFiltroBeneficio] = useState<string>("todas");
  const [filtroEscola, setFiltroEscola] = useState<string>("todas");

  // ── Ordenação ──────────────────────────────────────────────────────
  const [sortField, setSortField] = useState<string>("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const unidades = [...new Set(pacientes.map(p => p.unidade).filter(Boolean))].sort();
  const equipes = [...new Set(pacientes.map(p => p.equipe).filter(Boolean))].sort();
  const microareas = [...new Set(pacientes.map(p => p.microarea).filter(Boolean))].sort();
  const sexosDisponiveis = [...new Set(pacientes.map(p => p.sexo).filter(Boolean))].sort();
  const racasDisponiveis = [...new Set(pacientes.map(p => p.raca).filter(Boolean))].sort();
  const nutricionaisDisponiveis = [...new Set(pacientes.map(p => p.estado_nutricional).filter(Boolean))].sort();
  const vacinaisDisponiveis = [...new Set(pacientes.map(p => p.situacao_vacinal).filter(Boolean))].sort();
  const beneficiosDisponiveis = [...new Set(pacientes.map(p => p.recebe_algum_beneficio).filter(Boolean))].sort();
  const escolasDisponiveis = [...new Set(pacientes.map(p => p.unidade_escolar).filter(Boolean))].sort();
  const tabelaMobileRef = useRef<HTMLDivElement>(null);
  const [toastScroll, setToastScroll] = useState(false);
  const toastMostrado = useRef(false);

  const [favSet, setFavSet] = useState<Set<string>>(new Set());
  const [favToast, setFavToast] = useState<string | null>(null);
  const [pacienteModal, setPacienteModal] = useState<Paciente | null>(null);
  const [editando, setEditando] = useState(false);
  const [formData, setFormData] = useState<Partial<Paciente>>({});
  const [salvando, setSalvando] = useState(false);
  const [pacienteAcompModal, setPacienteAcompModal] = useState<Paciente | null>(null);
  const [acompCounts, setAcompCounts] = useState<Record<string, number>>({});
  const [ultimosAcomps, setUltimosAcomps] = useState<Acompanhamento[]>([]);
  const [pagina, setPagina] = useState(1);

  // Auto-limpar toast
  useEffect(() => {
    if (!favToast) return;
    const t = setTimeout(() => setFavToast(null), 4000);
    return () => clearTimeout(t);
  }, [favToast]);

  // Carregar últimos acompanhamentos quando modal abre
  useEffect(() => {
    if (!pacienteModal) { setUltimosAcomps([]); return; }
    let cancel = false;
    buscarAcompanhamentos(pacienteModal.id).then((acmps) => {
      if (!cancel) setUltimosAcomps(acmps.slice(0, 5));
    }).catch(() => { if (!cancel) setUltimosAcomps([]); });
    return () => { cancel = true; };
  }, [pacienteModal]);

  async function toggleFavorito(p: Paciente) {
    const estavaFav = favSet.has(p.id);

    // ── Optimistic update ──────────────────────────────────────────────
    setFavSet((prev) => {
      const next = new Set(prev);
      if (estavaFav) next.delete(p.id);
      else next.add(p.id);
      return next;
    });

    try {
      if (estavaFav) {
        const favs = await buscarFavoritos(usuarioId);
        const match = favs.find((f) => f.paciente_id === p.id);
        if (match) await removerFavorito(match.id);
      } else {
        await adicionarFavorito(usuarioId, p.id);
      }
    } catch (e) {
      // Reverter em caso de erro
      setFavSet((prev) => {
        const next = new Set(prev);
        if (estavaFav) next.add(p.id);
        else next.delete(p.id);
        return next;
      });
      console.error("Erro ao alternar favorito:", e);
      setFavToast("Erro ao salvar favorito. Tente novamente.");
    }
  }

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        setCarregando(true);
        setErro(null);
        const { items } = await buscarPacientes({ perPage: 500 });
        if (!cancelado) {
          const filtrados = usuarioUnidade ? items.filter((p) => p.unidade === usuarioUnidade) : items;
          setPacientes(filtrados);
        }
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Erro ao carregar pacientes");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    carregar();
    return () => { cancelado = true; };
  }, []);

  // Carregar favoritos do usuario
  useEffect(() => {
    let cancelado = false;
    async function carregarFavs() {
      try {
        const favs = await buscarFavoritos(usuarioId);
        if (!cancelado) setFavSet(new Set(favs.map((f) => f.paciente_id)));
      } catch (e) {
        console.error("Erro ao carregar favoritos:", e);
      }
    }
    if (usuarioId) carregarFavs();
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
  }, [carregando, erro]);

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

  // Busca em multiplos campos
  const filtrados = pacientes.filter((p) => {
    const q = busca.toLowerCase();
    const matchBusca =
      busca === "" ||
      p.nome?.toLowerCase().includes(q) ||
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
    const matchSexo = filtroSexo === "todas" || p.sexo === filtroSexo;
    const matchRaca = filtroRaca === "todas" || p.raca === filtroRaca;
    const matchNutricional = filtroNutricional === "todas" || p.estado_nutricional === filtroNutricional;
    const matchVacinal = filtroVacinal === "todas" || p.situacao_vacinal === filtroVacinal;
    const matchBeneficio = filtroBeneficio === "todas" || p.recebe_algum_beneficio === filtroBeneficio;
    const matchEscola = filtroEscola === "todas" || p.unidade_escolar === filtroEscola;

    return matchBusca && matchFiltro && matchUnidade && matchEquipe && matchMicroarea && matchSexo && matchRaca && matchNutricional && matchVacinal && matchBeneficio && matchEscola;
  });

  const porPagina = 10;
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const filtradosSorted = [...filtrados].sort((a, b) => {
    let va = "", vb = "";
    switch (sortField) {
      case "nome": va = a.nome || ""; vb = b.nome || ""; break;
      case "unidade": va = a.unidade || ""; vb = b.unidade || ""; break;
      case "unidade_escolar": va = a.unidade_escolar || ""; vb = b.unidade_escolar || ""; break;
      case "estado_nutricional": va = a.estado_nutricional || ""; vb = b.estado_nutricional || ""; break;
      case "extra": va = a.raca || ""; vb = b.raca || ""; break;
      default: va = a.nome || ""; vb = b.nome || ""; break;
    }
    const cmp = va.localeCompare(vb, "pt-BR", { sensitivity: "base" });
    return sortDir === "asc" ? cmp : -cmp;
  });
  const paginaAtual = filtradosSorted.slice((pagina - 1) * porPagina, pagina * porPagina);

  useEffect(() => { setPagina(1); }, [busca, filtro, filtroUnidade, filtroEquipe, filtroMicroarea, filtroSexo, filtroRaca, filtroNutricional, filtroVacinal, filtroBeneficio, filtroEscola]);

  function abrirModal(p: Paciente) {
    setPacienteModal(p);
    setFormData({
      nome: p.nome || "",
      sexo: p.sexo || "",
      raca: p.raca || "",
      data_de_nascimento: p.data_de_nascimento || "",
      unidade: p.unidade || "",
      equipe: p.equipe || "",
      microarea: p.microarea || "",
      ult_consulta: p.ult_consulta || "",
      unidade_escolar: p.unidade_escolar || "",
      estado_nutricional: p.estado_nutricional || "",
      situacao_vacinal: p.situacao_vacinal || "",
      classificacao: p.classificacao || "",
      recebe_algum_beneficio: p.recebe_algum_beneficio || "",
      observacoes: p.observacoes || "",
      unidade_especializada: p.unidade_especializada || "",
    });
    setEditando(false);
  }

  async function salvar() {
    if (!pacienteModal) return;
    setSalvando(true);
    try {
      await atualizarPaciente(pacienteModal.id, formData);
      setPacienteModal({ ...pacienteModal, ...formData } as Paciente);
      setEditando(false);
    } catch (e) {
      console.error("Erro ao salvar:", e);
      alert("Erro ao salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative overflow-hidden rounded-b-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-bordo-950 px-5 py-4 sm:px-6 sm:py-5 shadow-xl shadow-slate-900/30">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-bordo-500/10 blur-3xl" />
        <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-bordo-600/15 blur-2xl" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-bordo-500/40 to-transparent" />

        <div className="relative mx-auto flex max-w-[1380px] flex-col items-center text-center gap-2 sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-bordo-500 to-bordo-700" />
            <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
              PACIENTES <span className="text-bordo-400 font-bold">Cadastrados</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
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
              <svg className="h-4 w-4 text-amber-300/70" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Total</span>
              <span className="text-2xl font-black text-white tabular-nums leading-none">
                {carregando ? "\u2026" : filtrados.length.toLocaleString("pt-BR")}
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
            <div className="mx-auto flex max-w-[1380px] items-center gap-3">
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Unidade</label>
                <select value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white">
                  <option value="todas">Todas</option>
                  {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Equipe</label>
                <select value={filtroEquipe} onChange={(e) => setFiltroEquipe(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white">
                  <option value="todas">Todas</option>
                  {equipes.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Microárea</label>
                <select value={filtroMicroarea} onChange={(e) => setFiltroMicroarea(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white">
                  <option value="todas">Todas</option>
                  {microareas.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Grupo</label>
                <select value={filtro} onChange={(e) => setFiltro(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white">
                  <option value="todos">Todos</option>
                  <option value="diabetes">Diabetes</option>
                  <option value="anemia_falciforme">Anemia Falciforme</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Sexo</label>
                <select value={filtroSexo} onChange={(e) => setFiltroSexo(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white">
                  <option value="todas">Todos</option>
                  {sexosDisponiveis.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Raça</label>
                <select value={filtroRaca} onChange={(e) => setFiltroRaca(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white">
                  <option value="todas">Todas</option>
                  {racasDisponiveis.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Estado Nutricional</label>
                <select value={filtroNutricional} onChange={(e) => setFiltroNutricional(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white">
                  <option value="todas">Todos</option>
                  {nutricionaisDisponiveis.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Situação Vacinal</label>
                <select value={filtroVacinal} onChange={(e) => setFiltroVacinal(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white">
                  <option value="todas">Todas</option>
                  {vacinaisDisponiveis.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Benefício</label>
                <select value={filtroBeneficio} onChange={(e) => setFiltroBeneficio(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white">
                  <option value="todas">Todos</option>
                  {beneficiosDisponiveis.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/40">Escola</label>
                <select value={filtroEscola} onChange={(e) => setFiltroEscola(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-3 py-2 text-xs font-medium text-white outline-none transition-all focus:border-bordo-500/40 focus:ring-1 focus:ring-bordo-500/20 [&>option]:bg-slate-800 [&>option]:text-white">
                  <option value="todas">Todas</option>
                  {escolasDisponiveis.map(e => <option key={e} value={e}>{e.length > 50 ? e.slice(0, 50) + "..." : e}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => { setFiltroUnidade("todas"); setFiltroEquipe("todas"); setFiltroMicroarea("todas"); setFiltro("todos"); setFiltroSexo("todas"); setFiltroRaca("todas"); setFiltroNutricional("todas"); setFiltroVacinal("todas"); setFiltroBeneficio("todas"); setFiltroEscola("todas"); }}
                className="rounded-lg bg-white/[0.07] border border-white/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white/50 transition-all hover:bg-white/10 hover:text-white/70"
              >
                Limpar Filtros
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1380px] px-4 py-8 sm:px-6 lg:px-8">

        {/* Erro */}
        {erro && (
          <div className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-300">
            <p className="font-semibold">Erro ao conectar ao PocketBase:</p>
            <p className="mt-1">{erro}</p>
          </div>
        )}

        {/* Loading premium */}
        {carregando && (
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm py-20 text-center shadow-lg shadow-slate-200/50">
            <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-blue-500/10 to-bordo-600/10 blur-3xl animate-pulse" />
            <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-gradient-to-tr from-bordo-600/10 to-blue-500/10 blur-3xl animate-pulse" />
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-[3px] border-slate-100" />
              <div className="absolute inset-0 rounded-full border-[3px] border-t-blue-600 border-r-cyan-500 border-b-transparent border-l-transparent animate-spin" />
              <div className="h-3 w-3 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 animate-pulse" />
            </div>
            <p className="mt-6 text-[15px] font-bold text-slate-700 tracking-tight uppercase">
              CARREGANDO PACIENTES
              <span className="inline-flex gap-1 ml-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-bordo-600 animate-pulse" style={{ animationDelay: '300ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '600ms' }} />
              </span>
            </p>
            <p className="mt-2 text-xs font-medium text-slate-400 tracking-widest uppercase">AGUARDE UM MOMENTO</p>
          </div>
        )}

        {/* ═══ TABELA DESKTOP ═══════════════════════════════════════ */}
            <div className="hidden overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-lg shadow-slate-200/80 xl:block" style={{ overflow: "visible" }}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <colgroup>
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '20%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-800 to-slate-700">
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-bordo-400 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Ação</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px] cursor-pointer select-none" onClick={() => handleSort("nome")}>
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-bordo-400 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Paciente</span>
                          {sortField === "nome" && (
                            <svg className={`h-2.5 w-2.5 text-white/60 transition-all duration-300 ease-out ${sortDir === "desc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px] cursor-pointer select-none" onClick={() => handleSort("unidade")}>
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-bordo-400 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Unidade</span>
                          {sortField === "unidade" && (
                            <svg className={`h-2.5 w-2.5 text-white/60 transition-all duration-300 ease-out ${sortDir === "desc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px] cursor-pointer select-none" onClick={() => handleSort("unidade_escolar")}>
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-bordo-400 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" /></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Escola</span>
                          {sortField === "unidade_escolar" && (
                            <svg className={`h-2.5 w-2.5 text-white/60 transition-all duration-300 ease-out ${sortDir === "desc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px] cursor-pointer select-none" onClick={() => handleSort("estado_nutricional")}>
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-bordo-400 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Saúde</span>
                          {sortField === "estado_nutricional" && (
                            <svg className={`h-2.5 w-2.5 text-white/60 transition-all duration-300 ease-out ${sortDir === "desc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px] cursor-pointer select-none" onClick={() => handleSort("extra")}>
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-bordo-400 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Extras</span>
                          {sortField === "extra" && (
                            <svg className={`h-2.5 w-2.5 text-white/60 transition-all duration-300 ease-out ${sortDir === "desc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginaAtual.map((p) => {
                      const idadeNum = calcularIdade(p.data_de_nascimento);
                      return (
                      <tr key={p.id} className="group transition-colors hover:bg-slate-50/50">
                        <td className="px-3 py-3 text-center align-top">
                          <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-slate-50 to-white px-3 py-1.5 ring-1 ring-slate-200/70 shadow-sm">
                              <button onClick={() => toggleFavorito(p)} className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 transition-all duration-200 hover:scale-110 hover:shadow-md ${favSet.has(p.id) ? "bg-amber-50 ring-amber-200/50 hover:bg-amber-100" : "bg-slate-50 ring-slate-200/60 hover:bg-amber-50 hover:ring-amber-200/60"}`} title={favSet.has(p.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
                                {favSet.has(p.id) ? (<svg className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>) : (<svg className="h-3.5 w-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>)}
                              </button>
                              {acompCounts[p.id] > 0 && (
                                <AcompCountBadge count={acompCounts[p.id]} pacienteId={p.id} onNavigate={onNavigateAcompFiltered} className="inline-flex h-5 min-w-[20px] cursor-pointer select-none items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 px-1.5 text-[9px] font-black text-white shadow-md shadow-red-500/30 ring-1 ring-red-400/30 transition-all duration-300 ease-out hover:scale-110 active:scale-90" />
                              )}
                            </div>
                            <div className="h-px w-10 bg-gradient-to-r from-transparent via-slate-300/60 to-transparent" />
                            <div className="flex w-full flex-col gap-1.5">
                              <button onClick={() => setPacienteAcompModal(p)} className="group/btn relative flex w-full items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-gradient-to-br from-bordo-500 via-bordo-600 to-bordo-700 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-lg shadow-bordo-500/25 ring-1 ring-bordo-400/20 transition-all duration-300 hover:from-bordo-400 hover:via-bordo-500 hover:to-bordo-600 hover:shadow-xl hover:shadow-bordo-500/40 hover:-translate-y-0.5 hover:scale-[1.02] active:translate-y-0 active:scale-[0.98]">
                                <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100" />
                                <svg className="h-3.5 w-3.5 flex-shrink-0 transition-all duration-300 ease-out duration-300 group-hover/btn:scale-110 group-hover/btn:rotate-[-5deg]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/></svg>
                                <span className="relative z-10">Acomp.</span>
                              </button>
                              <button onClick={() => abrirModal(p)} className="group/btn relative flex w-full items-center justify-center gap-1.5 overflow-hidden rounded-xl border-2 border-bordo-100 bg-gradient-to-br from-white to-bordo-50/30 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-bordo-700 shadow-sm shadow-bordo-200/20 transition-all duration-300 hover:border-bordo-300 hover:from-bordo-50 hover:to-white hover:shadow-lg hover:shadow-bordo-300/30 hover:-translate-y-0.5 hover:scale-[1.02] active:translate-y-0 active:scale-[0.98]">
                                <div className="absolute inset-0 bg-gradient-to-br from-bordo-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100" />
                                <svg className="h-3.5 w-3.5 flex-shrink-0 transition-all duration-300 ease-out duration-300 group-hover/btn:scale-110 group-hover/btn:rotate-[-5deg]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
                                <span className="relative z-10">Detalhes</span>
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs font-black text-slate-800 group-hover:text-slate-900 transition-colors duration-200 leading-tight">{p.nome || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-800 leading-tight">Nasc {formatarData(p.data_de_nascimento)}</span>
                            {idadeNum !== null && (
                              <span className="text-[9px] font-bold text-slate-800 leading-tight">{idadeNum} {idadeNum === 1 ? "ano" : "anos"}</span>
                            )}
                            {(p.ult_consulta && p.ult_consulta !== "0000-00-00") && (
                              <span className="text-[9px] font-bold text-blue-600/70 leading-tight">Últ. consulta {formatarData(p.ult_consulta)}</span>
                            )}
                            <div className="flex flex-wrap justify-center gap-1">
                              {renderCategorias(p)}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            {p.unidade && <span className="text-xs font-black text-slate-800 group-hover:text-slate-900 transition-colors duration-200 leading-tight">{p.unidade}</span>}
                            {p.equipe && <span className="text-[9px] font-bold text-slate-800 leading-tight">{p.equipe}</span>}
                            {p.microarea && <span className="text-[9px] font-bold text-slate-800 leading-tight">Micro: {p.microarea}</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs font-black text-slate-800 leading-tight">{p.unidade_escolar}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[9px] font-bold text-slate-800 leading-tight">{p.estado_nutricional}</span>
                            <span className="text-[9px] font-bold text-slate-800 leading-tight">{p.situacao_vacinal}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            {p.recebe_algum_beneficio && <span className="text-[9px] font-bold text-slate-800 leading-tight">Benef&iacute;cio: {p.recebe_algum_beneficio}</span>}
                            {p.observacoes && <span className="text-[9px] font-bold text-slate-800 leading-tight">Obs: {p.observacoes.length > 30 ? p.observacoes.slice(0, 30) + "..." : p.observacoes}</span>}
                            {p.raca && <span className="text-[9px] font-bold text-slate-800 leading-tight">Ra&ccedil;a: {p.raca}</span>}
{p.unidade_especializada && <span className="text-[9px] font-bold text-slate-800 leading-tight">Esp.: {p.unidade_especializada}</span>}
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
                  <colgroup>
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '20%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-800 to-slate-700">
                      <th className="px-6 py-1 text-center align-middle h-[76px]">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-bordo-400 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Ação</span>
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px] cursor-pointer select-none" onClick={() => handleSort("nome")}>
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-bordo-400 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Paciente</span>
                          {sortField === "nome" && (
                            <svg className={`h-2.5 w-2.5 text-white/60 transition-all duration-300 ease-out ${sortDir === "desc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-5 text-center cursor-pointer select-none" onClick={() => handleSort("unidade")}>
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-bordo-400 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Unidade</span>
                          {sortField === "unidade" && (
                            <svg className={`h-2.5 w-2.5 text-white/60 transition-all duration-300 ease-out ${sortDir === "desc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px] cursor-pointer select-none" onClick={() => handleSort("unidade_escolar")}>
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-bordo-400 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" /></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Escola</span>
                          {sortField === "unidade_escolar" && (
                            <svg className={`h-2.5 w-2.5 text-white/60 transition-all duration-300 ease-out ${sortDir === "desc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px] cursor-pointer select-none" onClick={() => handleSort("estado_nutricional")}>
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-bordo-400 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Saúde</span>
                          {sortField === "estado_nutricional" && (
                            <svg className={`h-2.5 w-2.5 text-white/60 transition-all duration-300 ease-out ${sortDir === "desc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-1 text-center align-middle h-[76px] cursor-pointer select-none" onClick={() => handleSort("extra")}>
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-bordo-400 ring-1 ring-white/10">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Extras</span>
                          {sortField === "extra" && (
                            <svg className={`h-2.5 w-2.5 text-white/60 transition-all duration-300 ease-out ${sortDir === "desc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginaAtual.map((p) => {
                      const idadeNum = calcularIdade(p.data_de_nascimento);
                      return (
                      <tr key={p.id} className="group transition-colors hover:bg-slate-50/50">
                        <td className="px-3 py-3 text-center align-top">
                          <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-slate-50 to-white px-3 py-1.5 ring-1 ring-slate-200/70 shadow-sm">
                              <button onClick={() => toggleFavorito(p)} className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 transition-all duration-200 hover:scale-110 hover:shadow-md ${favSet.has(p.id) ? "bg-amber-50 ring-amber-200/50 hover:bg-amber-100" : "bg-slate-50 ring-slate-200/60 hover:bg-amber-50 hover:ring-amber-200/60"}`} title={favSet.has(p.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
                                {favSet.has(p.id) ? (<svg className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>) : (<svg className="h-3.5 w-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>)}
                              </button>
                              {acompCounts[p.id] > 0 && (
                                <AcompCountBadge count={acompCounts[p.id]} pacienteId={p.id} onNavigate={onNavigateAcompFiltered} className="inline-flex h-5 min-w-[20px] cursor-pointer select-none items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 px-1.5 text-[9px] font-black text-white shadow-md shadow-red-500/30 ring-1 ring-red-400/30 transition-all duration-300 ease-out hover:scale-110 active:scale-90" />
                              )}
                            </div>
                            <div className="h-px w-10 bg-gradient-to-r from-transparent via-slate-300/60 to-transparent" />
                            <div className="flex w-full flex-col gap-1.5">
                              <button onClick={() => setPacienteAcompModal(p)} className="group/btn relative flex w-full items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-gradient-to-br from-bordo-500 via-bordo-600 to-bordo-700 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-lg shadow-bordo-500/25 ring-1 ring-bordo-400/20 transition-all duration-300 hover:from-bordo-400 hover:via-bordo-500 hover:to-bordo-600 hover:shadow-xl hover:shadow-bordo-500/40 hover:-translate-y-0.5 hover:scale-[1.02] active:translate-y-0 active:scale-[0.98]">
                                <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100" />
                                <svg className="h-3.5 w-3.5 flex-shrink-0 transition-all duration-300 ease-out duration-300 group-hover/btn:scale-110 group-hover/btn:rotate-[-5deg]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/></svg>
                                <span className="relative z-10">Acomp.</span>
                              </button>
                              <button onClick={() => abrirModal(p)} className="group/btn relative flex w-full items-center justify-center gap-1.5 overflow-hidden rounded-xl border-2 border-bordo-100 bg-gradient-to-br from-white to-bordo-50/30 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-bordo-700 shadow-sm shadow-bordo-200/20 transition-all duration-300 hover:border-bordo-300 hover:from-bordo-50 hover:to-white hover:shadow-lg hover:shadow-bordo-300/30 hover:-translate-y-0.5 hover:scale-[1.02] active:translate-y-0 active:scale-[0.98]">
                                <div className="absolute inset-0 bg-gradient-to-br from-bordo-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100" />
                                <svg className="h-3.5 w-3.5 flex-shrink-0 transition-all duration-300 ease-out duration-300 group-hover/btn:scale-110 group-hover/btn:rotate-[-5deg]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
                                <span className="relative z-10">Detalhes</span>
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs font-black text-slate-800 group-hover:text-slate-900 transition-colors duration-200 leading-tight">{p.nome || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-800 leading-tight">Nasc {formatarData(p.data_de_nascimento)}</span>
                            {idadeNum !== null && (
                              <span className="text-[9px] font-bold text-slate-800 leading-tight">{idadeNum} {idadeNum === 1 ? "ano" : "anos"}</span>
                            )}
                            {(p.ult_consulta && p.ult_consulta !== "0000-00-00") && (
                              <span className="text-[9px] font-bold text-blue-600/70 leading-tight">Últ. consulta {formatarData(p.ult_consulta)}</span>
                            )}
                            <div className="flex flex-wrap justify-center gap-1">
                              {renderCategorias(p)}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            {p.unidade && <span className="text-xs font-black text-slate-800 group-hover:text-slate-900 transition-colors duration-200 leading-tight">{p.unidade}</span>}
                            {p.equipe && <span className="text-[9px] font-bold text-slate-800 leading-tight">{p.equipe}</span>}
                            {p.microarea && <span className="text-[9px] font-bold text-slate-800 leading-tight">Micro: {p.microarea}</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs font-black text-slate-800 leading-tight">{p.unidade_escolar}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[9px] font-bold text-slate-800 leading-tight">{p.estado_nutricional}</span>
                            <span className="text-[9px] font-bold text-slate-800 leading-tight">{p.situacao_vacinal}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            {p.recebe_algum_beneficio && <span className="text-[9px] font-bold text-slate-800 leading-tight">Benef&iacute;cio: {p.recebe_algum_beneficio}</span>}
                            {p.observacoes && <span className="text-[9px] font-bold text-slate-800 leading-tight">Obs: {p.observacoes.length > 30 ? p.observacoes.slice(0, 30) + "..." : p.observacoes}</span>}
                            {p.raca && <span className="text-[9px] font-bold text-slate-800 leading-tight">Ra&ccedil;a: {p.raca}</span>}
{p.unidade_especializada && <span className="text-[9px] font-bold text-slate-800 leading-tight">Esp.: {p.unidade_especializada}</span>}
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
                          <svg className="h-3 w-3 text-bordo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/></svg>
                          <span className="text-[8px] font-black uppercase tracking-wider text-white/90">Ação</span>
                        </div>
                      </th>
                      <th className="px-2 py-2.5 text-center cursor-pointer select-none" style={{ width: '50%' }} onClick={() => handleSort("nome")}>
                        <div className="flex flex-col items-center gap-0.5">
                          <svg className="h-3 w-3 text-bordo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
                          <span className="text-[8px] font-black uppercase tracking-wider text-white/90">Paciente</span>
                          {sortField === "nome" && (
                            <svg className={`h-2 w-2 text-white/60 transition-all duration-300 ease-out ${sortDir === "desc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-2 py-2.5 text-center cursor-pointer select-none" style={{ width: '30%' }} onClick={() => handleSort("unidade")}>
                        <div className="flex flex-col items-center gap-0.5">
                          <svg className="h-3 w-3 text-bordo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/></svg>
                          <span className="text-[8px] font-black uppercase tracking-wider text-white/90">Unidade</span>
                          {sortField === "unidade" && (
                            <svg className={`h-2 w-2 text-white/60 transition-all duration-300 ease-out ${sortDir === "desc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          )}
                        </div>
                      </th>
                      <th className="px-2 py-2.5 text-center cursor-pointer select-none" style={{ width: '30%' }} onClick={() => handleSort("unidade_escolar")}>
                        <div className="flex flex-col items-center gap-0.5">
                          <svg className="h-3 w-3 text-bordo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>
                          <span className="text-[8px] font-black uppercase tracking-wider text-white/90">Info</span>
                          {sortField === "unidade_escolar" && (
                            <svg className={`h-2 w-2 text-white/60 transition-all duration-300 ease-out ${sortDir === "desc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                          )}
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
                        <td className="px-2 py-2 text-center align-middle" style={{ width: '20%' }}>
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1 rounded-lg bg-gradient-to-br from-slate-50 to-white px-2 py-1 ring-1 ring-slate-200/70 shadow-sm">
                              <button
                                onClick={() => toggleFavorito(p)}
                                className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-50 ring-1 ring-amber-200/50 transition-all duration-200 hover:scale-110 hover:shadow-sm"
                                title={favSet.has(p.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                              >
                                {favSet.has(p.id) ? (
                                  <svg className="h-3 w-3 text-amber-400" fill="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
                                ) : (
                                  <svg className="h-3 w-3 text-slate-300 hover:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
                                )}
                              </button>
                              {acompCounts[p.id] > 0 && (
                                <AcompCountBadge count={acompCounts[p.id]} pacienteId={p.id} onNavigate={onNavigateAcompFiltered} className="inline-flex h-4 min-w-[16px] cursor-pointer select-none items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 px-1 text-[8px] font-black text-white shadow-sm shadow-red-500/30 ring-1 ring-red-400/30 transition-all duration-300 ease-out hover:scale-110 active:scale-90" />
                              )}
                            </div>
                            <div className="h-px w-8 bg-gradient-to-r from-transparent via-slate-300/60 to-transparent" />
                            <div className="flex w-full flex-col gap-1">
                              <button onClick={() => setPacienteAcompModal(p)} className="group/btn relative flex w-full items-center justify-center gap-1 overflow-hidden rounded-lg bg-gradient-to-br from-bordo-500 via-bordo-600 to-bordo-700 px-2 py-1.5 text-[8px] font-extrabold uppercase tracking-wider text-white shadow-md shadow-bordo-500/20 ring-1 ring-bordo-400/20 transition-all duration-200 hover:from-bordo-400 hover:via-bordo-500 hover:to-bordo-600 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0">
                                <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent opacity-0 transition-opacity duration-200 group-hover/btn:opacity-100" />
                                <svg className="h-3 w-3 flex-shrink-0 transition-all duration-300 ease-out duration-200 group-hover/btn:scale-110" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/></svg>
                                <span className="relative z-10">Acomp.</span>
                              </button>
                              <button onClick={() => abrirModal(p)} className="group/btn relative flex w-full items-center justify-center gap-1 overflow-hidden rounded-lg border-2 border-bordo-100 bg-gradient-to-br from-white to-bordo-50/30 px-2 py-1.5 text-[8px] font-extrabold uppercase tracking-wider text-bordo-700 shadow-sm transition-all duration-200 hover:border-bordo-300 hover:from-bordo-50 hover:to-white hover:shadow-md hover:-translate-y-0.5 active:translate-y-0">
                                <div className="absolute inset-0 bg-gradient-to-br from-bordo-500/5 to-transparent opacity-0 transition-opacity duration-200 group-hover/btn:opacity-100" />
                                <svg className="h-3 w-3 flex-shrink-0 transition-all duration-300 ease-out duration-200 group-hover/btn:scale-110" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
                                <span className="relative z-10">Det.</span>
                              </button>
                            </div>
                          </div>
                        </td>
                        {/* Col 2: Paciente */}
                        <td className="px-2 py-2.5 text-center align-middle" style={{ width: '50%' }}>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[11px] font-black text-slate-800 group-hover:text-slate-900 transition-colors duration-200 leading-tight break-words">{p.nome || "\u2014"}</span>
                            <span className="text-[9px] font-bold text-slate-800 leading-tight">Nasc {formatarData(p.data_de_nascimento)}</span>
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
                            {(p.ult_consulta && p.ult_consulta !== "0000-00-00") && (
                              <span className="text-[8px] font-bold text-blue-600/70 leading-tight">Últ. consulta {formatarData(p.ult_consulta)}</span>
                            )}
                            <div className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">
                              {p.classificacao?.toLowerCase().includes("diabetes") && <span className="inline-flex items-center rounded-full bg-blue-50 px-1 py-px text-[6px] font-bold text-blue-700 border border-blue-100">DM</span>}
                              {p.classificacao?.toLowerCase().includes("anemia") && <span className="inline-flex items-center rounded-full bg-bordo-50 px-1 py-px text-[6px] font-bold text-bordo-700 border border-bordo-100">AF</span>}
                            </div>
                          </div>
                        </td>
                        {/* Col 3: Unidade */}
                        <td className="px-2 py-2.5 text-center align-middle" style={{ width: '30%' }}>
                          <div className="flex flex-col items-center gap-0.5">
                            {p.unidade && <span className="text-[10px] font-black text-slate-800 group-hover:text-slate-900 transition-colors duration-200 leading-tight">{p.unidade}</span>}
                            <span className="text-[8px] font-bold text-slate-800 leading-tight">{p.equipe && <span className="text-[9px] font-bold text-slate-800 leading-tight">{p.equipe}</span>}</span>
                            {p.microarea && <span className="text-[7px] font-bold text-slate-400/80 leading-tight">Micro: {p.microarea}</span>}
                          </div>
                        </td>
                        {/* Col 4: Info */}
                        <td className="px-2 py-2.5 text-center align-middle" style={{ width: '30%' }}>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] font-black text-slate-800 leading-tight">{p.unidade_escolar}</span>
                            {p.estado_nutricional && <span className="text-[8px] font-bold text-slate-800 leading-tight">Nutri: {p.estado_nutricional}</span>}
                            {p.situacao_vacinal && <span className="text-[8px] font-bold text-slate-800 leading-tight">Vacinal: {p.situacao_vacinal}</span>}
                            {p.recebe_algum_beneficio && <span className="text-[8px] font-bold text-slate-800 leading-tight">Benef&iacute;cio: {p.recebe_algum_beneficio}</span>}
                            {p.observacoes && <span className="text-[8px] font-bold text-slate-800 leading-tight">Obs: {p.observacoes.length > 30 ? p.observacoes.slice(0, 30) + "..." : p.observacoes}</span>}
                            {p.raca && <span className="text-[8px] font-bold text-slate-800 leading-tight">Ra&ccedil;a: {p.raca}</span>}
{p.unidade_especializada && <span className="text-[8px] font-bold text-slate-800 leading-tight">Esp.: {p.unidade_especializada}</span>}
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

      {/* ═══ TOAST FAVORITO — erro ══════════════════════════════════════ */}
      {favToast && (
        <div className="fixed bottom-20 right-4 z-[9999] flex items-center gap-3 rounded-2xl bg-red-600/95 backdrop-blur-xl px-5 py-3 shadow-2xl shadow-red-900/30 ring-1 ring-white/10 animate-toast-in">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </div>
          <p className="text-sm font-semibold text-white">{favToast}</p>
          <button onClick={() => setFavToast(null)} className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors">✕</button>
        </div>
      )}

      {/* Modal de detalhes do paciente */}
      {pacienteModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={() => { setPacienteModal(null); setEditando(false); }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* ── Header premium ── */}
            <div className="relative flex items-center gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 px-6 py-5">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-blue-500 text-xl font-black text-white shadow-lg shadow-indigo-500/30 ring-2 ring-white/20">
                {pacienteModal.nome?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-black text-white leading-tight">{pacienteModal.nome}</h2>
                <div className="mt-0.5 flex items-center gap-2 text-xs font-semibold text-white/60">
                  {pacienteModal.sexo && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">{pacienteModal.sexo}</span>}
                  {pacienteModal.idade != null && <span>{pacienteModal.idade} anos</span>}
                  {pacienteModal.raca && <span className="hidden sm:inline">· {pacienteModal.raca}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {!editando ? (
                  <>
                    <button onClick={() => setEditando(true)} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-sm ring-1 ring-white/10 transition-all hover:bg-white/20 hover:text-white hover:ring-white/25">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                      Editar
                    </button>
                    <button onClick={() => setPacienteModal(null)} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/50 ring-1 ring-white/10 transition-all hover:bg-white/15 hover:text-white">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={salvar} disabled={salvando} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg shadow-emerald-500/30 transition-all hover:bg-emerald-400 disabled:opacity-50">
                      {salvando ? (
                        <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      )}
                      Salvar
                    </button>
                    <button onClick={() => { setEditando(false); setFormData({ nome: pacienteModal.nome, sexo: pacienteModal.sexo, raca: pacienteModal.raca, data_de_nascimento: pacienteModal.data_de_nascimento, unidade: pacienteModal.unidade, equipe: pacienteModal.equipe, microarea: pacienteModal.microarea, ult_consulta: pacienteModal.ult_consulta, unidade_escolar: pacienteModal.unidade_escolar, estado_nutricional: pacienteModal.estado_nutricional, situacao_vacinal: pacienteModal.situacao_vacinal, classificacao: pacienteModal.classificacao, recebe_algum_beneficio: pacienteModal.recebe_algum_beneficio, observacoes: pacienteModal.observacoes, unidade_especializada: pacienteModal.unidade_especializada }); }} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/90 ring-1 ring-white/10 transition-all hover:bg-white/20">
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ── Conteúdo scrollável ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

              {/* ▸ Identificação */}
              <div className="rounded-xl border-l-4 border-blue-500 bg-gradient-to-r from-blue-50/80 to-white p-3.5">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10"><svg className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg></div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-blue-700">Identifica&ccedil;&atilde;o</p>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Nome</p>
                    {editando ? (
                      <input type="text" value={formData.nome || ""} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                    ) : (
                      <p className="text-sm font-bold text-slate-800">{pacienteModal.nome || "\u2014"}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Sexo</p>
                      {editando ? (
                        <select value={formData.sexo || ""} onChange={(e) => setFormData({ ...formData, sexo: e.target.value })} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                          <option value="">Selecione</option>
                          <option value="M">M</option>
                          <option value="F">F</option>
                        </select>
                      ) : (
                        <p className="text-sm font-bold text-slate-800">{pacienteModal.sexo || "\u2014"}</p>
                      )}
                    </div>
                    <div>
                      <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Ra&ccedil;a</p>
                      {editando ? (
                        <select value={formData.raca || ""} onChange={(e) => setFormData({ ...formData, raca: e.target.value })} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                          <option value="">Selecione...</option>
                          <option value="BRANCA">BRANCA</option>
                          <option value="PRETA">PRETA</option>
                          <option value="PARDA">PARDA</option>
                          <option value="AMARELA">AMARELA</option>
                          <option value="IND&Iacute;GENA">IND&Iacute;GENA</option>
                          <option value="N&Atilde;O DESEJA DECLARAR / N&Atilde;O INFORMADO">N&Atilde;O DESEJA DECLARAR / N&Atilde;O INFORMADO</option>
                        </select>
                      ) : (
                        <p className="text-sm font-bold text-slate-800">{pacienteModal.raca || "\u2014"}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ▸ Demografia */}
              <div className="rounded-xl border-l-4 border-violet-500 bg-gradient-to-r from-violet-50/80 to-white p-3.5">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/10"><svg className="h-3.5 w-3.5 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg></div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-violet-700">Demografia</p>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <div>
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Nascimento</p>
                    {editando ? (
                      <input type="text" value={toDisplayDate(formData.data_de_nascimento || "")} onChange={(e) => setFormData({ ...formData, data_de_nascimento: toStorageDate(e.target.value) })} placeholder="DD/MM/AAAA" maxLength={10} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                    ) : (
                      <p className="text-sm font-bold text-slate-800">{formatarData(pacienteModal.data_de_nascimento)}</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Idade</p>
                    <p className="text-sm font-bold text-slate-500">{pacienteModal.idade ?? "\u2014"}{pacienteModal.idade != null ? " anos" : ""}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Unidade</p>
                    {editando && usuarioRole === "admin" ? (
                      <input type="text" value={formData.unidade || ""} onChange={(e) => setFormData({ ...formData, unidade: e.target.value })} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                    ) : (
                      <p className="text-sm font-bold text-slate-800 break-words">{pacienteModal.unidade || "\u2014"}</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Equipe</p>
                    {editando ? (
                      <input type="text" value={formData.equipe || ""} onChange={(e) => setFormData({ ...formData, equipe: e.target.value })} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                    ) : (
                      <p className="text-sm font-bold text-slate-800">{pacienteModal.equipe || "\u2014"}</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Micro&Aacute;rea</p>
                    {editando ? (
                      <input type="text" value={formData.microarea || ""} onChange={(e) => setFormData({ ...formData, microarea: e.target.value })} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                    ) : (
                      <p className="text-sm font-bold text-slate-800">{pacienteModal.microarea || "\u2014"}</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">&Uacute;lt. Consulta</p>
                    {editando ? (
                      <input type="text" value={toDisplayDate(formData.ult_consulta || "")} onChange={(e) => setFormData({ ...formData, ult_consulta: toStorageDate(e.target.value) })} placeholder="DD/MM/AAAA" maxLength={10} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                    ) : (
                      <p className="text-sm font-bold text-slate-800">{formatarData(pacienteModal.ult_consulta)}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ▸ Escola */}
              <div className="rounded-xl border-l-4 border-emerald-500 bg-gradient-to-r from-emerald-50/80 to-white p-3.5">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10"><svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" /></svg></div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-700">Escola</p>
                </div>
                <div>
                  <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Unidade Escolar</p>
                  {editando ? (
                    <select value={formData.unidade_escolar || ""} onChange={(e) => setFormData({ ...formData, unidade_escolar: e.target.value })} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                      <option value="">Selecione</option>
                      <option value="ESCOLA MUNICIPAL PONTE DOS JESUITAS">ESCOLA MUNICIPAL PONTE DOS JESUITAS</option>
                      <option value="ESCOLA MUNICIPAL RICARDO BRENTANI">ESCOLA MUNICIPAL RICARDO BRENTANI</option>
                      <option value="GET ARMANDO KLABIN">GET ARMANDO KLABIN</option>
                      <option value="ESCOLA MUNICIPAL ROBERTO CIVITA">ESCOLA MUNICIPAL ROBERTO CIVITA</option>
                      <option value="EDI PROFESSOR RUBEM GONCALVES">EDI PROFESSOR RUBEM GONCALVES</option>
                      <option value="EDI PROFESSOR ANTONIO ALFREDO MERCADANTE">EDI PROFESSOR ANTONIO ALFREDO MERCADANTE</option>
                      <option value="EDI PROFESSORA MARIA MESQUITA DE SIQUEIRA">EDI PROFESSORA MARIA MESQUITA DE SIQUEIRA</option>
                      <option value="ESCOLA MUNICIPAL PROFESSOR COQUEIRO">ESCOLA MUNICIPAL PROFESSOR COQUEIRO</option>
                      <option value="ESCOLA MUNICIPAL ANDRE VIDAL DE NEGREIROS">ESCOLA MUNICIPAL ANDRE VIDAL DE NEGREIROS</option>
                      <option value="ESCOLA MUNICIPAL PESTALOZZI">ESCOLA MUNICIPAL PESTALOZZI</option>
                      <option value="ESCOLA MUNICIPAL PROFESSOR DARCY ARAUJO DE MIRANDA">ESCOLA MUNICIPAL PROFESSOR DARCY ARAUJO DE MIRANDA</option>
                      <option value="ESCOLA MUNICIPAL ESC ESP DOUTOR HELIO PELLEGRINO">ESCOLA MUNICIPAL ESC ESP DOUTOR HELIO PELLEGRINO</option>
                      <option value="ESCOLA MUNICIPAL PROFESSORA ZELIA CAROLINA DA SILVA">ESCOLA MUNICIPAL PROFESSORA ZELIA CAROLINA DA SILVA</option>
                      <option value="CIEP 1º DE MAIO">CIEP 1º DE MAIO</option>
                      <option value="CRECHE MUNICIPAL CRIANCA FELIZ">CRECHE MUNICIPAL CRIANCA FELIZ</option>
                      <option value="CRECHE MUNICIPAL SEMENTINHA DO AMOR">CRECHE MUNICIPAL SEMENTINHA DO AMOR</option>
                      <option value="CRECHE MUNICIPAL IRINEA DOS SANTOS PAIVA">CRECHE MUNICIPAL IRINEA DOS SANTOS PAIVA</option>
                      <option value="ESTADUAL PROFESSORA VANIA DO AMARAL MATIAS EDDE">ESTADUAL PROFESSORA VANIA DO AMARAL MATIAS EDDE</option>
                      <option value="ESCOLA MUNICIPAL PROFESSOR JORGE GONCALVES FARINHA">ESCOLA MUNICIPAL PROFESSOR JORGE GONCALVES FARINHA</option>
                      <option value="ESCOLA MUNICIPAL MEDALHISTA OLIMPICO ROBSON DONATO CONCEICAO">ESCOLA MUNICIPAL MEDALHISTA OLIMPICO ROBSON DONATO CONCEICAO</option>
                      <option value="ESCOLA MUNICIPAL MEDALHISTA OLIMPICO THIAGO BRAZ DA SILVA">ESCOLA MUNICIPAL MEDALHISTA OLIMPICO THIAGO BRAZ DA SILVA</option>
                      <option value="CRECHE MUNICIPAL MARLENE DA SILVA CARDOSO">CRECHE MUNICIPAL MARLENE DA SILVA CARDOSO</option>
                      <option value="CRECHE MUNICIPAL MARCOLINA">CRECHE MUNICIPAL MARCOLINA</option>
                      <option value="EDI MEDALHISTA OLIMPICA POLIANA OKIMOTO">EDI MEDALHISTA OLIMPICA POLIANA OKIMOTO</option>
                      <option value="EDI MEDALHISTA OLIMPICO ERLON DE SOUZA SILVA">EDI MEDALHISTA OLIMPICO ERLON DE SOUZA SILVA</option>
                      <option value="ESCOLA MUNICIPAL PROFESSORA ZULMIRA TELLES DA COSTA">ESCOLA MUNICIPAL PROFESSORA ZULMIRA TELLES DA COSTA</option>
                      <option value="ESCOLA MUNICIPAL JOAQUIM DA SILVA GOMES">ESCOLA MUNICIPAL JOAQUIM DA SILVA GOMES</option>
                      <option value="ESCOLA MUNICIPAL MARINHEIRO JOAO CANDIDO">ESCOLA MUNICIPAL MARINHEIRO JOAO CANDIDO</option>
                      <option value="ESCOLA MUNICIPAL LIBERDADE">ESCOLA MUNICIPAL LIBERDADE</option>
                      <option value="ESCOLA MUNICIPAL SINDICALISTA CHICO MENDES">ESCOLA MUNICIPAL SINDICALISTA CHICO MENDES</option>
                      <option value="ESCOLA MUNICIPAL PROFESSORA DIONE FREITAS FELISBERTO DE CARVALHO">ESCOLA MUNICIPAL PROFESSORA DIONE FREITAS FELISBERTO DE CARVALHO</option>
                      <option value="CIEP PAPA JOAO XXIII">CIEP PAPA JOAO XXIII</option>
                      <option value="CRECHE MUNICIPAL SEMPRE VIDA VALE DO SOL">CRECHE MUNICIPAL SEMPRE VIDA VALE DO SOL</option>
                      <option value="CRECHE MUNICIPAL AYRTON SENNA">CRECHE MUNICIPAL AYRTON SENNA</option>
                      <option value="CRECHE MUNICIPAL AMANHECER DE LUZ">CRECHE MUNICIPAL AMANHECER DE LUZ</option>
                      <option value="CRECHE MUNICIPAL LEUZA MARINS NOVAES S SANTOS">CRECHE MUNICIPAL LEUZA MARINS NOVAES S SANTOS</option>
                      <option value="CRECHE MUNICIPAL ZACARIAS - O TRAPALHAO">CRECHE MUNICIPAL ZACARIAS - O TRAPALHAO</option>
                      <option value="EDI LARYSSA SILVA MARTINS">EDI LARYSSA SILVA MARTINS</option>
                      <option value="EDI GUANDU">EDI GUANDU</option>
                      <option value="EDI PROFESSORA ROSA MARIA ALVES DE OLIVEIRA">EDI PROFESSORA ROSA MARIA ALVES DE OLIVEIRA</option>
                      <option value="EDI PROFESSORA SOLANGE INACIA DE SA LACERDA">EDI PROFESSORA SOLANGE INACIA DE SA LACERDA</option>
                      <option value="CRECHE MUNICIPAL SEMPRE VIDA ELZA RABELO DE ANDRADE">CRECHE MUNICIPAL SEMPRE VIDA ELZA RABELO DE ANDRADE</option>
                      <option value="EDI ELIZABETH PAPERA">EDI ELIZABETH PAPERA</option>
                      <option value="EDI RENE BISCAIA RAPOSO">EDI RENE BISCAIA RAPOSO</option>
                      <option value="DEPUTADO BOCAYUVA CUNHA">DEPUTADO BOCAYUVA CUNHA</option>
                      <option value="RAUL RYFF">RAUL RYFF</option>
                      <option value="ESCOLA MUNICIPAL VIVALDO RAMOS DE VASCONCELOS">ESCOLA MUNICIPAL VIVALDO RAMOS DE VASCONCELOS</option>
                      <option value="CIEP ROBERTO MORENA">CIEP ROBERTO MORENA</option>
                      <option value="CRECHE MUNICIPAL TRINTA E UM DE OUTUBRO">CRECHE MUNICIPAL TRINTA E UM DE OUTUBRO</option>
                      <option value="CRECHE MUNICIPAL DANIELA PEREZ">CRECHE MUNICIPAL DANIELA PEREZ</option>
                      <option value="CRECHE MUNICIPAL DJANIRA MARIA RAMOS">CRECHE MUNICIPAL DJANIRA MARIA RAMOS</option>
                      <option value="EDI LARISSA DOS SANTOS ATANAZIO">EDI LARISSA DOS SANTOS ATANAZIO</option>
                      <option value="ESCOLA MUNICIPAL IPEG">ESCOLA MUNICIPAL IPEG</option>
                      <option value="IVO PITANGUY">IVO PITANGUY</option>
                      <option value="CIEP MAJOR MANOEL GOMES ARCHER">CIEP MAJOR MANOEL GOMES ARCHER</option>
                      <option value="CRECHE MUNICIPAL MIRIAM PIRES">CRECHE MUNICIPAL MIRIAM PIRES</option>
                      <option value="ESCOLA MUNICIPAL PROFESSOR ARTHUR THIRE">ESCOLA MUNICIPAL PROFESSOR ARTHUR THIRE</option>
                      <option value="ESCOLA MUNICIPAL PROFESSORA SONIA MOTA MOLISANI">ESCOLA MUNICIPAL PROFESSORA SONIA MOTA MOLISANI</option>
                      <option value="CRECHE MUNICIPAL ADALTO BASTOS">CRECHE MUNICIPAL ADALTO BASTOS</option>
                      <option value="ESCOLA MUNICIPAL RONALD DE CARVALHO">ESCOLA MUNICIPAL RONALD DE CARVALHO</option>
                      <option value="ESCOLA MUNICIPAL TENENTE RENATO CESAR">ESCOLA MUNICIPAL TENENTE RENATO CESAR</option>
                      <option value="ESCOLA MUNICIPAL BENTO DO AMARAL COUTINHO">ESCOLA MUNICIPAL BENTO DO AMARAL COUTINHO</option>
                      <option value="CRECHE MUNICIPAL SEMPRE VIDA PARQUE DE SANTA CRUZ">CRECHE MUNICIPAL SEMPRE VIDA PARQUE DE SANTA CRUZ</option>
                      <option value="EDI PROFESSORA CARMEN FRAGA DE ARAUJO">EDI PROFESSORA CARMEN FRAGA DE ARAUJO</option>
                      <option value="MARIO DE ANDRADE">MARIO DE ANDRADE</option>
                      <option value="ESCOLA MUNICIPAL LOURDES DE LIMA ROCHA">ESCOLA MUNICIPAL LOURDES DE LIMA ROCHA</option>
                      <option value="ESCOLA MUNICIPAL MERALINA DE CASTRO">ESCOLA MUNICIPAL MERALINA DE CASTRO</option>
                      <option value="ESCOLA MUNICIPAL EMILIANO GALDINO">ESCOLA MUNICIPAL EMILIANO GALDINO</option>
                      <option value="ESCOLA MUNICIPAL MARIA DE JESUS OLIVEIRA">ESCOLA MUNICIPAL MARIA DE JESUS OLIVEIRA</option>
                      <option value="CRECHE MUNICIPAL ESTRELA DALVA">CRECHE MUNICIPAL ESTRELA DALVA</option>
                      <option value="ESCOLA MUNICIPAL ESPANHA">ESCOLA MUNICIPAL ESPANHA</option>
                      <option value="ESCOLA MUNICIPAL RIBEIRO COUTO">ESCOLA MUNICIPAL RIBEIRO COUTO</option>
                      <option value="ESCOLA MUNICIPAL DOUTOR JOSE ANTONIO CIRAUDO">ESCOLA MUNICIPAL DOUTOR JOSE ANTONIO CIRAUDO</option>
                      <option value="ESCOLA MUNICIPAL FRANCISCO CALDEIRA DE ALVARENGA">ESCOLA MUNICIPAL FRANCISCO CALDEIRA DE ALVARENGA</option>
                      <option value="ESCOLA MUNICIPAL PRIMÁRIO VERA LÚCIA CHAVES">ESCOLA MUNICIPAL PRIMÁRIO VERA LÚCIA CHAVES</option>
                      <option value="ESCOLA MUNICIPAL HAYDEA VIANNA FIUZA DE CASTRO">ESCOLA MUNICIPAL HAYDEA VIANNA FIUZA DE CASTRO</option>
                      <option value="ESCOLA MUNICIPAL PROFESSORA SILVIA DE ARAUJO TOLEDO">ESCOLA MUNICIPAL PROFESSORA SILVIA DE ARAUJO TOLEDO</option>
                      <option value="CRECHE MUNICIPAL MARIA HELENA PAPERA MONTEIRO">CRECHE MUNICIPAL MARIA HELENA PAPERA MONTEIRO</option>
                      <option value="JOAO VITTA">JOAO VITTA</option>
                      <option value="ESCOLA MUNICIPAL PREFEITO JOAO CARLOS VITAL">ESCOLA MUNICIPAL PREFEITO JOAO CARLOS VITAL</option>
                      <option value="ESCOLA MUNICIPAL GEO JOSE DE MELLO">ESCOLA MUNICIPAL GEO JOSE DE MELLO</option>
                      <option value="ESCOLA MUNICIPAL CORONEL BERTHIER">ESCOLA MUNICIPAL CORONEL BERTHIER</option>
                      <option value="ESCOLA MUNICIPAL PRINCESA ISABEL">ESCOLA MUNICIPAL PRINCESA ISABEL</option>
                      <option value="ESCOLA MUNICIPAL GEO FERNANDO DE AZEVEDO">ESCOLA MUNICIPAL GEO FERNANDO DE AZEVEDO</option>
                      <option value="ESCOLA MUNICIPAL SOCRATES GALVEAS">ESCOLA MUNICIPAL SOCRATES GALVEAS</option>
                      <option value="ESCOLA MUNICIPAL PROFESSORA EULALIA RODRIGUES DE OLIVEIRA VIEIRA">ESCOLA MUNICIPAL PROFESSORA EULALIA RODRIGUES DE OLIVEIRA VIEIRA</option>
                      <option value="CIEP BARAO DE ITARARE">CIEP BARAO DE ITARARE</option>
                      <option value="EDI PROFESSOR CELSO DE ALMEIDA CHAVES">EDI PROFESSOR CELSO DE ALMEIDA CHAVES</option>
                      <option value="ESTADUAL BARAO DO RIO BRANCO">ESTADUAL BARAO DO RIO BRANCO</option>
                      <option value="ESTADUAL PROFESSOR OZEAS GOMES LARANGEIRAS">ESTADUAL PROFESSOR OZEAS GOMES LARANGEIRAS</option>
                      <option value="ESCOLA MUNICIPAL NAIR DA FONSECA">ESCOLA MUNICIPAL NAIR DA FONSECA</option>
                      <option value="EDI PROFESSORA INAIA WANDERLEY CARMO">EDI PROFESSORA INAIA WANDERLEY CARMO</option>
                      <option value="ESCOLA MUNICIPAL NELSON ROMERO">ESCOLA MUNICIPAL NELSON ROMERO</option>
                      <option value="ESCOLA MUNICIPAL FELIPE CAMARAO">ESCOLA MUNICIPAL FELIPE CAMARAO</option>
                      <option value="CIEP MINISTRO MARCOS FREIRE">CIEP MINISTRO MARCOS FREIRE</option>
                      <option value="CIEP DEPUTADO ULYSSES GUIMARAES">CIEP DEPUTADO ULYSSES GUIMARAES</option>
                      <option value="CRECHE MUNICIPAL CHAVE DO TAMANHO">CRECHE MUNICIPAL CHAVE DO TAMANHO</option>
                      <option value="CRECHE MUNICIPAL SEMPRE VIDA ESTRELA DO ALAGADO">CRECHE MUNICIPAL SEMPRE VIDA ESTRELA DO ALAGADO</option>
                      <option value="EDI PROFESSORA MARIA LUIZA JOBIM DE QUEIROZ">EDI PROFESSORA MARIA LUIZA JOBIM DE QUEIROZ</option>
                      <option value="EDI THAMIRIS DE ANDRADE DA SILVA SANTOS">EDI THAMIRIS DE ANDRADE DA SILVA SANTOS</option>
                      <option value="ESCOLA MUNICIPAL JULIO CESARIO DE MELO">ESCOLA MUNICIPAL JULIO CESARIO DE MELO</option>
                      <option value="ESCOLA MUNICIPAL PRIMARIO PARALIMPIADAS RIO 2016">ESCOLA MUNICIPAL PRIMARIO PARALIMPIADAS RIO 2016</option>
                      <option value="ESCOLA MUNICIPAL EMILINHA BORBA">ESCOLA MUNICIPAL EMILINHA BORBA</option>
                      <option value="ESCOLA MUNICIPAL GINASIO PROFESSOR NEEMIAS RODRIGUES DE MELLO">ESCOLA MUNICIPAL GINASIO PROFESSOR NEEMIAS RODRIGUES DE MELLO</option>
                      <option value="S ARNOLDO ABRUZZINI DA FONSECA">S ARNOLDO ABRUZZINI DA FONSECA</option>
                      <option value="ESCOLA MUNICIPAL WALQUIR PEREIRA">ESCOLA MUNICIPAL WALQUIR PEREIRA</option>
                      <option value="ESCOLA MUNICIPAL PROFESSORA CLARA LUCIA DE SOUSA">ESCOLA MUNICIPAL PROFESSORA CLARA LUCIA DE SOUSA</option>
                      <option value="CRECHE MUNICIPAL NARIZINHO">CRECHE MUNICIPAL NARIZINHO</option>
                      <option value="CRECHE MUNICIPAL PEDRINHO">CRECHE MUNICIPAL PEDRINHO</option>
                      <option value="CRECHE MUNICIPAL VOVO BENTA">CRECHE MUNICIPAL VOVO BENTA</option>
                      <option value="CRECHE MUNICIPAL MERILUCE DE OLIVEIRA MULLER">CRECHE MUNICIPAL MERILUCE DE OLIVEIRA MULLER</option>
                      <option value="EDI PROFESSORA KATIA MIRANDA SANTOS">EDI PROFESSORA KATIA MIRANDA SANTOS</option>
                      <option value="EDI MARIA ROSANGELA OLIVEIRA TIA NEGUINHA">EDI MARIA ROSANGELA OLIVEIRA TIA NEGUINHA</option>
                      <option value="EDI PROFESSORA LILIA CHAVES DA COSTA">EDI PROFESSORA LILIA CHAVES DA COSTA</option>
                      <option value="ESCOLA MUNICIPAL PROFESSORA MARIA HELENA ALVES PORTILHO">ESCOLA MUNICIPAL PROFESSORA MARIA HELENA ALVES PORTILHO</option>
                      <option value="ESCOLA MUNICIPAL JAPAO">ESCOLA MUNICIPAL JAPAO</option>
                      <option value="ESCOLA MUNICIPAL ROBERTO COELHO">ESCOLA MUNICIPAL ROBERTO COELHO</option>
                      <option value="ESCOLA MUNICIPAL ADALGIZA NERI">ESCOLA MUNICIPAL ADALGIZA NERI</option>
                      <option value="CRECHE MUNICIPAL CANTINHO DA TIA DOLORES">CRECHE MUNICIPAL CANTINHO DA TIA DOLORES</option>
                      <option value="CRECHE MUNICIPAL SANTA TEREZINHA">CRECHE MUNICIPAL SANTA TEREZINHA</option>
                      <option value="EDI SAO FERNANDO">EDI SAO FERNANDO</option>
                      <option value="ESCOLA MUNICIPAL GENERAL GOMES CARNEIRO">ESCOLA MUNICIPAL GENERAL GOMES CARNEIRO</option>
                      <option value="ESCOLA MUNICIPAL EDUARDO RABELO">ESCOLA MUNICIPAL EDUARDO RABELO</option>
                      <option value="ESCOLA MUNICIPAL PROFESSORA MARIA SANTIAGO">ESCOLA MUNICIPAL PROFESSORA MARIA SANTIAGO</option>
                      <option value="ESCOLA MUNICIPAL LUIS CAETANO DE OLIVEIRA">ESCOLA MUNICIPAL LUIS CAETANO DE OLIVEIRA</option>
                      <option value="ESCOLA MUNICIPAL PROFESSOR FRANCISCO JOSE ANTONIO">ESCOLA MUNICIPAL PROFESSOR FRANCISCO JOSE ANTONIO</option>
                      <option value="CIEP ISMAEL NERY">CIEP ISMAEL NERY</option>
                      <option value="ESCOLA MUNICIPAL PROFESSORA LEILA MEHL MENEZES DE MATTOS">ESCOLA MUNICIPAL PROFESSORA LEILA MEHL MENEZES DE MATTOS</option>
                      <option value="ESCOLA MUNICIPAL GANDHI">ESCOLA MUNICIPAL GANDHI</option>
                      <option value="ESCOLA MUNICIPAL MARIO LAGO">ESCOLA MUNICIPAL MARIO LAGO</option>
                      <option value="CRECHE MUNICIPAL INSPETOR HERALDO CARVALHO DE SOUSA">CRECHE MUNICIPAL INSPETOR HERALDO CARVALHO DE SOUSA</option>
                      <option value="EDI PROFESSORA RAQUEL KELLY LANERA">EDI PROFESSORA RAQUEL KELLY LANERA</option>
                      <option value="ESCOLA MUNICIPAL PROFESSORA FLAVIA DOS SANTOS SOARES">ESCOLA MUNICIPAL PROFESSORA FLAVIA DOS SANTOS SOARES</option>
                      <option value="ESCOLA MUNICIPAL ALVARO VALLE">ESCOLA MUNICIPAL ALVARO VALLE</option>
                      <option value="CIEP ALBERTO PASQUALINI">CIEP ALBERTO PASQUALINI</option>
                      <option value="CRECHE MUNICIPAL MAOS PEQUENAS">CRECHE MUNICIPAL MAOS PEQUENAS</option>
                      <option value="EDI SARGENTO IZO GOMES PATRICIO">EDI SARGENTO IZO GOMES PATRICIO</option>
                      <option value="EDI PROFESSORA ROSELE NICOLAU JORGE COUTINHO">EDI PROFESSORA ROSELE NICOLAU JORGE COUTINHO</option>
                      <option value="EDI JOAO CORREA">EDI JOAO CORREA</option>
                      <option value="ESCOLA MUNICIPAL PROFESSOR JOAO GUALBERTO JORGE DO AMARAL">ESCOLA MUNICIPAL PROFESSOR JOAO GUALBERTO JORGE DO AMARAL</option>
                      <option value="ESCOLA MUNICIPAL MARECHAL PEDRO CAVALCANTI">ESCOLA MUNICIPAL MARECHAL PEDRO CAVALCANTI</option>
                      <option value="ESCOLA MUNICIPAL MANOEL PORTO FILHO">ESCOLA MUNICIPAL MANOEL PORTO FILHO</option>
                      <option value="CIEP DOUTOR NELSON HUNGRIA">CIEP DOUTOR NELSON HUNGRIA</option>
                      <option value="CRECHE MUNICIPAL JARDIM DOS VIEIRAS">CRECHE MUNICIPAL JARDIM DOS VIEIRAS</option>
                      <option value="CRECHE MUNICIPAL SEMPRE VIDA TERRA DA PAZ">CRECHE MUNICIPAL SEMPRE VIDA TERRA DA PAZ</option>
                      <option value="EDI GOUVEIAS">EDI GOUVEIAS</option>
                      <option value="ESCOLA MUNICIPAL FRANKLIN TAVORA">ESCOLA MUNICIPAL FRANKLIN TAVORA</option>
                      <option value="EDI GEOGRAFO AZIZ ABSABER">EDI GEOGRAFO AZIZ ABSABER</option>
                      <option value="ESCOLA MUNICIPAL REPUBLICA ARABE DA SIRIA">ESCOLA MUNICIPAL REPUBLICA ARABE DA SIRIA</option>
                      <option value="ESCOLA MUNICIPAL MIGUEL CALMON">ESCOLA MUNICIPAL MIGUEL CALMON</option>
                      <option value="EDI CESARINHO">EDI CESARINHO</option>
                      <option value="ESCOLA MUNICIPAL ALDEBARA">ESCOLA MUNICIPAL ALDEBARA</option>
                      <option value="ESCOLA MUNICIPAL OTELO DE SOUZA REIS">ESCOLA MUNICIPAL OTELO DE SOUZA REIS</option>
                      <option value="CIEP MAESTRO HEITOR VILLA LOBOS">CIEP MAESTRO HEITOR VILLA LOBOS</option>
                      <option value="CRECHE MUNICIPAL SEMPRE VIDA ANTARES">CRECHE MUNICIPAL SEMPRE VIDA ANTARES</option>
                      <option value="EDI ERASMO CARLOS">EDI ERASMO CARLOS</option>
                      <option value="EDI GAL COSTA">EDI GAL COSTA</option>
                      <option value="REDE PRIVADA">REDE PRIVADA</option>
                      <option value="NÃO MATRICULADO">NÃO MATRICULADO</option>
                      <option value="OUTROS">OUTROS</option>
                    </select>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 w-full">{pacienteModal.unidade_escolar || "\u2014"}</div>
                  )}
                </div>
              </div>

              {/* ▸ Saúde */}
              <div className="rounded-xl border-l-4 border-rose-500 bg-gradient-to-r from-rose-50/80 to-white p-3.5">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-500/10"><svg className="h-3.5 w-3.5 text-rose-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg></div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-rose-700">Sa&uacute;de</p>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Estado Nutricional</p>
                      {editando ? (
                        <select value={formData.estado_nutricional || ""} onChange={(e) => setFormData({ ...formData, estado_nutricional: e.target.value })} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                          <option value="">Selecione...</option>
                          <option value="1 - MAGREZA ACENTUADA">1 - MAGREZA ACENTUADA</option>
                          <option value="2 - MAGREZA">2 - MAGREZA</option>
                          <option value="3 - PESO ADEQUADO">3 - PESO ADEQUADO</option>
                          <option value="4 - RISCO SOBREPESO">4 - RISCO SOBREPESO</option>
                          <option value="5 - OBESIDADE">5 - OBESIDADE</option>
                          <option value="6 - OBESIDADE GRAVE">6 - OBESIDADE GRAVE</option>
                        </select>
                      ) : (
                        <p className="text-sm font-bold text-slate-800">{pacienteModal.estado_nutricional || "\u2014"}</p>
                      )}
                    </div>
                    <div>
                      <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Situa&ccedil;&atilde;o Vacinal</p>
                      {editando ? (
                        <select value={formData.situacao_vacinal || ""} onChange={(e) => setFormData({ ...formData, situacao_vacinal: e.target.value })} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                          <option value="">Selecione...</option>
                          <option value="ESQUEMA VACINAL EM DIA">ESQUEMA VACINAL EM DIA</option>
                          <option value="ESQUEMA VACINAL ATRASADO (DOSE PERDIDA)">ESQUEMA VACINAL ATRASADO (DOSE PERDIDA)</option>
                          <option value="IMUNIZAÇÃO COMPLETA">IMUNIZAÇÃO COMPLETA</option>
                          <option value="RECUSA VACINAL">RECUSA VACINAL</option>
                          <option value="SITUAÇÕES ESPECIAIS">SITUAÇÕES ESPECIAIS</option>
                        </select>
                      ) : (
                        <p className="text-sm font-bold text-slate-800">{pacienteModal.situacao_vacinal || "\u2014"}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Classifica&ccedil;&atilde;o</p>
                    {editando && usuarioRole === "admin" ? (
                      <input type="text" value={formData.classificacao || ""} onChange={(e) => setFormData({ ...formData, classificacao: e.target.value })} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                    ) : (
                      <p className="text-sm font-bold text-slate-800">{pacienteModal.classificacao || "\u2014"}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ▸ Extras */}
              <div className="rounded-xl border-l-4 border-amber-500 bg-gradient-to-r from-amber-50/80 to-white p-3.5">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10"><svg className="h-3.5 w-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg></div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-700">Extras</p>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Benef&iacute;cio</p>
                      {editando ? (
                        <select value={formData.recebe_algum_beneficio || ""} onChange={(e) => setFormData({ ...formData, recebe_algum_beneficio: e.target.value })} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                          <option value="">Selecione...</option>
                          <option value="BF">BF</option>
                          <option value="CFC">CFC</option>
                          <option value="LOAS/BPC">LOAS/BPC</option>
                          <option value="PÉ DE MEIA">PÉ DE MEIA</option>
                          <option value="JÁ É">JÁ É</option>
                          <option value="OUTROS">OUTROS</option>
                          <option value="NÃO RECEBE">NÃO RECEBE</option>
                        </select>
                      ) : (
                        <p className="text-sm font-bold text-slate-800">{pacienteModal.recebe_algum_beneficio || "\u2014"}</p>
                      )}
                    </div>
                    <div>
                      <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Unidade Especializada</p>
                      {editando ? (
                        <input type="text" value={formData.unidade_especializada || ""} onChange={(e) => setFormData({ ...formData, unidade_especializada: e.target.value })} className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                      ) : (
                        <p className="text-sm font-bold text-slate-800">{pacienteModal.unidade_especializada || "\u2014"}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Observa&ccedil;&otilde;es</p>
                    {editando ? (
                      <textarea rows={2} value={formData.observacoes || ""} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} className="w-full resize-none rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                    ) : (
                      <p className="text-sm font-bold text-slate-800 whitespace-pre-wrap">{pacienteModal.observacoes || "\u2014"}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ▸ Acompanhamentos */}
              <div className="rounded-xl border-l-4 border-cyan-500 bg-gradient-to-r from-cyan-50/80 to-white p-3.5">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/10"><svg className="h-3.5 w-3.5 text-cyan-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg></div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-cyan-700">&Uacute;ltimos Acompanhamentos</p>
                  {ultimosAcomps.length > 0 && (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-cyan-500 px-1.5 text-[9px] font-black text-white shadow-sm shadow-cyan-500/30">{ultimosAcomps.length}</span>
                  )}
                </div>
                {ultimosAcomps.length === 0 ? (
                  <p className="text-xs font-semibold text-slate-400 italic">Nenhum acompanhamento registrado.</p>
                ) : (
                  <div className="space-y-1.5">
                    {ultimosAcomps.map((a) => (
                      <div key={a.id} className="flex items-start gap-2.5 rounded-lg bg-white/60 px-3 py-2 ring-1 ring-black/[0.03] transition-colors hover:bg-white">
                        <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-cyan-100 text-cyan-600">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-black text-slate-700">{formatarData(a.data_da_busca)}</span>
                            <span className="rounded-full bg-bordo-50 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-bordo-700 ring-1 ring-bordo-200/50">{a.tipo_busca || "\u2014"}</span>
                          </div>
                          {a.situacao_pos_busca && (
                            <p className="mt-0.5 text-[10px] font-semibold text-slate-400 leading-snug break-words">{a.situacao_pos_busca}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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


