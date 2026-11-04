"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * En la web muestra el splash propio.
 * En la aplicación PWA instalada se omite: Android ya muestra el splash nativo
 * generado desde el manifest y los iconos de la aplicación.
 */
export function LandingSplash() {
  const [phase, setPhase] = useState<"checking" | "show" | "fade" | "hidden">("checking");

  useEffect(() => {
    const isInstalledApp =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isInstalledApp) {
      setPhase("hidden");
      return;
    }

    setPhase("show");
    const fadeTimer = window.setTimeout(() => setPhase("fade"), 1150);
    const removeTimer = window.setTimeout(() => setPhase("hidden"), 2050);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (phase === "checking" || phase === "hidden") return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#ffffff",
        opacity: phase === "fade" ? 0 : 1,
        transition: "opacity 850ms ease-in-out",
        pointerEvents: phase === "fade" ? "none" : "auto",
      }}
    >
      <Image
        src="/Esfera_brillante_de_Agencias_Corrientes-removebg-preview.png"
        alt=""
        width={512}
        height={512}
        priority
        style={{
          display: "block",
          width: "min(72vw, 176px)",
          height: "auto",
          borderRadius: 0,
          background: "transparent",
          boxShadow: "none",
          filter: "none",
        }}
      />
    </div>
  );
}
