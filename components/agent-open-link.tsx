"use client";

import Link from "next/link";
import { useState } from "react";

export function AgentOpenLink({ href, className, children, ariaLabel, title }: {
  href: string;
  className: string;
  children: React.ReactNode;
  ariaLabel: string;
  title: string;
}) {
  const [opening, setOpening] = useState(false);
  return (
    <Link
      href={href}
      prefetch
      className={className}
      aria-label={ariaLabel}
      title={title}
      onClick={() => setOpening(true)}
      aria-busy={opening}
    >
      {opening ? <><span className="agent-open-spinner" aria-hidden="true" /> Abriendo…</> : children}
      <style jsx>{`
        .agent-open-spinner { display:inline-block; width:12px; height:12px; margin-right:6px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; vertical-align:-1px; animation:agent-spin .55s linear infinite; }
        @keyframes agent-spin { to { transform:rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .agent-open-spinner { animation:none; } }
      `}</style>
    </Link>
  );
}
