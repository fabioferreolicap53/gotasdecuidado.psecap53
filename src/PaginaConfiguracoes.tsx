import { useState } from "react";
import PaginaImportacao from "./PaginaImportacao";
import HistoricoImportacoes from "./HistoricoImportacoes";

interface UserConfig {
  nome: string;
  email: string;
  notificacoes: boolean;
  modoEscuro: boolean;
  idioma: string;
}

interface ConfigProps {
  usuarioRole?: string;
}

const PB_URL = (import.meta.env.VITE_POCKETBASE_URL as string) || "https://centraldedados.dev.br";
const PB_USERS_COLLECTION = "gotas_de_cuidado_users";

export default function PaginaConfiguracoes({ usuarioRole }: ConfigProps) {
  const isAdmin = usuarioRole === "admin";
  const [novoEmail, setNovoEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [emailErro, setEmailErro] = useState("");
  const [user, setUser] = useState<UserConfig>(() => {
    try {
      const stored = localStorage.getItem("pb_user");
      if (stored) {
        const u = JSON.parse(stored);
        return {
          nome: u.name ?? "",
          email: u.email ?? "",
          notificacoes: true,
          modoEscuro: false,
          idioma: "pt-BR",
        };
      }
    } catch { /* ignore */ }
    return { nome: "", email: "", notificacoes: true, modoEscuro: false, idioma: "pt-BR" };
  });

  const [mensagem, setMensagem] = useState<string | null>(null);

  async function handleTrocarEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailErro("");

    if (!novoEmail.trim() || novoEmail.trim() === user.email) {
      setEmailErro("Digite um e-mail diferente do atual.");
      return;
    }

    setEmailStatus("loading");
    try {
      const token = localStorage.getItem("pb_auth_token");
      const resp = await fetch(
        `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_USERS_COLLECTION}/request-email-change`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ newEmail: novoEmail.trim() }),
        }
      );
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        setEmailStatus("success");
      } else {
        const msg = data.message || "Erro ao solicitar alteração";
        setEmailErro(msg.includes("already") ? "Este e-mail já está em uso" : msg);
        setEmailStatus("error");
      }
    } catch {
      setEmailErro("Erro de conexão. Tente novamente.");
      setEmailStatus("error");
    }
  }

  async function handleSalvar() {
    try {
      const stored = localStorage.getItem("pb_user");
      const token = localStorage.getItem("pb_auth_token");
      if (stored && token) {
        const u = JSON.parse(stored);
        // Atualiza no PocketBase
        const resp = await fetch(
          `${PB_URL.replace(/\/+$/, "")}/api/collections/${PB_USERS_COLLECTION}/records/${u.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ name: user.nome }),
          }
        );
        if (resp.ok) {
          u.name = user.nome;
          localStorage.setItem("pb_user", JSON.stringify(u));
        }
      }
    } catch { /* ignore */ }
    localStorage.setItem("user_preferences", JSON.stringify({
      notificacoes: user.notificacoes,
      modoEscuro: user.modoEscuro,
      idioma: user.idioma,
    }));
    setMensagem("Configurações salvas com sucesso!");
    setTimeout(() => setMensagem(null), 3000);
  }

  return (
    <>
      {/* Hero — dark premium */}
      <div className="relative overflow-hidden rounded-b-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-bordo-950 px-5 py-4 sm:px-6 sm:py-5 shadow-xl shadow-slate-900/30">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-bordo-500/10 blur-3xl" />
        <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-bordo-600/15 blur-2xl" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-bordo-500/40 to-transparent" />

        <div className="relative mx-auto flex max-w-[1380px] flex-col items-center text-center gap-2 sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-600" />
            <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
              CONFIGURAÇÕES <span className="text-bordo-400 font-bold">do Sistema</span>
            </h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1380px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">

        {/* Mensagem de sucesso */}
        {mensagem && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-700">
            {mensagem}
          </div>
        )}

        {/* ═══ PERFIL DO USUÁRIO ═══════════════════════════════════════ */}
        <section className="rounded-[2rem] border border-slate-200/60 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Perfil do Usuário</h2>
              <p className="text-xs text-slate-400">Informações básicas da conta</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium uppercase tracking-wide text-slate-400">Nome</label>
              <input
                type="text"
                value={user.nome}
                onChange={(e) => setUser({ ...user, nome: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
                placeholder="Seu nome"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Email</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-500"
              />
              <p className="text-sm text-slate-400">Email definido no cadastro</p>
            </div>
          </div>
        </section>

        {/* ═══ TROCA DE E-MAIL ═════════════════════════════════════════ */}
        <section className="rounded-[2rem] border border-slate-200/60 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50">
              <svg className="h-6 w-6 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Alterar E-mail</h2>
              <p className="text-xs text-slate-400">Um link de confirmação será enviado ao novo e-mail</p>
            </div>
          </div>

          {emailStatus === "success" ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-700">
              E-mail de confirmação enviado para <strong>{novoEmail}</strong>. Verifique sua caixa de entrada.
            </div>
          ) : (
            <form onSubmit={handleTrocarEmail} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Novo E-mail</label>
                <input
                  type="email"
                  value={novoEmail}
                  onChange={(e) => { setNovoEmail(e.target.value); setEmailErro(""); setEmailStatus("idle"); }}
                  placeholder="novo@email.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-violet-400 focus:bg-white"
                />
              </div>

              {emailErro && (
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-center text-xs font-bold text-rose-600">
                  {emailErro}
                </div>
              )}

              <button
                type="submit"
                disabled={emailStatus === "loading"}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-violet-200 transition-all hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emailStatus === "loading" ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Enviando...
                  </span>
                ) : (
                  "Enviar Link de Confirmação"
                )}
              </button>
            </form>
          )}
        </section>

        {/* ═══ SEGURANÇA ═══════════════════════════════════════════════ */}
        <section className="rounded-[2rem] border border-slate-200/60 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50">
              <svg className="h-6 w-6 text-rose-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Segurança</h2>
              <p className="text-xs text-slate-400">Gerencie sua sessão</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-100 p-4">
            <div>
              <p className="text-sm font-medium text-slate-700">Sessão Ativa</p>
              <p className="text-sm text-slate-400">Você está logado no sistema</p>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem("pb_auth_token");
                localStorage.removeItem("pb_user");
                window.location.reload();
              }}
              className="inline-flex items-center gap-2.5 rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-rose-200 transition-all hover:bg-rose-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
              Sair
            </button>
          </div>
        </section>

        {/* ═══ BOTÃO SALVAR ═════════════════════════════════════════════ */}
        <div className="flex justify-end">
          <button
            onClick={handleSalvar}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-base font-bold uppercase tracking-wide text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 hover:shadow-xl"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            Salvar Alterações
          </button>
        </div>

        {/* ═══ IMPORTAÇÃO ═══════════════════════════════════════════════ */}
        {isAdmin && (
          <section>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-400">Importação de Dados</h2>
            <PaginaImportacao />
          </section>
        )}

        {/* ═══ HISTÓRICO DE IMPORTAÇÕES ══════════════════════════════ */}
        {isAdmin && (
          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/25">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-tight text-slate-800">Histórico de Importações</h2>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Controle e monitoramento de todas as importações realizadas</p>
              </div>
            </div>
            <HistoricoImportacoes isAdmin={isAdmin} />
          </section>
        )}
      </div>
    </>
  );
}
