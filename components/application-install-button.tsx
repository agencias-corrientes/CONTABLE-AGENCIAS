"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function ApplicationInstallButton() {
  const [mounted, setMounted] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isMacSafari, setIsMacSafari] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const userAgent = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsInstalled(standalone);
    setIsIOS(ios);
    setIsAndroid(/Android/i.test(userAgent));
    setIsMacSafari(/Macintosh/i.test(userAgent) && /Safari/i.test(userAgent) && !/Chrome|Chromium|Edg/i.test(userAgent));
    setMounted(true);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setHelpOpen(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!installPrompt) {
      setHelpOpen(true);
      return;
    }
    setInstalling(true);
    try {
      const promptEvent = installPrompt;
      setInstallPrompt(null);
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setIsInstalled(true);
    } finally {
      setInstalling(false);
    }
  }

  if (!mounted || isInstalled) return null;

  const instructions = isIOS
    ? "En tu iPhone o iPad, toca Compartir en el navegador y elegí “Añadir a pantalla de inicio”. Después confirmá “Añadir”. Abrí el nuevo icono desde la pantalla de inicio para entrar como aplicación."
    : isAndroid
      ? "En Android, abrí el menú de tres puntos de Chrome y elegí “Instalar aplicación”. Si no aparece, buscá “Añadir a pantalla principal”. Después abrí Agencias Corrientes desde el icono instalado."
      : isMacSafari
        ? "En Safari para Mac, abrí el menú Archivo y elegí “Añadir al Dock”. Luego iniciá Agencias Corrientes desde el icono agregado."
        : "En Chrome o Edge, buscá el icono Instalar en la barra de direcciones o abrí el menú del navegador y elegí “Instalar aplicación”. La opción aparece cuando el navegador valida que el sitio se puede instalar.";

  return (
    <div className="landing-app-install">
      <button
        type="button"
        className="landing-app-install-trigger"
        onClick={handleInstall}
        disabled={installing}
      >
        {installing ? "Abriendo instalación..." : "Instalar aplicación"}
      </button>

      {helpOpen && (
        <div className="landing-app-install-backdrop">
          <section className="landing-app-install-dialog" role="dialog" aria-modal="true" aria-labelledby="landing-install-title" aria-describedby="landing-install-description">
            <p className="eyebrow">AGENCIAS CORRIENTES</p>
            <h2 id="landing-install-title">Instalar en este dispositivo</h2>
            <p id="landing-install-description">{instructions}</p>
            <div className="landing-app-install-actions">
              <button type="button" onClick={() => setHelpOpen(false)}>Entendido</button>
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        .landing-app-install{display:flex;justify-content:center;margin:16px auto 4px}
        .landing-app-install-trigger{min-height:46px;min-width:220px;padding:11px 20px;border:1px solid #9e813b;border-radius:10px;background:#e9b83f;color:#382b16;font:850 14px/1.2 Arial,Helvetica,sans-serif;cursor:pointer}
        .landing-app-install-trigger:hover,.landing-app-install-trigger:focus-visible{background:#dfaa2d;outline:2px solid #e5d2a4;outline-offset:2px}
        .landing-app-install-trigger:disabled{opacity:.65;cursor:wait}
        .landing-app-install-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:16px;background:rgba(22,18,17,.62);backdrop-filter:blur(3px)}
        .landing-app-install-dialog{width:min(100%,440px);box-sizing:border-box;padding:24px;border:1px solid #ded3bf;border-radius:16px;background:#fffdf8;color:#302a25;box-shadow:0 18px 55px rgba(0,0,0,.28)}
        .landing-app-install-dialog .eyebrow{margin:0 0 8px;color:#8b7140;font-size:10px;font-weight:900;letter-spacing:.12em}
        .landing-app-install-dialog h2{margin:0 0 10px;font-size:22px;line-height:1.2;font-weight:900}
        .landing-app-install-dialog>p:not(.eyebrow){margin:0;color:#625b53;font-size:14px;line-height:1.55}
        .landing-app-install-actions{display:flex;justify-content:flex-end;margin-top:20px}
        .landing-app-install-actions button{min-height:44px;padding:9px 18px;border:1px solid #343a40;border-radius:10px;background:#343a40;color:#fff;font:800 13px Arial,Helvetica,sans-serif;cursor:pointer}
        @media(max-width:520px){.landing-app-install-dialog{padding:20px 17px}.landing-app-install-dialog h2{font-size:20px}}
      `}</style>
    </div>
  );
}
