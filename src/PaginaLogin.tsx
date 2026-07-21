import { useState } from "react";

/**
 * Tela de autenticação — login via PocketBase REST API.
 * Valida contra collection gotas_de_cuidado_users.
 * Verifica email confirmado antes de permitir acesso.
 */

const PB_URL = import.meta.env.VITE_POCKETBASE_URL as string;
const PB_USERS_COLLECTION = "gotas_de_cuidado_users";

function authUrl(): string {
  return `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_USERS_COLLECTION}/auth-with-password`;
}

function requestResetUrl(): string {
  return `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_USERS_COLLECTION}/request-password-reset`;
}

interface LoginProps {
  onLogin: (token: string, record: { id: string; email: string; name: string; role: string }) => void;
}

export default function PaginaLogin({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [esqueciLoading, setEsqueciLoading] = useState(false);
  const [esqueciMensagem, setEsqueciMensagem] = useState("");


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Preencha email e senha");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(authUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: email.trim(), password }),
      });
      const data = await resp.json();

      if (!resp.ok || !data.token) {
        setError("Email ou senha incorretos");
        return;
      }

      const { token, record } = data;

      // Verificar se email foi confirmado
      if (record.verified === false || record.verified === 0) {
        setError("Email não confirmado. Verifique sua caixa de entrada.");
        return;
      }

      // Salvar token no localStorage
      try {
        localStorage.setItem("pb_auth_token", token);
      } catch { /* ignore */ }

      onLogin(token, {
        id: record.id,
        email: record.email ?? email,
        name: record.name ?? "",
        role: record.role ?? "user",
      });
    } catch {
      setError("Erro ao conectar ao servidor");
    } finally {
      setLoading(false);
    }
  }

  async function handleEsqueciSenha() {
    if (!email.trim()) {
      setError("Digite seu email acima para redefinir a senha");
      return;
    }
    setEsqueciLoading(true);
    setEsqueciMensagem("");
    try {
      const resp = await fetch(requestResetUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (resp.ok) {
        setEsqueciMensagem("Email enviado! Verifique sua caixa de entrada.");
      } else {
        setEsqueciMensagem("Erro ao enviar email. Tente novamente.");
      }
    } catch {
      setEsqueciMensagem("Erro de conexão");
    } finally {
      setEsqueciLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      {/* Orbs decorativos */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-bordo-500/5 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-bordo-500/5 blur-[100px]" />
      </div>

      {/* Linha decorativa topo */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />

      {/* Card login */}
      <div className="relative w-full max-w-md">
        {/* Glow atrás do card */}
        <div className="absolute -inset-1 rounded-[3rem] bg-gradient-to-b from-bordo-500/10 to-transparent blur-xl" />

        <div className="relative rounded-[3rem] bg-white border border-slate-200 shadow-2xl shadow-slate-200/60 p-8 sm:p-12">
          {/* Logo */}
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-bordo-600 shadow-xl shadow-bordo-500/20">
              <svg viewBox="0 0 32 32" fill="none" className="relative h-11 w-11">
                <path d="M16 3C11.5 3 8 5 8 9c0 2 .8 3.5 1.5 5.5C10.5 16.5 11 19 11 22c0 3 2 7 5 7s5-4 5-7c0-3 .5-5.5 1.5-7.5C23.2 12.5 24 11 24 9c0-4-3.5-6-8-6z" fill="white" />
              </svg>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black tracking-tight text-slate-900">GOTAS DE</span>
              <span className="text-2xl font-black tracking-tight text-bordo-600">CUIDADO</span>
            </div>
            <p className="mt-2 text-[10px] font-bold tracking-[0.2em] text-slate-400">MONITORAMENTO DE CRIANÇAS E ADOLESCENTES COM DIABETES E ANEMIA FALCIFORME</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">
                Email
              </label>
              <div className="relative">
                <svg className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
                <input
                  type="email"
                  placeholder="exemplo@email.com"
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 py-4 pl-12 pr-4 text-sm font-medium text-slate-900 placeholder-slate-300 outline-none transition-all focus:border-bordo-400/50 focus:bg-white focus:ring-4 focus:ring-bordo-500/5"
                />
              </div>
            </div>

            {/* Senha */}
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">
                Senha
              </label>
              <div className="relative">
                <svg className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e); }}
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 py-4 pl-12 pr-12 text-sm font-medium text-slate-900 placeholder-slate-300 outline-none transition-all focus:border-bordo-400/50 focus:bg-white focus:ring-4 focus:ring-bordo-500/5"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 transition-colors hover:text-slate-500"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Erro */}
            {error && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-center text-xs font-bold text-rose-600">
                {error}
              </div>
            )}

            {/* Esqueci a senha */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleEsqueciSenha}
                disabled={esqueciLoading}
                className="text-[10px] font-bold text-bordo-500 transition-colors hover:text-bordo-700 disabled:opacity-50"
              >
                {esqueciLoading ? "Enviando..." : "Esqueci a senha"}
              </button>
            </div>

            {esqueciMensagem && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-center text-xs font-bold text-blue-600">
                {esqueciMensagem}
              </div>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              className="relative w-full overflow-hidden rounded-2xl bg-bordo-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-bordo-500/20 transition-all hover:bg-bordo-700 hover:shadow-bordo-500/30 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Autenticando...
                </span>
              ) : (
                "Entrar no Sistema"
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-300">
            Acesso Restrito
          </p>
        </div>
      </div>
    </div>
  );
}
