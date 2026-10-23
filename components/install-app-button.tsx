"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/**
 * Botón visible de instalación. Chrome decide cuándo habilitar el instalador nativo;
 * cuando aún no lo ofrece, el botón explica cómo instalar desde el propio navegador.
 */
export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(standalone);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setHelp(false);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setHelp(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      setHelp((value) => !value);
      return;
    }
    setBusy(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallPrompt(null);
      else setHelp(true);
    } catch {
      setHelp(true);
    } finally {
      setBusy(false);
    }
  }

  if (installed) {
    return <p className="install-app-status" role="status">La aplicación ya está instalada en este dispositivo.</p>;
  }

  return (
    <div className="install-app-area">
      <button type="button" className="button ghost full install-app-button" onClick={install} disabled={busy}>
        {busy ? "Abriendo instalador…" : "⇩ Instalar aplicación"}
      </button>
      {help && (
        <p className="install-app-help" role="status">
          {installPrompt
            ? "Chrome no pudo abrir el instalador en este momento. Cerrá cualquier cuadro abierto y volvé a tocar el botón."
            : "Chrome todavía no entregó el instalador directo en esta pestaña. Después de esta actualización, recargá la página y volvé a tocar «Instalar aplicación»."}
        </p>
      )}
      <style jsx>{`
        .install-app-area { display:grid; gap:8px; margin-top:12px; }
        .install-app-button { min-height:48px; border:1px solid #bda66c; background:#fffdf6; color:#64283a; font-weight:850; }
        .install-app-button:disabled { opacity:.7; }
        .install-app-help,.install-app-status { margin:0; font-size:13px; line-height:1.45; color:#5d5154; }
      `}</style>
    </div>
  );
}
