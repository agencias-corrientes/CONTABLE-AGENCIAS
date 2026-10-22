"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const nav = [
  ["pagos", "Rendiciones"],
  ["agencias", "Subagentes y ambulantes"],
  ["buscar", "Buscar"],
  ["juegos", "Juegos y comisiones"],
  ["loteria-correntina", "Lotería Correntina"],
  ["configuracion", "Configuración"],
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
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const officialAgencyNumber = organizationName.match(/\b(\d{3})\b/)?.[1] ?? null;

  const scrollContentAfterMenuClickRef = useRef(false);

  // El botón Atrás no debe sacar al agenciero del panel ni llevarlo al login.
  // Interceptamos en captura antes del manejador de navegación de Next y volvemos
  // a la última URL del panel. La sesión solo se cierra con el botón explícito.
  useEffect(() => {
    // Este guardián también debe proteger al administrador maestro cuando entra
    // al panel operativo; solo se monta dentro del panel de agencia.
    let lastAgencyUrl = window.location.pathname + window.location.search;
    const keepAgencySession = (event: PopStateEvent) => {
      const targetPath = window.location.pathname;
      if (targetPath === "/" || targetPath === "/login" || targetPath === "/registro") {
        event.stopImmediatePropagation();
        window.history.pushState({ agencySessionGuard: true }, "", lastAgencyUrl);
        router.replace(lastAgencyUrl || "/pagos?menu=1");
        return;
      }
      lastAgencyUrl = window.location.pathname + window.location.search;
    };
    // Crear un estado propio hace que el primer Atrás dispare el guardián.
    window.history.pushState({ agencySessionGuard: true }, "", window.location.href);
    window.addEventListener("popstate", keepAgencySession, true);
    return () => window.removeEventListener("popstate", keepAgencySession, true);
  }, [isPlatformAdmin, router]);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 1000px)").matches) return;
    const currentParams = new URLSearchParams(searchParamsKey);
    if (currentParams.get("menu") === "1") {
      scrollContentAfterMenuClickRef.current = false;
      window.scrollTo(0, 0);
      return;
    }
    const hasAgentSelection = currentParams.has("agent");
    if (hasAgentSelection) {
      window.requestAnimationFrame(() => {
        const target = document.querySelector(".rendition-selected-view .rendition-agent-expanded-head") ?? document.querySelector(".rendition-selected-header");
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    if (!scrollContentAfterMenuClickRef.current) return;
    scrollContentAfterMenuClickRef.current = false;
    window.requestAnimationFrame(() => {
      document.querySelector(".content-area")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [pathname, searchParamsKey]);
  const isOwner = userRole === "owner";
  const visibleNav = nav.filter(([slug]) => isOwner || !["juegos", "equipo", "configuracion"].includes(slug));
  const activeNavSlug = visibleNav
    .filter(([slug]) => {
      const href = `/${slug}`;
      return pathname === href || pathname.startsWith(`${href}/`);
    })
    .sort(([first], [second]) => second.length - first.length)[0]?.[0];

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
                onClick={(event) => {
                  if (window.matchMedia("(max-width: 1000px)").matches) {
                    scrollContentAfterMenuClickRef.current = true;
                    if (pathname === href) {
                      event.preventDefault();
                      scrollContentAfterMenuClickRef.current = false;
                      window.requestAnimationFrame(() => {
                        document.querySelector(".content-area")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      });
                    }
                  }
                  if (slug === "pagos") {
                    event.preventDefault();
                    router.push("/pagos");
                    router.refresh();
                  }
                }}
                className={activeNavSlug === slug ? "nav-item active" : "nav-item"}
                aria-current={activeNavSlug === slug ? "page" : undefined}
              >
                <span className="nav-label">{label}</span>
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
        .sidebar .central-return-button { display: flex; margin-top: 6px; margin-bottom: 30px; min-height: 50px; padding: 9px 10px; border-color: rgba(255,255,255,.35); line-height: 1.25; white-space: normal; text-align: center; font-size: 12px; font-weight: 800; }
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
            display: flex;
            min-width: 0;
            min-height: 66px;
            padding: 11px 10px;
            gap: 9px;
            align-items: center;
            justify-content: flex-start;
            border: 1px solid #ddcda0;
            border-bottom: 3px solid #b79a45;
            border-radius: 13px;
            background: linear-gradient(180deg,#fffdf5 0%,#f1e6c4 100%);
            color: #59273a;
            font-family: Inter, "Segoe UI", ui-sans-serif, system-ui, sans-serif;
            font-size: 16px;
            line-height: 1.2;
            font-weight: 800;
            text-align: left;
            overflow-wrap: anywhere;
            box-shadow: 0 3px 0 rgba(48,12,23,.16), 0 6px 12px rgba(35,8,16,.13);
            transform: none;
          }
          .sidebar .nav-list .nav-item .nav-icon {
            display: inline-flex;
            flex: 0 0 29px;
            width: 29px;
            height: 29px;
            margin: 0;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(255,255,255,.18);
            border-radius: 9px;
            background: #7c3347;
            color: #fff3d0;
            font-size: 16px;
            font-weight: 900;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.15);
          }
          .sidebar .nav-list .nav-item .nav-label { display: block; min-width: 0; flex: 1 1 auto; }
          .sidebar .nav-list .nav-item.active {
            background: linear-gradient(180deg,#ffffff 0%,#fffaf0 100%);
            color: #542338;
            border-color: #b79a45;
            border-bottom-color: #7c3347;
            box-shadow: inset 4px 0 #7c3347, 0 3px 0 rgba(48,12,23,.13), 0 6px 12px rgba(30,10,16,.12);
            transform: translateY(-1px);
          }
          .sidebar .nav-list .nav-item.active .nav-icon { background: #f0e3bb; color: #64283a; border-color: #d9c48a; }
          .sidebar .nav-list .nav-item:hover:not(.active) { background: linear-gradient(180deg,#ffffff 0%,#f5ebcd 100%); color: #542338; border-color: #b79a45; transform: translateY(-1px); }
          .sidebar .nav-list .nav-item:active:not(.active) { transform: translateY(1px); }
          .sidebar .central-return-button { margin-bottom: 28px; min-height: 54px; font-size: 14px; }
          .sidebar .sidebar-footer > .button + .button { margin-top: 18px; }
          .sidebar .sidebar-footer .button { min-height: 50px; padding: 12px 14px; font-size: 14px; line-height: 1.3; white-space: normal; }
        }

        /* Menú inicial: paleta grafito-azulada y dorado discreto. */
        .sidebar {
          background: #263746 !important;
          color: #f7f9fa !important;
          border-right: 4px solid #c9ad5d !important;
        }
        .sidebar .brand-subtitle { color: #d7e0e5 !important; }
        .sidebar .official-agency-number {
          background: #f7f8f8 !important;
          border-color: #c9ad5d !important;
          color: #233241 !important;
          box-shadow: 0 2px 0 rgba(8,20,30,.22) !important;
        }
        .sidebar .nav-list .nav-item {
          background: linear-gradient(180deg,#fbfcfd 0%,#e9eef1 100%) !important;
          color: #263746 !important;
          border: 1px solid #d2dce2 !important;
          border-bottom: 3px solid #a8914c !important;
          box-shadow: 0 3px 0 rgba(6,17,26,.18), 0 6px 12px rgba(6,17,26,.12) !important;
        }
        .sidebar .nav-list .nav-item .nav-icon {
          background: #e5ebef !important;
          border-color: #cbd5dc !important;
          color: #263746 !important;
          box-shadow: none !important;
        }
        .sidebar .nav-list .nav-item.active {
          background: #ffffff !important;
          color: #182a39 !important;
          border-color: #c9ad5d !important;
          border-bottom-color: #263746 !important;
          box-shadow: inset 4px 0 #c9ad5d, 0 3px 0 rgba(6,17,26,.13) !important;
        }
        .sidebar .nav-list .nav-item.active .nav-icon {
          background: #f3edda !important;
          border-color: #d8c68b !important;
          color: #263746 !important;
        }
        .sidebar .nav-list .nav-item:hover:not(.active) {
          background: #ffffff !important;
          color: #182a39 !important;
          border-color: #b8c7d1 !important;
        }
        .sidebar .nav-list .nav-item .nav-label { color: inherit !important; }
        .sidebar .sidebar-footer .button {
          background: rgba(255,255,255,.08) !important;
          color: #f5f7f8 !important;
          border: 1px solid rgba(231,238,242,.38) !important;
          box-shadow: none !important;
        }
        .sidebar .sidebar-footer .central-return-button {
          margin-bottom: 0 !important;
        }
        @media (max-width: 1000px) {
          .app-shell { display: block !important; min-height: 100vh; }
          .sidebar {
            position: relative !important;
            top: auto !important;
            width: 100%;
            height: auto !important;
            min-height: 100vh;
            min-height: 100svh;
            padding: max(16px, env(safe-area-inset-top)) 14px max(18px, env(safe-area-inset-bottom)) !important;
            border-right: 0 !important;
            border-bottom: 5px solid #c9ad5d !important;
            display: flex !important;
            flex-direction: column !important;
          }
          .sidebar-brand {
            flex: 0 0 auto;
            padding: 5px 4px 14px !important;
            border-bottom: 1px solid rgba(232,239,243,.18);
          }
          .sidebar .nav-list {
            position: relative;
            flex: 1 1 auto;
            min-height: 0;
            display: grid !important;
            grid-template-columns: repeat(2,minmax(0,1fr)) !important;
            grid-template-rows: repeat(3,minmax(86px,1fr));
            grid-auto-rows: auto;
            align-content: stretch;
            gap: 11px !important;
            margin: 14px 0 10px !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
          }
          .sidebar .nav-list::before {
            position: absolute;
            left: 2px;
            top: -23px;
            grid-column: auto;
            padding: 0 !important;
            color: #d9e1e6 !important;
            font-size: 12px !important;
            font-weight: 900 !important;
            letter-spacing: .16em !important;
          }
          .sidebar .nav-list:has(.nav-item:nth-child(5)) { grid-template-rows: repeat(3,minmax(86px,1fr)); }
          .sidebar .nav-list:not(:has(.nav-item:nth-child(5))) { grid-template-rows: repeat(2,minmax(90px,1fr)); }
          .sidebar .nav-list .nav-item {
            min-width: 0;
            min-height: 82px !important;
            height: 100%;
            padding: 15px 12px !important;
            gap: 0 !important;
            align-items: center !important;
            justify-content: center !important;
            border-radius: 12px !important;
            text-align: center !important;
            font-size: 17px !important;
            font-weight: 800 !important;
            line-height: 1.3 !important;
            overflow-wrap: anywhere;
          }
          .sidebar .nav-list .nav-item .nav-icon { display: none !important; }
          .sidebar .nav-list .nav-item .nav-label {
            flex: 1 1 auto;
            min-width: 0;
            text-align: center;
            color: inherit !important;
          }
          .sidebar .nav-list .nav-item.active {
            box-shadow: inset 0 4px #c9ad5d, 0 3px 0 rgba(6,17,26,.13) !important;
            transform: none !important;
          }
          .sidebar .nav-list .nav-item:hover:not(.active) { transform: none !important; }
          .sidebar .sidebar-footer {
            flex: 0 0 auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: auto !important;
            padding-top: 8px;
          }
          .sidebar .user-role-line {
            grid-template-columns: minmax(0,1fr);
            gap: 5px;
            padding: 5px 2px 7px;
          }
          .sidebar .sidebar-footer .button {
            width: 100%;
            min-height: 54px !important;
            margin: 0 !important;
            padding: 13px 14px !important;
            border-radius: 10px !important;
            font-size: 15px !important;
            font-weight: 800 !important;
            line-height: 1.25;
          }
          .sidebar .sidebar-footer > .button + .button { margin-top: 0 !important; }
          .sidebar .central-return-button { min-height: 54px !important; }
          .content-area { padding: 12px !important; }
        }
        @media (max-width: 640px) {
          .sidebar .nav-list .nav-item { min-height: 82px !important; font-size: 16px !important; padding: 13px 9px !important; }
          .sidebar .user-line { font-size: 12px !important; }
        }
        @media (max-height: 700px) and (max-width: 1000px) {
          .sidebar-brand { padding-bottom: 9px !important; }
          .sidebar .nav-list { margin-top: 9px !important; gap: 7px !important; }
          .sidebar .nav-list:has(.nav-item:nth-child(5)) { grid-template-rows: repeat(3,minmax(56px,1fr)); }
          .sidebar .nav-list:not(:has(.nav-item:nth-child(5))) { grid-template-rows: repeat(2,minmax(62px,1fr)); }
          .sidebar .nav-list .nav-item { min-height: 60px !important; padding: 8px !important; font-size: 16px !important; }
          .sidebar .sidebar-footer .button { min-height: 43px !important; padding: 8px 10px !important; }
          .sidebar .sidebar-footer .user-role-line { padding: 1px 2px 4px; }
        }
        @media (max-width: 1000px) {
          .sidebar .nav-list .nav-item { font-size: 19px !important; font-weight: 850 !important; line-height: 1.18 !important; min-height: 90px !important; padding: 13px 10px !important; }
          .sidebar .nav-list:has(.nav-item:nth-child(5)) { grid-template-rows: repeat(3,minmax(86px,1fr)); }
          .sidebar .nav-list:not(:has(.nav-item:nth-child(5))) { grid-template-rows: repeat(2,minmax(90px,1fr)); }
        }
        @media (max-width: 640px) {
          .sidebar .nav-list .nav-item { font-size: 18px !important; min-height: 90px !important; }
          .sidebar .nav-list::before { font-size: 12px !important; }
        }
        @media (max-height: 700px) and (max-width: 1000px) {
          .sidebar .nav-list .nav-item { font-size: 16px !important; min-height: 60px !important; }
          .sidebar .nav-list:has(.nav-item:nth-child(5)) { grid-template-rows: repeat(3,minmax(56px,1fr)); }
          .sidebar .nav-list:not(:has(.nav-item:nth-child(5))) { grid-template-rows: repeat(2,minmax(62px,1fr)); }
        }


        /* Menú principal: fondo crema y botones bordó con contraste real. */
        .sidebar {
          background: #f4edcf !important;
          color: #2a2020 !important;
          border-right: 4px solid #7c3347 !important;
        }
        .sidebar-brand strong { color: #64283a !important; }
        .sidebar .brand-subtitle { color: #6e5960 !important; }
        .sidebar .official-agency-number {
          background: #fffdf6 !important;
          border: 2px solid #c5a84b !important;
          color: #64283a !important;
          box-shadow: 0 2px 0 rgba(74,35,48,.12) !important;
        }
        .sidebar .nav-list .nav-item,
        .sidebar .nav-list .nav-item:focus:not(.active),
        .sidebar .nav-list .nav-item:hover:not(.active) {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background: linear-gradient(180deg,#873d52 0%,#702d41 100%) !important;
          color: #fffaf0 !important;
          border: 1px solid #9c6371 !important;
          border-bottom: 4px solid #4b1b2a !important;
          border-radius: 13px !important;
          box-shadow: 0 3px 0 rgba(65,22,35,.22),0 7px 13px rgba(65,22,35,.12) !important;
          font-size: 19px !important;
          font-weight: 900 !important;
          line-height: 1.22 !important;
          text-decoration: none !important;
          transform: none !important;
          outline: none;
        }
        .sidebar .nav-list .nav-item .nav-icon { display: none !important; }
        .sidebar .nav-list .nav-item .nav-label {
          display: block !important;
          flex: 1 1 auto;
          width: 100%;
          min-width: 0;
          color: inherit !important;
          text-align: center;
        }
        .sidebar .nav-list .nav-item.active,
        .sidebar .nav-list .nav-item.active:hover,
        .sidebar .nav-list .nav-item.active:focus {
          background: linear-gradient(180deg,#ffeaa0 0%,#f1d36e 100%) !important;
          color: #4d202e !important;
          border: 1px solid #c5a84b !important;
          border-bottom: 4px solid #7c3347 !important;
          box-shadow: inset 0 3px #fff4ce,0 3px 0 rgba(65,22,35,.16) !important;
          font-weight: 950 !important;
          transform: none !important;
          outline: none !important;
        }
        .sidebar .user-role-line .user-line { color: #6e5960 !important; }
        .sidebar .sidebar-footer .button {
          background: #fffdf6 !important;
          color: #64283a !important;
          border: 1px solid #d8c99f !important;
          box-shadow: none !important;
          font-weight: 850 !important;
        }
        @media (min-width: 1001px) {
          .sidebar .nav-list { gap: 10px !important; }
          .sidebar .nav-list .nav-item {
            min-height: 58px !important;
            padding: 14px 12px !important;
            font-size: 18px !important;
            line-height: 1.25 !important;
          }
        }
        @media (max-width: 1000px) {
          .sidebar {
            background: #f4edcf !important;
            border-right: 0 !important;
            border-bottom: 5px solid #7c3347 !important;
          }
          .sidebar .nav-list {
            grid-template-columns: repeat(2,minmax(0,1fr)) !important;
            gap: 10px !important;
            margin-top: 15px !important;
          }
          .sidebar .nav-list .nav-item,
          .sidebar .nav-list .nav-item:focus:not(.active),
          .sidebar .nav-list .nav-item:hover:not(.active) {
            min-height: 90px !important;
            padding: 14px 9px !important;
            font-size: 21px !important;
            font-weight: 950 !important;
            line-height: 1.18 !important;
            letter-spacing: -.01em;
            text-align: center !important;
          }
          .sidebar .nav-list .nav-item .nav-label { text-align: center !important; }
          .sidebar .nav-list .nav-item.active,
          .sidebar .nav-list .nav-item.active:hover,
          .sidebar .nav-list .nav-item.active:focus {
            background: linear-gradient(180deg,#ffeaa0 0%,#f1d36e 100%) !important;
            color: #4d202e !important;
            box-shadow: inset 0 3px #fff4ce,0 3px 0 rgba(65,22,35,.16) !important;
          }
          .sidebar .sidebar-footer .button {
            background: #fffdf6 !important;
            color: #64283a !important;
            border-color: #cdbd94 !important;
          }
        }
        @media (max-width: 640px) {
          .sidebar .nav-list .nav-item,
          .sidebar .nav-list .nav-item:focus:not(.active),
          .sidebar .nav-list .nav-item:hover:not(.active) {
            min-height: 94px !important;
            padding: 13px 8px !important;
            font-size: 21px !important;
            line-height: 1.16 !important;
          }
          .sidebar .nav-list::before {
            color: #6e5960 !important;
            font-size: 12px !important;
            font-weight: 950 !important;
          }
        }
        @media (max-height: 700px) and (max-width: 1000px) {
          .sidebar .nav-list .nav-item,
          .sidebar .nav-list .nav-item:focus:not(.active),
          .sidebar .nav-list .nav-item:hover:not(.active) {
            min-height: 62px !important;
            padding: 8px !important;
            font-size: 17px !important;
            line-height: 1.2 !important;
          }
        }

        /* Menú principal: blanco, botones rectangulares y selección única. */
        .sidebar {
          background: #ffffff !important;
          color: #241d20 !important;
          border-right: 3px solid #7c3347 !important;
        }
        .sidebar-brand strong { color: #64283a !important; }
        .sidebar .brand-subtitle { color: #5d5154 !important; }
        .sidebar .nav-list {
          gap: 12px !important;
        }
        .sidebar .nav-list .nav-item,
        .sidebar .nav-list .nav-item:hover,
        .sidebar .nav-list .nav-item:focus,
        .sidebar .nav-list .nav-item:focus-visible,
        .sidebar .nav-list .nav-item:active,
        .sidebar .nav-list .nav-item:focus:not(.active),
        .sidebar .nav-list .nav-item:hover:not(.active),
        .sidebar .nav-list .nav-item:active:not(.active) {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          min-width: 0 !important;
          min-height: 68px !important;
          height: auto !important;
          padding: 15px 12px !important;
          border: 2px solid #6e293d !important;
          border-bottom: 4px solid #4b1b2a !important;
          border-radius: 4px !important;
          background: #7c3347 !important;
          background-image: none !important;
          color: #ffffff !important;
          font-size: 21px !important;
          font-weight: 900 !important;
          line-height: 1.2 !important;
          letter-spacing: 0 !important;
          text-align: center !important;
          text-decoration: none !important;
          box-shadow: 0 3px 0 rgba(65,22,35,.18) !important;
          transform: none !important;
          outline: none !important;
          -webkit-tap-highlight-color: transparent !important;
        }
        .sidebar .nav-list .nav-item .nav-label {
          display: block !important;
          flex: 1 1 auto !important;
          width: 100% !important;
          min-width: 0 !important;
          color: inherit !important;
          text-align: center !important;
          overflow-wrap: anywhere !important;
        }
        .sidebar .nav-list .nav-item.active,
        .sidebar .nav-list .nav-item.active:hover,
        .sidebar .nav-list .nav-item.active:focus,
        .sidebar .nav-list .nav-item.active:focus-visible,
        .sidebar .nav-list .nav-item.active:active {
          background: #ffe58a !important;
          background-image: none !important;
          color: #3f1825 !important;
          border: 2px solid #9b7830 !important;
          border-bottom: 4px solid #7c3347 !important;
          box-shadow: 0 3px 0 rgba(65,22,35,.14) !important;
          font-weight: 950 !important;
          transform: none !important;
          outline: none !important;
        }
        .sidebar .nav-list .nav-item .nav-icon { display: none !important; }
        .sidebar .sidebar-footer .button {
          background: #ffffff !important;
          color: #64283a !important;
          border: 1px solid #c9bfc2 !important;
          box-shadow: none !important;
        }
        @media (min-width: 1001px) {
          .sidebar .nav-list .nav-item {
            min-height: 66px !important;
            padding: 15px 12px !important;
            font-size: 21px !important;
          }
        }
        @media (max-width: 1000px) {
          .sidebar {
            background: #ffffff !important;
            border-right: 0 !important;
            border-bottom: 4px solid #7c3347 !important;
          }
          .sidebar .nav-list {
            grid-template-columns: repeat(2,minmax(0,1fr)) !important;
            gap: 12px !important;
            margin: 16px 0 12px !important;
          }
          .sidebar .nav-list .nav-item,
          .sidebar .nav-list .nav-item:hover,
          .sidebar .nav-list .nav-item:focus,
          .sidebar .nav-list .nav-item:focus-visible,
          .sidebar .nav-list .nav-item:active,
          .sidebar .nav-list .nav-item:focus:not(.active),
          .sidebar .nav-list .nav-item:hover:not(.active),
          .sidebar .nav-list .nav-item:active:not(.active) {
            min-height: 100px !important;
            padding: 16px 10px !important;
            font-size: 23px !important;
            font-weight: 950 !important;
            line-height: 1.15 !important;
          }
          .sidebar .nav-list .nav-item.active,
          .sidebar .nav-list .nav-item.active:hover,
          .sidebar .nav-list .nav-item.active:focus,
          .sidebar .nav-list .nav-item.active:focus-visible,
          .sidebar .nav-list .nav-item.active:active {
            background: #ffe58a !important;
            color: #3f1825 !important;
          }
          .sidebar .sidebar-footer .button {
            background: #ffffff !important;
            color: #64283a !important;
          }
        }
        @media (max-width: 390px) {
          .sidebar .nav-list .nav-item,
          .sidebar .nav-list .nav-item:hover,
          .sidebar .nav-list .nav-item:focus,
          .sidebar .nav-list .nav-item:focus-visible,
          .sidebar .nav-list .nav-item:active {
            font-size: 21px !important;
            padding: 14px 8px !important;
          }
        }
        @media (max-height: 700px) and (max-width: 1000px) {
          .sidebar .nav-list .nav-item,
          .sidebar .nav-list .nav-item:hover,
          .sidebar .nav-list .nav-item:focus,
          .sidebar .nav-list .nav-item:focus-visible,
          .sidebar .nav-list .nav-item:active {
            min-height: 88px !important;
            font-size: 21px !important;
            padding: 12px 8px !important;
          }
        }


        /* Force global overrides: the sidebar is rendered inside styled-jsx. */
        :global(.app-shell .sidebar) { background:#fff !important; }
        :global(.app-shell .sidebar .nav-list) {
          display:grid !important;
          grid-template-columns:repeat(2,minmax(0,1fr)) !important;
          grid-auto-rows:minmax(112px,auto) !important;
          grid-template-rows:none !important;
          gap:12px !important;
          align-items:stretch !important;
          margin:16px 0 !important;
          padding:0 !important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item),
        :global(.app-shell .sidebar .nav-list .nav-item:hover),
        :global(.app-shell .sidebar .nav-list .nav-item:focus),
        :global(.app-shell .sidebar .nav-list .nav-item:active),
        :global(.app-shell .sidebar .nav-list .nav-item:focus-visible) {
          display:flex !important;
          width:100% !important;
          min-width:0 !important;
          min-height:112px !important;
          height:100% !important;
          box-sizing:border-box !important;
          align-items:center !important;
          justify-content:center !important;
          padding:14px 8px !important;
          margin:0 !important;
          border:2px solid #632538 !important;
          border-bottom:5px solid #4a1b2a !important;
          border-radius:8px !important;
          background:#7c3347 !important;
          background-image:none !important;
          color:#fff !important;
          font-size:clamp(21px,5.2vw,25px) !important;
          font-weight:900 !important;
          line-height:1.16 !important;
          text-align:center !important;
          text-decoration:none !important;
          box-shadow:0 3px 0 rgba(50,15,25,.2) !important;
          transform:none !important;
          outline:none !important;
          -webkit-tap-highlight-color:transparent !important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item .nav-label) {
          display:block !important;
          width:100% !important;
          flex:1 1 100% !important;
          color:inherit !important;
          font-size:inherit !important;
          font-weight:inherit !important;
          line-height:inherit !important;
          text-align:center !important;
          white-space:normal !important;
          overflow-wrap:normal !important;
          word-break:normal !important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item.active),
        :global(.app-shell .sidebar .nav-list .nav-item.active:hover),
        :global(.app-shell .sidebar .nav-list .nav-item.active:focus),
        :global(.app-shell .sidebar .nav-list .nav-item.active:active) {
          background:#ffe58a !important;
          background-image:none !important;
          color:#3f1825 !important;
          border-color:#8f6d26 !important;
          border-bottom-color:#632538 !important;
          box-shadow:0 3px 0 rgba(50,15,25,.15) !important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item:not(.active):hover),
        :global(.app-shell .sidebar .nav-list .nav-item:not(.active):focus),
        :global(.app-shell .sidebar .nav-list .nav-item:not(.active):active) {
          background:#7c3347 !important;
          color:#fff !important;
        }
        :global(.app-shell .sidebar .nav-list .nav-item .nav-icon) { display:none !important; }
        @media (min-width:1001px) {
          :global(.app-shell .sidebar .nav-list) {
            grid-template-columns:minmax(0,1fr) !important;
            grid-auto-rows:minmax(70px,auto) !important;
          }
          :global(.app-shell .sidebar .nav-list .nav-item) {
            min-height:70px !important;
            font-size:21px !important;
          }
        }
        @media (max-width:1000px) {
          :global(.app-shell .sidebar) {
            background:#fff !important;
            border-right:0 !important;
            border-bottom:4px solid #7c3347 !important;
          }
          :global(.app-shell .sidebar .nav-list::before) { display:none !important; }
          :global(.app-shell .sidebar .nav-list .nav-item),
          :global(.app-shell .sidebar .nav-list .nav-item:hover),
          :global(.app-shell .sidebar .nav-list .nav-item:focus),
          :global(.app-shell .sidebar .nav-list .nav-item:active) {
            min-height:112px !important;
            font-size:clamp(21px,5.2vw,25px) !important;
          }
        }

      `}</style>
    </div>
  );
}
