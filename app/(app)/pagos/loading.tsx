"use client";

import Image from "next/image";

export default function PagosLoading() {
  return (
    <main className="rendition-loading" aria-live="polite" aria-busy="true">
      <div className="rendition-loading-brand" aria-hidden="true">
        <Image
          src="/Esfera_brillante_de_Agencias_Corrientes-removebg-preview.png"
          alt=""
          width={820}
          height={820}
          quality={100}
          priority
          sizes="(max-width: 1000px) 22vw, (min-width: 1400px) 680px, 58vw"
          className="rendition-loading-brand-logo"
        />
      </div>
      <style jsx>{`
        .rendition-loading {
          width: 100%;
          min-height: 55vh;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: transparent;
        }
        .rendition-loading-brand {
          width: 100%;
          min-height: 55vh;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border: 1px solid rgba(228,216,185,.75);
          border-radius: 18px;
          background:
            radial-gradient(circle at 50% 46%, rgba(255,255,255,.98) 0%, rgba(255,253,247,.97) 48%, rgba(245,239,216,.98) 100%);
        }
        .rendition-loading-brand-logo {
          display: block;
          width: clamp(84px, 22vw, 112px) !important;
          height: auto !important;
          max-width: 22vw !important;
          max-height: 16vh !important;
          object-fit: contain !important;
          object-position: center;
          filter: drop-shadow(0 8px 14px rgba(66,35,25,.09));
          animation: none !important;
          transition: none !important;
          transform: none !important;
        }
        @media (min-width: 1001px) {
          .rendition-loading {
            min-height: calc(100vh - 56px);
            padding: 0;
          }
          .rendition-loading-brand {
            min-height: calc(100vh - 56px);
          }
          .rendition-loading-brand-logo {
            width: min(58vw, 680px);
            max-height: 82vh;
            filter: drop-shadow(0 16px 28px rgba(66,35,25,.10));
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
