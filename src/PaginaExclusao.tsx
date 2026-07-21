import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Sistema de exclusão em massa — collection gotas_de_cuidado_pacientes.
 * 100% frontend, fetch REST direto ao PocketBase.
 * Sem SDK, sem framer-motion.
 *
 * Segurança: validação de senha via fetch REST (NÃO authWithPassword do SDK).
 */

const PB_URL = import.meta.env.VITE_POCKETBASE_URL as string;
const PB_COLLECTION = import.meta.env.VITE_POCKETBASE_COLLECTION as string;
const PB_USERS_COLLECTION = "gotas_de_cuidado_users";

function apiBase(): string {
  return `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_COLLECTION}/records`;
}

function usersAuthUrl(): string {
  return `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_USERS_COLLECTION}/auth-with-password`;
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
  const h: Record<string, string> = { "Accept": "application/json" };
  const t = getAuthToken();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

// ── Types ──────────────────────────────────────────────────────────────

type DeleteStage = "idle" | "deleting" | "completed" | "error";
type DeleteControl = "idle" | "running" | "paused";

interface DeleteStatus {
  stage: DeleteStage;
  message: string;
}

interface DeleteProgress {
  deleted: number;
  total: number;
  errors: number;
}

interface DeleteSummary {
  elapsedSec: number;
  errors: number;
  total: number;
  cancelled: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function calcEta(deleted: number, total: number, elapsedMs: number): string {
  if (deleted === 0 || elapsedMs < 1000) return "--";
  const rate = deleted / (elapsedMs / 1000);
  const remaining = total - deleted;
  const etaSec = Math.ceil(remaining / rate);
  return formatTime(etaSec);
}

// ── Componente ─────────────────────────────────────────────────────────

export default function PaginaExclusao() {
  // Status geral
  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>({ stage: "idle", message: "" });
  const [deleteControl, setDeleteControl] = useState<DeleteControl>("idle");
  const [deleteProgress, setDeleteProgress] = useState<DeleteProgress>({ deleted: 0, total: 0, errors: 0 });
  const [deleteSummary, setDeleteSummary] = useState<DeleteSummary | null>(null);
  const [deleteEta, setDeleteEta] = useState("--");

  // Modal senha
  const [showModal, setShowModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Controle assíncrono via useRef
  const flagsRef = useRef({ paused: false, cancelled: false });
  const startTimeRef = useRef(0);
  const etaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef({ deleted: 0, total: 0 });

  // Cleanup
  useEffect(() => {
    return () => {
      if (etaTimerRef.current) clearInterval(etaTimerRef.current);
      if (deleteControl !== "idle") flagsRef.current.cancelled = true;
    };
  }, [deleteControl]);

  // ── Abrir modal ──────────────────────────────────────────────────────

  function handleOpenModal() {
    setPasswordInput("");
    setPasswordError("");
    setShowPassword(false);
    setShowModal(true);
  }

  function handleCloseModal() {
    setShowModal(false);
    setPasswordInput("");
    setPasswordError("");
  }

  // ── Validar senha (fetch REST — NÃO authWithPassword do SDK) ─────────
  // Usa email do user logado + senha digitada no modal.
  // Apenas role "admin" pode excluir.

  function getLoggedEmail(): string {
    try {
      const stored = localStorage.getItem("pb_user");
      if (stored) {
        const user = JSON.parse(stored);
        return user.email ?? "";
      }
    } catch { /* ignore */ }
    return "";
  }

  async function handleConfirmPassword(): Promise<boolean> {
    if (!passwordInput.trim()) {
      setPasswordError("Digite sua senha");
      return false;
    }

    const email = getLoggedEmail();
    if (!email) {
      setPasswordError("Sessão expirada. Faça login novamente");
      return false;
    }

    try {
      const resp = await fetch(usersAuthUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: email, password: passwordInput }),
      });
      const data = await resp.json();

      if (!resp.ok || !data.token) {
        setPasswordError("Senha incorreta");
        return false;
      }

      if (data.record?.role !== "admin") {
        setPasswordError("Apenas administradores podem excluir dados");
        return false;
      }

      return true;
    } catch {
      setPasswordError("Erro ao validar senha");
      return false;
    }
  }

  // ── Iniciar exclusão ─────────────────────────────────────────────────

  const handleStartDelete = useCallback(async () => {
    // Validar senha
    const ok = await handleConfirmPassword();
    if (!ok) return;

    // Fechar modal e preparar
    setShowModal(false);
    setPasswordInput("");
    setPasswordError("");

    setDeleteStatus({ stage: "deleting", message: "Buscando registros..." });
    setDeleteControl("running");
    setDeleteProgress({ deleted: 0, total: 0, errors: 0 });
    setDeleteSummary(null);
    setDeleteEta("--");

    flagsRef.current = { paused: false, cancelled: false };
    startTimeRef.current = Date.now();
    progressRef.current = { deleted: 0, total: 0 };

    // Timer de ETA
    etaTimerRef.current = setInterval(() => {
      const p = progressRef.current;
      const elapsed = Date.now() - startTimeRef.current;
      setDeleteEta(calcEta(p.deleted, p.total, elapsed));
    }, 2000);

    try {
      // Buscar todos os IDs via REST paginado
      let allIds: string[] = [];
      let page = 1;
      const perPage = 5000;

      while (true) {
        if (flagsRef.current.cancelled) throw new Error("Cancelado");

        const res = await fetch(`${apiBase()}?page=${page}&perPage=${perPage}&fields=id`, {
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error(`Erro HTTP ${res.status} ao buscar registros`);
        const data = await res.json();
        allIds = allIds.concat(data.items.map((r: { id: string }) => r.id));
        if (allIds.length >= data.totalItems) break;
        page++;
      }

      if (allIds.length === 0) {
        setDeleteSummary({ elapsedSec: 0, errors: 0, total: 0, cancelled: false });
        setDeleteStatus({ stage: "completed", message: "Nenhum registro encontrado para excluir." });
        setDeleteControl("idle");
        if (etaTimerRef.current) clearInterval(etaTimerRef.current);
        return;
      }

      const total = allIds.length;
      progressRef.current.total = total;
      setDeleteProgress({ deleted: 0, total, errors: 0 });
      setDeleteStatus({ stage: "deleting", message: `Excluindo ${total} registros...` });

      // Exclusão em lotes
      const BATCH = 100;
      let deleted = 0;
      let errors = 0;
      let wasCancelled = false;

      for (let i = 0; i < total; i += BATCH) {
        if (flagsRef.current.cancelled) { wasCancelled = true; break; }

        // Esperar se pausado
        while (flagsRef.current.paused && !flagsRef.current.cancelled) {
          await new Promise((r) => setTimeout(r, 200));
        }
        if (flagsRef.current.cancelled) { wasCancelled = true; break; }

        // Lote com Promise.allSettled
        const batch = allIds.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map((id) =>
            fetch(`${apiBase()}/${id}`, {
              method: "DELETE",
              headers: authHeaders(),
            }).then((res) => {
              if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
              return res;
            })
          )
        );

        results.forEach((r) => (r.status === "fulfilled" ? deleted++ : errors++));

        progressRef.current.deleted = deleted;
        setDeleteProgress({ deleted, total, errors });
        setDeleteStatus({ stage: "deleting", message: `${deleted} registros excluídos...` });
      }

      // Finalizar
      if (etaTimerRef.current) clearInterval(etaTimerRef.current);
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      setDeleteSummary({ elapsedSec: elapsed, errors, total, cancelled: wasCancelled });
      setDeleteStatus({ stage: "completed", message: wasCancelled ? "Exclusão interrompida" : "Exclusão concluída!" });
      setDeleteControl("idle");
    } catch (err) {
      if (etaTimerRef.current) clearInterval(etaTimerRef.current);
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      const msg = err instanceof Error ? err.message : "Falha na comunicação";
      if (msg === "Cancelado") {
        const p = progressRef.current;
        setDeleteSummary({ elapsedSec: elapsed, errors: p.total > 0 ? 0 : 0, total: p.total, cancelled: true });
        setDeleteStatus({ stage: "completed", message: "Exclusão interrompida" });
      } else {
        setDeleteSummary({ elapsedSec: elapsed, errors: 0, total: 0, cancelled: false });
        setDeleteStatus({ stage: "error", message: msg });
      }
      setDeleteControl("idle");
    }
  }, [passwordInput]);

  // ── Controles ────────────────────────────────────────────────────────

  function handlePauseResume() {
    if (flagsRef.current.paused) {
      flagsRef.current.paused = false;
      setDeleteControl("running");
    } else {
      flagsRef.current.paused = true;
      setDeleteControl("paused");
    }
  }

  function handleCancel() {
    flagsRef.current.cancelled = true;
    flagsRef.current.paused = false;
    setDeleteControl("idle");
  }

  function handleReset() {
    setDeleteStatus({ stage: "idle", message: "" });
    setDeleteControl("idle");
    setDeleteProgress({ deleted: 0, total: 0, errors: 0 });
    setDeleteSummary(null);
    setDeleteEta("--");
  }

  // ── RENDER ──────────────────────────────────────────────────────────

  return (
    <>
      {/* ═══ MODAL DE SENHA ═══════════════════════════════════════════ */}
      {showModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={handleCloseModal}
        >
          <div
            className="relative w-full max-w-md rounded-[2.5rem] border border-rose-100 bg-white p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Decoração */}
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-rose-500/5 blur-3xl" />
            <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-rose-500/5 blur-3xl" />

            {/* Header */}
            <div className="relative mb-5 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 shadow-lg shadow-rose-200">
                <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-black uppercase tracking-tight text-slate-800">Confirmação de Segurança</p>
                <p className="text-xs font-bold uppercase tracking-widest text-rose-500">Ação irreversível</p>
              </div>
            </div>

            {/* Aviso */}
            <div className="relative mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm text-rose-700">
                Esta ação irá remover permanentemente <strong>TODOS</strong> os registros da coleção <strong>{PB_COLLECTION}</strong>. Esta operação não pode ser desfeita.
              </p>
            </div>

            {/* Input senha */}
            <div className="relative mb-5">
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                Digite sua senha para confirmar
              </label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoFocus
                  value={passwordInput}
                  onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleStartDelete(); }}
                  className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 py-4 pl-11 pr-12 text-sm text-slate-700 outline-none transition-colors focus:border-rose-400 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordError && (
                <p className="mt-2 text-xs text-rose-600">{passwordError}</p>
              )}
            </div>

            {/* Botões */}
            <div className="relative flex gap-3">
              <button onClick={handleCloseModal} className="flex-1 rounded-2xl bg-slate-100 px-4 py-4 text-xs font-bold uppercase tracking-widest text-slate-600 transition-all hover:bg-slate-200">
                Cancelar
              </button>
              <button onClick={handleStartDelete} className="flex-1 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 px-4 py-4 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-rose-200 transition-all hover:from-rose-700 hover:to-rose-800">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ESTADO IDLE: Card de Ação ════════════════════════════════ */}
      {deleteStatus.stage === "idle" && (
        <div className="rounded-[2.5rem] border border-slate-200/60 bg-white p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-rose-50">
              <svg className="h-6 w-6 text-rose-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-lg font-black uppercase tracking-tight text-slate-800">Excluir Todos os Pacientes</p>
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">Ação permanente e irreversível</p>
              <p className="text-sm text-slate-500">
                Esta ação remove permanentemente todos os dados da coleção <strong>{PB_COLLECTION}</strong>.
                Você precisará reimportar os dados via CSV.
              </p>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              onClick={handleOpenModal}
              className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-rose-200 transition-all hover:bg-rose-700 hover:shadow-xl hover:shadow-rose-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
              Excluir Tudo
            </button>
          </div>
        </div>
      )}

      {/* ═══ ESTADO DELETING ══════════════════════════════════════════ */}
      {deleteStatus.stage === "deleting" && (
        <div className="rounded-[2.5rem] border border-rose-100 bg-white p-8 shadow-sm">
          {/* Header */}
          <div className="mb-4 flex items-center gap-3">
            {deleteControl === "running" && (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-rose-200 border-t-rose-600" />
            )}
            {deleteControl === "paused" && (
              <div className="h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
            )}
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-rose-600">
                {deleteControl === "paused" ? "PAUSADO" : "EXCLUINDO"}
              </p>
              <p className="text-sm text-slate-500">{deleteStatus.message}</p>
            </div>
          </div>

          {/* Barra de progresso */}
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span>{deleteProgress.deleted} / {deleteProgress.total} registros</span>
            <span className="font-bold">
              {deleteProgress.total > 0 ? Math.round((deleteProgress.deleted / deleteProgress.total) * 100) : 0}%
            </span>
          </div>
          <div className="mb-5 h-3 w-full overflow-hidden rounded-full bg-rose-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-600 transition-all duration-300"
              style={{ width: `${deleteProgress.total > 0 ? (deleteProgress.deleted / deleteProgress.total) * 100 : 0}%` }}
            />
          </div>

          {/* Métricas */}
          <div className="mb-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 p-2.5 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Tempo</p>
              <p className="text-sm font-bold text-slate-700">{formatTime(Math.round((Date.now() - startTimeRef.current) / 1000))}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Erros</p>
              <p className={`text-sm font-bold ${deleteProgress.errors > 0 ? "text-rose-600" : "text-emerald-600"}`}>{deleteProgress.errors}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Estimado</p>
              <p className="text-sm font-bold text-slate-700">{deleteEta}</p>
            </div>
          </div>

          {/* Controles */}
          <div className="flex gap-3">
            <button
              onClick={handlePauseResume}
              className="flex-1 rounded-2xl bg-amber-500 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600"
            >
              {deleteControl === "paused" ? "\u25B6 Continuar" : "\u23F8 Pausar"}
            </button>
            <button
              onClick={handleCancel}
              className="rounded-2xl bg-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600 transition-all hover:bg-slate-300"
            >
              \u23F9 Interromper
            </button>
          </div>
        </div>
      )}

      {/* ═══ ESTADO COMPLETED ═════════════════════════════════════════ */}
      {deleteStatus.stage === "completed" && deleteSummary && (
        <div className={`rounded-[2.5rem] border p-8 shadow-sm ${deleteSummary.cancelled ? "border-amber-200 bg-amber-50" : "border-emerald-100 bg-emerald-50"}`}>
          <div className="mb-4 flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${deleteSummary.cancelled ? "bg-amber-500 shadow-lg shadow-amber-200" : "bg-emerald-500 shadow-lg shadow-emerald-200"}`}>
              {deleteSummary.cancelled ? (
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" /></svg>
              ) : (
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              )}
            </div>
            <div>
              <p className="text-lg font-black uppercase tracking-tight text-slate-800">
                {deleteSummary.cancelled ? "Exclusão Interrompida" : "Exclusão Concluída!"}
              </p>
              <p className="text-xs text-slate-500">Coleção {PB_COLLECTION}</p>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white p-3 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Registros</p>
              <p className="text-xl font-bold text-slate-800">{deleteSummary.total.toLocaleString("pt-BR")}</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Duração</p>
              <p className="text-xl font-bold text-slate-800">{formatTime(deleteSummary.elapsedSec)}</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Falhas</p>
              <p className={`text-xl font-bold ${deleteSummary.errors > 0 ? "text-rose-600" : "text-emerald-600"}`}>{deleteSummary.errors}</p>
            </div>
          </div>

          <button onClick={handleReset} className="w-full rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-200">
            Voltar
          </button>
        </div>
      )}

      {/* ═══ ESTADO ERROR ══════════════════════════════════════════════ */}
      {deleteStatus.stage === "error" && (
        <div className="rounded-[2.5rem] border border-rose-100 bg-rose-50 p-8 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 shadow-lg shadow-rose-200">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" /></svg>
            </div>
            <p className="text-lg font-black uppercase tracking-tight text-rose-700">Erro na Exclusão</p>
          </div>
          <p className="mb-5 rounded-xl bg-white p-4 text-sm text-rose-600">{deleteStatus.message}</p>
          <button onClick={handleReset} className="w-full rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-200">
            Voltar
          </button>
        </div>
      )}
    </>
  );
}
