"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  agencyCount,
}: {
  children: React.ReactNode;
  organizationName: string;
  userEmail: string;
  userRole: string;
  isPlatformAdmin: boolean;
  agencyCount: number | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedSection = searchParams.get("seleccion") ?? "";
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
    <div className={pathname === "/inicio" ? "app-shell mobile-navigation-home" : "app-shell"}>
      <aside className="sidebar">
        <section className="panel-general-home" aria-label="Panel general de Agencias Corrientes">
          <header className="panel-general-header">
            <div className="panel-general-heading">
              <h1>Panel general</h1>
              <p>AGENCIAS CORRIENTES</p>
            </div>
            <div className="panel-general-count" aria-label={`Número de agencias: ${agencyCount ?? "no disponible"}`}>
              <div className="panel-general-count-copy"><span>N° Agencias</span><strong>{agencyCount ?? "—"}</strong></div>
              <span className="panel-general-count-divider" aria-hidden="true" />
              <span className="panel-general-grid-icon" aria-hidden="true"><i /><i /><i /><i /></span>
            </div>
          </header>
          <nav className="panel-general-grid" aria-label="Secciones principales">
            {[
              { slug: "pagos", title: "Rendiciones", subtitle: "Control diario", icon: "receipt" },
              { slug: "agencias", title: "Subagentes y ambulantes", subtitle: "Gestión de agentes", icon: "users" },
              { slug: "buscar", title: "Buscar", subtitle: "Consultas y registros", icon: "search" },
              { slug: "juegos", title: "Juegos y comisiones", subtitle: "Gestión comercial", icon: "gamepad" },
              { slug: "loteria-correntina", title: "Lotería", subtitle: "Información y servicios", icon: "ticket" },
              { slug: "configuracion", title: "Configuración", subtitle: "Opciones de agencia", icon: "settings" },
            ].filter((item) => isOwner || !["juegos", "configuracion"].includes(item.slug)).map((item, index) => (
              <Link key={item.slug} href={`/${item.slug}`} className={index === 0 ? "panel-general-card featured" : "panel-general-card"}>
                <span className="panel-general-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="panel-general-card-icon" aria-hidden="true">
                  {item.icon === "receipt" && <svg viewBox="0 0 96 96"><path d="M25 16h46v65H25zM38 16v-6h20v6M36 36h24M36 49h24M36 62h24" /></svg>}
                  {item.icon === "users" && <svg viewBox="0 0 96 96"><circle cx="35" cy="28" r="12" /><circle cx="66" cy="24" r="12" /><path d="M10 76c0-18 10-29 26-29s26 11 26 29H10zM54 48c19-8 34 5 34 27H62" /></svg>}
                  {item.icon === "search" && <svg viewBox="0 0 96 96"><circle cx="40" cy="39" r="25" /><path d="m58 58 25 25" /></svg>}
                  {item.icon === "gamepad" && <svg viewBox="0 0 96 96"><path d="M23 28h50c9 0 14 6 17 17l5 25c2 12-9 17-18 8L63 65H33L19 78C9 87 0 82 2 70l5-25c2-11 7-17 16-17z" /><path d="M28 42v18M19 51h18M66 43h1M77 52h1M66 61h1" /></svg>}
                  {item.icon === "ticket" && <svg viewBox="0 0 96 96"><path d="M12 29 72 10l13 22a12 12 0 0 0 7 22L79 82 19 92 5 69a12 12 0 0 0 7-40z" /><path d="m30 25 17 54M58 16l3 7M64 34l3 7M70 52l3 7M76 70l2 5" /><path d="m48 39 4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" /></svg>}
                  {item.icon === "settings" && <svg viewBox="0 0 96 96"><path d="m40 8 16 0 3 12 9 4 10-7 11 11-7 10 4 9 12 3v16l-12 3-4 9 7 10-11 11-10-7-9 4-3 12H40l-3-12-9-4-10 7L7 88l7-10-4-9-12-3V50l12-3 4-9-7-10 11-11 10 7 9-4z" /><circle cx="48" cy="56" r="17" /></svg>}
                </span>
                <span className="panel-general-card-title">{item.title}</span>
                <span className="panel-general-card-subtitle">{item.subtitle}</span>
                <span className="panel-general-card-accent" />
              </Link>
            ))}
          </nav>
          <div className="panel-general-footer" aria-hidden="true"><span /></div>
        </section>

        <div className="sidebar-brand">
          <div className="brand-logo-wrap sidebar-logo"><Image src="/Esfera_brillante_de_Agencias_Corrientes-removebg-preview.png" alt="Agencias Corrientes — Quiniela Oficial" width={48} height={48} priority /></div>
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
                className={pathname.startsWith(href) || (pathname === "/inicio" && selectedSection === slug) ? "nav-item active" : "nav-item"}
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

        .panel-general-home { display:none; }
        @media (max-width: 1000px) {
          :global(.app-shell.mobile-navigation-home .sidebar) { padding: 12px 12px max(12px,env(safe-area-inset-bottom)) !important; background:#fff !important; border:0 !important; }
          :global(.app-shell.mobile-navigation-home .sidebar-brand),
          :global(.app-shell.mobile-navigation-home .sidebar > .nav-list),
          :global(.app-shell.mobile-navigation-home .sidebar > .sidebar-footer) { display:none !important; }
          :global(.app-shell.mobile-navigation-home .panel-general-home) { display:flex; flex-direction:column; min-height:calc(100svh - 24px); min-height:calc(100dvh - 24px); box-sizing:border-box; padding:4px 4px 0; border-radius:28px; background:#fff; overflow:hidden; }
          .panel-general-header { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:112px; padding:12px 10px 14px 16px; border-radius:22px; background:#fff; box-shadow:0 4px 14px rgba(110,36,55,.10); }
          .panel-general-heading { min-width:0; }
          .panel-general-heading h1 { margin:0; color:#861337; font-size:clamp(27px,7vw,38px); line-height:1.02; font-weight:900; letter-spacing:-.045em; white-space:nowrap; }
          .panel-general-heading p { margin:7px 0 0; color:#68575a; font-size:clamp(11px,3.1vw,17px); line-height:1.1; letter-spacing:.035em; white-space:nowrap; }
          .panel-general-count { display:flex; align-items:center; justify-content:center; flex:0 0 auto; gap:10px; min-width:124px; min-height:68px; padding:8px 10px; border-radius:18px; background:#8a123b; color:#fff; box-shadow:0 3px 6px rgba(50,10,25,.16); }
          .panel-general-count-copy { display:flex; flex-direction:column; align-items:center; gap:2px; }
          .panel-general-count-copy span { font-size:clamp(10px,2.7vw,14px); font-weight:750; white-space:nowrap; }
          .panel-general-count-copy strong { font-size:clamp(25px,6vw,36px); line-height:1; font-weight:900; }
          .panel-general-count-divider { width:2px; height:48px; background:rgba(255,255,255,.9); }
          .panel-general-grid-icon { display:grid; grid-template-columns:repeat(2,16px); grid-template-rows:repeat(2,16px); gap:6px; }
          .panel-general-grid-icon i { display:block; border-radius:4px; background:#fff; }
          .panel-general-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); grid-template-rows:repeat(3,minmax(0,1fr)); gap:10px; flex:1; min-height:0; margin:12px 0 10px; }
          .panel-general-card { position:relative; display:flex; min-width:0; min-height:0; box-sizing:border-box; flex-direction:column; align-items:center; justify-content:center; gap:4px; padding:22px 9px 18px; border:1px solid #f0d8c9; border-radius:23px; background:linear-gradient(145deg,#fffaf0,#fff2e2); color:#83133a; text-decoration:none; box-shadow:0 3px 7px rgba(84,39,35,.16),inset 0 1px 0 #fff; -webkit-tap-highlight-color:transparent; }
          .panel-general-card.featured { border-color:#97113e; background:linear-gradient(145deg,#99103e,#7d0e36); color:#fff; box-shadow:0 4px 9px rgba(74,13,34,.28); }
          .panel-general-number { position:absolute; top:12px; right:14px; color:#a87562; font-size:clamp(22px,5vw,30px); line-height:1; font-weight:900; }
          .panel-general-card.featured .panel-general-number { color:#fff; }
          .panel-general-card-icon { display:flex; align-items:center; justify-content:center; width:clamp(54px,15vw,76px); height:clamp(54px,15vw,76px); margin-bottom:6px; color:#94113d; }
          .panel-general-card.featured .panel-general-card-icon { color:#fff; }
          .panel-general-card-icon svg { width:100%; height:100%; fill:none; stroke:currentColor; stroke-width:8; stroke-linecap:round; stroke-linejoin:round; }
          .panel-general-card-icon svg path:first-child, .panel-general-card-icon svg circle:not(:last-child) { fill:currentColor; stroke:currentColor; }
          .panel-general-card-title { display:block; width:100%; color:inherit; text-align:center; font-size:clamp(15px,4.2vw,21px); line-height:1.12; font-weight:900; overflow-wrap:normal; word-break:normal; }
          .panel-general-card-subtitle { display:block; width:100%; color:#5d4c4c; text-align:center; font-size:clamp(12px,3.3vw,17px); line-height:1.16; font-weight:500; }
          .panel-general-card.featured .panel-general-card-subtitle { color:#fff; }
          .panel-general-card-accent { position:absolute; left:18%; right:18%; bottom:12px; height:5px; border-radius:99px; background:#94113d; }
          .panel-general-card.featured .panel-general-card-accent { background:#e7b6b8; }
          .panel-general-footer { position:relative; flex:0 0 48px; margin:0 -16px; overflow:hidden; background:#861039; clip-path:polygon(0 34%,18% 17%,43% 40%,67% 75%,84% 82%,100% 30%,100% 100%,0 100%); }
          .panel-general-footer span { position:absolute; inset:0 0 auto; height:11px; background:#e5b14d; clip-path:polygon(0 0,18% 0,43% 48%,67% 88%,84% 100%,100% 0,100% 22%,84% 100%,67% 88%,43% 48%,18% 0,0 35%); }
        }
        @media (max-width:380px) {
          .panel-general-header { min-height:100px; padding-left:12px; }
          .panel-general-count { min-width:112px; gap:7px; padding:7px; }
          .panel-general-grid { gap:8px; }
          .panel-general-card { padding-left:6px; padding-right:6px; }
          .panel-general-card-title { font-size:clamp(14px,3.9vw,17px); }
          .panel-general-card-subtitle { font-size:clamp(11px,3vw,14px); }
        }

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
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:hover),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:focus),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item.active:active) {
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
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:not(.active):hover),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:not(.active):focus),
        :global(.app-shell.mobile-navigation-home .sidebar .nav-list .nav-item:not(.active):active) {
          background: #7c3347 !important;
          color: #ffffff !important;
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
            border: 2px solid #632538 !important;
            border-bottom: 5px solid #4a1b2a !important;
            border-radius: 8px !important;
            background: #7c3347 !important;
            background-image: none !important;
            color: #ffffff !important;
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
            background: #ffe58a !important;
            background-image: none !important;
            color: #3f1825 !important;
            border-color: #8f6d26 !important;
            border-bottom-color: #632538 !important;
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

      `}</style>
    </div>
  );
}
