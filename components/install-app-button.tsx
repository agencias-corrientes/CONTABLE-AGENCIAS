"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallAppButton() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
      setShowHelp(false);
      setMessage("La aplicación quedó instalada en este dispositivo.");
    };
    if (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone) {
      setInstalled(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installEvent) {
      setShowHelp((current) => !current);
      setMessage("");
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setMessage("Se inició la instalación de Agencias Corrientes.");
      setShowHelp(false);
    }
    setInstallEvent(null);
  }

  if (installed) {
    return <p className="muted small-text" role="status">{message || "Agencias Corrientes ya está instalada en este dispositivo."}</p>;
  }

  return (
    <div style={{ margin: "16px 0 8px" }}>
      <button type="button" className="button ghost full" onClick={install}>
        ⬇ Instalar aplicación en este dispositivo
      </button>
      {message && <p className="message success-message" role="status" style={{ marginTop: 10 }}>{message}</p>}
      {showHelp && (
        <div className="message" role="status" style={{ marginTop: 10, lineHeight: 1.5 }}>
          <strong>Cómo instalar Agencias Corrientes</strong>
          <p style={{ margin: "8px 0" }}>Si no aparece automáticamente la ventana de instalación:</p>
          <ul style={{ margin: "0 0 8px", paddingLeft: 22 }}>
            <li><strong>Android / Chrome:</strong> tocá el menú ⋮ del navegador y elegí “Instalar aplicación” o “Agregar a pantalla principal”.</li>
            <li><strong>iPhone / Safari:</strong> tocá Compartir y después “Agregar a pantalla de inicio”.</li>
          </ul>
          <p style={{ margin: 0 }}>La opción depende de las funciones que ofrezca el navegador.</p>
        </div>
      )}
    </div>
  );
}
