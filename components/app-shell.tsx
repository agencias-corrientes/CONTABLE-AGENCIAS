"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const nav = [
  ["pagos", "Rendiciones", "↔"],
  ["agencias", "Subagentes y ambulantes", "▣"],
  ["buscar", "Buscar", "⌕"],
  ["juegos", "Juegos y comisiones", "◎"],
  ["loteria-correntina", "Lotería Correntina", "◉"],
  ["configuracion", "Configuración", "⚙"],
] as const;

export function AppShell({
  children,
  organizationName,
  userEmail,
  userRole,
}: {
  children: React.ReactNode;
  organizationName: string;
  userEmail: string;
  userRole: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const officialAgencyNumber = organizationName.match(/\b(\d{3})\b/)?.[1] ?? null;

  useEffect(() => {
    if (window.matchMedia("(max-width: 1000px)").matches) {
      document.querySelector(".content-area")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pathname]);
  const isOwner = userRole === "owner";
  const visibleNav = nav.filter(([slug]) => isOwner || !["juegos", "equipo", "configuracion"].includes(slug));

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const displayRole = isOwner || userRole === "admin" ? "Administrador" : "Empleado";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small brand-logo-wrap"><Image src="/logo-agencias-quiniela.webp" alt="Agencias de Quiniela" width={44} height={44} priority /></div>
          <div className="brand-copy"><strong>Agencias</strong><div className="brand-subline"><span>Subagentes · Ambulantes</span>{officialAgencyNumber && <span className="official-agency-number" aria-label={"Agencia oficial " + officialAgencyNumber}>{officialAgencyNumber}</span>}</div></div>
        </div>
        <div className="org-chip"><span className="status-dot" /><span>{organizationName}</span></div>
        <nav className="nav-list">
          {visibleNav.map(([slug, label, icon]) => {
            const href = `/${slug}`;
            return (
              <Link
                key={slug}
                href={href}
                onClick={slug === "pagos" ? (event) => {
                  event.preventDefault();
                  router.push("/pagos");
                  router.refresh();
                } : undefined}
                className={pathname.startsWith(href) ? "nav-item active" : "nav-item"}
              >
                {icon ? <span className="nav-icon">{icon}</span> : null}{label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="user-role-line">
            <span className="user-role-pill">{displayRole}</span>
            <span className="user-line" title={userEmail}>{userEmail}</span>
          </div>
          <button className="button ghost full" onClick={signOut}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="content-area">{children}</main>
      <style jsx>{`\n        .sidebar { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .sidebar-brand strong { font-size: 17px; font-weight: 800; letter-spacing: -.025em; }
        .sidebar-brand span { font-size: 11px; line-height: 1.45; letter-spacing: .015em; }
        .sidebar .org-chip { min-height: 42px; border: 1px solid rgba(255,255,255,.14); border-radius: 11px; font-size: 12px; font-weight: 700; letter-spacing: .015em; }
        .sidebar .nav-list { display: grid; gap: 9px; margin-top: 8px; }
        .sidebar .nav-list .nav-item { position: relative; display: flex; align-items: center; gap: 11px; min-height: 50px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.18); border-bottom: 3px solid #54202f; border-radius: 12px; background: linear-gradient(180deg, #93475b 0%, #7c3347 62%, #702a3e 100%); color: #fff8eb; font-size: 15px; font-weight: 700; line-height: 1.35; letter-spacing: .005em; box-shadow: 0 3px 0 rgba(48,12,23,.22), 0 5px 10px rgba(35,8,16,.12); transition: background .16s ease, color .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
        .sidebar .nav-list .nav-item .nav-icon { display: inline-flex; flex: 0 0 30px; width: 30px; height: 30px; align-items: center; justify-content: center; margin: 0; border: 1px solid rgba(255,255,255,.3); border-radius: 9px; background: linear-gradient(180deg,rgba(255,255,255,.19),rgba(255,255,255,.07)); color: #ffe5a0; font-size: 16px; font-weight: 800; line-height: 1; box-shadow: inset 0 1px 0 rgba(255,255,255,.18); }
        .sidebar .nav-list .nav-item:hover:not(.active) { background: linear-gradient(180deg,#a45167 0%,#87384e 100%); border-color: rgba(255,255,255,.42); color: #fff; outline: none !important; transform: translateY(-1px); box-shadow: 0 4px 0 rgba(48,12,23,.22), 0 8px 14px rgba(35,8,16,.18); }
        .sidebar .nav-list .nav-item:active:not(.active) { transform: translateY(1px); box-shadow: 0 1px 0 rgba(48,12,23,.25); }
        .sidebar .nav-list .nav-item.active { background: #ffffff !important; background-image: linear-gradient(180deg,#ffffff 0%,#fffdf7 100%) !important; color: #64283a !important; border: 1px solid #dfcda0 !important; border-bottom: 3px solid #b79a45 !important; outline: none !important; box-shadow: inset 4px 0 #d1b35a, 0 4px 0 rgba(48,12,23,.18), 0 7px 14px rgba(30,10,16,.16) !important; font-weight: 850; transform: translateY(-1px); }
        .sidebar .nav-list .nav-item.active .nav-icon { background: linear-gradient(180deg,#fff7d9,#f4edcf); border-color: #e2d3a8; color: #64283a; box-shadow: inset 0 1px 1px rgba(90,60,20,.08); }
        .sidebar .nav-list .nav-item.active:hover { background: #fff !important; color: #64283a !important; }
        .sidebar .user-role-pill { font-size: 11px; font-weight: 800; letter-spacing: .025em; }
        .sidebar .user-line { font-size: 11px; line-height: 1.4; }
        .sidebar .sidebar-footer .button { min-height: 40px; border-color: rgba(255,255,255,.3); font-size: 12px; font-weight: 750; }
        @media (max-width: 1000px) {
          .sidebar { padding: 15px 12px 13px; }
          .sidebar-brand { padding-bottom: 14px; }
          .sidebar .nav-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin-top: 7px; }
          .sidebar .nav-list .nav-item { justify-content: flex-start; align-items: center; min-height: 58px; padding: 10px 9px; gap: 8px; border-radius: 11px; font-size: 13.5px; line-height: 1.25; box-shadow: 0 3px 0 rgba(48,12,23,.22), 0 5px 10px rgba(35,8,16,.12); }
          .sidebar .nav-list .nav-item .nav-icon { flex-basis: 28px; width: 28px; height: 28px; font-size: 15px; }
          .sidebar .nav-list .nav-item.active { box-shadow: inset 4px 0 #d1b35a, 0 3px 0 rgba(48,12,23,.16), 0 6px 12px rgba(30,10,16,.15) !important; }
        }
        @media (max-width: 420px) {
          .sidebar .nav-list { gap: 7px; }
          .sidebar .nav-list .nav-item { min-height: 56px; padding: 9px 7px; gap: 6px; font-size: 12.5px; }
          .sidebar .nav-list .nav-item .nav-icon { flex-basis: 25px; width: 25px; height: 25px; border-radius: 7px; }
        }\n      `}
.brand-copy { min-width: 0; flex: 1; }
.brand-subline { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.brand-subline > span:first-child { min-width: 0; overflow-wrap: anywhere; }
.official-agency-number { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; min-width: 36px; padding: 5px 8px; border: 1px solid #e5d9b9; border-radius: 7px; background: #fff; color: #171717; font-size: 14px !important; font-weight: 900; line-height: 1.1; letter-spacing: .02em; box-shadow: 0 2px 0 rgba(30,10,16,.14); }
@media (max-width: 1000px) {
  .sidebar .nav-list .nav-item { font-size: 15px; line-height: 1.3; overflow-wrap: anywhere; min-width: 0; }
  .sidebar .nav-list .nav-item .nav-icon { flex-shrink: 0; }
}
@media (max-width: 420px) {
  .sidebar .nav-list .nav-item { font-size: 13.5px; min-height: 58px; padding: 10px 8px; }
  .brand-subline { gap: 5px; }
  .official-agency-number { min-width: 32px; padding: 4px 6px; font-size: 13px !important; }
}

      </style>\n    </div>
  );
}
