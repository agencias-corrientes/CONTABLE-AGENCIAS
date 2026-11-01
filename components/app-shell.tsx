"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
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
  const [sectionSelected, setSectionSelected] = useState(() => pathname !== "/pagos");
  const sectionKey = pathname.startsWith("/pagos") ? "rendiciones" : pathname.startsWith("/agencias") ? "agentes" : pathname.startsWith("/buscar") ? "buscar" : pathname.startsWith("/juegos") ? "juegos" : pathname.startsWith("/loteria-correntina") ? "loteria" : pathname.startsWith("/configuracion") ? "configuracion" : "general";
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
    <div className={"app-shell " + (sectionSelected ? "section-open" : "menu-open")}>
      <aside className={"sidebar " + (sectionSelected ? "sidebar-hidden" : "sidebar-menu")}>
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
                onClick={(event) => {
                  setSectionSelected(true);
                  if (slug === "pagos") {
                    event.preventDefault();
                    router.push("/pagos");
                  }
                }}
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
          {isPlatformAdmin && <Link href="/plataforma/accesos" className="button ghost full central-return-button">↩ Volver a control de agencia</Link>}
          <button className="button ghost full" onClick={signOut}>Cerrar sesión</button>
        </div>
      </aside>
      <main className={"content-area " + (sectionSelected ? "section-active section-" + sectionKey : "agency-menu-screen")}>
        {sectionSelected ? (
          <>
            <div className="section-navigation-bar">
              <button type="button" className="section-menu-return" onClick={() => setSectionSelected(false)}>← Menú principal</button>
            </div>
            {children}
          </>
        ) : (
          <section className="agency-home-menu">
            <header className="agency-home-menu-heading">
              <div className="agency-home-menu-brand">
                <div className="brand-logo-wrap"><Image src="/logo-agencias-corrientes.webp" alt="Agencias Corrientes" width={72} height={72} priority /></div>
                <div><p>AGENCIA {officialAgencyNumber ?? ""}</p><h1>Menú principal</h1><span>{organizationName}</span></div>
              </div>
              <p>Elegí el sector que necesitás utilizar.</p>
            </header>
            <nav className="agency-home-menu-grid" aria-label="Menú principal de la agencia">
              {visibleNav.map(([slug, label]) => (
                <Link key={slug} href={"/" + slug} onClick={() => setSectionSelected(true)} className={"agency-home-menu-item agency-menu-" + slug}>
                  <strong>{label}</strong><span>Ingresar →</span>
                </Link>
              ))}
            </nav>
            <footer className="agency-home-menu-footer">
              <span>{displayRole} · {userEmail}</span>
              {isPlatformAdmin && <Link href="/plataforma/accesos" className="button ghost">Control central</Link>}
              <button className="button ghost" onClick={signOut}>Cerrar sesión</button>
            </footer>
          </section>
        )}
      </main>
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
        :global(.app-shell .sidebar) {
          background: #ffffff !important;
          color: #241d20 !important;
        }
        :global(.app-shell .sidebar .nav-list) {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          grid-auto-rows: minmax(104px, auto) !important;
          grid-template-rows: none !important;
          align-items: stretch !important;
          gap: 12px !important;
          margin: 16px 0 !important;
          padding: 0 !important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item),
        :global(.app-shell .sidebar .nav-list .nav-item:hover),
        :global(.app-shell .sidebar .nav-list .nav-item:focus),
        :global(.app-shell .sidebar .nav-list .nav-item:focus-visible),
        :global(.app-shell .sidebar .nav-list .nav-item:active) {
          display: flex !important;
          width: 100% !important;
          min-width: 0 !important;
          min-height: 104px !important;
          height: 100% !important;
          box-sizing: border-box !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 14px 8px !important;
          margin: 0 !important;
          border: 2px solid #632538 !important;
          border-bottom: 5px solid #4a1b2a !important;
          border-radius: 8px !important;
          background: #7c3347 !important;
          background-image: none !important;
          color: #ffffff !important;
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
        :global(.app-shell .sidebar .nav-list .nav-item.active),
        :global(.app-shell .sidebar .nav-list .nav-item.active:hover),
        :global(.app-shell .sidebar .nav-list .nav-item.active:focus),
        :global(.app-shell .sidebar .nav-list .nav-item.active:active) {
          background: #ffe58a !important;
          background-image: none !important;
          color: #3f1825 !important;
          border-color: #8f6d26 !important;
          border-bottom-color: #632538 !important;
          box-shadow: 0 3px 0 rgba(50,15,25,.15) !important;
          font-weight: 950 !important;
          transform: none !important;
          outline: none !important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item:not(.active):hover),
        :global(.app-shell .sidebar .nav-list .nav-item:not(.active):focus),
        :global(.app-shell .sidebar .nav-list .nav-item:not(.active):active) {
          background: #7c3347 !important;
          color: #ffffff !important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item .nav-icon) {
          display: none !important;
        }
        @media (min-width: 1001px) {
          :global(.app-shell .sidebar .nav-list) {
            grid-template-columns: minmax(0, 1fr) !important;
            grid-auto-rows: minmax(70px, auto) !important;
          }
          :global(.app-shell .sidebar .nav-list .nav-item) {
            min-height: 70px !important;
            font-size: 21px !important;
          }
        }
        @media (max-width: 1000px) {
          :global(.app-shell .sidebar) {
            background: #ffffff !important;
            border-right: 0 !important;
            border-bottom: 4px solid #7c3347 !important;
          }
          :global(.app-shell .sidebar .nav-list::before) { display: none !important; }
          :global(.app-shell .sidebar .nav-list .nav-item),
          :global(.app-shell .sidebar .nav-list .nav-item:hover),
          :global(.app-shell .sidebar .nav-list .nav-item:focus),
          :global(.app-shell .sidebar .nav-list .nav-item:active) {
            min-height: 104px !important;
            font-size: clamp(21px, 5.2vw, 25px) !important;
          }
        }
        @media (max-width: 390px) {
          :global(.app-shell .sidebar .nav-list .nav-item) {
            font-size: 21px !important;
            padding: 12px 7px !important;
          }
        }


        @media (max-width: 1000px) {
          .app-shell { display:block !important; width:100% !important; min-height:100vh !important; min-height:100svh !important; min-height:100dvh !important; }
          .sidebar { position:relative !important; top:auto !important; width:100% !important; height:auto !important; min-height:100vh !important; min-height:100svh !important; min-height:100dvh !important; box-sizing:border-box !important; padding-top:max(16px,env(safe-area-inset-top)) !important; padding-bottom:max(18px,env(safe-area-inset-bottom)) !important; }
          .content-area { width:100% !important; min-width:0 !important; padding:12px !important; }
          .sidebar .nav-list .nav-item { transition:none !important; }
        }

        :global(.app-shell.menu-open) { display:block !important; min-height:100dvh; background:#f7f2e7; }
        :global(.app-shell.menu-open .sidebar) { display:none !important; }
        :global(.app-shell.menu-open .content-area) { width:100% !important; min-height:100dvh; padding:clamp(16px,3vw,32px) !important; box-sizing:border-box; background:#f7f2e7; }
        :global(.agency-home-menu) { display:grid; align-content:center; gap:22px; width:min(920px,100%); min-height:calc(100dvh - 64px); margin:0 auto; }
        :global(.agency-home-menu-heading) { display:grid; gap:8px; }
        :global(.agency-home-menu-heading > p) { margin:0; color:#665b60; font-size:15px; }
        :global(.agency-home-menu-brand) { display:flex; align-items:center; gap:15px; }
        :global(.agency-home-menu-brand .brand-logo-wrap) { flex:0 0 72px; width:72px; height:72px; overflow:hidden; border-radius:18%; }
        :global(.agency-home-menu-brand p) { margin:0 0 3px; color:#8a6a2c; font-size:10px; font-weight:900; letter-spacing:.12em; }
        :global(.agency-home-menu-brand h1) { margin:0; color:#542033; font-size:clamp(25px,5vw,36px); line-height:1.1; }
        :global(.agency-home-menu-brand span) { display:block; margin-top:4px; color:#756b66; font-size:13px; }
        :global(.agency-home-menu-grid) { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:13px; }
        :global(.agency-home-menu-item) { display:flex; flex-direction:column; justify-content:center; gap:10px; min-height:116px; padding:18px; border:2px solid #632538; border-bottom:5px solid #4a1b2a; border-radius:10px; background:#7c3347; color:#fff !important; text-decoration:none; box-shadow:0 3px 0 rgba(50,15,25,.13); }
        :global(.agency-home-menu-item strong) { font-size:clamp(17px,3vw,22px); line-height:1.2; }
        :global(.agency-home-menu-item span) { font-size:13px; font-weight:800; color:#ffe5a0; }
        :global(.agency-home-menu-item:active) { transform:translateY(1px); }
        :global(.agency-home-menu-footer) { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding-top:8px; color:#756b66; font-size:12px; }
        :global(.agency-home-menu-footer .button) { min-height:40px; }
        :global(.app-shell.section-open) { display:block !important; min-height:100dvh; }
        :global(.app-shell.section-open .sidebar) { display:none !important; }
        :global(.app-shell.section-open .content-area) { width:100% !important; min-width:0 !important; min-height:100dvh; padding:12px clamp(12px,2vw,24px) 24px !important; box-sizing:border-box; }
        :global(.section-navigation-bar) { position:sticky; top:0; z-index:30; display:flex; justify-content:flex-start; padding:4px 0 12px; background:inherit; }
        :global(.section-menu-return) { min-height:42px; padding:9px 15px; border:1px solid #6b3344; border-radius:8px; background:#fff; color:#572338; font-size:14px; font-weight:850; cursor:pointer; }
        :global(.section-rendiciones) { background:#fff7e6 !important; }
        :global(.section-agentes) { background:#eaf4ec !important; }
        :global(.section-buscar) { background:#eaf1fb !important; }
        :global(.section-juegos) { background:#f1ecfa !important; }
        :global(.section-loteria) { background:#fff0dc !important; }
        :global(.section-configuracion) { background:#f8eaf0 !important; }
        :global(.section-active .page) { min-height:calc(100dvh - 58px); background:transparent !important; }
        :global(.ticket-cancel-dialog-backdrop) { position:fixed; inset:0; z-index:1800; display:grid; place-items:center; padding:18px; background:rgba(25,13,18,.72); }
        :global(.ticket-cancel-dialog) { display:grid; gap:16px; width:min(440px,100%); padding:24px; border:2px solid #7c3347; border-radius:12px; background:#fff; color:#241d20; box-shadow:0 18px 54px rgba(0,0,0,.3); }
        :global(.ticket-cancel-dialog h3) { margin:0; color:#64283a; font-size:22px; text-align:center; }
        :global(.ticket-cancel-dialog p) { margin:0; color:#5f5559; line-height:1.45; text-align:center; }
        :global(.ticket-cancel-dialog-actions) { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
        :global(.ticket-cancel-dialog-actions button) { min-height:48px; font-size:16px; font-weight:850; }
        :global(.ticket-cancel-dialog-actions .ticket-cancel-yes) { border:1px solid #632538; background:#7c3347; color:#fff; }
        :global(.ticket-cancel-dialog-actions .ticket-cancel-no) { border:1px solid #b79a45; background:#ffe58a; color:#3f1825; }
        @media(max-width:640px) {
          :global(.agency-home-menu) { min-height:calc(100dvh - 32px); gap:18px; }
          :global(.agency-home-menu-grid) { gap:10px; }
          :global(.agency-home-menu-item) { min-height:108px; padding:14px 12px; }
          :global(.agency-home-menu-footer) { justify-content:center; text-align:center; }
          :global(.section-menu-return) { width:100%; }
          :global(.ticket-cancel-dialog) { padding:20px 16px; }
        }

      `}</style>
    </div>
  );
}
