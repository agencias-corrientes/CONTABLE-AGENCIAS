import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#6b283b",
          border: "7px solid #e7bf4b",
          borderRadius: 34,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 112,
            height: 132,
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 11,
            background: "#fffaf0",
            border: "4px solid #e7bf4b",
            borderRadius: 9,
          }}
        >
          <div style={{ display: "flex", color: "#6b283b", fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>
            QUINIELA
          </div>
          <div style={{ display: "flex", width: 81, height: 3, marginTop: 7, background: "#6b283b" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5, width: 81, marginTop: 9 }}>
            <div style={{ display: "flex", width: "100%", height: 2, background: "#d7bd89" }} />
            <div style={{ display: "flex", width: "100%", height: 2, background: "#d7bd89" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 1, marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 27, height: 27, borderRadius: 20, background: "#c8263d", color: "white", fontSize: 11, fontWeight: 900 }}>3</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 20, background: "#ffdf00", color: "#4b1628", fontSize: 14, fontWeight: 900 }}>7</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 27, height: 27, borderRadius: 20, background: "#176fc6", color: "white", fontSize: 9, fontWeight: 900 }}>15</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
