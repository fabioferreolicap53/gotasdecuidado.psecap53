import { useState, useEffect, useCallback } from "react";

// ── Tipos ─────────────────────────────────────────────────────────────
type Platform = "android" | "ios" | "windows" | "other";

interface UseInstallPrompt {
  shouldShow: boolean;
  platform: Platform;
  canNativeInstall: boolean;
  install: () => Promise<void>;
  dismiss: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────
function getPlatform(): Platform {
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows/i.test(ua)) return "windows";
  return "other";
}

function isStandalone(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if ((window.navigator as any).standalone === true) return true;
  if (window.matchMedia("(display-mode: window-controls-overlay)").matches) return true;
  return false;
}

const DISMISS_KEY = "pwa_install_banner_dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "true";
  } catch {
    return false;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────
export function useInstallPrompt(): UseInstallPrompt {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [shouldShow, setShouldShow] = useState(false);

  // Captura do beforeinstallprompt — listener ativo durante toda a vida do componente
  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShouldShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Verifica se o evento já disparou antes do mount
    // (Chrome pode ter disparado antes do useEffect rodar)
    // Nesse caso, o banner ainda deve aparecer para plataformas suportadas
    if (getPlatform() === "ios" || getPlatform() === "android" || getPlatform() === "windows") {
      setShouldShow(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const platform = getPlatform();
  const canNativeInstall = !!deferredPrompt;

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setShouldShow(false);
      }
    } catch {
      // instalação falhou silenciosamente
    }
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch { /* ignore */ }
    setShouldShow(false);
  }, []);

  return { shouldShow, platform, canNativeInstall, install, dismiss };
}
