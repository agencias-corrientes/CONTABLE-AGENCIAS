"use client";

import Image from "next/image";

export default function PagosLoading() {
  return (
    <main className="rendition-loading" aria-live="polite" aria-busy="true">
      <div className="rendition-loading-desktop">
        <Image
          src="/Esfera_brillante_de_Agencias_Corrientes-removebg-preview.png"
          alt="Agencias Corrientes — Quiniela Oficial"
          width={640}
          height={640}
          quality={100}
          priority
          sizes="(min-width: 1400px) 360px, 30vw"
        />
        <h1>Preparando la información de la agencia</h1>
        <div className="rendition-loading-desktop-status">
          <span className="rendition-loading-spinner" aria-hidden="true" />
          <strong>Cargando</strong>
        </div>
      </div>
      <div className="rendition-loading-head">
        <span className="rendition-loading-mark" aria-hidden="true">AC</span>
        <div>
          <p>AGENCIAS CORRIENTES</p>
          <h1>Rendiciones</h1>
          <span>Preparando la información de la agencia…</span>
        </div>
      </div>
      <div className="rendition-loading-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="rendition-loading-card" key={index}>
            <i />
            <b />
            <span />
          </div>
        ))}
      </div>
      <div className="rendition-loading-list">
        <b />
        <span />
        <span />
        <span />
      </div>
      <style jsx>{`
        .rendition-loading { min-height: 55vh; padding: 18px 4px; color: #632538; }
        .rendition-loading-head { display:flex; align-items:center; gap:13px; margin-bottom:22px; }
        .rendition-loading-mark { display:grid; place-items:center; flex:0 0 48px; height:48px; border-radius:12px; background:#7c3347; color:#ffe58a; font-weight:950; }
        .rendition-loading-head p { margin:0 0 3px; font-size:10px; font-weight:900; letter-spacing:.12em; }
        .rendition-loading-head h1 { margin:0; font-size:24px; }
        .rendition-loading-head span { display:block; margin-top:4px; color:#6b6265; font-size:13px; }
        .rendition-loading-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        .rendition-loading-card,.rendition-loading-list { border:1px solid #eadfe1; border-radius:12px; background:#fff; padding:14px; }
        .rendition-loading-card { min-height:90px; }
        .rendition-loading-card i,.rendition-loading-card b,.rendition-loading-card span,.rendition-loading-list b,.rendition-loading-list span { display:block; border-radius:8px; background:linear-gradient(90deg,#eee8e9 20%,#faf7f7 45%,#eee8e9 70%); background-size:200% 100%; animation:loading-shimmer 1.25s ease-in-out infinite; }
        .rendition-loading-card i { width:42%; height:9px; margin-bottom:14px; }
        .rendition-loading-card b { width:65%; height:20px; margin-bottom:9px; }
        .rendition-loading-card span { width:82%; height:8px; }
        .rendition-loading-list { margin-top:14px; }
        .rendition-loading-list b { width:48%; height:14px; margin-bottom:18px; }
        .rendition-loading-list span { width:100%; height:11px; margin:13px 0; }
        .rendition-loading-desktop { display:none; }
        @keyframes loading-shimmer { to { background-position:-200% 0; } }
        @keyframes rendition-loading-spin { to { transform:rotate(360deg); } }
        @media (min-width: 1001px) {
          .rendition-loading { min-height:calc(100vh - 56px); display:grid; place-items:center; padding:24px; }
          .rendition-loading-head,.rendition-loading-grid,.rendition-loading-list { display:none; }
          .rendition-loading-desktop { width:100%; min-height:calc(100vh - 110px); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:22px; text-align:center; }
          .rendition-loading-desktop img { display:block; width:min(30vw,360px); height:auto; max-height:38vh; object-fit:contain; }
          .rendition-loading-desktop h1 { max-width:760px; margin:0; color:#632538; font-size:clamp(28px,2.6vw,40px); line-height:1.18; font-weight:850; }
          .rendition-loading-desktop-status { display:flex; align-items:center; justify-content:center; gap:12px; color:#6b6265; font-size:20px; }
          .rendition-loading-spinner { width:22px; height:22px; border:3px solid #eadfe1; border-top-color:#7c3347; border-radius:50%; animation:rendition-loading-spin .85s linear infinite; }
        }
        @media (prefers-reduced-motion: reduce) {
          .rendition-loading-card i,.rendition-loading-card b,.rendition-loading-card span,.rendition-loading-list b,.rendition-loading-list span,.rendition-loading-spinner { animation:none; }
        }
      `}</style>
    </main>
  );
}
