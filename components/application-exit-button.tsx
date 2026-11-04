"use client";

import { useEffect, useState } from "react";

export function ApplicationExitButton() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [isInstalledApp, setIsInstalledApp] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalledApp(standalone);
  }, []);

  function exitApplication() {
    setConfirmOpen(false);
    window.close();
    if (!window.closed) setCloseBlocked(true);
  }

  if (!isInstalledApp) return null;

  return (
    <div className="landing-app-exit">
      <button
        type="button"
        className="landing-app-exit-trigger"
        onClick={() => { setCloseBlocked(false); setConfirmOpen(true); }}
      >
        Salir de la aplicación
      </button>

      {confirmOpen && (
        <div className="landing-app-exit-backdrop">
          <section className="landing-app-exit-dialog" role="alertdialog" aria-modal="true" aria-labelledby="landing-exit-title" aria-describedby="landing-exit-description">
            <p className="eyebrow">AGENCIAS CORRIENTES</p>
            <h2 id="landing-exit-title">¿Querés salir de la aplicación?</h2>
            <p id="landing-exit-description">Tu sesión ya está cerrada. Se intentará cerrar por completo esta ventana.</p>
            <div className="landing-app-exit-actions">
              <button type="button" className="landing-app-exit-cancel" onClick={() => setConfirmOpen(false)}>No, permanecer</button>
              <button type="button" className="landing-app-exit-confirm" onClick={exitApplication}>Sí, salir</button>
            </div>
          </section>
        </div>
      )}

      {closeBlocked && (
        <div className="landing-app-exit-backdrop">
          <section className="landing-app-exit-dialog" role="alertdialog" aria-modal="true" aria-labelledby="landing-exit-blocked-title" aria-describedby="landing-exit-blocked-description">
            <p className="eyebrow">AGENCIAS CORRIENTES</p>
            <h2 id="landing-exit-blocked-title">La ventana sigue abierta</h2>
            <p id="landing-exit-blocked-description">Tu sesión ya está cerrada, pero el navegador no permitió cerrar esta ventana automáticamente. Cerrá la pestaña o la aplicación desde los controles de tu dispositivo.</p>
            <div className="landing-app-exit-actions landing-app-exit-actions-single">
              <button type="button" className="landing-app-exit-confirm" onClick={() => setCloseBlocked(false)}>Entendido</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
