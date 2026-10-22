"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [message, setMessage] = useState("");
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setIsInstalled(standalone);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setMessage("Aplicación instalada correctamente.");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (isInstalled) {
      setMessage("La aplicación ya está instalada en este dispositivo.");
      return;
    }

    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      setMessage(choice.outcome === "accepted"
        ? "Se inició la instalación de la aplicación."
        : "La instalación se canceló. Podés intentarlo nuevamente desde el menú del navegador.");
      return;
    }

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setMessage(isIOS
      ? "Para instalarla: tocá Compartir en Safari y elegí “Agregar a pantalla de inicio”."
      : "Para instalarla: abrí el menú ⋮ de Chrome y elegí “Instalar aplicación” o “Agregar a pantalla principal”. Si esa opción no aparece, actualizá la página y volvé a intentarlo.");
  }

  return (
    <div className="install-app-area">
      <button type="button" className="button ghost full" onClick={handleInstall}>
        {isInstalled ? "Aplicación instalada" : "Instalar aplicación"}
      </button>
      {message && <p className="muted small-text" role="status" aria-live="polite">{message}</p>}
    </div>
  );
}
