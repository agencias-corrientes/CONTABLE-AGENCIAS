import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Agencias Corrientes — Control de Agencias",
    short_name: "Agencias",
    description: "Gestión diaria de agencias de quiniela, rendiciones y cobranzas.",
    lang: "es-AR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#f8f5ef",
    theme_color: "#6b283b",
    orientation: "portrait",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/logo-agencias-quiniela.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
