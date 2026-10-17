export function BrandAppIcon() {
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
          border: "3px solid #f5cf4d",
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
          justifyContent: "space-evenly",
          padding: "7%",
          boxSizing: "border-box",
          borderRadius: 12,
          backgroundColor: "#fff8e7",
          border: "4px solid #f5cf4d",
          transform: "rotate(-8deg)",
        }}
      >
        <div style={{ height: 7, width: "100%", borderRadius: 4, backgroundColor: "#70243a", display: "flex" }} />
        <div style={{ height: 7, width: "72%", borderRadius: 4, backgroundColor: "#70243a", display: "flex" }} />
        <div style={{ height: 7, width: "92%", borderRadius: 4, backgroundColor: "#70243a", display: "flex" }} />
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
          border: "7px solid #fff8e7",
          backgroundColor: "#f5cf4d",
          color: "#70243a",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: 94,
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
          height: 8,
          borderRadius: 4,
          backgroundColor: "#fff8e7",
          display: "flex",
        }}
      />
    </div>
  );
}
