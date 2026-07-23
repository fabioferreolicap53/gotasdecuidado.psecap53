import { useState } from "react";

/**
 * Página unificada de ações de e-mail:
 * - Reset de senha (com token)
 * - Confirmação de troca de e-mail (com token + senha)
 * - Solicitação de reset (sem token)
 */

const PB_URL = (import.meta.env.VITE_POCKETBASE_URL as string) || "https://centraldedados.dev.br";
const PB_USERS_COLLECTION = "gotas_de_cuidado_users";

function resetUrl(): string {
  return `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_USERS_COLLECTION}/confirm-password-reset`;
}

function confirmEmailChangeUrl(): string {
  return `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_USERS_COLLECTION}/confirm-email-change`;
}

function requestResetUrl(): string {
  return `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_USERS_COLLECTION}/request-password-reset`;
}

interface PaginaRedefinicaoProps {
  token?: string;
  action?: "reset_password" | "confirm_email_change";
  onVoltar?: () => void;
}

export default function PaginaRedefinicao({ token, action = "reset_password", onVoltar }: PaginaRedefinicaoProps) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [status, setStatus] = useState<"form" | "loading" | "success" | "error">("form");
  const [error, setError] = useState("");

  // Se não tem token, mostra formulário de solicitação de reset
  if (!token) {
    return <SolicitarReset onVoltar={onVoltar} />;
  }

  // ── Reset de Senha ──────────────────────────────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("As senhas não conferem.");
      return;
    }

    setStatus("loading");
    try {
      const resp = await fetch(resetUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ token, password, passwordConfirm }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        setStatus("success");
      } else {
        const msg = data.message || "Erro ao redefinir senha";
        if (msg.includes("expired") || msg.includes("expirado")) setError("Link expirado. Solicite uma nova recuperação de senha.");
        else if (msg.includes("invalid") || msg.includes("inválid") || msg.includes("password")) setError("Senha inválida ou link incorreto.");
        else setError(msg);
        setStatus("error");
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setStatus("error");
    }
  };

  // ── Confirmação de Troca de E-mail ──────────────────────────────
  const handleConfirmEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password) {
      setError("Digite sua senha atual para confirmar.");
      return;
    }

    setStatus("loading");
    try {
      const resp = await fetch(confirmEmailChangeUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        setStatus("success");
      } else {
        const msg = data.message || "Erro ao confirmar alteração";
        if (msg.includes("expired") || msg.includes("expirado")) setError("Link expirado. Solicite a alteração de e-mail novamente.");
        else if (msg.includes("invalid") || msg.includes("inválid") || msg.includes("password")) setError("Senha incorreta. Tente novamente.");
        else setError(msg);
        setStatus("error");
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setStatus("error");
    }
  };

  const isEmailChange = action === "confirm_email_change";

  // ── Sucesso ─────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-emerald-500/5 blur-[120px]" />
          <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-emerald-500/5 blur-[100px]" />
        </div>
        <div className="relative w-full max-w-md">
          <div className="absolute -inset-1 rounded-[3rem] bg-gradient-to-b from-emerald-500/10 to-transparent blur-xl" />
          <div className="relative rounded-[3rem] bg-white border border-slate-200 shadow-2xl shadow-slate-200/60 p-8 sm:p-12 text-center">
            <div className="mb-6 flex flex-col items-center">
              <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-xl shadow-emerald-500/20">
                <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black tracking-tight text-slate-900">GOTAS DE</span>
                <span className="text-2xl font-black tracking-tight text-bordo-600">CUIDADO</span>
              </div>
            </div>
            <h2 className="text-xl font-black text-slate-900">
              {isEmailChange ? "E-mail Alterado!" : "Senha Redefinida!"}
            </h2>
            <p className="mt-2 text-sm font-medium text-slate-500">
              {isEmailChange
                ? "Seu endereço de e-mail foi atualizado com sucesso.\nFaça login com o novo e-mail."
                : "Sua senha foi alterada com sucesso.\nAgora pode acessar o sistema com a nova senha."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-8 w-full rounded-2xl bg-bordo-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-bordo-500/20 transition-all hover:bg-bordo-700 hover:shadow-bordo-500/30 active:scale-[0.98]"
            >
              Acessar o Sistema
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Erro ────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-rose-500/5 blur-[120px]" />
          <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-rose-500/5 blur-[100px]" />
        </div>
        <div className="relative w-full max-w-md">
          <div className="absolute -inset-1 rounded-[3rem] bg-gradient-to-b from-rose-500/10 to-transparent blur-xl" />
          <div className="relative rounded-[3rem] bg-white border border-slate-200 shadow-2xl shadow-slate-200/60 p-8 sm:p-12 text-center">
            <div className="mb-6 flex flex-col items-center">
              <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-rose-500 to-rose-600 shadow-xl shadow-rose-500/20">
                <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black tracking-tight text-slate-900">GOTAS DE</span>
                <span className="text-2xl font-black tracking-tight text-bordo-600">CUIDADO</span>
              </div>
            </div>
            <h2 className="text-xl font-black text-slate-900">
              {isEmailChange ? "Não foi possível alterar" : "Link inválido ou expirado"}
            </h2>
            <p className="mt-2 text-sm font-medium text-slate-500">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-8 w-full rounded-2xl bg-bordo-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-bordo-500/20 transition-all hover:bg-bordo-700 hover:shadow-bordo-500/30 active:scale-[0.98]"
            >
              Voltar ao Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Formulário ──────────────────────────────────────────────────
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
                {isEmailChange ? (
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                )}
              </div>
              <h1 className="text-xl font-black tracking-tight text-white">
                {isEmailChange ? "Confirmar Novo E-mail" : "Redefinir Senha"}
              </h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
                {isEmailChange
                  ? "Digite sua senha atual para confirmar"
                  : "Digite a nova senha abaixo"}
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={isEmailChange ? handleConfirmEmailChange : handleResetPassword} className="space-y-5 px-8 py-8">
            {isEmailChange && (
              <div className="rounded-xl border border-bordo-100 bg-bordo-50/50 px-4 py-3 text-center text-xs font-bold text-bordo-600">
                Para confirmar a alteração do seu e-mail, digite sua senha atual.
              </div>
            )}

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">
                {isEmailChange ? "Senha Atual" : "Nova Senha"}
              </label>
              <input
                type="password"
                placeholder={isEmailChange ? "Digite sua senha" : "Mínimo 8 caracteres"}
                autoFocus
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 placeholder-slate-300 outline-none transition-all focus:border-bordo-400/50 focus:bg-white focus:ring-4 focus:ring-bordo-500/5"
                minLength={isEmailChange ? undefined : 8}
              />
            </div>

            {!isEmailChange && (
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
                  minLength={8}
                />
              </div>
            )}

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
                isEmailChange ? "Confirmar Alteração" : "Redefinir Senha"
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

        {/* Crédito */}
        <p className="mt-6 text-center text-[9px] font-medium tracking-[0.08em] text-slate-400/60">
          Desenvolvido por{" "}
          <span className="font-semibold text-slate-500/80">Fabio Ferreira de Oliveira</span>
          <span className="mx-1.5 text-slate-300/40">—</span>
          <span className="text-slate-400/60">DAPS/CAP5.3</span>
        </p>
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
