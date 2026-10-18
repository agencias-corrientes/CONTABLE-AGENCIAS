import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./agency-ops.css";

const siteUrl = "https://contable-agencias.vercel.app";
const siteTitle = "Agencias Corrientes";
const siteDescription = "Agencias Corrientes — Quiniela Oficial.";

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
    icon: [{ url: "/logo-agencias-quiniela.svg", type: "image/svg+xml", sizes: "any" }],
    apple: [{ url: "/logo-agencias-quiniela.svg", type: "image/svg+xml" }],
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
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
};

export const viewport: Viewport = {
  themeColor: "#71001f",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
