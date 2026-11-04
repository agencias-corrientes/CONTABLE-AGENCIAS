"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const nav = [
  ["pagos", "Rendiciones", "↔", "Control diario"],
  ["agencias", "Subagentes y ambulantes", "▣", "Gestión de agentes"],
  ["buscar", "Buscar", "⌕", "Consultas y registros"],
  ["juegos", "Juegos y comisiones", "◎", "Gestión comercial"],
  ["loteria-correntina", "Lotería Correntina", "◉", "Información y servicios"],
  ["configuracion", "Configuración", "⚙", "Opciones de agencia"],
] as const;

export function AppShell({
  children,
  organizationName,
  userEmail,
  userRole,
  isPlatformAdmin,
}: {
  children: React.ReactNode;
  organizationName: string;
  userEmail: string;
  userRole: string;
  isPlatformAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const officialAgencyNumber = organizationName.match(/\b(\d{3})\b/)?.[1] ?? null;

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
          <div className="brand-logo-wrap sidebar-logo"><Image src="/Esfera%20brillante%20de%20Agencias%20Corrientes.png" alt="Agencias Corrientes — Quiniela Oficial" width={48} height={48} priority /></div>
          <div className="brand-copy">
            <div className="brand-title-row"><strong>Agencias</strong>{officialAgencyNumber && <span className="official-agency-number" aria-label={"Agencia oficial " + officialAgencyNumber}>{officialAgencyNumber}</span>}</div>
            <span className="brand-subtitle">Subagentes · Ambulantes</span>
          </div>
        </div>
        <nav className="nav-list">
          {visibleNav.map(([slug, label, icon, description]) => {
            const href = `/${slug}`;
            return (
              <Link
                key={slug}
                href={href}
                onClick={slug === "pagos" ? (event) => {
                  event.preventDefault();
                  router.push("/pagos");
                } : undefined}
                className={pathname.startsWith(href) ? "nav-item active" : "nav-item"}
              >
                <span className="nav-icon" aria-hidden="true">{icon}</span>
                <span className="nav-copy">
                  <span className="nav-label">{label}</span>
                  <span className="nav-description">{description}</span>
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="user-role-line">
            <span className="user-role-pill">{displayRole}</span>
            <span className="user-line" title={userEmail}>{userEmail}</span>
          </div>
          {isPlatformAdmin && <Link href="/plataforma/accesos" className="button ghost full central-return-button">↩ Volver a control de agencia</Link>}
          <button className="button ghost full" onClick={signOut}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="content-area">{children}</main>
      <style jsx>{`
        .sidebar { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .sidebar-brand strong { font-size: 17px; font-weight: 800; letter-spacing: -.025em; }
        .sidebar-brand span { font-size: 11px; line-height: 1.45; letter-spacing: .015em; }
        .sidebar .org-chip { min-height: 42px; border: 1px solid rgba(255,255,255,.14); border-radius: 11px; font-size: 12px; font-weight: 700; letter-spacing: .015em; }
        .sidebar .user-role-pill { font-size: 11px; font-weight: 800; letter-spacing: .025em; }
        .sidebar .user-line { font-size: 11px; line-height: 1.4; }
        .sidebar .central-return-button { display: flex; margin-top: 6px; margin-bottom: 22px; min-height: 48px; padding: 9px 10px; border-color: rgba(255,255,255,.35); line-height: 1.25; white-space: normal; text-align: center; font-size: 12px; font-weight: 800; }
        .sidebar .sidebar-footer .button { min-height: 40px; border-color: rgba(255,255,255,.3); font-size: 12px; font-weight: 750; }
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



        .sidebar .nav-list { display:grid; grid-template-columns:minmax(0,1fr); gap:9px; margin:8px 0 16px; }
        .sidebar .nav-list .nav-item {
          position:relative; display:flex; align-items:center; gap:11px; min-width:0;
          min-height:54px; padding:10px 12px; border:1px solid rgba(255,255,255,.22);
          border-radius:10px; background:#7c3347; color:#fff8eb; text-decoration:none;
          font-size:14px; font-weight:750; line-height:1.25; box-shadow:none;
          transition:background .15s ease,border-color .15s ease;
        }
        .sidebar .nav-list .nav-item .nav-icon {
          display:inline-flex; flex:0 0 28px; width:28px; height:28px;
          align-items:center; justify-content:center; margin:0; border:0;
          background:transparent; color:#f3d778; font-size:22px; font-weight:800; line-height:1;
        }
        .sidebar .nav-list .nav-item .nav-copy { display:grid; gap:3px; min-width:0; }
        .sidebar .nav-list .nav-item .nav-label { color:inherit; font-size:14px; font-weight:800; line-height:1.2; }
        .sidebar .nav-list .nav-item .nav-description { color:rgba(255,248,235,.78); font-size:10px; font-weight:550; line-height:1.25; }
        .sidebar .nav-list .nav-item:hover:not(.active) { background:#6e2b3e; border-color:#e4c96e; }
        .sidebar .nav-list .nav-item.active,
        .sidebar .nav-list .nav-item.active:hover {
          background:#e8c95f !important; color:#2c2020 !important; border:1.5px solid #171313 !important;
          box-shadow:inset 0 0 0 1px rgba(255,255,255,.18) !important; transform:none !important;
        }
        .sidebar .nav-list .nav-item.active .nav-icon { color:#64283a; }
        .sidebar .nav-list .nav-item.active .nav-description { color:#514127; }
        @media (max-width:1000px) {
          .app-shell { display:block !important; width:100% !important; min-height:100dvh !important; }
          .sidebar {
            position:relative !important; top:auto !important; width:100% !important; height:auto !important;
            min-height:100dvh !important; box-sizing:border-box !important;
            padding: max(14px,env(safe-area-inset-top)) 12px max(16px,env(safe-area-inset-bottom)) !important;
            background:#fffdf6 !important; color:#241d20 !important; border:0 !important;
            border-bottom:3px solid #7c3347 !important;
          }
          .sidebar-brand { align-items:center; padding:2px 4px 10px !important; }
          .sidebar .brand-subtitle { color:#6f6060 !important; }
          .sidebar .nav-list {
            grid-template-columns:repeat(2,minmax(0,1fr)) !important;
            grid-auto-rows:auto !important; align-items:stretch !important;
            gap:10px !important; margin:8px 0 12px !important; padding:0 !important;
            min-height:0 !important;
          }
          .sidebar .nav-list::before { display:none !important; content:none !important; }
          .sidebar .nav-list .nav-item,
          .sidebar .nav-list .nav-item:hover,
          .sidebar .nav-list .nav-item:focus,
          .sidebar .nav-list .nav-item:active {
            display:flex !important; position:relative !important; width:100% !important; min-width:0 !important;
            min-height:0 !important; height:auto !important; aspect-ratio:1 / 1 !important;
            box-sizing:border-box !important; align-items:center !important; justify-content:center !important;
            padding:34px 10px 12px !important; margin:0 !important;
            border:1.5px solid #171313 !important; border-radius:10px !important;
            background:#e8c95f !important; background-image:none !important; color:#2c2020 !important;
            font-size:14px !important; font-weight:800 !important; line-height:1.18 !important;
            text-align:center !important; text-decoration:none !important; box-shadow:0 2px 0 rgba(35,25,10,.12) !important;
            transform:none !important; outline:none !important; overflow:hidden !important;
            -webkit-tap-highlight-color:transparent;
          }
          .sidebar .nav-list .nav-item.active,
          .sidebar .nav-list .nav-item.active:hover,
          .sidebar .nav-list .nav-item.active:focus,
          .sidebar .nav-list .nav-item.active:active {
            background:#e8c95f !important; color:#2c2020 !important;
            border:2px solid #111 !important; box-shadow:inset 0 0 0 1px rgba(255,255,255,.2) !important;
          }
          .sidebar .nav-list .nav-item .nav-icon {
            position:absolute !important; top:10px !important; left:11px !important;
            display:inline-flex !important; width:25px !important; height:25px !important;
            flex:0 0 25px !important; margin:0 !important; padding:0 !important;
            color:#64283a !important; font-size:22px !important; line-height:1 !important;
          }
          .sidebar .nav-list .nav-item .nav-copy {
            display:grid !important; justify-items:center !important; align-content:center !important;
            gap:5px !important; width:100% !important; min-width:0 !important;
          }
          .sidebar .nav-list .nav-item .nav-label {
            display:block !important; max-width:100% !important; color:#2c2020 !important;
            font-size:clamp(13px,3.65vw,15px) !important; font-weight:850 !important;
            line-height:1.16 !important; text-align:center !important;
            white-space:normal !important; overflow-wrap:normal !important; word-break:normal !important;
            hyphens:none !important; text-wrap:balance;
          }
          .sidebar .nav-list .nav-item .nav-description {
            display:block !important; max-width:100% !important; color:#59492b !important;
            font-size:10px !important; font-weight:600 !important; line-height:1.2 !important;
            text-align:center !important; white-space:normal !important; overflow-wrap:normal !important;
          }
          .sidebar .sidebar-footer { margin-top:8px !important; }
          .sidebar .sidebar-footer .button { min-height:38px !important; }
          .content-area { width:100% !important; min-width:0 !important; padding:12px !important; }
        }
        @media (max-width:360px) {
          .sidebar .nav-list { gap:8px !important; }
          .sidebar .nav-list .nav-item { padding-left:7px !important; padding-right:7px !important; }
          .sidebar .nav-list .nav-item .nav-label { font-size:13px !important; }
          .sidebar .nav-list .nav-item .nav-description { font-size:9px !important; }
        }

        @media (max-width: 1000px) {
          .app-shell { display:block !important; width:100% !important; min-height:100vh !important; min-height:100svh !important; min-height:100dvh !important; }
          .sidebar { position:relative !important; top:auto !important; width:100% !important; height:auto !important; min-height:100vh !important; min-height:100svh !important; min-height:100dvh !important; box-sizing:border-box !important; padding-top:max(16px,env(safe-area-inset-top)) !important; padding-bottom:max(18px,env(safe-area-inset-bottom)) !important; }
          .content-area { width:100% !important; min-width:0 !important; padding:12px !important; }
          .sidebar .nav-list .nav-item { transition:none !important; }
        }
      `}</style>
    </div>
  );
}
