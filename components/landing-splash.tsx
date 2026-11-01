"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/** Splash institucional: muestra el logo 3D completo, sin adornos ni animaciones. */
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
            src="/agencias-corrientes-logo-3d.svg"
            alt=""
            width={800}
            height={800}
            priority
            unoptimized
            style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", background: "transparent" }}
          />
        </div>
      </div>
    </div>
  );
}
