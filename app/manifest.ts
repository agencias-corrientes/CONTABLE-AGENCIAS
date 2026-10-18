import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Agencias Corrientes",
    short_name: "Agencias",
    description: "Aplicación de gestión de agencias de quiniela, rendiciones y cobranzas.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: "#ffdf00",
    theme_color: "#71001f",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/logo-agencias-quiniela.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Ingresar a Agencias Corrientes",
        short_name: "Ingresar",
        description: "Abrir el acceso de Agencias Corrientes",
        url: "/login?perfil=administrador",
        icons: [{ src: "/logo-agencias-quiniela.svg", sizes: "any", type: "image/svg+xml" }],
      },
    ],
  };
}
