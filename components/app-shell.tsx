"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const nav = [
  ["pagos", "Rendiciones", "↔"],
  ["agencias", "Subagentes y ambulantes", "♟"],
  ["buscar", "Buscar", "⌕"],
  ["juegos", "Juegos y comisiones", "◎"],
  ["loteria-correntina", "Lotería Correntina", "◉"],
  ["equipo", "Personal y permisos", "♙"],
  ["dashboard", "Configuración", "⚙"],
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

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const displayRole =
    userRole === "owner" || userRole === "admin"
      ? "Administrador"
      : "Empleado";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small">AC</div>
          <div>
            <strong>Agencias</strong>
            <span>Subagentes · Ambulantes</span>
          </div>
        </div>

        <div className="org-chip">
          <span className="status-dot" />
          <span>{organizationName}</span>
        </div>

        <nav className="nav-list">
          {nav.map(([slug, label, icon]) => {
            const href = slug === "dashboard" ? "/dashboard" : `/${slug}`;
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={slug}
                href={href}
                className={isActive ? "nav-item active" : "nav-item"}
              >
                <span className="nav-icon">{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-role-line">
            <span className="user-role-pill">{displayRole}</span>
            <span className="user-line" title={userEmail}>
              {userEmail}
            </span>
          </div>
          <button className="button ghost full" onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="content-area">{children}</main>
    </div>
  );
}
