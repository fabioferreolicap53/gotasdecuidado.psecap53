import { useState } from "react";

/**
 * Página de redefinição de senha.
 * processa tokens de reset de senha via PocketBase REST API.
 *
 * Recebe token do index.html via props (window.__authToken).
 */

const PB_URL = import.meta.env.VITE_POCKETBASE_URL as string;
const PB_USERS_COLLECTION = "gotas_de_cuidado_users";

function resetUrl(): string {
  return `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_USERS_COLLECTION}/confirm-password-reset`;
}

function requestResetUrl(): string {
  return `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_USERS_COLLECTION}/request-password-reset`;
}

interface PaginaRedefinicaoProps {
  token?: string;
  action?: "reset_password" | "confirm_email_change";
  onVoltar?: () => void;
}

export default function PaginaRedefinicao({ token, action: _action = "reset_password", onVoltar }: PaginaRedefinicaoProps) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [status, setStatus] = useState<"form" | "loading" | "success" | "error">("form");
  const [error, setError] = useState("");

  // Se não tem token, mostra formulário de solicitação de reset
  if (!token) {
    return <SolicitarReset onVoltar={onVoltar} />;
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Mínimo de 8 caracteres");
      return;
    }

    if (password !== passwordConfirm) {
      setError("Senhas não conferem");
      return;
    }

    setStatus("loading");
    try {
      const resp = await fetch(resetUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ token, password, passwordConfirm }),
      });

      if (resp.ok) {
        setStatus("success");
      } else {
        const data = await resp.json().catch(() => ({}));
        const msg = data.message || "Erro ao redefinir senha";
        if (msg.includes("expired")) setError("Link expirado. Solicite novamente.");
        else if (msg.includes("password")) setError("Senha inválida.");
        else setError(msg || "Erro ao redefinir senha");
        setStatus("error");
      }
    } catch {
      setError("Erro de conexão");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-slate-900">Senha redefinida!</h2>
          <p className="mt-2 text-sm text-slate-500">Agora pode acessar o sistema com a nova senha.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-2xl bg-bordo-600 px-8 py-3 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-bordo-700"
          >
            Acessar o Sistema
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-bordo-500/5 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-bordo-500/5 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-bordo-950 px-8 py-8 text-center">
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />
            <div className="relative">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              </div>
              <h1 className="text-xl font-black tracking-tight text-white">
                Redefinir Senha
              </h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
                Digite a nova senha abaixo
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleResetPassword} className="space-y-5 px-8 py-8">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">
                Nova Senha
              </label>
              <input
                type="password"
                placeholder="Mínimo 8 caracteres"
                autoFocus
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 placeholder-slate-300 outline-none transition-all focus:border-bordo-400/50 focus:bg-white focus:ring-4 focus:ring-bordo-500/5"
              />
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">
                Confirmar Senha
              </label>
              <input
                type="password"
                placeholder="Repita a nova senha"
                value={passwordConfirm}
                onChange={(e) => { setPasswordConfirm(e.target.value); setError(""); }}
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 placeholder-slate-300 outline-none transition-all focus:border-bordo-400/50 focus:bg-white focus:ring-4 focus:ring-bordo-500/5"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-center text-xs font-bold text-rose-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="relative w-full overflow-hidden rounded-2xl bg-bordo-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-bordo-500/20 transition-all hover:bg-bordo-700 hover:shadow-bordo-500/30 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "loading" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Processando...
                </span>
              ) : (
                "Redefinir Senha"
              )}
            </button>

            <button
              type="button"
              onClick={() => window.location.href = "/"}
              className="w-full text-center text-xs font-bold text-slate-400 transition-colors hover:text-slate-600"
            >
              Voltar ao Login
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Sub-componente: formulário de solicitação de reset (quando não tem token) */
function SolicitarReset({ onVoltar }: { onVoltar?: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"form" | "loading" | "success" | "error">("form");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Digite seu email");
      return;
    }

    setStatus("loading");
    try {
      const resp = await fetch(requestResetUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (resp.ok) {
        setStatus("success");
      } else {
        const data = await resp.json().catch(() => ({}));
        setError(data.message || "Erro ao solicitar redefinição");
        setStatus("error");
      }
    } catch {
      setError("Erro de conexão");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
            <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-slate-900">Email enviado!</h2>
          <p className="mt-2 text-sm text-slate-500">Verifique sua caixa de entrada e clique no link para redefinir a senha.</p>
          <button
            onClick={() => window.location.href = "/"}
            className="mt-6 rounded-2xl bg-bordo-600 px-8 py-3 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-bordo-700"
          >
            Voltar ao Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-bordo-500/5 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-bordo-500/5 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-bordo-950 px-8 py-8 text-center">
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />
            <div className="relative">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              </div>
              <h1 className="text-xl font-black tracking-tight text-white">
                Esqueci a Senha
              </h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
                Informe seu email para redefinir
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 px-8 py-8">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">
                Email
              </label>
              <input
                type="email"
                placeholder="exemplo@email.com"
                autoFocus
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 placeholder-slate-300 outline-none transition-all focus:border-bordo-400/50 focus:bg-white focus:ring-4 focus:ring-bordo-500/5"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-center text-xs font-bold text-rose-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="relative w-full overflow-hidden rounded-2xl bg-bordo-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-bordo-500/20 transition-all hover:bg-bordo-700 hover:shadow-bordo-500/30 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "loading" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Enviando...
                </span>
              ) : (
                "Enviar Link de Redefinição"
              )}
            </button>

            <button
              type="button"
              onClick={() => onVoltar ? onVoltar() : window.location.reload()}
              className="w-full text-center text-xs font-bold text-slate-400 transition-colors hover:text-slate-600"
            >
              Voltar ao Login
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
