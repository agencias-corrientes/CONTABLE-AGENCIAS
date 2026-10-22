"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(standalone);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // Register the PWA worker so supported browsers can offer native installation.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Keep the button clean; unsupported contexts cannot show the native prompt.
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt || busy) return;

    setBusy(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallPrompt(null);
    } catch {
      // Do not add extra UI; leave only the requested button.
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
        disabled={busy || !installPrompt}
      >
        {busy ? "Abriendo instalador…" : "⇩ Instalar aplicación"}
      </button>
      <style jsx>{`
        .install-app-area { margin-top:12px; }
        .install-app-button { min-height:48px; border:1px solid #bda66c; background:#fffdf6; color:#64283a; font-weight:850; }
        .install-app-button:disabled { opacity:1; cursor:default; }
      `}</style>
    </div>
  );
}
