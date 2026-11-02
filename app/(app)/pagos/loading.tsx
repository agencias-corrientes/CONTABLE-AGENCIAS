"use client";

export default function PagosLoading() {
  return (
    <main className="rendition-loading" aria-live="polite" aria-busy="true">
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
        @keyframes loading-shimmer { to { background-position:-200% 0; } }
        @media (prefers-reduced-motion: reduce) { .rendition-loading-card i,.rendition-loading-card b,.rendition-loading-card span,.rendition-loading-list b,.rendition-loading-list span { animation:none; } }
      `}</style>
    </main>
  );
}
