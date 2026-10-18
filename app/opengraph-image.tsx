import { ImageResponse } from "next/og";

export const alt = "Agencias Corrientes — Quiniela Oficial";
export const size = { width: 1024, height: 1024 };
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
          alignItems: "center",
          justifyContent: "flex-start",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#ffdf00",
          color: "#71001f",
          fontFamily: "Arial, Helvetica, sans-serif",
          paddingTop: 44,
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: -122,
            left: -38,
            right: -38,
            height: 310,
            backgroundColor: "#71001f",
            borderRadius: "50% 50% 0 0",
            display: "flex",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", width: "100%" }}>
          <div style={{ display: "flex", width: 460, height: 360, position: "relative", alignItems: "center", justifyContent: "center" }}>
            <div style={{ display: "flex", position: "absolute", top: 24, left: 216, width: 152, height: 252, border: "17px solid #71001f", borderRadius: 20, transform: "rotate(12deg)", backgroundColor: "#ffdf00" }}>
              <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: 12, gap: 13 }}>
                <div style={{ display: "flex", height: 30, borderBottom: "12px solid #71001f" }} />
                <div style={{ display: "flex", height: 30, borderBottom: "12px solid #71001f" }} />
                <div style={{ display: "flex", height: 30, borderBottom: "12px solid #71001f" }} />
                <div style={{ display: "flex", height: 30, borderBottom: "12px solid #71001f" }} />
              </div>
            </div>
            <div style={{ display: "flex", position: "absolute", left: 28, top: 68, width: 258, height: 258, alignItems: "center", justifyContent: "center", backgroundColor: "#71001f", borderRadius: 999, border: "9px solid #f4c936" }}>
              <div style={{ display: "flex", width: 211, height: 211, alignItems: "center", justifyContent: "center", borderRadius: 999, backgroundColor: "#fff8e7", border: "5px solid #fff0bd", color: "#71001f", fontSize: 162, fontWeight: 900, lineHeight: 1, paddingBottom: 15 }}>1</div>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 86, fontWeight: 900, letterSpacing: "-3px", lineHeight: 1.02, marginTop: -8 }}>AGENCIAS</div>
          <div style={{ display: "flex", fontSize: 91, fontWeight: 900, letterSpacing: "-4px", lineHeight: 1.02 }}>CORRIENTES</div>
          <div style={{ display: "flex", height: 5, width: 740, backgroundColor: "#71001f", borderRadius: 4, marginTop: 14 }} />
          <div style={{ display: "flex", fontSize: 29, fontWeight: 800, letterSpacing: "8px", marginTop: 18 }}>QUINIELA OFICIAL</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
