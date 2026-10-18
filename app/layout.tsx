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
    icon: [{ url: "/logo-agencias-corrientes.webp", type: "image/webp", sizes: "320x320" }],
    shortcut: [{ url: "/logo-agencias-corrientes.webp", type: "image/webp", sizes: "320x320" }],
    apple: [{ url: "/logo-agencias-corrientes.webp", type: "image/webp", sizes: "320x320" }],
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
        url: "/logo-agencias-corrientes.webp",
        width: 512,
        height: 512,
        alt: "Logo original de Agencias Corrientes — Quiniela Oficial",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
    images: ["/logo-agencias-corrientes.webp"],
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
