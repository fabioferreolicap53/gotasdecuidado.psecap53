import { useState, useEffect } from "react";

// ── Captura global do beforeinstallprompt (FORA do componente) ────────
// O evento pode disparar antes do React montar (durante login/loading).
// Se o hook só registra listener no useEffect, o evento é perdido para sempre.
let capturedPrompt: any = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    capturedPrompt = e;
  });
}

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

// ── Hook ──────────────────────────────────────────────────────────────
export function useInstallPrompt(): UseInstallPrompt {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(capturedPrompt);
  const [shouldShow, setShouldShow] = useState<boolean>(() => {
    if (isStandalone()) return false;
    if (localStorage.getItem(DISMISS_KEY)) return false;
    const platform = getPlatform();
    if (capturedPrompt) return true;
    if (platform === "ios" || platform === "android") return true;
    return false;
  });

  const platform = getPlatform();
  const canNativeInstall = !!deferredPrompt;

  // Atualiza se o evento chegar depois do mount
  useEffect(() => {
    if (capturedPrompt && !deferredPrompt) {
      setDeferredPrompt(capturedPrompt);
      setShouldShow(true);
    }
  }, [deferredPrompt]);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      capturedPrompt = null;
      setShouldShow(false);
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch { /* ignore */ }
    setShouldShow(false);
  };

  return { shouldShow, platform, canNativeInstall, install, dismiss };
}
