"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/** Intro institucional breve con objetos 3D en movimiento. */
export function LandingSplash() {
  const [phase, setPhase] = useState<"show" | "fade" | "hidden">("show");

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setPhase("fade"), 2600);
    const removeTimer = window.setTimeout(() => setPhase("hidden"), 3100);
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
      <div className="landing-splash-stage">
        <div className="landing-splash-ring landing-splash-ring--outer" />
        <div className="landing-splash-ring landing-splash-ring--inner" />
        <span className="landing-splash-object landing-splash-object--gold" />
        <span className="landing-splash-object landing-splash-object--ruby" />
        <span className="landing-splash-object landing-splash-object--blue" />
        <span className="landing-splash-cube" />
        <span className="landing-splash-glint landing-splash-glint--one" />
        <span className="landing-splash-glint landing-splash-glint--two" />
        <span className="landing-splash-glint landing-splash-glint--three" />
        <div className="landing-splash-logo">
          <Image
            src="/logo-agencias-quiniela.svg"
            alt=""
            width={256}
            height={256}
            priority
            unoptimized
            style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", background: "transparent" }}
          />
        </div>
      </div>
    </div>
  );
}
