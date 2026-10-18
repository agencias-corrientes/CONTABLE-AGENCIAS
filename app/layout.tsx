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
const brandLogo = "/logo-agencias-corrientes.webp?v=20261018b";
const shareCard = `${siteUrl}/api/share-card?v=20261018b`;

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
    icon: [{ url: brandLogo, type: "image/webp", sizes: "512x512" }],
    shortcut: [{ url: brandLogo, type: "image/webp", sizes: "512x512" }],
    apple: [{ url: brandLogo, type: "image/webp", sizes: "512x512" }],
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
        url: shareCard,
        width: 1200,
        height: 630,
        alt: "Agencias Corrientes — Quiniela Oficial",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [shareCard],
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
