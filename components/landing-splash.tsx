"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/** Presentación institucional: el logo original es el único elemento animado. */
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
        <div className="landing-splash-logo">
          <Image
            src="/logo-agencias-corrientes-v2.webp"
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
