"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/** Splash simple: muestra únicamente el logo completo, sin animaciones ni adornos. */
export function LandingSplash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 2600);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div aria-hidden="true" className="landing-splash-motion">
      <div className="landing-splash-stage">
        <div className="landing-splash-logo">
          <Image
            src="/logo-agencias-corrientes-v2.webp"
            alt=""
            width={512}
            height={512}
            priority
            unoptimized
            style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", background: "transparent" }}
          />
        </div>
      </div>
    </div>
  );
}
