import { useState, useRef, useEffect, useCallback } from "react";
import Papa from "papaparse";

const PB_URL = (import.meta.env.VITE_POCKETBASE_URL as string) || "https://centraldedados.dev.br";
const PB_COLLECTION = import.meta.env.VITE_POCKETBASE_COLLECTION as string;

function pbApiBase(): string {
  return `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_COLLECTION}/records`;
}

function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem("pb_auth_token");
    if (stored) return stored;
  } catch { /* ignore */ }
  const envToken = import.meta.env.VITE_POCKETBASE_TOKEN as string | undefined;
  if (envToken) return envToken;
  return null;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = getAuthToken();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

const FIELD_ALIASES: Record<string, string[]> = {
  unidade: ["UNIDADE", "UNIDADE DE SAUDE", "UBS", "ESTABELECIMENTO"],
  nome: ["NOME", "PACIENTE", "NOME PACIENTE", "NOME DO PACIENTE", "NOME COMPLETO"],
  sexo: ["SEXO", "GENERO", "GÊNERO"],
  raca: ["RACA", "RAÇA", "COR", "ETNIA"],
  idade: ["IDADE", "IDADE ATUAL"],
  data_de_nascimento: ["DATA_DE_NASCIMENTO", "DATA NASCIMENTO", "DATA DE NASCIMENTO", "NASCIMENTO", "DT_NASCIMENTO"],
  equipe: ["EQUIPE", "EQ", "EQUIPE DE SAUDE"],
  microarea: ["MICROAREA", "MICRO AREA", "MICRO"],
  ult_consulta: ["ULT_CONSULTA", "DATA_ULTIMA_CONS_ORICLISTA", "DATA ULTIMA CONS ORICLISTA", "DATA ULTIMA CONSULTA", "DATA ULTIMA CONS", "DATA_ULTIMA_CONS_DENTISTA", "DATA ULTIMA CONS DENTISTA"],
  classificacao: ["CLASSIFICACAO", "CLASSIFICAÇÃO", "TIPO", "CATEGORIA"],
  unidade_escolar: ["UNIDADE_ESCOLAR", "UNIDADE ESCOLAR", "ESCOLA", "ESCOLA DO PACIENTE"],
  estado_nutricional: ["ESTADO_NUTRICIONAL", "ESTADO NUTRICIONAL", "NUTRICIONAL", "ESTADO NUTRI"],
  recebe_algum_beneficio: ["RECEBE_ALGUM_BENEFICIO", "RECEBE_ALGUM_BENEFICIO", "RECEBE ALGUM BENEFICIO", "BENEFICIO", "BENEFÍCIO", "RECEBE BENEFICIO"],
  situacao_vacinal: ["SITUACAO_VACINAL", "SITUAÇÃO VACINAL", "SITUACAO VACINAL", "VACINAL", "VACINA"],
  observacoes: ["OBSERVACOES", "OBSERVAÇÕES", "OBSERVACOES", "OBS", "OBS GERAIS"],
  unidade_especializada: ["UNIDADE_ESPECIALIZADA", "UNIDADE ESPECIALIZADA", "ESPECIALIZADA", "ESPECIALISTA"],
};

function normalize(h: string): string {
  return h.trim().toUpperCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function findField(csvHeader: string): string | null {
  const norm = normalize(csvHeader);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((a) => normalize(a) === norm)) return field;
    if (aliases.some((a) => norm.includes(normalize(a)) || normalize(a).includes(norm))) return field;
  }
  return null;
}

type Step = "upload" | "preview" | "importing" | "completed" | "error";
type Control = "idle" | "running" | "paused";

interface PreviewData {
  fileName: string;
  totalRows: number;
  headers: string[];
  fieldMap: Record<string, string>;
  sample: Record<string, string>[];
}

interface ImportMetrics {
  imported: number;
  total: number;
  errors: number;
  elapsedSec: number;
  speedRegSec: number;
}

interface LogEntry {
  time: string;
  msg: string;
  type: "info" | "success" | "warn" | "error";
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function now(): string {
  return new Date().toLocaleTimeString("pt-BR");
}

// ── Step Indicator ──────────────────────────────────────────────────────

const STEPS = [
  { key: "upload", label: "Upload", icon: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" },
  { key: "preview", label: "Mapeamento", icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" },
  { key: "importing", label: "Importação", icon: "M3 8.25V6.75a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 6.75v1.5M3 8.25v7.5M3 8.25h18m0 0v7.5m-18 0h18" },
  { key: "completed", label: "Resultado", icon: "m4.5 12.75 6 6 9-13.5" },
];

// ── Componente ─────────────────────────────────────────────────────────

export default function PaginaImportacao() {
  const [step, setStep] = useState<Step>("upload");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [control, setControl] = useState<Control>("idle");
  const [metrics, setMetrics] = useState<ImportMetrics>({ imported: 0, total: 0, errors: 0, elapsedSec: 0, speedRegSec: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const flagsRef = useRef({ paused: false, cancelled: false });
  const startTimeRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = useCallback((msg: string, type: LogEntry["type"] = "info") => {
    setLogs((prev) => [...prev, { time: now(), msg, type }]);
  }, []);

  // Tick de elapsed
  useEffect(() => {
    if (step === "importing" && control === "running") {
      tickRef.current = setInterval(() => {
        setMetrics((prev) => {
          const elapsedSec = Math.round((Date.now() - startTimeRef.current) / 1000);
          const speed = elapsedSec > 0 ? Math.round(prev.imported / elapsedSec) : 0;
          return { ...prev, elapsedSec, speedRegSec: speed };
        });
      }, 1000);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [step, control]);

  // Cleanup
  useEffect(() => {
    return () => { flagsRef.current.cancelled = true; };
  }, []);

  // ── Parse CSV → Preview ──────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setErrorMsg("Envie apenas arquivos .csv");
      setStep("error");
      return;
    }

    try {
      const csvText = await file.text();
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      const headers = parsed.meta.fields ?? [];
      const fieldMap: Record<string, string> = {};

      for (const h of headers) {
        const field = findField(h);
        if (field) fieldMap[h] = field;
      }

      if (!Object.values(fieldMap).includes("nome")) {
        setErrorMsg(`Coluna "nome" não encontrada. Colunas: ${headers.join(", ")}`);
        setStep("error");
        return;
      }

      const sample = (parsed.data as Record<string, string>[]).slice(0, 3);

      setPreview({
        fileName: file.name,
        totalRows: parsed.data.length,
        headers,
        fieldMap,
        sample,
      });
      setStep("preview");
      addLog(`Arquivo "${file.name}" lido — ${parsed.data.length} registros encontrados`, "success");
    } catch (err) {
      setErrorMsg(`Erro ao ler arquivo: ${err instanceof Error ? err.message : "Desconhecido"}`);
      setStep("error");
    }
  }, [addLog]);

  // ── Iniciar importação ──────────────────────────────────────────

  const handleStartImport = useCallback(async () => {
    if (!preview) return;

    setStep("importing");
    setControl("running");
    flagsRef.current = { paused: false, cancelled: false };
    startTimeRef.current = Date.now();
    setMetrics({ imported: 0, total: preview.totalRows, errors: 0, elapsedSec: 0, speedRegSec: 0 });
    setLogs([]);
    addLog("Iniciando importação...", "info");

    const BATCH = 500;
    let imported = 0;
    let errors = 0;

    // Re-read file for import
    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setErrorMsg("Arquivo não encontrado. Faça o upload novamente.");
      setStep("error");
      return;
    }

    const csvText = await file.text();
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const records: Record<string, unknown>[] = [];

    for (const row of parsed.data as Record<string, string>[]) {
      const rec: Record<string, unknown> = {};
      for (const [csvHeader, field] of Object.entries(preview.fieldMap)) {
        const val = (row[csvHeader] ?? "").toString().trim();
        if (val === "" || val === "--") continue;
        rec[field] = val;
      }
      if (rec.nome) records.push(rec);
    }

    addLog(`${records.length} registros válidos preparados para importação`, "info");

    for (let i = 0; i < records.length; i += BATCH) {
      if (flagsRef.current.cancelled) {
        addLog("Importação cancelada pelo usuário", "warn");
        break;
      }
      while (flagsRef.current.paused && !flagsRef.current.cancelled) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (flagsRef.current.cancelled) {
        addLog("Importação cancelada pelo usuário", "warn");
        break;
      }

      const batch = records.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((rec) =>
          fetch(pbApiBase(), {
            method: "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify(rec),
          }).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
        )
      );

      results.forEach((r) => {
        if (r.status === "fulfilled") imported++;
        else errors++;
      });

      setMetrics({ imported, total: records.length, errors, elapsedSec: Math.round((Date.now() - startTimeRef.current) / 1000), speedRegSec: 0 });

      addLog(`Lote ${Math.floor(i / BATCH) + 1}/${Math.ceil(records.length / BATCH)} — ${imported} registros`, "info");
    }

    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    const speed = elapsed > 0 ? Math.round(imported / elapsed) : 0;
    setMetrics((prev) => ({ ...prev, elapsedSec: elapsed, speedRegSec: speed }));
    setControl("idle");
    setStep("completed");

    if (flagsRef.current.cancelled) {
      addLog(`Importação interrompida — ${imported} registros importados, ${errors} falhas`, "warn");
    } else {
      addLog(`Importação finalizada — ${imported} registros, ${errors} falhas, ${formatTime(elapsed)}`, "success");
    }
  }, [preview, addLog]);

  // ── Control handlers ────────────────────────────────────────────

  const handlePauseResume = useCallback(() => {
    if (flagsRef.current.paused) {
      flagsRef.current.paused = false;
      setControl("running");
      addLog("Importação retomada", "info");
    } else {
      flagsRef.current.paused = true;
      setControl("paused");
      addLog("Importação pausada", "warn");
    }
  }, [addLog]);

  const handleCancel = useCallback(() => {
    flagsRef.current.cancelled = true;
    flagsRef.current.paused = false;
    setControl("idle");
    addLog("Cancelando importação...", "warn");
  }, [addLog]);

  const handleReset = useCallback(() => {
    setStep("upload");
    setPreview(null);
    setControl("idle");
    setMetrics({ imported: 0, total: 0, errors: 0, elapsedSec: 0, speedRegSec: 0 });
    setLogs([]);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const progressPct = metrics.total > 0 ? Math.round((metrics.imported / metrics.total) * 100) : 0;
  const isPaused = step === "importing" && control === "paused";

  // ── RENDER ──────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto">

      {/* ── Step Indicator ──────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-0">
        {STEPS.map((s, i) => {
          const done = ["preview", "importing", "completed"].includes(step) && ["upload"].includes(s.key)
            || ["importing", "completed"].includes(step) && ["upload", "preview"].includes(s.key)
            || step === "completed" && ["upload", "preview", "importing"].includes(s.key);
          const current = s.key === step;

          return (
            <div key={s.key} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 ${current ? "opacity-100" : done ? "opacity-80" : "opacity-30"}`}>
                <div className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full text-[11px] font-black transition-all duration-300 ${
                  current
                    ? "bg-gradient-to-br from-bordo-500 to-blue-600 text-white shadow-lg shadow-bordo-500/25 ring-2 ring-bordo-400/30 scale-110"
                    : done
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "bg-slate-200 text-slate-400"
                }`}>
                  {done ? (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`hidden sm:inline text-[10px] font-bold uppercase tracking-wider ${
                  current ? "text-slate-700" : done ? "text-emerald-600" : "text-slate-300"
                }`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-2 sm:mx-3 transition-all duration-500 ${
                  done ? "bg-emerald-300" : "bg-slate-200"
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── STEP: UPLOAD ─────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="group relative overflow-hidden rounded-[2rem] border border-slate-200/60 bg-white/80 backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.04)] transition-all duration-500 hover:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.12)]">
          {/* Animated gradient border */}
          <div className="absolute inset-0 rounded-[2rem] p-[1px] opacity-0 transition-opacity duration-500 group-hover:opacity-100 pointer-events-none">
            <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-blue-400/20 via-bordo-400/10 to-blue-400/20" />
          </div>

          <div className="relative p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-black uppercase tracking-tight text-slate-800">Importar CSV</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Adicione registros à base de pacientes</p>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
              className="relative cursor-pointer rounded-[1.5rem] border-2 border-dashed border-slate-200 bg-gradient-to-b from-slate-50/80 to-white p-10 sm:p-14 transition-all duration-500 hover:border-blue-400 hover:bg-white hover:shadow-xl hover:shadow-blue-500/5 group/drop"
            >
              {/* Glow bg */}
              <div className="absolute inset-0 rounded-[1.5rem] bg-gradient-to-br from-blue-500/[0.02] to-bordo-500/[0.02] opacity-0 transition-opacity duration-500 group-hover/drop:opacity-100" />

              <div className="relative flex flex-col items-center justify-center">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 ring-1 ring-blue-200/50 transition-all duration-500 group-hover/drop:scale-110 group-hover/drop:from-blue-600 group-hover/drop:to-indigo-700 group-hover/drop:ring-blue-400/50 group-hover/drop:shadow-2xl group-hover/drop:shadow-blue-500/20">
                  <svg className="h-10 w-10 text-blue-600 transition-all duration-500 group-hover/drop:text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                  </svg>
                </div>
                <p className="mb-1 text-sm font-bold text-slate-600">Solte o arquivo <span className="text-blue-600">CSV</span> aqui</p>
                <p className="text-[11px] text-slate-400 font-medium">ou clique para navegar</p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />

            <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
                Coleção: {PB_COLLECTION}
              </div>
              <span className="text-[10px] font-bold text-slate-400">.csv</span>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP: PREVIEW ────────────────────────────────────────── */}
      {step === "preview" && preview && (
        <div className="space-y-5">
          {/* Summary card */}
          <div className="rounded-[1.5rem] border border-slate-200/60 bg-white/80 backdrop-blur-sm p-6 shadow-sm">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-wider text-slate-700">Pré-visualização</p>
                  <p className="text-[10px] font-semibold text-slate-400">{preview.fileName}</p>
                </div>
              </div>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-[10px] font-black text-violet-700 tabular-nums ring-1 ring-violet-200/50">
                {preview.totalRows.toLocaleString("pt-BR")} registros
              </span>
            </div>

            {/* Mapeamento de colunas */}
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Mapeamento de Colunas</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
              {Object.entries(preview.fieldMap).map(([csv, field]) => (
                <div key={csv} className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                  <svg className="h-3 w-3 flex-shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold text-slate-500 truncate uppercase">{csv}</p>
                    <p className="text-[8px] font-semibold text-emerald-600 truncate">→ {field}</p>
                  </div>
                </div>
              ))}
              {preview.headers.filter((h) => !preview.fieldMap[h]).map((h) => (
                <div key={h} className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 ring-1 ring-rose-100">
                  <svg className="h-3 w-3 flex-shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                  <p className="text-[9px] font-bold text-rose-500 truncate uppercase">{h}</p>
                </div>
              ))}
            </div>

            {/* Amostra */}
            {preview.sample.length > 0 && (
              <>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Amostra (3 primeiros registros)</p>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left text-[10px]">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-3 py-2 font-bold text-slate-500 uppercase tracking-wider">#</th>
                        {Object.entries(preview.fieldMap).slice(0, 6).map(([csv, field]) => (
                          <th key={csv} className="px-3 py-2 font-bold text-slate-500 uppercase tracking-wider">
                            <span className="text-emerald-600">{field}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample.map((row, i) => (
                        <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-bold text-slate-300 tabular-nums">{i + 1}</td>
                          {Object.entries(preview.fieldMap).slice(0, 6).map(([csv]) => (
                            <td key={csv} className="px-3 py-2 text-slate-600 truncate max-w-[120px]">{row[csv] || "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Ações */}
            <div className="mt-6 flex gap-3">
              <button onClick={handleReset} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-all hover:bg-slate-50 hover:border-slate-300">
                Voltar
              </button>
              <button onClick={handleStartImport} className="flex-1 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-violet-500/25 transition-all hover:from-violet-500 hover:to-purple-600 hover:shadow-xl hover:shadow-violet-500/30 hover:-translate-y-0.5 active:translate-y-0">
                Iniciar Importação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP: IMPORTING ──────────────────────────────────────── */}
      {step === "importing" && (
        <div className="space-y-5">
          {/* Progress card */}
          <div className="rounded-[1.5rem] border border-slate-200/60 bg-white/80 backdrop-blur-sm p-6 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 ${
                  isPaused
                    ? "bg-amber-100 text-amber-600 ring-2 ring-amber-300/50 animate-pulse"
                    : "bg-blue-100 text-blue-600 ring-2 ring-blue-300/50"
                }`}>
                  {isPaused ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className={`text-sm font-black uppercase tracking-wider ${
                    isPaused ? "text-amber-700" : "text-blue-700"
                  }`}>
                    {isPaused ? "PAUSADO" : "IMPORTANDO"}
                  </p>
                  <p className="text-[10px] text-slate-500">{preview?.fileName}</p>
                </div>
              </div>
              <span className="text-3xl font-black tabular-nums tracking-tight text-slate-800">
                {progressPct}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="mb-5">
              <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold text-slate-400">
                <span>{metrics.imported.toLocaleString("pt-BR")} / {metrics.total.toLocaleString("pt-BR")} registros</span>
                <span className="text-slate-500">{metrics.imported > 0 && metrics.speedRegSec > 0 ? `${metrics.speedRegSec} reg/s` : ""}</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 via-violet-500 to-bordo-500 transition-all duration-500 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Métricas em tempo real */}
            <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Registros", value: metrics.imported.toLocaleString("pt-BR"), color: "text-blue-700", bg: "bg-blue-50", border: "ring-blue-200/50" },
                { label: "Falhas", value: String(metrics.errors), color: metrics.errors > 0 ? "text-rose-700" : "text-emerald-700", bg: metrics.errors > 0 ? "bg-rose-50" : "bg-emerald-50", border: metrics.errors > 0 ? "ring-rose-200/50" : "ring-emerald-200/50" },
                { label: "Tempo", value: formatTime(metrics.elapsedSec), color: "text-slate-700", bg: "bg-slate-50", border: "ring-slate-200/50" },
                { label: "Velocidade", value: metrics.speedRegSec > 0 ? `${metrics.speedRegSec}/s` : "—", color: "text-violet-700", bg: "bg-violet-50", border: "ring-violet-200/50" },
              ].map((m) => (
                <div key={m.label} className={`rounded-xl ${m.bg} ${m.border} ring-1 p-3 text-center transition-all duration-300`}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{m.label}</p>
                  <p className={`text-base sm:text-lg font-black tabular-nums ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Controles */}
            <div className="flex gap-3">
              <button
                onClick={handlePauseResume}
                className={`flex-1 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all ${
                  isPaused
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-600"
                    : "bg-amber-500 text-white shadow-lg shadow-amber-200 hover:bg-amber-600"
                }`}
              >
                {isPaused ? "▶ Continuar" : "⏸ Pausar"}
              </button>
              <button
                onClick={handleCancel}
                className="rounded-xl bg-slate-100 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-all hover:bg-rose-100 hover:text-rose-600 ring-1 ring-slate-200/50"
              >
                ⏹ Interromper
              </button>
            </div>
          </div>

          {/* Logs ao vivo */}
          <div className="rounded-[1.5rem] border border-slate-200/60 bg-white/80 backdrop-blur-sm p-5 shadow-sm">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Registro de Atividades</p>
            <div className="max-h-32 overflow-y-auto space-y-1 scrollbar-thin">
              {logs.length === 0 && (
                <p className="text-[11px] text-slate-300 italic">Aguardando...</p>
              )}
              {logs.map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px] font-medium font-mono">
                  <span className="text-slate-300 tabular-nums flex-shrink-0">{log.time}</span>
                  <span className={`${
                    log.type === "success" ? "text-emerald-600" :
                    log.type === "warn" ? "text-amber-600" :
                    log.type === "error" ? "text-rose-600" :
                    "text-slate-500"
                  }`}>
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP: COMPLETED ──────────────────────────────────────── */}
      {step === "completed" && (
        <div className="space-y-5">
          <div className={`rounded-[1.5rem] border p-6 shadow-sm bg-white/80 backdrop-blur-sm ${
            metrics.errors > 0 ? "border-amber-200/60" : "border-emerald-200/60"
          }`}>
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg ${
                metrics.errors > 0
                  ? "bg-amber-500 shadow-amber-200"
                  : "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-200"
              }`}>
                {metrics.errors > 0 ? (
                  <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" />
                  </svg>
                ) : (
                  <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-lg font-black uppercase tracking-tight text-slate-800">
                  {metrics.imported === 0 ? "Nenhum registro importado"
                    : metrics.errors > 0 ? "Importação concluída com ressalvas"
                    : "Importação concluída com sucesso!"}
                </p>
                <p className="text-[10px] font-bold text-slate-400">{preview?.fileName}</p>
              </div>
            </div>

            {/* Métricas finais */}
            <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Registros", value: metrics.total.toLocaleString("pt-BR"), icon: "M9 12h3.75M9 15h3.75M9 18h3.75" },
                { label: "Importados", value: metrics.imported.toLocaleString("pt-BR"), color: "text-emerald-600", icon: "m4.5 12.75 6 6 9-13.5" },
                { label: "Falhas", value: String(metrics.errors), color: metrics.errors > 0 ? "text-rose-600" : "text-emerald-600", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71" },
                { label: "Duração", value: formatTime(metrics.elapsedSec), icon: "M12 6v6h4.5" },
              ].map((m) => (
                <div key={m.label} className="rounded-xl bg-white border border-slate-100 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">{m.label}</p>
                  <p className={`text-lg sm:text-xl font-black tabular-nums ${m.color || "text-slate-800"}`}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Logs */}
            <div className="mb-6 rounded-xl bg-slate-50 p-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Detalhes da Importação</p>
              <div className="max-h-40 overflow-y-auto space-y-1 scrollbar-thin">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px] font-medium font-mono">
                    <span className="text-slate-300 tabular-nums flex-shrink-0">{log.time}</span>
                    <span className={`${
                      log.type === "success" ? "text-emerald-600" :
                      log.type === "warn" ? "text-amber-600" :
                      log.type === "error" ? "text-rose-600" :
                      "text-slate-500"
                    }`}>{log.msg}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Velocidade média */}
            <div className="mb-6 rounded-xl bg-gradient-to-r from-blue-50 to-violet-50 p-4 ring-1 ring-blue-200/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Velocidade Média</p>
                  <p className="text-lg font-black text-blue-700 tabular-nums">
                    {metrics.speedRegSec > 0 ? `${metrics.speedRegSec} registros/s` : "—"}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
                  </svg>
                </div>
              </div>
            </div>

            <button onClick={handleReset} className="w-full rounded-xl bg-slate-100 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-all hover:bg-slate-200 ring-1 ring-slate-200/50">
              Nova Importação
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: ERROR ──────────────────────────────────────────── */}
      {step === "error" && (
        <div className="rounded-[1.5rem] border border-rose-200/60 bg-white/80 backdrop-blur-sm p-6 shadow-sm">
          <div className="flex items-center gap-4 mb-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 shadow-lg shadow-rose-200">
              <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-black uppercase tracking-tight text-rose-700">Erro na Importação</p>
              <p className="text-[10px] text-rose-400">Falha ao processar o arquivo</p>
            </div>
          </div>

          <div className="mb-5 rounded-xl bg-rose-50 border border-rose-100 p-4">
            <p className="text-sm font-medium text-rose-700">{errorMsg}</p>
          </div>

          <button onClick={handleReset} className="w-full rounded-xl bg-slate-100 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-all hover:bg-slate-200 ring-1 ring-slate-200/50">
            Tentar Novamente
          </button>
        </div>
      )}
    </div>
  );
}
