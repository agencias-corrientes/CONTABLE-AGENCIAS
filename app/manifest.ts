import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Agencias Corrientes — Quiniela Oficial",
    short_name: "Agencias Corrientes",
    description: "Gestión diaria de agencias de quiniela, rendiciones y cobranzas.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffda18",
    theme_color: "#702039",
    icons: [
      {
        src: "/icon-192?v=20261023-pwa1",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512?v=20261023-pwa1",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}