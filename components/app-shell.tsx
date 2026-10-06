"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const nav = [
  ["dashboard", "Dashboard", "▦"],
  ["agencias", "Agencias", "♟"],
  ["asientos", "Asientos", "≡"],
  ["cuentas", "Plan de cuentas", "◇"],
  ["contactos", "Contactos", "◎"],
  ["ventas", "Ventas", "↗"],
  ["compras", "Compras", "↙"],
  ["movimientos", "Caja y bancos", "◫"],
  ["pagos", "Pagos", "↔"],
  ["reportes", "Reportes", "◢"],
  ["configuracion", "Configuración", "⚙"],
];

export function AppShell({children,organizationName,userEmail}:{children:React.ReactNode;organizationName:string;userEmail:string}) {
  const pathname=usePathname();
  const router=useRouter();

  async function signOut(){const supabase=createClient();await supabase.auth.signOut();router.push("/login");router.refresh()}

  return <div className="app-shell"><aside className="sidebar">
    <div className="sidebar-brand"><div className="brand-mark small">AC</div><div><strong>Contable</strong><span>Agencias Corrientes</span></div></div>
    <div className="org-chip"><span className="status-dot" /><span>{organizationName}</span></div>
    <nav className="nav-list">{nav.map(([slug,label,icon])=><Link key={slug} href={slug==="dashboard"?"/dashboard":`/${slug}`} className={pathname.startsWith(`/${slug}`)?"nav-item active":"nav-item"}><span className="nav-icon">{icon}</span>{label}</Link>)}</nav>
    <div className="sidebar-footer"><div className="user-line" title={userEmail}>{userEmail}</div><button className="button ghost full" onClick={signOut}>Cerrar sesión</button></div>
  </aside><main className="content-area">{children}</main></div>;
}