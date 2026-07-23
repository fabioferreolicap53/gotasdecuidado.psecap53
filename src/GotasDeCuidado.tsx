import { useState, useCallback, useEffect } from "react";
import PaginaResumo from "./PaginaResumo";
import PaginaPacientes from "./PaginaPacientes";
import PaginaFavoritos from "./PaginaFavoritos";
import PaginaAcompanhamentos from "./PaginaAcompanhamentos";
import PaginaConfiguracoes from "./PaginaConfiguracoes";
import PaginaLogin from "./PaginaLogin";
import PaginaRedefinicao from "./PaginaRedefinicao";

// ── Tipos ───────────────────────────────────────────────────────────────

type Pagina = "resumo" | "pacientes" | "favoritos" | "acompanhamentos" | "configuracoes";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  unidade: string;
}

// ── Header Premium ───────────────────────────────────────────────────────

interface HeaderProps {
  pagina: Pagina;
  onNavigate: (p: Pagina) => void;
  onLogout: () => void;
  user: AuthUser;
}

function Header({ pagina, onNavigate, onLogout, user }: HeaderProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems: { key: Pagina; label: string; icon: React.ReactNode }[] = [
    {
      key: "resumo", label: "Resumo",
      icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>,
    },
    {
      key: "pacientes", label: "Pacientes",
      icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>,
    },
    {
      key: "favoritos", label: "Favoritos",
      icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>,
    },
    {
      key: "acompanhamentos", label: "Acompanhamentos",
      icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>,
    },
  ];

  const handleNav = useCallback((p: Pagina) => {
    onNavigate(p);
    setSidebarOpen(false);
  }, [onNavigate]);

  return (
    <>
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-gradient-to-r from-slate-800 to-slate-700 shadow-lg shadow-slate-800/20">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-bordo-600/20 to-transparent" />

      <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-1 sm:gap-2 lg:gap-3 px-3 sm:px-5 lg:px-6 py-2 sm:py-2.5 lg:py-3">
        {/* Logo + Hambúrguer */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Botão Hambúrguer — mobile/tablet */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 ring-1 ring-white/10 transition-all duration-200 hover:bg-white/20 hover:text-white md:hidden"
          >
            <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {/* Logo texto — mobile compacto (< sm) */}
          <div className="sm:hidden">
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold tracking-wide text-white/90">GDC</span>
            </div>
          </div>

          {/* Logo texto — completo (sm+) */}
          <div className="hidden sm:block min-w-0">
            <div className="flex items-baseline gap-1.5 flex-nowrap">
              <span className="text-[13px] sm:text-[15px] font-bold tracking-wide text-white/90 whitespace-nowrap">GOTAS DE</span>
              <span className="bg-gradient-to-r from-bordo-400 to-blue-500 bg-clip-text text-[13px] sm:text-[15px] font-bold tracking-wide text-transparent whitespace-nowrap">CUIDADO</span>
            </div>
            <p className="hidden lg:block mt-px text-[9px] sm:text-[10px] font-medium tracking-wider text-white/40 leading-tight">MONITORAMENTO DE CRIANÇAS E ADOLESCENTES<br />COM DIABETES E ANEMIA FALCIFORME</p>
          </div>
        </div>

        {/* Nav Pill Tabs — central */}
        <nav className="hidden md:flex flex-1 min-w-0 items-center justify-center gap-1 rounded-2xl bg-white/10 p-1 ring-1 ring-white/10 overflow-x-auto flex-nowrap scrollbar-thin">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`relative flex items-center gap-1 md:gap-1.5 lg:gap-2 rounded-lg md:rounded-xl px-1.5 md:px-2 lg:px-3 xl:px-4 py-1.5 md:py-1.5 lg:py-2 text-[11px] md:text-[11px] lg:text-xs xl:text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                pagina === item.key
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-white/70 hover:bg-white/20 hover:text-white"
              }`}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="hidden lg:inline xl:inline">{item.label}</span>
              <span className="inline lg:hidden xl:hidden">{item.label.substring(0, 3)}</span>
            </button>
          ))}
        </nav>

        {/* User + Ações */}
        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          {/* Engrenagem — configurações (só em lg+ pra não competir espaço) */}
          <button
            onClick={() => onNavigate("configuracoes")}
            className={`hidden lg:flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl transition-all duration-200 ${
              pagina === "configuracoes"
                ? "bg-bordo-600 text-white shadow-lg shadow-bordo-600/25"
                : "bg-white/10 text-white/70 ring-1 ring-white/10 hover:bg-white/20 hover:text-white"
            }`}
          >
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>

          {/* User info */}
          <div className="flex items-center gap-2.5 rounded-xl bg-white/10 py-1.5 px-3 ring-1 ring-white/10 transition-all hover:bg-white/20">
            <div className="hidden lg:block">
              <p className="text-[11px] sm:text-xs font-semibold text-white/90 whitespace-nowrap">{user.name || user.email}</p>
              <p className="text-[9px] sm:text-[10px] text-white/50 font-medium whitespace-nowrap">{user.role === "admin" ? "Coordenação" : user.unidade || "Usuário"}</p>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={onLogout}
            title="Sair"
            className="flex h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 ring-1 ring-white/10 transition-all duration-200 hover:bg-rose-500/20 hover:text-rose-300 hover:ring-rose-400/30"
          >
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    {/* ── Sidebar Drawer — Mobile/Tablet ─────────────────────────── */}
    {sidebarOpen && (
      <div className="fixed inset-0 z-[999] md:hidden">
        {/* Overlay */}
        <div
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
        {/* Drawer */}
        <div className="absolute inset-y-0 left-0 flex w-60 flex-col bg-gradient-to-b from-slate-800 to-slate-700 shadow-2xl shadow-slate-900/40 ring-1 ring-white/[0.06]">
          {/* Drawer header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bordo-600 text-white text-sm font-black shadow-lg">
                CA
              </div>
              <div>
                <span className="text-sm font-bold tracking-wide text-white/90">GOTAS DE CUIDADO</span>
                <p className="text-[9px] font-bold tracking-wider text-bordo-400">MONITORAMENTO DE CRIANÇAS E ADOLESCENTES COM DIABETES E ANEMIA FALCIFORME</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => handleNav(item.key)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                    pagina === item.key
                      ? "bg-bordo-600 text-white shadow-lg shadow-bordo-600/20"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {item.label}
                </button>
              ))}
              {/* Configurações */}
              <button
                onClick={() => handleNav("configuracoes")}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                  pagina === "configuracoes"
                    ? "bg-bordo-600 text-white shadow-lg shadow-bordo-600/20"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                Configurações
              </button>
            </div>
          </nav>

          {/* Drawer footer — user + logout */}
          <div className="border-t border-white/[0.06] px-4 py-4">
            <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] px-3 py-2.5 ring-1 ring-white/[0.06]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white/90">{user.name || user.email}</p>
                <p className="truncate text-[10px] text-white/50 font-medium">{user.role === "admin" ? "Coordenação" : user.unidade || "Usuário"}</p>
              </div>
              <button
                onClick={onLogout}
                title="Sair"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/40 transition-all hover:bg-rose-500/20 hover:text-rose-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ── Componente Principal ─────────────────────────────────────────────────

export default function GotasDeCuidado() {
  const [pagina, setPagina] = useState<Pagina>("resumo");
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem("pb_user");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [selectedPacienteId, setSelectedPacienteId] = useState<string | null>(null);

  // Email actions (capturados pelo script inline no index.html)
  const [emailAction, setEmailAction] = useState(() => {
    const token = (window as any).__authToken as string | undefined;
    const action = (window as any).__authAction as string | undefined;
    delete (window as any).__authToken;
    delete (window as any).__authAction;
    if (token && token.length >= 10) {
      return { action: (action === "confirm_email_change" ? "confirm_email_change" : "reset_password") as "reset_password" | "confirm_email_change", token };
    }
    return null;
  });

  // Status de verificação de email
  const [verificacaoStatus, setVerificacaoStatus] = useState<"nenhum" | "sucesso" | "erro">(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") {
      window.history.replaceState(null, "", window.location.pathname);
      return "sucesso";
    }
    if (params.get("verify_error") === "1") {
      window.history.replaceState(null, "", window.location.pathname);
      return "erro";
    }
    return "nenhum";
  });

  // Rolar para o topo ao navegar entre páginas
  useEffect(() => { window.scrollTo(0, 0); }, [pagina]);

  const handleNavigate = useCallback((p: Pagina) => {
    setSelectedPacienteId(null);
    setPagina(p);
  }, []);

  const handleNavigateAcompFiltered = useCallback((pacienteId: string) => {
    setSelectedPacienteId(pacienteId);
    setPagina("acompanhamentos");
  }, []);

  function handleLogin(_token: string, record: AuthUser) {
    try { localStorage.setItem("pb_user", JSON.stringify(record)); } catch { /* ignore */ }
    setUser(record);
  }

  function handleLogout() {
    try {
      localStorage.removeItem("pb_auth_token");
      localStorage.removeItem("pb_user");
    } catch { /* ignore */ }
    setUser(null);
    setPagina("resumo");
  }

  // 1. Email action (reset password) — ANTES do auth check
  if (emailAction) {
    return (
      <PaginaRedefinicao
        token={emailAction.token}
        action={emailAction.action}
        onVoltar={() => { setEmailAction(null); window.location.reload(); }}
      />
    );
  }

  // 2. Verificação de email — mostrar resultado
  if (verificacaoStatus === "sucesso") {
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
            <h2 className="text-xl font-black text-slate-900">Email confirmado!</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">Sua conta foi ativada com sucesso.<br/>Agora pode acessar o sistema.</p>
            <button
              onClick={() => setVerificacaoStatus("nenhum")}
              className="mt-8 w-full rounded-2xl bg-bordo-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-bordo-500/20 transition-all hover:bg-bordo-700 hover:shadow-bordo-500/30 active:scale-[0.98]"
            >
              Acessar o Sistema
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (verificacaoStatus === "erro") {
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
            <h2 className="text-xl font-black text-slate-900">Erro na verificação</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">Link inválido ou expirado.<br/>Solicite um novo email de verificação.</p>
            <button
              onClick={() => setVerificacaoStatus("nenhum")}
              className="mt-8 w-full rounded-2xl bg-bordo-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-bordo-500/20 transition-all hover:bg-bordo-700 hover:shadow-bordo-500/30 active:scale-[0.98]"
            >
              Voltar ao Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Auth check
  if (!user) {
    return <PaginaLogin onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      <Header pagina={pagina} onNavigate={handleNavigate} onLogout={handleLogout} user={user} />

      <main>
        {pagina === "resumo" && <PaginaResumo usuarioUnidade={user.unidade} />}
        {pagina === "pacientes" && <PaginaPacientes usuarioId={user.id} usuarioUnidade={user.unidade} usuarioRole={user.role} onNavigateAcompFiltered={handleNavigateAcompFiltered} />}
        {pagina === "favoritos" && <PaginaFavoritos usuarioId={user.id} usuarioUnidade={user.unidade} usuarioRole={user.role} onNavigateAcompFiltered={handleNavigateAcompFiltered} />}
        {pagina === "acompanhamentos" && <PaginaAcompanhamentos selectedPacienteId={selectedPacienteId} usuarioId={user.id} />}
        {pagina === "configuracoes" && <PaginaConfiguracoes usuarioRole={user.role} />}
      </main>

      <footer className="mt-auto border-t border-slate-200 bg-white py-8 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1.5 opacity-40">
            <span className="text-xs font-black uppercase tracking-widest text-slate-900">SISTEMA</span>
            <span className="text-xs font-black uppercase tracking-widest text-bordo-600">GOTAS DE CUIDADO</span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Monitoramento de Crianças e Adolescentes com Diabetes e Anemia Falciforme
          </p>
        </div>
      </footer>
    </div>
  );
}
