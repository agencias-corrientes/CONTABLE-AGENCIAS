import type { Metadata } from "next";
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
const brandLogo = "/logo-agencias-quiniela.svg";

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
    icon: [{ url: brandLogo, type: "image/svg+xml" }],
    shortcut: [{ url: brandLogo, type: "image/svg+xml" }],
    apple: [{ url: "/logo-agencias-quiniela.webp", type: "image/webp" }],
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
        url: "/logo-agencias-quiniela.webp",
        width: 512,
        height: 512,
        type: "image/webp",
        alt: "Agencias Corrientes — Quiniela Oficial",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/logo-agencias-quiniela.webp"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
