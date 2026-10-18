import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Agencias Corrientes — Quiniela Oficial";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function GET(request: Request) {
  const logoUrl = new URL("/logo-agencias-corrientes.webp?v=20261018b", request.url);
  const logoResponse = await fetch(logoUrl, { cache: "no-store" });

  if (!logoResponse.ok) {
    return new Response("No se pudo cargar el logo de Agencias Corrientes", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const logoBytes = await logoResponse.arrayBuffer();
  const logoBase64 = btoa(
    Array.from(new Uint8Array(logoBytes), (byte) => String.fromCharCode(byte)).join(""),
  );
  const logoDataUrl = `data:image/webp;base64,${logoBase64}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff9e8",
          borderBottom: "100px solid #70243a",
          padding: "28px",
        }}
      >
        <img
          src={logoDataUrl}
          alt={alt}
          width="560"
          height="560"
          style={{ objectFit: "contain", maxWidth: "100%", maxHeight: "100%" }}
        />
      </div>
    ),
    { ...size },
  );
}
