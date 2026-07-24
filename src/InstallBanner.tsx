import { useState } from "react";
import { useInstallPrompt } from "./useInstallPrompt";

// ── Instruções por plataforma ─────────────────────────────────────────
const PLATFORM_INSTRUCTIONS: Record<string, { title: string; steps: string[] }> = {
  android: {
    title: "Android",
    steps: [
      "Toque no ícone ⋮ no canto superior direito.",
      'Toque em "Adicionar à tela inicial".',
      'Confirme tocando em "Adicionar".',
    ],
  },
  ios: {
    title: "iOS",
    steps: [
      "Toque no ícone de compartilhar na barra inferior.",
      'Role e toque em "Adicionar à Tela de Início".',
      'Toque em "Adicionar".',
    ],
  },
  windows: {
    title: "Windows",
    steps: [
      'Clique no ícone de instalar na barra de endereços.',
      'Confirme clicando em "Instalar".',
    ],
  },
  other: {
    title: "Navegador",
    steps: [
      'Abra o menu do navegador.',
      'Procure "Instalar aplicativo" ou "Adicionar à tela inicial".',
    ],
  },
};

// ── Ícone da plataforma ───────────────────────────────────────────────
function PIcon({ platform }: { platform: string }) {
  const cls = "h-3.5 w-3.5";
  switch (platform) {
    case "ios":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
      );
    case "android":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.115 5.19l.319 1.913A6 6 0 008.11 10.36L9.75 12l-.387.775c-.217.433-.132.956.21 1.298l1.348 1.348c.21.21.329.497.329.795v1.089c0 .426.24.815.622 1.006l.153.076c.433.217.956.132 1.298-.21l.723-.723a8.7 8.7 0 002.288-4.042 1.087 1.087 0 00-.358-1.099l-1.33-1.108c-.251-.21-.582-.299-.905-.245l-1.17.195a1.125 1.125 0 01-.98-.314l-.295-.295a1.125 1.125 0 010-1.591l.13-.132a1.125 1.125 0 011.3-.21l.603.302a.809.809 0 001.086-1.086L14.25 7.5l1.256-.837a4.5 4.5 0 001.528-1.732l.146-.292M6.115 5.19A9 9 0 1017.18 4.64M6.115 5.19A8.965 8.965 0 0112 3c1.929 0 3.716.607 5.18 1.64" />
        </svg>
      );
    default:
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      );
  }
}

// ═══ COMPONENTE ═══════════════════════════════════════════════════════
export default function InstallBanner() {
  const { shouldShow, platform, canNativeInstall, install, dismiss } = useInstallPrompt();
  const [expanded, setExpanded] = useState(false);

  if (!shouldShow) return null;

  const instructions = PLATFORM_INSTRUCTIONS[platform] || PLATFORM_INSTRUCTIONS.other;

  return (
    <div
      className="fixed bottom-24 left-1/2 z-[200] -translate-x-1/2 sm:bottom-4"
      style={{ animation: "pwa-slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
    >
      <div
        className={`group relative max-w-[92vw] overflow-hidden rounded-2xl border border-white/[0.08] bg-bordo-800/95 shadow-2xl shadow-bordo-950/50 backdrop-blur-xl${canNativeInstall ? " cursor-pointer" : ""}`}
        onClick={canNativeInstall ? install : undefined}
        role={canNativeInstall ? "button" : undefined}
        tabIndex={canNativeInstall ? 0 : undefined}
        onKeyDown={canNativeInstall ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); install(); } } : undefined}
      >
        <div className="relative flex items-center gap-2.5 px-4 py-2.5 sm:gap-3 sm:px-5 sm:py-3">
          {/* Ícone */}
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.08] ring-1 ring-white/[0.06] transition-colors group-hover:bg-white/[0.12]">
            {canNativeInstall ? (
              <svg className="h-4 w-4 text-amber-300/80" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            ) : (
              <PIcon platform={platform} />
            )}
          </div>

          {/* Texto */}
          <div className="min-w-0">
            {canNativeInstall ? (
              <p className="text-[11px] font-semibold text-white/95 leading-snug sm:text-xs">
                Instale o <span className="text-amber-200/90">Gotas de Cuidado PSE Cap 53</span>
              </p>
            ) : (
              <p className="text-[11px] font-semibold text-white/95 leading-snug sm:text-xs">
                Adicione à tela inicial
              </p>
            )}
          </div>

          {/* Botão de ação */}
          {canNativeInstall ? (
            <span className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-white/[0.1] px-2.5 py-1.5 text-[10px] font-semibold text-white/90 ring-1 ring-white/[0.06] transition-all duration-200 group-hover:bg-white/[0.18] group-hover:text-white pointer-events-none sm:px-3 sm:py-2 sm:text-[11px]">
              <svg className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Instalar
            </span>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[10px] font-medium text-white/60 ring-1 ring-white/[0.04] transition-all duration-200 hover:bg-white/[0.14] hover:text-white/80 active:scale-[0.97] sm:px-3 sm:py-2 sm:text-[11px]"
            >
              Como instalar
              <svg className={`h-3 w-3 transition-transform duration-250 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          )}
        </div>

        {/* Instruções expandidas */}
        {!canNativeInstall && (
          <div
            className="overflow-hidden transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ maxHeight: expanded ? "260px" : "0px", opacity: expanded ? 1 : 0 }}
          >
            <div className="mx-3 mb-3 rounded-xl bg-white/[0.05] p-3 ring-1 ring-white/[0.04] sm:mx-4 sm:mb-3.5">
              <div className="space-y-2">
                {instructions.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="mt-px flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded bg-amber-400/[0.15] text-[9px] font-bold text-amber-300/80">
                      {i + 1}
                    </span>
                    <p className="text-[11px] text-white/55 leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Dispensar */}
        <button
          onClick={(e) => { e.stopPropagation(); dismiss(); }}
          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md text-white/25 transition-all duration-200 hover:bg-white/[0.08] hover:text-white/50 sm:right-2 sm:top-2 sm:h-6 sm:w-6"
          aria-label="Dispensar"
        >
          <svg className="h-2.5 w-2.5 sm:h-3 sm:w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
