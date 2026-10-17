type BrandAppIconProps = {
  scale?: number;
};

export function BrandAppIcon({ scale = 1 }: BrandAppIconProps) {
  const lineHeight = Math.max(2, 7 * scale);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#70243a",
        borderRadius: "22%",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "4%",
          border: `${3 * scale}px solid #f5cf4d`,
          borderRadius: "19%",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "17%",
          top: "21%",
          width: "57%",
          height: "43%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-around",
          padding: "7%",
          boxSizing: "border-box",
          borderRadius: 12 * scale,
          backgroundColor: "#fff8e7",
          border: `${4 * scale}px solid #f5cf4d`,
          transform: "rotate(-8deg)",
        }}
      >
        <div style={{ height: lineHeight, width: "100%", borderRadius: 4 * scale, backgroundColor: "#70243a", display: "flex" }} />
        <div style={{ height: lineHeight, width: "72%", borderRadius: 4 * scale, backgroundColor: "#70243a", display: "flex" }} />
        <div style={{ height: lineHeight, width: "92%", borderRadius: 4 * scale, backgroundColor: "#70243a", display: "flex" }} />
      </div>
      <div
        style={{
          position: "absolute",
          right: "13%",
          bottom: "14%",
          width: "43%",
          height: "43%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          border: `${7 * scale}px solid #fff8e7`,
          backgroundColor: "#f5cf4d",
          color: "#70243a",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: 94 * scale,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        7
      </div>
      <div
        style={{
          position: "absolute",
          left: "15%",
          bottom: "13%",
          width: "28%",
          height: Math.max(2, 8 * scale),
          borderRadius: 4 * scale,
          backgroundColor: "#fff8e7",
          display: "flex",
        }}
      />
    </div>
  );
}
