"use client";

import Image from "next/image";

export default function PagosLoading() {
  return (
    <main className="rendition-loading" aria-live="polite" aria-busy="true">
      <p className="rendition-loading-label">Cargando</p>
      <div className="rendition-loading-brand" aria-hidden="true">
        <Image
          src="/Esfera_brillante_de_Agencias_Corrientes-removebg-preview.png"
          alt=""
          width={180}
          height={180}
          quality={100}
          priority
          sizes="(max-width: 1000px) 38vw, 58vw"
          className="rendition-loading-brand-logo"
        />
      </div>
      <style jsx>{`
        .rendition-loading {
          width: 100%;
          min-height: calc(100dvh - 56px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 18px;
          padding: 0;
          overflow: hidden;
          background: transparent;
        }
        .rendition-loading-label {
          margin: 0;
          color: #5b5042;
          font-size: 16px;
          font-weight: 750;
          letter-spacing: .04em;
          line-height: 1;
        }
        .rendition-loading-brand {
          width: 100%;
          min-height: 0;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: visible;
          border: 0;
          border-radius: 0;
          background: transparent;
        }
        .rendition-loading-brand-logo {
          display: block;
          width: clamp(120px, 38vw, 180px);
          height: auto;
          max-width: 42vw;
          max-height: 42vw;
          object-fit: contain;
          object-position: center;
          filter: drop-shadow(0 5px 12px rgba(66,35,25,.10));
          animation: none !important;
          transition: none !important;
          transform: none !important;
        }
        @media (min-width: 1001px) {
          .rendition-loading {
            min-height: calc(100vh - 56px);
          }
          .rendition-loading-brand-logo {
            width: min(58vw, 680px);
            max-width: 58vw;
            max-height: 82vh;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rendition-loading-brand-logo {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </main>
  );
}
