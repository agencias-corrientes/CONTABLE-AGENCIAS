"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const nav = [
  ["pagos", "Rendiciones", "↔"],
  ["agencias", "Subagentes y ambulantes", ""],
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
          <div><strong>Agencias</strong><span>Subagentes · Ambulantes</span></div>
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
        .sidebar .nav-list { gap: 7px; margin-top: 5px; }
        .sidebar .nav-list .nav-item { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 11px 12px; border: 1px solid transparent; border-radius: 12px; color: #fff4e4; font-size: 13.5px; font-weight: 650; line-height: 1.35; letter-spacing: .005em; transition: background-color .16s ease, color .16s ease, border-color .16s ease, transform .16s ease; }
        .sidebar .nav-list .nav-item .nav-icon { display: inline-flex; flex: 0 0 27px; width: 27px; height: 27px; align-items: center; justify-content: center; margin: 0; border: 1px solid rgba(255,255,255,.22); border-radius: 8px; background: rgba(255,255,255,.09); color: #ffe5a0; font-size: 16px; font-weight: 800; line-height: 1; }
        .sidebar .nav-list .nav-item:hover:not(.active) { background: rgba(255,255,255,.11); border-color: rgba(255,255,255,.24); color: #fff; outline: none !important; transform: translateX(2px); }
        .sidebar .nav-list .nav-item.active { background: #fffdf7 !important; color: #64283a !important; border-color: #e5d6ac !important; outline: none !important; box-shadow: inset 4px 0 #d1b35a, 0 4px 12px rgba(30,10,16,.13) !important; font-weight: 800; }
        .sidebar .nav-list .nav-item.active .nav-icon { background: #f4edcf; border-color: #e2d3a8; color: #64283a; }
        .sidebar .user-role-pill { font-size: 11px; font-weight: 800; letter-spacing: .025em; }
        .sidebar .user-line { font-size: 11px; line-height: 1.4; }
        .sidebar .sidebar-footer .button { min-height: 40px; border-color: rgba(255,255,255,.3); font-size: 12px; font-weight: 750; }
        @media (max-width: 1000px) { .sidebar .nav-list .nav-item { justify-content: flex-start; min-height: 44px; padding: 9px 10px; } }\n      `}</style>\n    </div>
  );
}
