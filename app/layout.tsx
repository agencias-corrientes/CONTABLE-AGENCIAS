import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./agency-ops.css";

const productionSiteUrl = "https://contable-agencias.vercel.app";
const previewHost = process.env.VERCEL_URL;
const siteUrl =
  process.env.VERCEL_ENV === "preview" && previewHost
    ? `https://${previewHost}`
    : productionSiteUrl;
const siteTitle = "Agencias Corrientes";
const siteDescription =
  "Gestión diaria de agencias de quiniela, rendiciones y cobranzas.";
const brandLogo = "/logo-agencias-corrientes-v2.webp";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteTitle,
  title: {
    default: siteTitle,
    template: "%s | Agencias Corrientes",
  },
  description: siteDescription,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: brandLogo, type: "image/webp" }],
    shortcut: [{ url: brandLogo, type: "image/webp" }],
    apple: [{ url: brandLogo, type: "image/webp" }],
  },
  appleWebApp: {
    capable: true,
    title: siteTitle,
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: siteTitle,
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    images: [
      {
        url: "/logo-agencias-corrientes-v2.webp",
        width: 112,
        height: 112,
        type: "image/webp",
        alt: "Agencias Corrientes — Quiniela Oficial",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/logo-agencias-corrientes-v2.webp"],
  },
};

const installPromptCapture = `
(() => {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.__deferredPwaInstallPrompt = event;
    window.dispatchEvent(new Event("pwa-install-prompt-available"));
  });
  window.addEventListener("appinstalled", () => {
    window.__deferredPwaInstallPrompt = null;
    window.dispatchEvent(new Event("pwa-installed"));
  });
})();
`;

declare global {
  interface Window {
    __deferredPwaInstallPrompt?: Event | null;
  }
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <Script
          id="capture-pwa-install-prompt"
          strategy="beforeInteractive"
        >
          {installPromptCapture}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
