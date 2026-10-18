import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Agencias Corrientes — Quiniela Oficial";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function GET(request: Request) {
  const imageUrl = new URL("/logo-agencias-corrientes.webp", request.url).toString();

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
          src={imageUrl}
          alt={alt}
          width="560"
          height="560"
          style={{ objectFit: "contain", maxWidth: "100%", maxHeight: "100%" }}
        />
      </div>
    ),
    { ...size }
  );
}
