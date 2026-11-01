"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/** Presentación breve y animada de la identidad institucional al abrir la portada. */
export function LandingSplash() {
  const [phase, setPhase] = useState<"show" | "fade" | "hidden">("show");

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setPhase("fade"), 1450);
    const removeTimer = window.setTimeout(() => setPhase("hidden"), 2350);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden="true"
      className={`landing-splash-motion landing-splash-motion--${phase}`}
    >
      <div className="landing-splash-orbit landing-splash-orbit--outer" />
      <div className="landing-splash-orbit landing-splash-orbit--inner" />
      <span className="landing-splash-particle landing-splash-particle--one" />
      <span className="landing-splash-particle landing-splash-particle--two" />
      <span className="landing-splash-particle landing-splash-particle--three" />
      <div className="landing-splash-logo">
        <Image
          src="/logo-agencias-corrientes.webp"
          alt=""
          width={220}
          height={220}
          priority
          unoptimized
          style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
      <div className="landing-splash-bottom-line" />
    </div>
  );
}
