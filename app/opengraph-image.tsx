import { ImageResponse } from "next/og";
import { BrandAppIcon } from "@/components/BrandAppIcon";

export const alt = "Agencias Corrientes — gestión de agencias de quiniela";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "row",
          backgroundColor: "#f7f0e4",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            width: "410px",
            height: "630px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            backgroundColor: "#70243a",
            borderRight: "12px solid #f5cf4d",
          }}
        >
          <div style={{ width: "284px", height: "284px", display: "flex" }}>
            <BrandAppIcon scale={284 / 512} />
          </div>
          <div
            style={{
              position: "absolute",
              bottom: "35px",
              color: "#f5cf4d",
              fontSize: "16px",
              letterSpacing: "4px",
              fontWeight: 700,
              display: "flex",
            }}
          >
            CORRIENTES · ARGENTINA
          </div>
        </div>
        <div
          style={{
            flex: 1,
            height: "630px",
            padding: "58px 48px 44px 48px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            color: "#70243a",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#876c35",
              fontSize: "16px",
              letterSpacing: "3px",
              fontWeight: 800,
              marginBottom: "22px",
            }}
          >
            GESTIÓN PARA AGENCIAS DE QUINIELA
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "62px",
              lineHeight: 1.04,
              letterSpacing: "-1.5px",
              fontWeight: 900,
            }}
          >
            <div>AGENCIAS</div>
            <div style={{ color: "#33252a" }}>CORRIENTES</div>
          </div>
          <div
            style={{
              width: "100%",
              height: "5px",
              marginTop: "27px",
              marginBottom: "24px",
              borderRadius: "4px",
              backgroundColor: "#f5cf4d",
              display: "flex",
            }}
          />
          <div
            style={{
              fontSize: "25px",
              lineHeight: 1.3,
              color: "#4d4242",
              display: "flex",
            }}
          >
            Tu agencia organizada, todos los días.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "13px", marginTop: "31px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "19px", fontWeight: 700, color: "#70243a" }}>
              <div style={{ width: "11px", height: "11px", borderRadius: "50%", backgroundColor: "#f0c744", display: "flex" }} />
              Rendiciones diarias
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "19px", fontWeight: 700, color: "#70243a" }}>
              <div style={{ width: "11px", height: "11px", borderRadius: "50%", backgroundColor: "#f0c744", display: "flex" }} />
              Subagentes y ambulantes
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "19px", fontWeight: 700, color: "#70243a" }}>
              <div style={{ width: "11px", height: "11px", borderRadius: "50%", backgroundColor: "#f0c744", display: "flex" }} />
              Caja y cobranzas
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
