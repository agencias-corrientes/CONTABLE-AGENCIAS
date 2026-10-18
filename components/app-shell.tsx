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
          <div className="brand-logo-wrap sidebar-logo"><Image src="/logo-agencias-corrientes.webp" alt="Agencias Corrientes — Quiniela Oficial" width={48} height={48} priority /></div>
          <div className="brand-copy">
            <div className="brand-title-row"><strong>Agencias</strong>{officialAgencyNumber && <span className="official-agency-number" aria-label={"Agencia oficial " + officialAgencyNumber}>{officialAgencyNumber}</span>}</div>
            <span className="brand-subtitle">Subagentes · Ambulantes</span>
          </div>
        </div>
        <nav className="nav-list">
          {visibleNav.map(([slug, label]) => {
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
                {label}
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
      <style jsx>{`
        .sidebar { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .sidebar-brand strong { font-size: 17px; font-weight: 800; letter-spacing: -.025em; }
        .sidebar-brand span { font-size: 11px; line-height: 1.45; letter-spacing: .015em; }
        .sidebar .org-chip { min-height: 42px; border: 1px solid rgba(255,255,255,.14); border-radius: 11px; font-size: 12px; font-weight: 700; letter-spacing: .015em; }
        .sidebar .nav-list { display: grid; gap: 9px; margin-top: 8px; }
        .sidebar .nav-list .nav-item { position: relative; display: flex; align-items: center; gap: 0; min-height: 50px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.18); border-bottom: 3px solid #54202f; border-radius: 12px; background: linear-gradient(180deg, #93475b 0%, #7c3347 62%, #702a3e 100%); color: #fff8eb; font-size: 15px; font-weight: 700; line-height: 1.35; letter-spacing: .005em; box-shadow: 0 3px 0 rgba(48,12,23,.22), 0 5px 10px rgba(35,8,16,.12); transition: background .16s ease, color .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
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
          .sidebar .nav-list .nav-item { justify-content: flex-start; align-items: center; min-height: 64px; padding: 11px 10px; gap: 8px; border-radius: 11px; font-size: 16px; font-weight: 800; line-height: 1.25; overflow-wrap: anywhere; min-width: 0; box-shadow: 0 3px 0 rgba(48,12,23,.22), 0 5px 10px rgba(35,8,16,.12); }
          .sidebar .nav-list .nav-item .nav-icon { flex-basis: 28px; width: 28px; height: 28px; font-size: 15px; }
          .sidebar .nav-list .nav-item.active { box-shadow: inset 4px 0 #d1b35a, 0 3px 0 rgba(48,12,23,.16), 0 6px 12px rgba(30,10,16,.15) !important; }
        }
        @media (max-width: 420px) {
          .sidebar .nav-list { gap: 7px; }
          .sidebar .nav-list .nav-item { min-height: 68px; padding: 10px 8px; gap: 6px; font-size: 15px; font-weight: 800; line-height: 1.25; }
          .sidebar .nav-list .nav-item .nav-icon { flex-basis: 25px; width: 25px; height: 25px; border-radius: 7px; }
        }
        .brand-copy { min-width: 0; flex: 1; align-self: stretch; display: flex; flex-direction: column; justify-content: center; gap: 1px; }
        .brand-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 48px; height: 48px; min-width: 0; }
        .sidebar .brand-title-row strong { display: block; font-size: 18px; line-height: 1.1; }
        .sidebar .brand-subtitle { display: block; color: #eadcc2; font-size: 12px; line-height: 1.2; letter-spacing: .005em; white-space: nowrap; }
        .official-agency-number { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 52px; width: 52px; height: 44px; padding: 0; border: 1px solid #eadbb4; border-radius: 8px; background: #f4edcf; color: #30250b; font-size: 20px !important; font-weight: 950; line-height: 1; letter-spacing: .01em; box-shadow: 0 3px 0 rgba(30,10,16,.19); }
        @media (max-width: 1000px) {
          .sidebar-brand { align-items: flex-start; }
          .sidebar .org-chip { display: none !important; }
          .sidebar .nav-list .nav-item { font-size: 16px; font-weight: 800; line-height: 1.25; overflow-wrap: anywhere; min-width: 0; }
          .sidebar .nav-list .nav-item .nav-icon { flex-shrink: 0; }
        }
        @media (max-width: 420px) {
          .sidebar .nav-list .nav-item { font-size: 15px; min-height: 68px; padding: 10px 8px; line-height: 1.25; }
          .sidebar .brand-title-row { gap: 6px; }
          .sidebar .brand-title-row strong { font-size: 17px; }
          .sidebar .brand-subtitle { font-size: 11px; }
          .official-agency-number { flex-basis: 52px; width: 52px; height: 44px; font-size: 20px !important; }
        }

        /* Ajustes puntuales en celular: compactar el recibo leído, no la lista de carga manual. */
        :global(.ticket-photo-picker .ticket-photo-picker-cta) { color: #fff !important; font-size: 14px !important; font-weight: 900 !important; }
        @media (max-width: 640px) {
          :global(.ticket-closure-receipt.is-editable) { margin: 5px 0; padding: 7px; border-radius: 8px; font-size: 11px; line-height: 1.25; }
          :global(.ticket-closure-receipt.is-editable .ticket-closure-title) { padding-bottom: 5px; margin-bottom: 5px; }
          :global(.ticket-closure-receipt.is-editable .ticket-closure-title span) { font-size: 8px; letter-spacing: .04em; }
          :global(.ticket-closure-receipt.is-editable .ticket-closure-title h3) { font-size: 15px; letter-spacing: .04em; }
          :global(.ticket-closure-receipt.is-editable .ticket-closure-title p) { font-size: 10px; line-height: 1.25; margin: 4px 0 0; }
          :global(.ticket-closure-identifiers), :global(.ticket-closure-footer) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; padding: 5px 0; }
          :global(.ticket-meta-field) { gap: 2px; font-size: 10px; line-height: 1.2; }
          :global(.ticket-meta-field > span) { font-size: 9px; }
          :global(.ticket-meta-field input) { min-height: 29px; padding: 4px 5px; font-size: 11px; }
          :global(.ticket-closure-grid), :global(.ticket-closure-receipt.is-compact .ticket-closure-grid) { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 5px; margin-top: 5px; }
          :global(.ticket-closure-section) { padding: 5px; border-radius: 6px; }
          :global(.ticket-closure-section h4) { font-size: 11px; line-height: 1.15; margin-bottom: 4px; }
          :global(.ticket-sales-row) { margin: 0 0 3px; }
          :global(.ticket-sales-row > small) { padding: 2px 3px 3px; font-size: 9px; line-height: 1.15; }
          :global(.ticket-closure-line) { gap: 4px; padding: 3px 0; font-size: 10px; line-height: 1.2; }
          :global(.ticket-closure-line strong) { font-size: 10px; }
          :global(.ticket-closure-edit-line) { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 3px; padding: 4px 0; align-items: center; }
          :global(.ticket-closure-edit-line > strong) { grid-column: 1; grid-row: 1; font-size: 10px; line-height: 1.15; min-width: 0; }
          :global(.ticket-closure-edit-line > label:nth-of-type(1)) { grid-column: 1; grid-row: 2; min-width: 0; }
          :global(.ticket-closure-edit-line > label:nth-of-type(2)) { grid-column: 2; grid-row: 2; min-width: 0; }
          :global(.ticket-closure-edit-line > label) { gap: 2px; font-size: 8px; line-height: 1.1; }
          :global(.ticket-closure-edit-line > label > span) { font-size: 8px; }
          :global(.ticket-closure-edit-line input) { min-height: 28px; padding: 4px; font-size: 11px !important; }
          :global(.ticket-closure-edit-line .ticket-clear-row) { grid-column: 2; grid-row: 1; justify-self: end; min-height: 22px; padding: 2px 5px; font-size: 9px; }
          :global(.ticket-draw-row) { grid-template-columns: minmax(0, 1fr) minmax(55px, .7fr) auto; gap: 3px; }
          :global(.ticket-draw-row input) { min-height: 28px; padding: 4px; font-size: 10px; }
          :global(.ticket-add-draw) { padding: 5px 7px; min-height: 28px; font-size: 10px; }
          :global(.ticket-closure-validation) { margin: 5px 0 0; padding: 6px 7px; font-size: 9px; line-height: 1.25; }
          :global(.ticket-closure-accept-actions) { gap: 5px; padding: 7px; margin: 6px 0; }
          :global(.ticket-closure-accept-actions p) { font-size: 10px; line-height: 1.25; }
          :global(.ticket-closure-accept-actions .button) { min-height: 30px; padding: 6px 8px; font-size: 10px; }
        }
        @media (max-width: 380px) {
          :global(.ticket-closure-section) { padding: 4px; }
          :global(.ticket-closure-section h4) { font-size: 10px; }
          :global(.ticket-closure-edit-line input) { font-size: 10px !important; }
          :global(.ticket-closure-edit-line > strong) { font-size: 9px; }
        }


        /* Jerarquía visual exclusiva para el menú en celular. */
        @media (max-width: 640px) {
          .sidebar .nav-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            margin-top: 12px;
            padding: 10px;
            border: 1px solid rgba(255,255,255,.15);
            border-radius: 15px;
            background: rgba(39, 10, 20, .22);
            box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
          }
          .sidebar .nav-list::before {
            content: "MENÚ PRINCIPAL";
            grid-column: 1 / -1;
            display: block;
            padding: 1px 2px 4px;
            color: #eadcc2;
            font-size: 10px;
            font-weight: 850;
            letter-spacing: .14em;
          }
          .sidebar .nav-list .nav-item:nth-child(1) { order: 1; }
          .sidebar .nav-list .nav-item:nth-child(3) { order: 2; }
          .sidebar .nav-list .nav-item:nth-child(5) { order: 3; }
          .sidebar .nav-list .nav-item:nth-child(2) { order: 4; }
          .sidebar .nav-list .nav-item:nth-child(4) { order: 5; }
          .sidebar .nav-list .nav-item:nth-child(6) { order: 6; }
          .sidebar .nav-list .nav-item {
            min-width: 0;
            min-height: 58px;
            padding: 10px 11px;
            border-radius: 10px;
            font-size: 13.5px;
            line-height: 1.22;
            font-weight: 800;
            text-align: left;
            justify-content: flex-start;
            overflow-wrap: anywhere;
            box-shadow: 0 2px 0 rgba(48,12,23,.2), 0 4px 8px rgba(35,8,16,.1);
          }
          .sidebar .nav-list .nav-item.active {
            transform: none;
            box-shadow: inset 4px 0 #d1b35a, 0 2px 0 rgba(48,12,23,.13);
          }
          .sidebar .nav-list .nav-item:active:not(.active) {
            transform: translateY(1px);
          }
        }

      `}</style>
    </div>
  );
}
