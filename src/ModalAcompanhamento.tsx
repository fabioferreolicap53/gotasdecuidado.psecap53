import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Paciente, Acompanhamento } from "./types";
import { buscarAcompanhamentos, criarAcompanhamento, atualizarAcompanhamento, excluirAcompanhamento } from "./pocketbase";

// ── Constantes de domínio ────────────────────────────────────────────────

const TIPOS_BUSCA = [
  "BUSCA ATIVA - VISITA DOMICILIAR REGISTRADA EM PRONTUÁRIO",
  "BUSCA ATIVA - CONTATO TELEFÔNICO (LIGAÇÃO) REGISTRADA EM PRONTUÁRIO",
  "BUSCA ATIVA - MENSAGEM REGISTRADA EM PRONTUÁRIO",
];

const TIPOS_CONTATO = [
  "CONTATO DIRETO (CONVERSA)",
  "CONTATO INDIRETO (MENSAGEM)",
  "NÃO HOUVE CONTATO (NÃO LOCALIZADA; LIGAÇÃO NÃO ATENDIDA...)",
];

const ENTRAVES_INFORMADO_POR = [
  "PRÓPRIO PACIENTE",
  "FAMILIAR / RESPONSÁVEL",
  "PROFISSIONAL DE SAÚDE",
  "COMUNIDADE",
  "OUTRO",
];

const SITUAÇÕES_POS_BUSCA = [
  "AGENDAMENTO APÓS CONTATO DIRETO",
  "CONVITE PARA DEMANDA LIVRE",
  "MUDANÇA DE TERRITÓRIO (SITUAÇÃO ATUALIZADA NO PEP)",
  "ÓBITO (SITUAÇÃO ATUALIZADA NO PEP)",
  "NÃO LOCALIZADA",
  "RECUSA",
];

const ENTRAVES_OPTIONS = [
  "HORÁRIOS INCOMPATÍVEIS COM A ROTINA DE TRABALHO",
  "VERGONHA OU CONSTRANGIMENTO DURANTE A CONSULTA",
  "IDEIA EQUIVOCADA SOBRE A NECESSIDADE DA CONSULTA",
  "FAZ ACOMPANHAMENTO PELA REDE PRIVADA",
  "DIFICULDADE DE LOCOMOÇÃO (EX:ACAMADA)",
  "DISTÂNCIA DA UNIDADE",
  "SE RECUSA A FAZER O ACOMPANHAMENTO COM O PROFISSIONAL DA EQUIPE",
  "ESQUECE A DATA DO AGENDAMENTO",
  "INDISPONIBILIDADE DE TEMPO",
  "NÃO IDENTIFICADO ENTRAVE",
];

// ── Helpers ──────────────────────────────────────────────────────────────

function formatarData(dateStr: string): string {
  if (!dateStr) return "";
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function toISO(dia: number, mes: number, ano: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function hojeISO(): string {
  const d = new Date();
  return toISO(d.getDate(), d.getMonth() + 1, d.getFullYear());
}

// ── Props ────────────────────────────────────────────────────────────────

interface Props {
  paciente: Paciente;
  usuarioId: string;
  onFechar: () => void;
  acompanhamentoEdit?: Acompanhamento | null;
  onEditSalvo?: () => void;
}

// ── Ícones reutilizáveis (SVG) ───────────────────────────────────────────

const Icone = {
  calendario: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>,
  busca: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>,
  telefone: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"/></svg>,
  info: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>,
  relogio: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>,
  chat: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"/></svg>,
  check: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>,
  x: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
  seta: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/></svg>,
  setaEsq: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5"/></svg>,
  setaDir: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/></svg>,
  lixo: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>,
  mais: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>,
  prontuario: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.375M9 18h3.375m4.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>,
  alerta: <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>,
};

// ── Calendário popup ─────────────────────────────────────────────────────

const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const ANOS_RANGE = Array.from({ length: new Date().getFullYear() - 1950 + 6 }, (_, i) => 1950 + i);

function parseData(str: string): { d: number; m: number; y: number } | null {
  if (!str) return null;
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

function CalendarioPopup({ valor, onSelecionar, onFechar }: { valor: string; onSelecionar: (data: string) => void; onFechar: () => void }) {
  const parsed = parseData(valor);
  const hoje = new Date();
  const [ano, setAno] = useState(parsed?.y ?? hoje.getFullYear());
  const [mes, setMes] = useState(parsed?.m ?? hoje.getMonth());
  const primeiroDia = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const diaSel = parsed?.d ?? 0;
  const mesSel = parsed?.m ?? -1;
  const anoSel = parsed?.y ?? -1;
  const dias: (number | null)[] = [...Array(primeiroDia).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xl shadow-slate-900/10" style={{ minWidth: 240 }}>
      <div className="mb-2.5 flex items-center justify-between gap-1">
        <button onClick={() => { if (mes === 0) { setMes(11); setAno(ano - 1); } else setMes(mes - 1); }} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
          {Icone.setaEsq}
        </button>
        <div className="flex items-center gap-1">
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-800 cursor-pointer transition-colors hover:border-cyan-300 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20">
            {MESES_PT.map((nome, idx) => <option key={idx} value={idx}>{nome}</option>)}
          </select>
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-800 cursor-pointer transition-colors hover:border-cyan-300 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20">
            {ANOS_RANGE.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <button onClick={() => { if (mes === 11) { setMes(0); setAno(ano + 1); } else setMes(mes + 1); }} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
          {Icone.setaDir}
        </button>
      </div>
      <div className="mb-1.5 grid grid-cols-7 gap-0.5">
        {DIAS_SEMANA.map((d) => <div key={d} className="py-0.5 text-center text-[9px] font-semibold text-slate-400">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {dias.map((dia, i) => {
          if (dia === null) return <div key={`e${i}`} />;
          const selecionado = dia === diaSel && mes === mesSel && ano === anoSel;
          const ehHoje = dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear();
          return (
            <button key={dia} onClick={() => { onSelecionar(toISO(dia, mes + 1, ano)); onFechar(); }}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-medium transition-all duration-150 ${
                selecionado
                  ? "bg-gradient-to-br from-slate-800 to-cyan-600 font-bold text-white shadow-md shadow-cyan-500/30"
                  : ehHoje
                    ? "ring-2 ring-cyan-400 font-bold text-cyan-600"
                    : "text-slate-600 hover:bg-cyan-50 hover:text-cyan-600"
              }`}>{dia}</button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
        <button onClick={() => { onSelecionar(""); onFechar(); }} className="text-[10px] font-medium text-slate-400 transition-colors hover:text-red-500">Limpar</button>
        <button onClick={() => { onSelecionar(toISO(hoje.getDate(), hoje.getMonth() + 1, hoje.getFullYear())); onFechar(); }} className="text-[10px] font-bold text-cyan-600 transition-colors hover:text-cyan-700">Hoje</button>
      </div>
    </div>
  );
}

// ── InputData ────────────────────────────────────────────────────────────

function InputData({ valor, onChange, placeholder = "dd/mm/aaaa" }: { valor: string; onChange: (data: string) => void; placeholder?: string }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(formatarData(valor));
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTexto(formatarData(valor)); }, [valor]);

  function abrir(e: React.MouseEvent) {
    e.stopPropagation();
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX });
    }
    setAberto(!aberto);
  }

  function aplicar() {
    const m = texto.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (!m) return;
    let d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    if (y < 100) y += 2000;
    if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900 || y > 2100) return;
    const iso = toISO(d, mo, y);
    onChange(iso);
    setTexto(formatarData(iso));
    setAberto(false);
  }

  useEffect(() => {
    if (!aberto) return;
    function f() { setAberto(false); }
    document.addEventListener("click", f);
    return () => document.removeEventListener("click", f);
  }, [aberto]);

  return (
    <div ref={wrapRef} className="relative">
      <div className={`flex items-center gap-2 rounded-xl border bg-slate-50/80 px-3 py-2.5 transition-all duration-200 focus-within:border-cyan-400/60 focus-within:bg-white focus-within:ring-2 focus-within:ring-cyan-400/15 ${
        valor ? "border-slate-300" : "border-slate-200"
      }`}>
        <span className="flex-shrink-0 text-slate-400">{Icone.calendario}</span>
        <input type="text" value={texto} placeholder={placeholder} maxLength={10}
          className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder-slate-400/70"
          onChange={(e) => setTexto(e.target.value)} onBlur={aplicar} onKeyDown={(e) => { if (e.key === "Enter") aplicar(); }} />
        <button onClick={abrir} className="flex-shrink-0 rounded-md p-0.5 text-slate-400 transition-colors hover:bg-cyan-50 hover:text-cyan-600">
          {Icone.calendario}
        </button>
      </div>
      {aberto && createPortal(
        <div style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 999999 }}>
          <CalendarioPopup valor={valor} onSelecionar={(data) => { onChange(data); setTexto(formatarData(data)); }} onFechar={() => setAberto(false)} />
        </div>, document.body
      )}
    </div>
  );
}

// ── SelectField ──────────────────────────────────────────────────────────

function SelectField({
  label,
  valor,
  onChange,
  opcoes,
  placeholder,
  obrigatorio,
  icone,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: string[];
  placeholder: string;
  obrigatorio?: boolean;
  icone?: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">
        {icone}
        {label}
        {obrigatorio && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <select
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-xl border bg-slate-50/80 px-3 py-2.5 pr-10 text-sm font-semibold outline-none transition-all duration-200 focus:bg-white focus:ring-2 focus:ring-cyan-400/15 ${
            valor
              ? "border-slate-300 text-slate-700 focus:border-cyan-400/60"
              : "border-slate-200 text-slate-400 focus:border-cyan-400/60"
          }`}
        >
          <option value="">{placeholder}</option>
          {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{Icone.seta}</span>
      </div>
    </div>
  );
}

// ── MultiSelect ──────────────────────────────────────────────────────────

function MultiSelect({
  label,
  valores,
  onChange,
  opcoes,
}: {
  label: string;
  valores: string[];
  onChange: (v: string[]) => void;
  opcoes: string[];
}) {
  const [aberto, setAberto] = useState(false);
  const [flip, setFlip] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback((opt: string) => {
    if (valores.includes(opt)) {
      onChange(valores.filter((v) => v !== opt));
    } else {
      onChange([...valores, opt]);
    }
  }, [valores, onChange]);

  useLayoutEffect(() => {
    if (!aberto) {
      setFlip(false);
      return;
    }
    const raf = requestAnimationFrame(() => {
      if (!dropdownRef.current || !wrapRef.current) return;
      const wrap = wrapRef.current;
      const dd = dropdownRef.current;
      const wrapRect = wrap.getBoundingClientRect();
      const ddH = dd.offsetHeight;
      const spaceBelow = window.innerHeight - wrapRect.bottom - 8;
      const spaceAbove = wrapRect.top - 8;
      if (spaceBelow < ddH && spaceAbove >= ddH) {
        setFlip(true);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function f(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("click", f);
    return () => document.removeEventListener("click", f);
  }, [aberto]);

  return (
    <div ref={wrapRef} className="relative">
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">{label}</label>
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className={`flex w-full items-center justify-between rounded-xl border bg-slate-50/80 px-3 py-2.5 text-left text-sm font-semibold transition-all duration-200 focus:bg-white focus:ring-2 focus:ring-cyan-400/15 ${
          valores.length > 0 ? "border-slate-300 text-slate-700" : "border-slate-200 text-slate-400"
        }`}
      >
        <span className="truncate">
          {valores.length === 0 ? "Selecione" : `${valores.length} selecionado${valores.length > 1 ? "s" : ""}`}
        </span>
        <span className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${aberto ? "rotate-180" : ""}`}>{Icone.seta}</span>
      </button>

      {valores.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {valores.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-cyan-50 to-blue-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-cyan-700 border border-cyan-200/60 shadow-sm shadow-cyan-100/50">
              {v.length > 30 ? v.slice(0, 30) + "..." : v}
              <button onClick={(e) => { e.stopPropagation(); toggle(v); }} className="ml-0.5 text-cyan-400 transition-colors hover:text-red-500">✕</button>
            </span>
          ))}
        </div>
      )}

      {aberto && (
        <div
          ref={dropdownRef}
          className={`absolute z-[99999] w-full rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-black/5 ${
            flip ? "bottom-full mb-1.5 top-auto" : "top-full mt-1.5"
          }`}
        >
          <div className="max-h-60 overflow-y-auto p-1">
            {opcoes.map((opt) => {
              const selecionado = valores.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 ${
                    selecionado
                      ? "bg-gradient-to-r from-cyan-50 to-blue-50 text-cyan-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className={`flex h-4.5 w-4.5 flex-shrink-0 items-center justify-center rounded-md border transition-all duration-150 ${
                    selecionado
                      ? "border-cyan-500 bg-gradient-to-br from-cyan-500 to-blue-500 shadow-sm shadow-cyan-400/30"
                      : "border-slate-300"
                  }`}>
                    {selecionado && (
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                    )}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wide leading-tight">{opt}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-slate-100 px-3 py-2">
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="w-full rounded-xl bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all duration-200 hover:from-slate-800 hover:to-cyan-800"
            >
              Concluir ({valores.length} selecionado{valores.length !== 1 ? "s" : ""})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ Componente Principal ════════════════════════════════════════════════

export default function ModalAcompanhamento({ paciente, usuarioId, onFechar, acompanhamentoEdit, onEditSalvo }: Props) {
  const [acompanhamentos, setAcompanhamentos] = useState<Acompanhamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [dataBusca, setDataBusca] = useState(hojeISO());
  const [tipoBusca, setTipoBusca] = useState("");
  const [tipoContato, setTipoContato] = useState("");
  const [entraveInformadoPor, setEntraveInformadoPor] = useState("");
  const [situacaoPosBusca, setSituacaoPosBusca] = useState("");
  const [entravesIdentificados, setEntravesIdentificados] = useState<string[]>([]);
  const [observacoes, setObservacoes] = useState("");

  const [modoForm, setModoForm] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    async function carregar() {
      try {
        setCarregando(true);
        const items = await buscarAcompanhamentos(paciente.id);
        if (!cancel) setAcompanhamentos(items);
      } catch {
        if (!cancel) setErro("Erro ao carregar acompanhamentos");
      } finally {
        if (!cancel) setCarregando(false);
      }
    }
    carregar();
    return () => { cancel = true; };
  }, [paciente.id]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  // Preencher formulário quando editar
  useEffect(() => {
    if (!acompanhamentoEdit) return;
    setDataBusca(acompanhamentoEdit.data_da_busca);
    setTipoBusca(acompanhamentoEdit.tipo_busca);
    setTipoContato(acompanhamentoEdit.tipo_contato);
    setEntraveInformadoPor(acompanhamentoEdit.entrave_informado_por || "");
    setSituacaoPosBusca(acompanhamentoEdit.situacao_pos_busca);
    setEntravesIdentificados(
      acompanhamentoEdit.entraves_identificados
        ? acompanhamentoEdit.entraves_identificados.split(";").map((e) => e.trim()).filter(Boolean)
        : []
    );
    setObservacoes(acompanhamentoEdit.observacoes || "");
    setModoForm(true);
  }, [acompanhamentoEdit]);

  async function handleSalvar() {
    if (!dataBusca) { setToast("Preencha a data da busca"); return; }
    if (!tipoBusca) { setToast("Selecione o tipo de busca"); return; }
    if (!tipoContato) { setToast("Selecione o tipo de contato"); return; }
    if (!situacaoPosBusca) { setToast("Selecione a situação pós busca ativa"); return; }

    setSalvando(true);
    setErro(null);
    try {
      if (acompanhamentoEdit) {
        await atualizarAcompanhamento(acompanhamentoEdit.id, {
          data_da_busca: dataBusca,
          tipo_busca: tipoBusca,
          tipo_contato: tipoContato,
          entrave_informado_por: entraveInformadoPor,
          situacao_pos_busca: situacaoPosBusca,
          entraves_identificados: entravesIdentificados.join("; "),
          observacoes,
        });
        setToast("Registro atualizado com sucesso!");
        onEditSalvo?.();
        setTimeout(() => onFechar(), 800);
      } else {
        const novo = await criarAcompanhamento({
          paciente_id: paciente.id,
          usuario_id: usuarioId,
          data_da_busca: dataBusca,
          tipo_busca: tipoBusca,
          tipo_contato: tipoContato,
          entrave_informado_por: entraveInformadoPor,
          situacao_pos_busca: situacaoPosBusca,
          entraves_identificados: entravesIdentificados.join("; "),
          observacoes,
        });
        setAcompanhamentos((prev) => [novo, ...prev]);
        setToast("Registro salvo com sucesso!");
        limparForm();
        setModoForm(false);
      }
    } catch {
      setErro("Erro ao salvar registro. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  function limparForm() {
    setDataBusca(hojeISO());
    setTipoBusca("");
    setTipoContato("");
    setEntraveInformadoPor("");
    setSituacaoPosBusca("");
    setEntravesIdentificados([]);
    setObservacoes("");
  }

  async function handleExcluir(id: string) {
    if (!confirm("Excluir este registro de acompanhamento?")) return;
    try {
      await excluirAcompanhamento(id);
      setAcompanhamentos((prev) => prev.filter((a) => a.id !== id));
      setToast("Registro excluído.");
    } catch {
      setToast("Erro ao excluir.");
    }
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-start justify-center overflow-y-auto p-2 sm:p-4" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />

      <div className="relative mt-4 sm:mt-8 mb-8 w-full max-w-3xl rounded-2xl bg-white shadow-2xl shadow-slate-900/10" onClick={(e) => e.stopPropagation()}>

        {/* ═══ HEADER PREMIUM ════════════════════════════════════════ */}
        <div className="relative flex items-center gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 px-5 py-5 sm:px-6">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-xl font-black text-white shadow-lg shadow-cyan-500/30 ring-2 ring-white/20">
            {paciente.nome?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-200/70 mb-0.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" /></svg>
              {acompanhamentoEdit ? "EDITAR REGISTRO" : "NOVO ACOMPANHAMENTO"}
            </div>
            <h2 className="truncate text-lg font-black text-white leading-tight">{paciente.nome}</h2>
          </div>
          <div className="flex items-center gap-1.5">
            {!modoForm && (
              <button onClick={() => setModoForm(true)} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-sm ring-1 ring-white/10 transition-all hover:bg-white/20 hover:text-white">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                Novo
              </button>
            )}
            <button onClick={onFechar} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/50 ring-1 ring-white/10 transition-all hover:bg-white/15 hover:text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* ── Toast ──────────────────────────────────────────────────── */}
        {toast && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/20">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
            {toast}
          </div>
        )}

        {/* ── Erro ───────────────────────────────────────────────────── */}
        {erro && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-500/20">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>
            {erro}
          </div>
        )}

        {/* ═══ CORPO ═════════════════════════════════════════════════ */}
        <div className="p-5 sm:p-6">
          {carregando ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-slate-100 border-t-cyan-500" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando registros...</p>
            </div>
          ) : modoForm ? (
            /* ═══ FORMULÁRIO ════════════════════════════════════════ */
            <div className="space-y-4">

              {/* ▸ Busca Ativa */}
              <div className="rounded-xl border-l-4 border-cyan-500 bg-gradient-to-r from-cyan-50/80 to-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/10">
                    <svg className="h-3.5 w-3.5 text-cyan-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>
                  </div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-cyan-700">Busca Ativa</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
                      Data da Busca
                    </label>
                    <InputData valor={dataBusca} onChange={setDataBusca} />
                  </div>
                  <SelectField
                    label="Tipo de Busca"
                    valor={tipoBusca}
                    onChange={setTipoBusca}
                    opcoes={TIPOS_BUSCA}
                    placeholder="Selecione o tipo"
                    obrigatorio
                    icone={undefined}
                  />
                </div>
              </div>

              {/* ▸ Contato e Entraves */}
              <div className="rounded-xl border-l-4 border-violet-500 bg-gradient-to-r from-violet-50/80 to-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/10">
                    <svg className="h-3.5 w-3.5 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"/></svg>
                  </div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-violet-700">Contato e Entraves</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <SelectField
                    label="Tipo de Contato"
                    valor={tipoContato}
                    onChange={setTipoContato}
                    opcoes={TIPOS_CONTATO}
                    placeholder="Selecione"
                    obrigatorio
                    icone={undefined}
                  />
                  <SelectField
                    label="Entrave(s) Informado Por"
                    valor={entraveInformadoPor}
                    onChange={setEntraveInformadoPor}
                    opcoes={ENTRAVES_INFORMADO_POR}
                    placeholder="Selecione"
                    icone={undefined}
                  />
                </div>
              </div>

              {/* ▸ Desfecho */}
              <div className="rounded-xl border-l-4 border-emerald-500 bg-gradient-to-r from-emerald-50/80 to-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10">
                    <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                  </div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-700">Desfecho</p>
                </div>
                <SelectField
                  label="Situa&ccedil;&atilde;o P&oacute;s Busca Ativa"
                  valor={situacaoPosBusca}
                  onChange={setSituacaoPosBusca}
                  opcoes={SITUAÇÕES_POS_BUSCA}
                  placeholder="Selecione o desfecho"
                  obrigatorio
                  icone={undefined}
                />
              </div>

              {/* ▸ Entraves Identificados */}
              <div className="rounded-xl border-l-4 border-amber-500 bg-gradient-to-r from-amber-50/80 to-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10">
                    <svg className="h-3.5 w-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>
                  </div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-700">Entraves Identificados</p>
                </div>
                <MultiSelect
                  label=""
                  valores={entravesIdentificados}
                  onChange={setEntravesIdentificados}
                  opcoes={ENTRAVES_OPTIONS}
                />
              </div>

              {/* ▸ Observações */}
              <div className="rounded-xl border-l-4 border-blue-500 bg-gradient-to-r from-blue-50/80 to-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10">
                    <svg className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"/></svg>
                  </div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-blue-700">Observa&ccedil;&otilde;es</p>
                </div>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none transition-all focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder-slate-400/70 resize-none"
                  placeholder="Descreva aqui detalhes relevantes do atendimento..."
                />
              </div>

              {/* Botões */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button onClick={() => { limparForm(); onFechar(); }} className="text-xs font-bold text-slate-400 transition-colors hover:text-slate-600 px-5 py-2.5">
                  Cancelar
                </button>
                <button onClick={handleSalvar} disabled={salvando}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-500/20 transition-all hover:from-emerald-400 hover:to-emerald-500 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0">
                  {salvando ? (
                    <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> {acompanhamentoEdit ? "Atualizando..." : "Salvando..."}</>
                  ) : (
                    <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg> {acompanhamentoEdit ? "Atualizar" : "Salvar"}</>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* ═══ HISTÓRICO ══════════════════════════════════════════ */
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-slate-50/80 px-4 py-2.5 border border-slate-100">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"/></svg>
                  {acompanhamentos.length} registro{acompanhamentos.length !== 1 ? "s" : ""}
                </div>
                <button onClick={() => setModoForm(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition-all hover:from-cyan-400 hover:to-cyan-500 hover:shadow-md">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                  Novo
                </button>
              </div>

              {acompanhamentos.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-300">
                    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"/></svg>
                  </div>
                  <p className="text-sm font-bold text-slate-400">Nenhum registro de acompanhamento</p>
                  <p className="mt-1 text-xs text-slate-400/70">Registre o primeiro acompanhamento deste paciente</p>
                  <button onClick={() => setModoForm(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-50 to-blue-50 px-4 py-2 text-xs font-bold text-cyan-600 border border-cyan-200/60 transition-colors hover:bg-cyan-100">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                    Registrar Agora
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {acompanhamentos.map((a, idx) => (
                    <div key={a.id} className="group rounded-xl border-l-4 border-cyan-400 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5" style={{ borderLeftColor: idx % 2 === 0 ? "#06b6d4" : "#8b5cf6" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          {/* Header do item */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-700 tabular-nums">
                              <svg className="h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
                              {formatarData(a.data_da_busca)}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-gradient-to-r from-cyan-50 to-blue-50 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-700 ring-1 ring-cyan-200/60">
                              {a.tipo_busca?.length > 45 ? a.tipo_busca.slice(0, 45) + "..." : a.tipo_busca}
                            </span>
                          </div>

                          {/* Detalhes em grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                            {a.tipo_contato && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0">Contato:</span>
                                <span className="font-bold text-slate-700 truncate">{a.tipo_contato}</span>
                              </div>
                            )}
                            {a.situacao_pos_busca && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0">Situa&ccedil;&atilde;o:</span>
                                <span className="font-bold text-slate-700 truncate">{a.situacao_pos_busca}</span>
                              </div>
                            )}
                            {a.entrave_informado_por && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0">Entrave por:</span>
                                <span className="font-bold text-slate-700 truncate">{a.entrave_informado_por}</span>
                              </div>
                            )}
                          </div>

                          {/* Entraves badges */}
                          {a.entraves_identificados && (
                            <div className="flex flex-wrap gap-1.5">
                              {a.entraves_identificados.split(";").map((e) => e.trim()).filter(Boolean).map((e) => (
                                <span key={e} className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-200/60">
                                  {e.length > 35 ? e.slice(0, 35) + "..." : e}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Observações */}
                          {a.observacoes && (
                            <div className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 border border-slate-100">
                              <svg className="h-3 w-3 mt-0.5 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"/></svg>
                              <p className="text-[10px] font-semibold text-slate-500 leading-relaxed">{a.observacoes}</p>
                            </div>
                          )}
                        </div>

                        {/* Ações */}
                        <div className="flex flex-shrink-0 items-start gap-1">
                          <button onClick={() => { /* editar */ }} className="rounded-lg p-1.5 text-slate-300 opacity-0 transition-all duration-200 hover:bg-cyan-50 hover:text-cyan-500 group-hover:opacity-100" title="Editar">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/></svg>
                          </button>
                          <button onClick={() => handleExcluir(a.id)} className="rounded-lg p-1.5 text-slate-300 opacity-0 transition-all duration-200 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100" title="Excluir">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
