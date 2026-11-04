"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/** Splash blanco con el logo, visible al iniciar tanto en web como en la aplicación instalada. */
export function LandingSplash() {
  const [phase, setPhase] = useState<"show" | "fade" | "hidden">("show");

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setPhase("fade"), 1150);
    const removeTimer = window.setTimeout(() => setPhase("hidden"), 2050);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (phase === "hidden") return null;

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
