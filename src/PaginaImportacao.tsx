import { useState, useRef, useEffect, useCallback } from "react";
import Papa from "papaparse";

/**
 * Pagina de importacao CSV → PocketBase.
 * Executa 100% no frontend, sem server-side hooks.
 *
 * Colecao alvo: VITE_POCKETBASE_COLLECTION (gotas_de_cuidado_pacientes)
 * Lotes de 500 via fetch REST direto ao PocketBase API.
 */

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

// ── Mapeamento CSV → campos da collection ──────────────────────────────

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
  // Match exato
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((a) => normalize(a) === norm)) return field;
  }
  // Match parcial
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((a) => norm.includes(normalize(a)) || normalize(a).includes(norm))) return field;
  }
  return null;
}

// ── Tipos de estado ────────────────────────────────────────────────────

type Stage = "idle" | "reading" | "importing" | "completed" | "error";
type Control = "idle" | "running" | "paused";

interface UploadStatus {
  stage: Stage;
  message: string;
  current: number;
  total: number;
  fileName?: string;
}

interface ImportProgress {
  imported: number;
  total: number;
  errors: number;
}

interface ImportSummary {
  elapsedSec: number;
  errors: number;
  total: number;
  cancelled: boolean;
}

// ── Componente ─────────────────────────────────────────────────────────

export default function PaginaImportacao() {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ stage: "idle", message: "", current: 0, total: 0 });
  const [importControl, setImportControl] = useState<Control>("idle");
  const [importProgress, setImportProgress] = useState<ImportProgress>({ imported: 0, total: 0, errors: 0 });
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const importFlagsRef = useRef({ paused: false, cancelled: false });
  const importStartTimeRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup
  useEffect(() => {
    return () => {
      if (importControl === "running" || importControl === "paused") {
        importFlagsRef.current.cancelled = true;
      }
    };
  }, [importControl]);

  // ── Handlers de controle ────────────────────────────────────────────

  const handlePauseResume = useCallback(() => {
    if (importFlagsRef.current.paused) {
      importFlagsRef.current.paused = false;
      setImportControl("running");
    } else {
      importFlagsRef.current.paused = true;
      setImportControl("paused");
    }
  }, []);

  const handleCancel = useCallback(() => {
    importFlagsRef.current.cancelled = true;
    importFlagsRef.current.paused = false;
    setImportControl("idle");
  }, []);

  const handleReset = useCallback(() => {
    setUploadStatus({ stage: "idle", message: "", current: 0, total: 0 });
    setImportControl("idle");
    setImportProgress({ imported: 0, total: 0, errors: 0 });
    setImportSummary(null);
  }, []);

  // ── Upload + parse + import ─────────────────────────────────────────

  const handleFileUpload = useCallback(async (file: File) => {
    // Validacao
    if (!file.name.endsWith(".csv")) {
      setUploadStatus({ stage: "error", message: "Envie apenas arquivos .csv", current: 0, total: 0 });
      return;
    }

    setImportSummary(null);
    setUploadStatus({ stage: "reading", message: "Lendo arquivo...", current: 0, total: 0, fileName: file.name });
    setImportControl("running");
    importFlagsRef.current = { paused: false, cancelled: false };
    importStartTimeRef.current = Date.now();

    try {
      // Parse CSV
      const csvText = await file.text();
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

      if (parsed.errors.length > 0) {
        console.warn("Avisos do PapaParse:", parsed.errors);
      }

      const headers = parsed.meta.fields ?? [];
      const fieldMap: Record<string, string> = {};
      const mappedFields: string[] = [];

      for (const h of headers) {
        const field = findField(h);
        if (field) {
          fieldMap[h] = field;
          mappedFields.push(field);
        }
      }

      // Validar campos obrigatorios
      if (!mappedFields.includes("nome")) {
        setUploadStatus({ stage: "error", message: `CSV sem coluna "nome". Colunas encontradas: ${headers.join(", ")}`, current: 0, total: 0 });
        setImportControl("idle");
        return;
      }

      // Transformar registros
      const records: Record<string, unknown>[] = [];
      for (const row of parsed.data as Record<string, string>[]) {
        const rec: Record<string, unknown> = {};
        for (const [csvHeader, field] of Object.entries(fieldMap)) {
          const val = (row[csvHeader] ?? "").toString().trim();
          if (val === "" || val === "--") continue;

          // Texto puro
          rec[field] = val;
        }
        // Só incluir se tiver nome
        if (rec.nome) records.push(rec);
      }

      if (records.length === 0) {
        setUploadStatus({ stage: "error", message: "Nenhum registro valido encontrado no CSV.", current: 0, total: 0 });
        setImportControl("idle");
        return;
      }

      // Insercao em lotes
      const BATCH = 500;
      let imported = 0;
      let errors = 0;
      let wasCancelled = false;

      setUploadStatus({ stage: "importing", message: `Importando ${records.length} registros...`, current: 0, total: records.length });
      setImportProgress({ imported: 0, total: records.length, errors: 0 });

      for (let i = 0; i < records.length; i += BATCH) {
        // Verificar cancelamento
        if (importFlagsRef.current.cancelled) {
          wasCancelled = true;
          break;
        }
        // Esperar se pausado
        while (importFlagsRef.current.paused && !importFlagsRef.current.cancelled) {
          await new Promise((r) => setTimeout(r, 200));
        }
        if (importFlagsRef.current.cancelled) {
          wasCancelled = true;
          break;
        }

        // Lote
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

        results.forEach((r) => (r.status === "fulfilled" ? imported++ : errors++));

        setImportProgress({ imported, total: records.length, errors });
        setUploadStatus({ stage: "importing", message: `${imported} registros importados...`, current: imported, total: records.length });
      }

      // Finalizar
      const elapsed = Math.round((Date.now() - importStartTimeRef.current) / 1000);
      setImportSummary({ elapsedSec: elapsed, errors, total: records.length, cancelled: wasCancelled });
      setUploadStatus({ stage: "completed", message: wasCancelled ? "Importacao interrompida" : "Importacao concluida!", current: imported, total: records.length });
      setImportControl("idle");
    } catch (err: unknown) {
      const elapsed = Math.round((Date.now() - importStartTimeRef.current) / 1000);
      setImportSummary({ elapsedSec: elapsed, errors: 0, total: 0, cancelled: false });
      setUploadStatus({ stage: "error", message: `Erro: ${err instanceof Error ? err.message : "Falha na comunicacao"}`, current: 0, total: 0 });
      setImportControl("idle");
    }
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  const progressPct = importProgress.total > 0 ? Math.round((importProgress.imported / importProgress.total) * 100) : 0;

  // ── RENDER ──────────────────────────────────────────────────────────

  return (
    <>
      <div className="max-w-3xl mx-auto">

        {/* ── Estado IDLE: Drop Zone ──────────────────────────────────── */}
        {uploadStatus.stage === "idle" && (
          <div className="rounded-[2.5rem] border border-slate-200/60 bg-white p-8 shadow-sm">
            <p className="text-xl font-black uppercase tracking-tight text-slate-800">Importar CSV</p>
            <p className="mb-6 text-xs font-bold uppercase tracking-widest text-slate-400">Adicione registros a base de pacientes</p>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file) handleFileUpload(file);
              }}
              className="group flex cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 transition-all duration-300 hover:border-blue-400 hover:bg-white hover:shadow-xl hover:shadow-blue-500/5"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 transition-all group-hover:bg-blue-600">
                <svg className="h-8 w-8 text-blue-600 transition-all group-hover:scale-110 group-hover:text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                </svg>
              </div>
              <p className="mb-1 text-sm font-semibold text-slate-600">Solte o CSV aqui</p>
              <p className="text-xs text-slate-400">ou clique para navegar</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = "";
              }}
            />

            <p className="mt-4 text-center text-xs text-slate-400">
              Formato aceito: .csv &bull; Colecao: {PB_COLLECTION}
            </p>
          </div>
        )}

        {/* ── Estado IMPORTING ───────────────────────────────────────── */}
        {uploadStatus.stage === "importing" && (
          <div className="rounded-[2.5rem] border border-blue-100 bg-white p-8 shadow-sm">
            {/* Header */}
            <div className="mb-4 flex items-center gap-3">
              {importControl === "running" && (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
              )}
              {importControl === "paused" && (
                <div className="h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
              )}
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-blue-600">
                  {importControl === "paused" ? "PAUSADO" : "IMPORTANDO"}
                </p>
                <p className="text-sm text-slate-500">{uploadStatus.fileName}</p>
              </div>
            </div>

            {/* Barra de progresso */}
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span>{importProgress.imported} / {importProgress.total} registros</span>
              <span className="font-bold">{progressPct}%</span>
            </div>
            <div className="mb-5 h-3 w-full overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Metricas */}
            <div className="mb-5 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Tempo</p>
                <p className="text-sm font-bold text-slate-700">{formatTime(Math.round((Date.now() - importStartTimeRef.current) / 1000))}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Erros</p>
                <p className={`text-sm font-bold ${importProgress.errors > 0 ? "text-red-600" : "text-emerald-600"}`}>{importProgress.errors}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Restante</p>
                <p className="text-sm font-bold text-slate-700">
                  {importProgress.total - importProgress.imported > 0
                    ? `${importProgress.total - importProgress.imported} reg.`
                    : "..."}
                </p>
              </div>
            </div>

            {/* Controles */}
            <div className="flex gap-3">
              <button
                onClick={handlePauseResume}
                className="flex-1 rounded-2xl bg-amber-500 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600"
              >
                {importControl === "paused" ? "▶ Continuar" : "⏸ Pausar"}
              </button>
              <button
                onClick={handleCancel}
                className="rounded-2xl bg-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600 transition-all hover:bg-slate-300"
              >
                ⏹ Interromper
              </button>
            </div>
          </div>
        )}

        {/* ── Estado COMPLETED ────────────────────────────────────────── */}
        {uploadStatus.stage === "completed" && importSummary && (
          <div className={`rounded-[2.5rem] border p-8 shadow-sm ${importSummary.cancelled ? "border-amber-200 bg-amber-50" : "border-emerald-100 bg-emerald-50"}`}>
            <div className="mb-4 flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${importSummary.cancelled ? "bg-amber-500 shadow-lg shadow-amber-200" : "bg-emerald-500 shadow-lg shadow-emerald-200"}`}>
                {importSummary.cancelled ? (
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" /></svg>
                ) : (
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                )}
              </div>
              <div>
                <p className="text-lg font-black uppercase tracking-tight text-slate-800">
                  {importSummary.cancelled ? "Importacao Interrompida" : "Importacao Concluida!"}
                </p>
                <p className="text-xs text-slate-500">{uploadStatus.fileName}</p>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white p-3 text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Registros</p>
                <p className="text-xl font-bold text-slate-800">{importSummary.total.toLocaleString("pt-BR")}</p>
              </div>
              <div className="rounded-xl bg-white p-3 text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Duracao</p>
                <p className="text-xl font-bold text-slate-800">{formatTime(importSummary.elapsedSec)}</p>
              </div>
              <div className="rounded-xl bg-white p-3 text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Falhas</p>
                <p className={`text-xl font-bold ${importSummary.errors > 0 ? "text-red-600" : "text-emerald-600"}`}>{importSummary.errors}</p>
              </div>
            </div>

            <button onClick={handleReset} className="w-full rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-200">
              Voltar
            </button>
          </div>
        )}

        {/* ── Estado ERROR ────────────────────────────────────────────── */}
        {uploadStatus.stage === "error" && (
          <div className="rounded-[2.5rem] border border-red-100 bg-red-50 p-8 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 shadow-lg shadow-red-200">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" /></svg>
              </div>
              <p className="text-lg font-black uppercase tracking-tight text-red-700">Erro na Importacao</p>
            </div>
            <p className="mb-5 rounded-xl bg-white p-4 text-sm text-red-600">{uploadStatus.message}</p>
            <button onClick={handleReset} className="w-full rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-200">
              Voltar
            </button>
          </div>
        )}

      </div>
    </>
  );
}
