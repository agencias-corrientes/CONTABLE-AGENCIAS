import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#6b283b",
          border: "16px solid #e7bf4b",
          borderRadius: 104,
        }}
      >
        <div
          style={{
            width: 318,
            height: 365,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            padding: "26px 22px",
            background: "#fffaf0",
            border: "7px solid #e7bf4b",
            borderRadius: 22,
            boxShadow: "0 12px 0 #481629",
          }}
        >
          <div style={{ display: "flex", color: "#6b283b", fontSize: 29, fontWeight: 900, letterSpacing: 2 }}>
            QUINIELA
          </div>
          <div style={{ display: "flex", width: 230, height: 6, marginTop: 13, background: "#6b283b", borderRadius: 4 }} />
          <div style={{ display: "flex", flexDirection: "column", width: 230, gap: 13, marginTop: 25 }}>
            <div style={{ display: "flex", height: 5, width: "100%", background: "#d7bd89", borderRadius: 4 }} />
            <div style={{ display: "flex", height: 5, width: "100%", background: "#d7bd89", borderRadius: 4 }} />
            <div style={{ display: "flex", height: 5, width: "100%", background: "#d7bd89", borderRadius: 4 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 67, height: 67, borderRadius: 40, background: "#c8263d", border: "5px solid #fff", color: "#fffaf0", fontSize: 28, fontWeight: 900 }}>3</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 78, height: 78, borderRadius: 45, background: "#ffdf00", border: "5px solid #fff", color: "#4b1628", fontSize: 32, fontWeight: 900 }}>7</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 67, height: 67, borderRadius: 40, background: "#176fc6", border: "5px solid #fff", color: "#fffaf0", fontSize: 23, fontWeight: 900 }}>15</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
