import { useState } from "react";
import { useInstallPrompt } from "./useInstallPrompt";

// ── Instruções por plataforma ─────────────────────────────────────────
const PLATFORM_INSTRUCTIONS: Record<string, { title: string; steps: string[] }> = {
  android: {
    title: "Android",
    steps: [
      "Toque no ícone ⋮ (três pontos) no canto superior direito.",
      'Toque em "Adicionar à tela inicial".',
      'Confirme tocando em "Adicionar".',
    ],
  },
  ios: {
    title: "iOS (iPhone/iPad)",
    steps: [
      'Toque no ícone de compartilhar (📤) na barra inferior.',
      'Role para baixo e toque em "Adicionar à Tela de Início".',
      'Toque em "Adicionar" no canto superior direito.',
    ],
  },
  windows: {
    title: "Windows",
    steps: [
      'Clique no ícone de instalar (∪) na barra de endereços.',
      'Confirme clicando em "Instalar".',
    ],
  },
  other: {
    title: "Navegador",
    steps: [
      'Abra o menu do navegador.',
      'Procure por "Instalar aplicativo" ou "Adicionar à tela inicial".',
    ],
  },
};

// ═══ COMPONENTE ═══════════════════════════════════════════════════════
export default function InstallBanner() {
  const { shouldShow, platform, canNativeInstall, install, dismiss } = useInstallPrompt();
  const [expanded, setExpanded] = useState(false);

  if (!shouldShow) return null;

  const instructions = PLATFORM_INSTRUCTIONS[platform] || PLATFORM_INSTRUCTIONS.other;

  return (
    <div className="animate-[slideDown_0.4s_ease-out] z-[200]">
      {/* ── Native install mode ─────────────────────────────────── */}
      {canNativeInstall ? (
        <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-r from-bordo-600 to-bordo-700 p-4 shadow-xl shadow-bordo-900/30">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -left-4 -bottom-4 h-16 w-16 rounded-full bg-white/5 blur-xl" />

          <div className="relative flex items-center gap-4">
            {/* Icon */}
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </div>

            {/* Text */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-white leading-tight">
                Instale o <span className="text-yellow-300">Gotas de Cuidado</span>
              </p>
              <p className="mt-0.5 text-xs font-semibold text-white/70">
                Acesse com um toque direto da sua tela inicial.
              </p>
            </div>

            {/* Install button */}
            <button
              onClick={install}
              className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-bordo-700 shadow-lg shadow-bordo-900/30 transition-all duration-200 hover:bg-yellow-50 hover:scale-105 active:scale-95"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
              </svg>
              Instalar agora
            </button>
          </div>

          {/* Dismiss */}
          <button
            onClick={(e) => { e.stopPropagation(); dismiss(); }}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="Dispensar"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        /* ── Manual install mode (iOS/Android) ──────────────────── */
        <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-r from-bordo-600 to-bordo-700 p-4 shadow-xl shadow-bordo-900/30">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />

          <div className="relative flex items-center gap-4">
            {/* Icon */}
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              {platform === "ios" ? (
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                </svg>
              ) : (
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.115 5.19l.319 1.913A6 6 0 008.11 10.36L9.75 12l-.387.775c-.217.433-.132.956.21 1.298l1.348 1.348c.21.21.329.497.329.795v1.089c0 .426.24.815.622 1.006l.153.076c.433.217.956.132 1.298-.21l.723-.723a8.7 8.7 0 002.288-4.042 1.087 1.087 0 00-.358-1.099l-1.33-1.108c-.251-.21-.582-.299-.905-.245l-1.17.195a1.125 1.125 0 01-.98-.314l-.295-.295a1.125 1.125 0 010-1.591l.13-.132a1.125 1.125 0 011.3-.21l.603.302a.809.809 0 001.086-1.086L14.25 7.5l1.256-.837a4.5 4.5 0 001.528-1.732l.146-.292M6.115 5.19A9 9 0 1017.18 4.64M6.115 5.19A8.965 8.965 0 0112 3c1.929 0 3.716.607 5.18 1.64" />
                </svg>
              )}
            </div>

            {/* Text */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-white leading-tight">
                Para <span className="text-yellow-300">{instructions.title}</span>
              </p>
              <p className="mt-0.5 text-xs font-semibold text-white/70">
                {platform === "ios"
                  ? "Compartilhe e adicione à tela de início."
                  : "Adicione à tela inicial para acesso rápido."}
              </p>
            </div>

            {/* Expand button */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-white/20 backdrop-blur-sm px-4 py-2.5 text-xs font-black text-white transition-all duration-200 hover:bg-white/30 active:scale-95"
            >
              Como instalar
              <svg className={`h-3.5 w-3.5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          </div>

          {/* Expanded instructions */}
          <div
            className="overflow-hidden transition-all duration-400 ease-out"
            style={{ maxHeight: expanded ? "300px" : "0px", opacity: expanded ? 1 : 0 }}
          >
            <div className="mt-4 rounded-xl bg-white/10 backdrop-blur-sm p-4 border border-white/10">
              <div className="space-y-3">
                {instructions.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-yellow-400 text-[10px] font-black text-bordo-800">
                      {i + 1}
                    </span>
                    <p className="text-xs font-semibold text-white/90 pt-0.5">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Dismiss */}
          <button
            onClick={(e) => { e.stopPropagation(); dismiss(); }}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="Dispensar"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
