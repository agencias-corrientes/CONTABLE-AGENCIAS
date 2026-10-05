import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Contable Agencias",
    template: "%s | Contable Agencias",
  },
  description: "Sistema administrativo, contable y financiero de Agencias Corrientes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
