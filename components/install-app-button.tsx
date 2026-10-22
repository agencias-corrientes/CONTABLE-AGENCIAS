"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
      // Browsers do not expose a way to open their native install menu from script.
      // Always provide visible, actionable instructions instead of a silent-looking click.
      setHelp(true);
      return;
    }

    setBusy(true);
    setHelp(false);
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
      <button
        type="button"
        className="button ghost full install-app-button"
        onClick={install}
        disabled={busy}
        aria-expanded={help}
        aria-controls="install-app-help"
      >
        {busy ? "Abriendo instalador…" : "⇩ Instalar aplicación"}
      </button>
      {help && (
        <div id="install-app-help" className="install-app-help" role="status" aria-live="polite">
          <strong>Para instalar Agencias Corrientes:</strong>
          <ol>
            <li>En Chrome, tocá el menú de los tres puntos (⋮), arriba a la derecha.</li>
            <li>Elegí <strong>«Instalar aplicación»</strong> o <strong>«Agregar a pantalla principal»</strong>.</li>
            <li>Confirmá la instalación cuando aparezca el aviso.</li>
          </ol>
          <p>Si no aparece ninguna de esas opciones, abrí este enlace directamente en Google Chrome y volvé a intentarlo.</p>
          <button type="button" className="install-app-close" onClick={() => setHelp(false)}>Cerrar instrucciones</button>
        </div>
      )}
      <style jsx>{`
        .install-app-area { display:grid; gap:8px; margin-top:12px; }
        .install-app-button { min-height:48px; border:1px solid #bda66c; background:#fffdf6; color:#64283a; font-weight:850; }
        .install-app-button:disabled { opacity:.7; }
        .install-app-help,.install-app-status { margin:0; font-size:14px; line-height:1.5; color:#5d5154; }
        .install-app-help { padding:12px; border:1px solid #d9c98d; border-radius:10px; background:#fffdf6; }
        .install-app-help ol { padding-left:22px; margin:8px 0; }
        .install-app-help li { margin:5px 0; }
        .install-app-close { margin-top:6px; border:0; background:transparent; color:#702039; text-decoration:underline; font-weight:700; padding:6px 0; }
      `}</style>
    </div>
  );
}
