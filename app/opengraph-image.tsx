import { ImageResponse } from "next/og";

export const alt = "Agencias Corrientes — gestión de agencias de quiniela";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f8f5ef",
          color: "#371622",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", height: 16, width: "100%", background: "#ffdf00" }} />
        <div style={{ display: "flex", flex: 1, alignItems: "center", padding: "34px 72px", gap: 60 }}>
          <div
            style={{
              display: "flex",
              width: 340,
              height: 340,
              flexShrink: 0,
              alignItems: "center",
              justifyContent: "center",
              background: "#6b283b",
              border: "10px solid #d8ad38",
              borderRadius: 58,
              boxShadow: "0 12px 0 #e6ded0",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 245,
                height: 280,
                padding: "20px 18px",
                borderRadius: 14,
                background: "#fffaf0",
                border: "5px solid #e7bf4b",
              }}
            >
              <div style={{ display: "flex", color: "#6b283b", fontSize: 24, fontWeight: 900, letterSpacing: 2 }}>
                QUINIELA
              </div>
              <div style={{ display: "flex", width: 190, height: 5, marginTop: 12, background: "#6b283b", borderRadius: 3 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 11, width: 190, marginTop: 20 }}>
                <div style={{ display: "flex", width: "100%", height: 4, background: "#d7bd89", borderRadius: 3 }} />
                <div style={{ display: "flex", width: "100%", height: 4, background: "#d7bd89", borderRadius: 3 }} />
                <div style={{ display: "flex", width: "100%", height: 4, background: "#d7bd89", borderRadius: 3 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 32, background: "#c8263d", color: "#fffaf0", fontSize: 23, fontWeight: 900, border: "4px solid white" }}>3</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 67, height: 67, borderRadius: 38, background: "#ffdf00", color: "#4b1628", fontSize: 27, fontWeight: 900, border: "4px solid white" }}>7</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 32, background: "#176fc6", color: "#fffaf0", fontSize: 19, fontWeight: 900, border: "4px solid white" }}>15</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
            <div style={{ display: "flex", color: "#8b6a24", fontSize: 22, fontWeight: 800, letterSpacing: 4, marginBottom: 22 }}>
              PLATAFORMA DE GESTIÓN
            </div>
            <div style={{ display: "flex", flexDirection: "column", fontSize: 66, lineHeight: 1.06, fontWeight: 900, color: "#6b283b", letterSpacing: -2 }}>
              <span>AGENCIAS</span>
              <span>CORRIENTES</span>
            </div>
            <div style={{ display: "flex", width: 92, height: 7, marginTop: 26, background: "#ffdf00", borderRadius: 4 }} />
            <div style={{ display: "flex", color: "#62545a", fontSize: 26, marginTop: 22 }}>
              Gestión diaria de agencias de quiniela
            </div>
          </div>
        </div>
        <div style={{ display: "flex", height: 58, width: "100%", alignItems: "center", padding: "0 72px", background: "#6b283b", color: "#fffaf0", fontSize: 17, letterSpacing: 3, fontWeight: 700 }}>
          RENDICIONES  ·  SUBAGENTES  ·  COBRANZAS
        </div>
      </div>
    ),
    { ...size }
  );
}
