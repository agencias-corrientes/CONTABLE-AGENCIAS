"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type NavigatorWithPwa = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<Array<{ id?: string; platform: string; url?: string }>>;
};

const INSTALLED_MARKER = "agencias-corrientes:pwa-installed:v1";

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
    let active = true;
    const pwaNavigator = navigator as NavigatorWithPwa;
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || window.matchMedia("(display-mode: fullscreen)").matches
      || pwaNavigator.standalone === true;
    const userAgent = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const markInstalled = () => {
      try {
        window.localStorage.setItem(INSTALLED_MARKER, "1");
      } catch {
        // La detección por modo independiente y por el navegador sigue funcionando.
      }
      if (active) {
        setIsInstalled(true);
        setInstallPrompt(null);
        setHelpOpen(false);
      }
    };

    let alreadyInstalled = standalone;
    try {
      alreadyInstalled = alreadyInstalled || window.localStorage.getItem(INSTALLED_MARKER) === "1";
    } catch {
      // El almacenamiento puede estar bloqueado; se consultará la API del navegador.
    }

    if (standalone) markInstalled();
    setIsInstalled(alreadyInstalled);
    setIsIOS(ios);
    setIsAndroid(/Android/i.test(userAgent));
    setIsMacSafari(/Macintosh/i.test(userAgent) && /Safari/i.test(userAgent) && !/Chrome|Chromium|Edg/i.test(userAgent));

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      // Si el navegador vuelve a ofrecer el evento, la app fue desinstalada:
      // quitamos la marca anterior y permitimos instalarla otra vez.
      try {
        window.localStorage.removeItem(INSTALLED_MARKER);
      } catch {
        // El evento sigue siendo una señal válida de que puede instalarse.
      }
      alreadyInstalled = false;
      if (active) {
        setIsInstalled(false);
        setInstallPrompt(event as InstallPromptEvent);
      }
    };
    const onAppInstalled = () => markInstalled();

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    // Chrome en Android puede informar desde el navegador si esta PWA ya está instalada.
    if (!alreadyInstalled && pwaNavigator.getInstalledRelatedApps) {
      pwaNavigator.getInstalledRelatedApps()
        .then((apps) => {
          if (!active) return;
          const installedWebApp = apps.some((app) =>
            app.platform === "webapp"
            && (!app.url || app.url.includes("/manifest.webmanifest"))
          );
          if (installedWebApp) markInstalled();
        })
        .catch(() => {
          // Si el navegador no ofrece esta API, se conserva la detección local.
        });
    }

    setMounted(true);
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (isInstalled) return;
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
      if (choice.outcome === "accepted") {
        try {
          window.localStorage.setItem(INSTALLED_MARKER, "1");
        } catch {
          // El evento appinstalled también actualizará el estado.
        }
        setIsInstalled(true);
      }
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
