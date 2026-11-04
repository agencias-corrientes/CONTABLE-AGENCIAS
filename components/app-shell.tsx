"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const nav = [
  ["pagos", "Rendiciones", "M4 6h16M4 12h16M4 18h16", "Control diario", "01"],
  ["agencias", "Subagentes y ambulantes", "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M17 11h6", "Gestión de agentes", "02"],
  ["buscar", "Buscar", "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16M21 21l-4.35-4.35", "Consultas y registros", "03"],
  ["juegos", "Juegos y comisiones", "M4 19V5M4 19h16M7 15l4-4 3 2 5-7", "Gestión comercial", "04"],
  ["loteria-correntina", "Lotería Correntina", "M4 7h16v12H4zM8 7V5h8v2M8 12h8M8 15h5", "Información y servicios", "05"],
  ["configuracion", "Configuración", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M19.4 15l1.1 1.1-2.2 2.2-1.1-1.1M4.6 9 3.5 7.9l2.2-2.2L6.8 6.8", "Opciones de agencia", "06"],
] as const;

export function AppShell({
  children,
  organizationName,
  userEmail,
  userRole,
  isPlatformAdmin,
  agencyCode,
}: {
  children: React.ReactNode;
  organizationName: string;
  userEmail: string;
  userRole: string;
  isPlatformAdmin: boolean;
  agencyCode: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedSection = searchParams.get("seleccion") ?? "";
  const officialAgencyNumber = agencyCode;

  const isOwner = userRole === "owner";
  const visibleNav = nav.filter(([slug]) => isOwner || !["juegos", "equipo", "configuracion"].includes(slug));

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const displayRole = isOwner || userRole === "admin" ? "Administrador" : "Empleado";

  // Pide al formulario activo que confirme antes de salir de una rendición con ticket cargado.
  function guardTicketNavigation(event: React.MouseEvent<HTMLAnchorElement>) {
    const request = new Event("agencias:request-panel-return", { cancelable: true });
    if (!window.dispatchEvent(request)) event.preventDefault();
  }

  return (
    <div className={pathname === "/inicio" ? "app-shell mobile-navigation-home" : "app-shell"}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo-wrap sidebar-logo"><Image src="/Esfera_brillante_de_Agencias_Corrientes-removebg-preview.png" alt="Agencias Corrientes — Quiniela Oficial" width={48} height={48} priority /></div>
          <div className="brand-copy">
            <div className="brand-title-row"><strong>Agencias</strong>{officialAgencyNumber && <span className="official-agency-number" aria-label={"Agencia oficial " + officialAgencyNumber}>{officialAgencyNumber}</span>}</div>
            <span className="brand-subtitle">Subagentes · Ambulantes</span>
          </div>
        </div>
        <section className="panel-general-summary" aria-label="Resumen de la agencia">
          <div className="panel-general-summary-title">
            <span>AGENCIAS CORRIENTES</span>
            <strong>Panel general</strong>
          </div>
        </section>
        <nav className="nav-list" aria-label="Menú principal">
          {visibleNav.map(([slug, label, iconPath, description, number]) => {
            const href = `/${slug}`;
            const active = pathname.startsWith(href) || (pathname === "/inicio" && selectedSection === slug);
            return (
              <Link key={slug} href={href} prefetch={true} className={active ? "nav-item active" : "nav-item"} onClick={guardTicketNavigation}>
                <span className="panel-nav-number">{number}</span>
                <span className="panel-nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={iconPath} />
                  </svg>
                </span>
                <span className="panel-nav-copy">
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                <span className="panel-nav-accent" aria-hidden="true" />
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="user-role-line">
            <span className="user-role-pill">{displayRole}</span>
            <span className="user-line" title={userEmail}>{userEmail}</span>
          </div>
          {isPlatformAdmin && <Link href="/plataforma/accesos" className="button ghost full central-return-button" onClick={guardTicketNavigation}>↩ Volver a control de agencia</Link>}
          <button className="button ghost full" onClick={signOut}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="content-area">
        {pathname !== "/inicio" && <div className="mobile-panel-return"><button type="button" onClick={() => { const request = new Event("agencias:request-panel-return", { cancelable: true }); const shouldNavigate = window.dispatchEvent(request); if (shouldNavigate) router.push("/inicio?seleccion=" + (pathname.split("/")[1] ?? "")); }} aria-label="Volver al panel general"><span aria-hidden="true">←</span><span>Volver al panel general</span></button></div>}
        {pathname === "/inicio" ? (
          <div className="desktop-agency-home" aria-label="Agencias Corrientes">
            <Image
              src="/Esfera_brillante_de_Agencias_Corrientes-removebg-preview.png"
              alt="Agencias Corrientes — Quiniela Oficial"
              width={820}
              height={820}
              quality={100}
              priority
              sizes="(min-width: 1400px) 680px, 58vw"
              className="desktop-agency-home-logo"
            />
          </div>
        ) : children}
      </main>
      <style jsx>{`
        .sidebar { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .sidebar-brand strong { font-size: 17px; font-weight: 800; letter-spacing: -.025em; }
        .sidebar-brand span { font-size: 11px; line-height: 1.45; letter-spacing: .015em; }
        .sidebar .org-chip { min-height: 42px; border: 1px solid rgba(255,255,255,.14); border-radius: 11px; font-size: 12px; font-weight: 700; letter-spacing: .015em; }
        .sidebar .nav-list { display: grid; gap: 9px; margin-top: 8px; }
        .sidebar .nav-list .nav-item {
          position:relative;display:flex;align-items:center;gap:10px;min-height:58px;padding:10px 12px;
          border:1px solid #e5dccb;border-bottom:3px solid #b79a45;border-radius:12px;
          background:#fbf8f1;color:#542333;font-size:14px;font-weight:750;line-height:1.3;
          box-shadow:0 2px 7px rgba(35,8,16,.08);transition:background .15s ease,border-color .15s ease,box-shadow .15s ease;
        }
        .sidebar .nav-list .nav-item .panel-nav-icon {
          display:inline-flex;flex:0 0 30px;width:30px;height:30px;align-items:center;justify-content:center;
          border:1px solid #e4dac8;border-radius:9px;background:#eee6d7;color:#713044;
        }
        .sidebar .nav-list .nav-item .panel-nav-icon svg{width:19px;height:19px;display:block}
        .sidebar .nav-list .nav-item .panel-nav-number{color:#a38a4a;font-size:11px;font-weight:850;flex:0 0 22px}
        .sidebar .nav-list .nav-item .panel-nav-copy{display:flex;flex:1 1 auto;min-width:0;flex-direction:column;gap:2px}
        .sidebar .nav-list .nav-item .panel-nav-copy strong{color:#542333;font-size:14px;line-height:1.25}
        .sidebar .nav-list .nav-item .panel-nav-copy small{color:#71666a;font-size:11px;line-height:1.25;font-weight:500}
        .sidebar .nav-list .nav-item .panel-nav-accent{display:none}
        .sidebar .nav-list .nav-item:hover,
        .sidebar .nav-list .nav-item.active,
        .sidebar .nav-list .nav-item.active:hover{
          background:#fbf8f1!important;color:#542333!important;border:1px solid #e5dccb!important;
          border-bottom:3px solid #b79a45!important;outline:none!important;
          box-shadow:0 2px 7px rgba(35,8,16,.08)!important;transform:none!important;
        }
        .sidebar .nav-list .nav-item.active .panel-nav-icon{background:#eee6d7;border-color:#e4dac8;color:#713044}
        @media (max-width:1000px){
          .sidebar{padding:15px 12px 13px}
          .sidebar-brand{padding-bottom:14px}
          .sidebar .nav-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:7px}
          .sidebar .nav-list .nav-item{justify-content:flex-start;min-height:64px;padding:10px;gap:7px;font-size:14px;min-width:0;overflow-wrap:anywhere}
          .sidebar .nav-list .nav-item .panel-nav-number{flex-basis:18px}
          .sidebar .nav-list .nav-item .panel-nav-icon{flex-basis:26px;width:26px;height:26px}
        }
        @media(max-width:420px){
          .sidebar .nav-list{gap:7px}
          .sidebar .nav-list .nav-item{min-height:68px;padding:9px 7px;gap:5px;font-size:13px}
          .sidebar .nav-list .nav-item .panel-nav-number{font-size:10px;flex-basis:16px}
          .sidebar .nav-list .nav-item .panel-nav-icon{flex-basis:23px;width:23px;height:23px}
          .sidebar .nav-list .nav-item .panel-nav-copy strong{font-size:12px}
          .sidebar .nav-list .nav-item .panel-nav-copy small{font-size:10px}
        }
        .sidebar .user-role-pill { font-size: 11px; font-weight: 800; letter-spacing: .025em; }
        .sidebar .user-line { font-size: 11px; line-height: 1.4; }
        .sidebar .central-return-button { display: flex; margin-top: 6px; margin-bottom: 22px; min-height: 48px; padding: 9px 10px; border-color: rgba(255,255,255,.35); line-height: 1.25; white-space: normal; text-align: center; font-size: 12px; font-weight: 800; }
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


        /* Corrección aislada del menú principal: no altera rutas ni lógica de negocio. */
        :global(.app-shell.mobile-navigation-home .sidebar) {
          background: #ffffff !important;
          color: #241d20 !important;
        }
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list) {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          grid-auto-rows: minmax(0, 1fr) !important;
          grid-template-rows: repeat(3, minmax(0, 1fr)) !important;
          align-items: stretch !important;
          gap: 12px !important;
          margin: 16px 0 !important;
          padding: 0 !important;
        }
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:hover),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus-visible),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:active) {
          display: flex !important;
          width: 100% !important;
          min-width: 0 !important;
          min-height: 0 !important;
          height: 100% !important;
          box-sizing: border-box !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 14px 8px !important;
          margin: 0 !important;
          border: 2px solid #e5dccb !important;
          border-bottom: 5px solid #cbbd9f !important;
          border-radius: 8px !important;
          background: #f8f2e7 !important;
          background-image: none !important;
          color: #4b3b35 !important;
          font-size: clamp(21px, 5.2vw, 25px) !important;
          font-weight: 900 !important;
          line-height: 1.16 !important;
          text-align: center !important;
          text-decoration: none !important;
          box-shadow: 0 3px 0 rgba(50,15,25,.2) !important;
          transform: none !important;
          outline: none !important;
          -webkit-tap-highlight-color: transparent !important;
        }
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:hover),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:focus),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:active) {
          background: #eee7d9 !important;
          background-image: none !important;
          color: #4b3b35 !important;
          border-color: #d8cdb8 !important;
          border-bottom-color: #cbbd9f !important;
          box-shadow: 0 3px 0 rgba(50,15,25,.15) !important;
          font-weight: 950 !important;
          transform: none !important;
          outline: none !important;
        }
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:not(.active):hover),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:not(.active):focus),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:not(.active):active) {
          background: #f8f2e7 !important;
          color: #4b3b35 !important;
        }
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item .nav-icon) {
          display: none !important;
        }
        @media (min-width: 1001px) {
          :global(.app-shell.mobile-navigation-home .sidebar) {
            height: 100vh !important;
            min-height: 0 !important;
            overflow-y: auto !important;
            overscroll-behavior: contain;
            padding: 12px 10px !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .sidebar-brand) {
            padding: 4px 6px 10px !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list) {
            grid-template-columns: minmax(0, 1fr) !important;
            grid-auto-rows: minmax(46px, auto) !important;
            gap: 7px !important;
            margin: 8px 0 !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:hover),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus-visible),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:active) {
            min-height: 46px !important;
            height: auto !important;
            padding: 8px 10px !important;
            font-size: 16px !important;
            line-height: 1.15 !important;
            transform: none !important;
            transition: none !important;
            box-sizing: border-box !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:hover:not(.active)),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus:not(.active)),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus-visible:not(.active)),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:active:not(.active)) {
            border-width: 2px !important;
            border-bottom-width: 5px !important;
            box-shadow: 0 3px 0 rgba(50,15,25,.2) !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:hover),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:focus),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:focus-visible),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:active) {
            transform: none !important;
            transition: none !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .sidebar-footer) {
            flex: 0 0 auto;
          }
        }
        @media (max-width: 1000px) {
          :global(.app-shell.mobile-navigation-home .sidebar) {
            background: #ffffff !important;
            border-right: 0 !important;
            border-bottom: 4px solid #7c3347 !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list::before) { display: none !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:hover),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:active) {
            min-height: 104px !important;
            font-size: clamp(21px, 5.2vw, 25px) !important;
          }
        }
        @media (max-width: 390px) {
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item) {
            font-size: 21px !important;
            padding: 12px 7px !important;
          }
        }


        .mobile-panel-return { display: none; }
        @media (max-width: 1000px) {
          .mobile-panel-return { display: block; position: sticky; top: 0; z-index: 30; margin: -12px -12px 12px; padding: 9px 12px; background: rgba(255,255,255,.97); border-bottom: 1px solid #e1e5e8; }
          .mobile-panel-return button { appearance: none; display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 48px; width: 100%; box-sizing: border-box; padding: 9px 16px; border: 1px solid #cbd5dc; border-bottom: 3px solid #aebdc7; border-radius: 10px; background: #edf1f4; color: #394b57; font: inherit; font-size: 15px; font-weight: 800; letter-spacing: .01em; cursor: pointer; box-shadow: 0 1px 3px rgba(35,50,60,.07); -webkit-tap-highlight-color: transparent; }
          .mobile-panel-return button span:first-child { font-size: 25px; line-height: 1; font-weight: 900; }
          .mobile-panel-return button:active { background: #e2e8ec; transform: translateY(1px); box-shadow: 0 1px 2px rgba(35,50,60,.08); }
          :global(.app-shell:not(.mobile-navigation-home) .sidebar) { display:none !important; }
          :global(.app-shell:not(.mobile-navigation-home) .content-area) { display:block !important; width:100% !important; min-width:0 !important; padding:12px !important; }
          .app-shell.mobile-navigation-home { display:block !important; width:100% !important; min-height:100vh !important; min-height:100svh !important; min-height:100dvh !important; }
          .app-shell.mobile-navigation-home .sidebar { position:relative !important; top:auto !important; width:100% !important; height:auto !important; min-height:100vh !important; min-height:100svh !important; min-height:100dvh !important; box-sizing:border-box !important; padding-top:max(16px,env(safe-area-inset-top)) !important; padding-bottom:max(18px,env(safe-area-inset-bottom)) !important; }
          .app-shell.mobile-navigation-home .content-area { display:none !important; width:100% !important; min-width:0 !important; padding:12px !important; }
          .sidebar .nav-list .nav-item { transition:none !important; }
        }

        /* PC: el panel lateral conserva fondo blanco y los mismos botones
           en todas las secciones. No afecta el menú móvil. */
        @media (min-width: 1001px) {
          :global(.app-shell.mobile-navigation-home .sidebar),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar) {
            background: #ffffff !important;
            color: #241d20 !important;
            border-right: 1px solid #e5dcc5 !important;
            overflow-y: visible !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .sidebar-brand strong),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .sidebar-brand strong) {
            color: #64283a !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .brand-subtitle),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .brand-subtitle),
          :global(.app-shell.mobile-navigation-home .sidebar .user-line),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .user-line) {
            color: #70666a !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:hover),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus-visible),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:active),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:hover),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:focus),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:focus-visible),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:active),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:hover),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:focus),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:focus-visible),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:active),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active:hover),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active:focus),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active:focus-visible),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active:active) {
            background: linear-gradient(180deg, #93475b 0%, #7c3347 62%, #702a3e 100%) !important;
            background-image: linear-gradient(180deg, #93475b 0%, #7c3347 62%, #702a3e 100%) !important;
            color: #fff8eb !important;
            border: 1px solid rgba(255,255,255,.18) !important;
            border-bottom: 3px solid #54202f !important;
            box-shadow: 0 3px 0 rgba(48,12,23,.22), 0 5px 10px rgba(35,8,16,.12) !important;
            font-weight: 700 !important;
            transform: none !important;
            outline: none !important;
            transition: none !important;
          }
        }


        /* Mismo marco y geometría del panel general en todas las secciones de PC. */
        @media (min-width: 1001px) {
          :global(.app-shell.mobile-navigation-home .sidebar),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar) {
            box-sizing: border-box !important;
            height: 100vh !important;
            min-height: 0 !important;
            padding: 12px 10px !important;
            overflow-y: visible !important;
            background: #ffffff !important;
            color: #241d20 !important;
            border-right: 1px solid #e5dcc5 !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .sidebar-brand),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .sidebar-brand) {
            padding: 4px 6px 10px !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list) {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 7px !important;
            margin: 8px 0 !important;
            padding: 0 !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:hover:not(.active)),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus:not(.active)),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus-visible:not(.active)),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:active:not(.active)),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:hover:not(.active)),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:focus:not(.active)),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:focus-visible:not(.active)),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:active:not(.active)) {
            display: flex !important;
            width: 100% !important;
            min-width: 0 !important;
            min-height: 46px !important;
            height: auto !important;
            box-sizing: border-box !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 8px 10px !important;
            margin: 0 !important;
            border: 2px solid #e5dccb !important;
            border-bottom: 5px solid #cbbd9f !important;
            border-radius: 8px !important;
            background: #f8f2e7 !important;
            background-image: none !important;
            color: #4b3b35 !important;
            font-size: 16px !important;
            font-weight: 900 !important;
            line-height: 1.15 !important;
            text-align: center !important;
            text-decoration: none !important;
            box-shadow: 0 3px 0 rgba(50,15,25,.2) !important;
            transform: none !important;
            transition: none !important;
            animation: none !important;
            outline: none !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:hover),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:focus),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:focus-visible),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:active),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active:hover),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active:focus),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active:focus-visible),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active:active) {
            background: #eee7d9 !important;
            background-image: none !important;
            color: #4b3b35 !important;
            border-color: #d8cdb8 !important;
            border-bottom-color: #cbbd9f !important;
            box-shadow: 0 3px 0 rgba(50,15,25,.15) !important;
            font-weight: 950 !important;
            transform: none !important;
            transition: none !important;
            animation: none !important;
            outline: none !important;
          }
          :global(.app-shell.mobile-navigation-home .sidebar .sidebar-footer),
          :global(.app-shell:not(.mobile-navigation-home) .sidebar .sidebar-footer) {
            flex: 0 0 auto !important;
          }
          :global(.desktop-agency-home) {
            height: calc(100vh - 32px) !important;
            min-height: 0 !important;
            max-height: calc(100vh - 32px) !important;
            box-sizing: border-box !important;
          }
          :global(.desktop-agency-home .desktop-agency-home-logo) {
            width: min(58vw, 680px) !important;
            max-width: 100% !important;
            max-height: 82vh !important;
            height: auto !important;
            flex: 0 0 auto !important;
            transform: none !important;
            transition: none !important;
            animation: none !important;
          }
        }


        /* Panel General: jerarquía del borrador aprobado, aislada de las demás pantallas. */
        .panel-general-summary { display: flex; align-items: center; justify-content: flex-start; gap: 12px; margin: 10px 2px 14px; padding: 12px 14px; border: 1px solid #e5d9b8; border-radius: 10px; background: #fffaf0; color: #542333; box-shadow: 0 3px 10px rgba(58,25,35,.06); }
        .panel-general-summary-title { display: grid; gap: 2px; min-width: 0; }
        .panel-general-summary-title > span { color: #9a7b39; font-size: 9px; font-weight: 900; letter-spacing: .15em; }
        .panel-general-summary-title > strong { color: #64283a; font-size: 17px; line-height: 1.1; font-weight: 900; }
        .panel-general-summary-title > small { color: #76666a; font-size: 10px; line-height: 1.2; }
        .panel-nav-number { position: absolute; top: 8px; right: 9px; color: #a88b4b; font-size: 10px; font-weight: 900; letter-spacing: .08em; }
        .panel-nav-icon { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; color: #762f45; }
        .panel-nav-icon svg { display: block; width: 100%; height: 100%; }
        .panel-nav-copy { display: grid; justify-items: center; gap: 5px; min-width: 0; width: 100%; text-align: center; }
        .panel-nav-copy strong { display: block; max-width: 100%; color: inherit; font-size: 15px; font-weight: 900; line-height: 1.15; overflow-wrap: normal; word-break: normal; }
        .panel-nav-copy small { display: block; max-width: 100%; color: inherit; font-size: 10px; font-weight: 650; line-height: 1.25; opacity: .78; overflow-wrap: normal; word-break: normal; }
        .panel-nav-accent { display: block; width: 28px; height: 3px; margin-top: 3px; border-radius: 2px; background: #7c3347; }
        @media (max-width: 1000px) {
          :global(.app-shell.mobile-navigation-home .sidebar) { display: flex !important; flex-direction: column !important; min-height: 100dvh !important; height: auto !important; padding: max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom)) !important; background: #fffdf8 !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .sidebar-brand) { flex: 0 0 auto !important; padding: 2px 4px 7px !important; }
          .panel-general-summary { flex: 0 0 auto; margin: 6px 0 10px; padding: 9px 10px; border-radius: 8px; }
          .panel-general-summary-title > strong { font-size: 16px; }
          .panel-general-summary-title > small { max-width: 135px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list) { display: grid !important; grid-template-columns: repeat(2,minmax(0,1fr)) !important; grid-template-rows: repeat(3,minmax(0,1fr)) !important; grid-auto-flow: row !important; gap: 9px !important; flex: 1 0 auto !important; min-height: min(59vh,510px) !important; margin: 0 !important; padding: 0 !important; align-items: stretch !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:hover),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus-visible),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:active),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active) { position: relative !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 6px !important; width: 100% !important; min-width: 0 !important; min-height: 0 !important; height: 100% !important; aspect-ratio: 1 / 1 !important; box-sizing: border-box !important; padding: 18px 8px 12px !important; margin: 0 !important; border: 1px solid #e4d7b8 !important; border-bottom: 4px solid #7c3347 !important; border-radius: 8px !important; background: #f8f2e4 !important; color: #5a2938 !important; box-shadow: 0 3px 8px rgba(58,25,35,.08) !important; text-align: center !important; text-decoration: none !important; transform: none !important; transition: none !important; overflow: hidden !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1)),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1).active) { background: #f8f2e7 !important; color: #fff8eb !important; border-color: #632538 !important; border-bottom-color: #4a1b2a !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-icon),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-accent) { color: #f1d58a !important; background: #d4b45b !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(n+2) .panel-nav-icon) { color: #762f45 !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(n+2) .panel-nav-accent) { background: #f8f2e7 !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:not(:first-child)) { border-color: #b79a45 !important; border-bottom-color: #7c3347 !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item .panel-nav-number) { color: #a88b4b !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-number) { color: #f2d990 !important; }
          .panel-nav-icon { width: 31px; height: 31px; flex: 0 0 31px; }
          .panel-nav-copy { gap: 4px; }
          .panel-nav-copy strong { font-size: clamp(12px,3.5vw,15px); line-height: 1.13; }
          .panel-nav-copy small { font-size: clamp(9px,2.7vw,10px); line-height: 1.2; }
          .panel-nav-accent { flex: 0 0 3px; }
          :global(.app-shell.mobile-navigation-home .sidebar .sidebar-footer) { flex: 0 0 auto !important; margin-top: 8px !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:hover),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus),
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:active) { transform: none !important; }
        }
        @media (max-width: 390px) {
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list) { gap: 7px !important; }
          .panel-nav-icon { width: 27px; height: 27px; flex-basis: 27px; }
          .panel-nav-copy strong { font-size: 12px; }
          .panel-nav-copy small { font-size: 9px; }
        }
        @media (min-width: 1001px) {
          .panel-general-summary { max-width: 290px; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list) { gap: 7px !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item) { display: grid !important; grid-template-columns: 34px minmax(0,1fr) !important; grid-template-rows: auto auto !important; min-height: 64px !important; height: auto !important; aspect-ratio: auto !important; padding: 9px 30px 9px 10px !important; gap: 2px 8px !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item .panel-nav-icon) { grid-column: 1; grid-row: 1 / 3; width: 30px; height: 30px; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item .panel-nav-copy) { grid-column: 2; grid-row: 1 / 3; justify-items: start; text-align: left; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item .panel-nav-copy strong) { font-size: 13px; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item .panel-nav-copy small) { font-size: 10px; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item .panel-nav-accent) { display: none; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1)) { background: #f8f2e7 !important; color: #fff8eb !important; }
          :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(n+2)) { background: #f8f2e4 !important; color: #5a2938 !important; }
        }

        /* Paleta uniforme del menú: ningún acceso se pinta bordó o amarillo fuerte.
           La selección sólo cambia a un crema algo más intenso. */
        :global(.app-shell .sidebar .nav-list .nav-item),
        :global(.app-shell .sidebar .nav-list .nav-item:nth-child(1)),
        :global(.app-shell .sidebar .nav-list .nav-item:nth-child(n+2)),
        :global(.app-shell .sidebar .nav-list .nav-item:hover),
        :global(.app-shell .sidebar .nav-list .nav-item:focus),
        :global(.app-shell .sidebar .nav-list .nav-item:focus-visible),
        :global(.app-shell .sidebar .nav-list .nav-item:active),
        :global(.app-shell .sidebar .nav-list .nav-item.active),
        :global(.app-shell .sidebar .nav-list .nav-item.active:hover),
        :global(.app-shell .sidebar .nav-list .nav-item.active:focus),
        :global(.app-shell .sidebar .nav-list .nav-item.active:focus-visible),
        :global(.app-shell .sidebar .nav-list .nav-item.active:active),
        :global(.app-shell .sidebar .nav-list .nav-item:nth-child(1).active),
        :global(.app-shell .sidebar .nav-list .nav-item:nth-child(n+2).active) {
          background:#f8f2e7!important;
          background-image:none!important;
          color:#4b4137!important;
          border:1px solid #e3d8c5!important;
          border-bottom:3px solid #d1c09b!important;
          box-shadow:0 2px 6px rgba(55,45,34,.07)!important;
          outline:none!important;
          transform:none!important;
          transition:background-color .14s ease,border-color .14s ease,box-shadow .14s ease!important;
          animation:none!important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item:hover),
        :global(.app-shell .sidebar .nav-list .nav-item:focus-visible),
        :global(.app-shell .sidebar .nav-list .nav-item:nth-child(1):hover),
        :global(.app-shell .sidebar .nav-list .nav-item:nth-child(n+2):hover) {
          background:#f1eadc!important;
          border-color:#d7c9ad!important;
          border-bottom-color:#c7b58c!important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item.active),
        :global(.app-shell .sidebar .nav-list .nav-item.active:hover),
        :global(.app-shell .sidebar .nav-list .nav-item.active:focus),
        :global(.app-shell .sidebar .nav-list .nav-item.active:focus-visible),
        :global(.app-shell .sidebar .nav-list .nav-item.active:active),
        :global(.app-shell .sidebar .nav-list .nav-item:nth-child(1).active),
        :global(.app-shell .sidebar .nav-list .nav-item:nth-child(n+2).active) {
          background:#eee5d5!important;
          background-image:none!important;
          color:#40372e!important;
          border-color:#d2c2a1!important;
          border-bottom-color:#bda879!important;
          box-shadow:0 2px 7px rgba(55,45,34,.09)!important;
          font-weight:800!important;
          transform:none!important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item.active:hover),
        :global(.app-shell .sidebar .nav-list .nav-item.active:focus-visible) {
          background:#eae0ce!important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item .panel-nav-icon),
        :global(.app-shell .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-icon),
        :global(.app-shell .sidebar .nav-list .nav-item:nth-child(n+2) .panel-nav-icon),
        :global(.app-shell .sidebar .nav-list .nav-item.active .panel-nav-icon) {
          background:#eee7da!important;
          color:#685a47!important;
          border-color:#e0d5c2!important;
          box-shadow:none!important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item .panel-nav-copy strong),
        :global(.app-shell .sidebar .nav-list .nav-item.active .panel-nav-copy strong) {
          color:#40372e!important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item .panel-nav-copy small),
        :global(.app-shell .sidebar .nav-list .nav-item.active .panel-nav-copy small) {
          color:#71675b!important;
          opacity:1!important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item .panel-nav-number),
        :global(.app-shell .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-number),
        :global(.app-shell .sidebar .nav-list .nav-item.active .panel-nav-number) {
          color:#9c8966!important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item .panel-nav-accent),
        :global(.app-shell .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-accent),
        :global(.app-shell .sidebar .nav-list .nav-item.active .panel-nav-accent) {
          background:#cbb990!important;
        }
 
        /* Prioridad final sobre reglas heredadas de escritorio y celular. */
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1)),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(1)),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(n+2)),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(n+2)) {
          background:#f8f2e7!important;background-image:none!important;color:#4b4137!important;
          border:1px solid #e3d8c5!important;border-bottom:3px solid #d1c09b!important;
          box-shadow:0 2px 6px rgba(55,45,34,.07)!important;transform:none!important;outline:none!important;
        }
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1).active),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(1).active),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(n+2).active),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(n+2).active) {
          background:#eee5d5!important;background-image:none!important;color:#40372e!important;
          border-color:#d2c2a1!important;border-bottom-color:#bda879!important;
          box-shadow:0 2px 7px rgba(55,45,34,.09)!important;font-weight:800!important;transform:none!important;
        }
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:hover),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:hover),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1):hover),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(1):hover) {
          background:#f1eadc!important;border-color:#d7c9ad!important;border-bottom-color:#c7b58c!important;
        }
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:hover),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active:hover),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:focus-visible),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active:focus-visible) {
          background:#eae0ce!important;
        }
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-icon),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-icon),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(n+2) .panel-nav-icon),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(n+2) .panel-nav-icon),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active .panel-nav-icon),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active .panel-nav-icon) {
          background:#eee7da!important;color:#685a47!important;border-color:#e0d5c2!important;box-shadow:none!important;
        }
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-accent),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-accent),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(n+2) .panel-nav-accent),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(n+2) .panel-nav-accent),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active .panel-nav-accent),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active .panel-nav-accent) {
          background:#cbb990!important;
        }
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-number),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-number),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active .panel-nav-number),
        :global(.app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active .panel-nav-number) {
          color:#9c8966!important;
        }

 
        /* Estado presionado uniforme para los seis accesos: hundido, sin bordó. */
        :global(body .app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:active),
        :global(body .app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:active),
        :global(body .app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active),
        :global(body .app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active),
        :global(body .app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:hover),
        :global(body .app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active:hover),
        :global(body .app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:focus-visible),
        :global(body .app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item.active:focus-visible),
        :global(body .app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1):active),
        :global(body .app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1).active),
        :global(body .app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(n+2):active),
        :global(body .app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(n+2).active),
        :global(body .app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(1):active),
        :global(body .app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(1).active),
        :global(body .app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(n+2):active),
        :global(body .app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(n+2).active) {
          background:#eee9df!important;
          background-image:none!important;
          color:#403a32!important;
          border-color:#d9cfbd!important;
          border-bottom-color:#c8b895!important;
          box-shadow:inset 0 2px 6px rgba(68,55,37,.13),inset 0 1px 2px rgba(68,55,37,.07)!important;
          transform:translateY(1px)!important;
          outline:none!important;
          filter:none!important;
        }
        :global(body .app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-icon),
        :global(body .app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:nth-child(n+2) .panel-nav-icon),
        :global(body .app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(1) .panel-nav-icon),
        :global(body .app-shell:not(.mobile-navigation-home) .sidebar .nav-list .nav-item:nth-child(n+2) .panel-nav-icon) {
          background:#eee7da!important;
          color:#685a47!important;
          border-color:#e0d5c2!important;
          box-shadow:none!important;
        }

        /* Menú uniforme: sin bordó; selección hundida con efecto 3D sutil. */
        :global(html body .app-shell.mobile-navigation-home aside.sidebar nav.nav-list > a.nav-item),
        :global(html body .app-shell:not(.mobile-navigation-home) aside.sidebar nav.nav-list > a.nav-item) {
          background:#f8f2e7!important;background-image:none!important;color:#4b4137!important;
          border:1px solid #e3d8c5!important;border-bottom:3px solid #d1c09b!important;
          box-shadow:0 3px 0 rgba(70,58,40,.10),0 4px 8px rgba(70,58,40,.06)!important;
          transform:translateY(0)!important;filter:none!important;
          transition:background-color .12s ease,box-shadow .12s ease,transform .12s ease!important;
        }
        :global(html body .app-shell.mobile-navigation-home aside.sidebar nav.nav-list > a.nav-item:hover),
        :global(html body .app-shell:not(.mobile-navigation-home) aside.sidebar nav.nav-list > a.nav-item:hover),
        :global(html body .app-shell.mobile-navigation-home aside.sidebar nav.nav-list > a.nav-item:focus-visible),
        :global(html body .app-shell:not(.mobile-navigation-home) aside.sidebar nav.nav-list > a.nav-item:focus-visible) {
          background:#f3eddf!important;color:#40372e!important;outline:none!important;
        }
        :global(html body .app-shell.mobile-navigation-home aside.sidebar nav.nav-list > a.nav-item:active),
        :global(html body .app-shell:not(.mobile-navigation-home) aside.sidebar nav.nav-list > a.nav-item:active),
        :global(html body .app-shell.mobile-navigation-home aside.sidebar nav.nav-list > a.nav-item.active),
        :global(html body .app-shell:not(.mobile-navigation-home) aside.sidebar nav.nav-list > a.nav-item.active),
        :global(html body .app-shell.mobile-navigation-home aside.sidebar nav.nav-list > a.nav-item.active:hover),
        :global(html body .app-shell:not(.mobile-navigation-home) aside.sidebar nav.nav-list > a.nav-item.active:hover),
        :global(html body .app-shell.mobile-navigation-home aside.sidebar nav.nav-list > a.nav-item.active:focus-visible),
        :global(html body .app-shell:not(.mobile-navigation-home) aside.sidebar nav.nav-list > a.nav-item.active:focus-visible) {
          background:#eee7d9!important;background-image:none!important;color:#40372e!important;
          border-color:#d9cfbd!important;border-bottom-color:#c8b895!important;
          box-shadow:inset 0 3px 7px rgba(68,55,37,.16),inset 0 1px 2px rgba(68,55,37,.08)!important;
          transform:translateY(2px)!important;outline:none!important;filter:none!important;
        }
        :global(html body .app-shell.mobile-navigation-home aside.sidebar nav.nav-list > a.nav-item .panel-nav-icon),
        :global(html body .app-shell:not(.mobile-navigation-home) aside.sidebar nav.nav-list > a.nav-item .panel-nav-icon) {
          background:#eee7da!important;color:#685a47!important;border-color:#e0d5c2!important;box-shadow:none!important;
        }
        :global(html body .app-shell.mobile-navigation-home aside.sidebar nav.nav-list > a.nav-item .panel-nav-copy strong),
        :global(html body .app-shell:not(.mobile-navigation-home) aside.sidebar nav.nav-list > a.nav-item .panel-nav-copy strong),
        :global(html body .app-shell.mobile-navigation-home aside.sidebar nav.nav-list > a.nav-item.active .panel-nav-copy strong),
        :global(html body .app-shell:not(.mobile-navigation-home) aside.sidebar nav.nav-list > a.nav-item.active .panel-nav-copy strong) {
          color:#40372e!important;
        }
        :global(html body .app-shell.mobile-navigation-home aside.sidebar nav.nav-list > a.nav-item .panel-nav-accent),
        :global(html body .app-shell:not(.mobile-navigation-home) aside.sidebar nav.nav-list > a.nav-item .panel-nav-accent) {
          background:#cbb990!important;
        }
        /* El menú conserva el mismo tono crema; solo se hunde mientras se presiona. */
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:hover),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:focus-visible),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:hover),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:focus),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:focus-visible) {
          background: #f8f2e7 !important;
          background-image: none !important;
          color: #4b3b35 !important;
          border-color: #e5dccb !important;
          border-bottom-color: #cbbd9f !important;
          box-shadow: 0 3px 0 rgba(75,59,53,.12) !important;
          transform: none !important;
          -webkit-tap-highlight-color: transparent !important;
        }
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:active),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:active) {
          background: #eee7d9 !important;
          color: #4b3b35 !important;
          border-color: #d8cdb8 !important;
          border-bottom-width: 2px !important;
          box-shadow: inset 0 2px 4px rgba(75,59,53,.14) !important;
          transform: translateY(2px) !important;
        }

        /* Encabezado institucional: solo logo, nombre, número de agencia y subtítulo.
           Los accesos adicionales de cabecera no deben aparecer sobre el número 000. */
        :global(html body .app-shell aside.sidebar .sidebar-brand > :not(.sidebar-logo):not(.brand-copy)),
        :global(html body .app-shell aside.sidebar .brand-copy > :not(.brand-title-row):not(.brand-subtitle)),
        :global(html body .app-shell aside.sidebar .brand-title-row > :not(strong):not(.official-agency-number)),
        :global(html body .app-shell aside.sidebar .panel-general-summary > :not(.panel-general-summary-title)),
        :global(html body .app-shell aside.sidebar .sidebar-brand a),
        :global(html body .app-shell aside.sidebar .sidebar-brand button),
        :global(html body .app-shell aside.sidebar .sidebar-brand [role="link"]),
        :global(html body .app-shell aside.sidebar .sidebar-brand [role="button"]),
        :global(html body .app-shell aside.sidebar .panel-general-summary a),
        :global(html body .app-shell aside.sidebar .panel-general-summary button),
        :global(html body .app-shell aside.sidebar > a:not(.nav-item)),
        :global(html body .app-shell aside.sidebar > button),
        :global(html body .app-shell aside.sidebar > [role="link"]),
        :global(html body .app-shell aside.sidebar > [role="button"]) {
          display:none!important;
          visibility:hidden!important;
          pointer-events:none!important;
        }
        /* El número 05 pertenece al acceso normal del menú y debe quedar dentro de su tarjeta,
           nunca flotando arriba de la cabecera. */
        :global(html body .app-shell aside.sidebar nav.nav-list > a.nav-item) {
          position:relative!important;
        }
        :global(html body .app-shell aside.sidebar nav.nav-list > a.nav-item > .panel-nav-number) {
          position:absolute!important;
          top:8px!important;
          right:9px!important;
        }
      `}</style>
    </div>
  );
}
