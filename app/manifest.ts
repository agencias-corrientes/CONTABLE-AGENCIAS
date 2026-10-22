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
        src: "/logo-agencias-quiniela.webp",
        sizes: "256x256",
        type: "image/webp",
        purpose: "any",
      },
    ],
  };
}