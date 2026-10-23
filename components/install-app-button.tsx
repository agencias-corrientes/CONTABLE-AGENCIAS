"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaWindow = Window & {
  __deferredPwaInstallPrompt?: Event | null;
};

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [buttonMessage, setButtonMessage] = useState<string | null>(null);

  useEffect(() => {
    const pwaWindow = window as PwaWindow;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(standalone);

    const syncSavedPrompt = () => {
      const saved = pwaWindow.__deferredPwaInstallPrompt as InstallPromptEvent | null | undefined;
      if (saved) {
        setInstallPrompt(saved);
        setButtonMessage(null);
      }
    };

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      pwaWindow.__deferredPwaInstallPrompt = event;
      setInstallPrompt(event as InstallPromptEvent);
      setButtonMessage(null);
    };

    const onInstalled = () => {
      pwaWindow.__deferredPwaInstallPrompt = null;
      setInstalled(true);
      setInstallPrompt(null);
    };

    // Recover an event captured in the document head before React hydrates.
    syncSavedPrompt();
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("pwa-install-prompt-available", syncSavedPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("pwa-installed", onInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // The button remains the only visible control; click feedback is shown in it.
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("pwa-install-prompt-available", syncSavedPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("pwa-installed", onInstalled);
    };
  }, []);

  async function install() {
    if (busy) return;

    const pwaWindow = window as PwaWindow;
    let promptEvent =
      installPrompt ??
      (pwaWindow.__deferredPwaInstallPrompt as InstallPromptEvent | null | undefined) ??
      null;

    if (!promptEvent) {
      setBusy(true);
      setButtonMessage("Preparando instalador…");
      try {
        if (!("serviceWorker" in navigator)) {
          throw new Error("Service workers are unavailable");
        }
        await navigator.serviceWorker.register("/sw.js");
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) =>
            window.setTimeout(() => reject(new Error("Service worker timeout")), 5000),
          ),
        ]);
        promptEvent =
          (pwaWindow.__deferredPwaInstallPrompt as InstallPromptEvent | null | undefined) ??
          null;
        if (!promptEvent) {
          setButtonMessage("Instalación todavía no disponible");
          window.setTimeout(() => setButtonMessage(null), 2200);
          return;
        }
      } catch {
        setButtonMessage("Instalación todavía no disponible");
        window.setTimeout(() => setButtonMessage(null), 2200);
        return;
      } finally {
        setBusy(false);
      }
    }

    setBusy(true);
    setButtonMessage(null);
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      pwaWindow.__deferredPwaInstallPrompt = null;
      setInstallPrompt(null);
    } catch {
      setButtonMessage("Instalación todavía no disponible");
      window.setTimeout(() => setButtonMessage(null), 2200);
    } finally {
      setBusy(false);
    }
  }

  if (installed) return null;

  return (
    <div className="install-app-area">
      <button
        type="button"
        className="button ghost full install-app-button"
        onClick={install}
        disabled={busy}
        aria-busy={busy}
      >
        {busy
          ? "Preparando instalador…"
          : buttonMessage ?? "⇩ Instalar aplicación"}
      </button>
      <style jsx>{`
        .install-app-area { margin-top:12px; }
        .install-app-button { min-height:48px; border:1px solid #bda66c; background:#fffdf6; color:#64283a; font-weight:850; }
        .install-app-button:disabled { opacity:.75; cursor:wait; }
      `}</style>
    </div>
  );
}
