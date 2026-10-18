type BrandAppIconProps = {
  scale?: number;
};

/**
 * Original custom app mark for Agencias Corrientes.
 * Created specifically for this project; it does not reuse a third-party logo.
 */
export function BrandAppIcon({ scale = 1 }: BrandAppIconProps) {
  const border = Math.max(1, 6 * scale);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "21%",
        backgroundColor: "#70243a",
        border: `${Math.max(1, 4 * scale)}px solid #70243a`,
        fontFamily: "Arial, Helvetica, sans-serif",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background: "linear-gradient(145deg, #ffe94f 0%, #ffdc16 58%, #f3bd08 100%)",
          borderTopLeftRadius: "19%",
          borderTopRightRadius: "19%",
          borderBottomLeftRadius: "22%",
          borderBottomRightRadius: "22%",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: "6%",
          left: "51%",
          width: "31%",
          height: "30%",
          display: "flex",
          flexDirection: "column",
          padding: `${10 * scale}px`,
          boxSizing: "border-box",
          borderRadius: `${12 * scale}px`,
          backgroundColor: "#fff9e8",
          border: `${border}px solid #70243a`,
          transform: "rotate(11deg)",
        }}
      >
        <div style={{ display: "flex", height: "15%", width: "100%", backgroundColor: "#70243a", borderRadius: `${2 * scale}px` }} />
        <div style={{ display: "flex", flex: 1, flexDirection: "row", marginTop: `${5 * scale}px`, gap: `${4 * scale}px` }}>
          <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: `${4 * scale}px` }}>
            <div style={{ display: "flex", flex: 1, backgroundColor: "#70243a" }} />
            <div style={{ display: "flex", flex: 1, backgroundColor: "#70243a" }} />
            <div style={{ display: "flex", flex: 1, backgroundColor: "#70243a" }} />
          </div>
          <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: `${4 * scale}px` }}>
            <div style={{ display: "flex", flex: 1, backgroundColor: "#70243a" }} />
            <div style={{ display: "flex", flex: 1, backgroundColor: "#70243a" }} />
            <div style={{ display: "flex", flex: 1, backgroundColor: "#70243a" }} />
          </div>
          <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: `${4 * scale}px` }}>
            <div style={{ display: "flex", flex: 1, backgroundColor: "#70243a" }} />
            <div style={{ display: "flex", flex: 1, backgroundColor: "#70243a" }} />
            <div style={{ display: "flex", flex: 1, backgroundColor: "#70243a" }} />
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "18%",
          left: "20%",
          width: "57%",
          height: "31%",
          display: "flex",
          borderTop: `${Math.max(2, 12 * scale)}px solid #70243a`,
          borderLeft: `${Math.max(2, 10 * scale)}px solid #70243a`,
          borderTopLeftRadius: "100%",
          transform: "rotate(-12deg)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "33%",
          width: "34%",
          height: "31%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          borderRadius: "50%",
          background: "radial-gradient(circle at 32% 25%, #fffef8 0%, #fff9e8 55%, #ead9ad 100%)",
          border: `${Math.max(3, 9 * scale)}px solid #70243a`,
          color: "#70243a",
          fontSize: 90 * scale,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        1
      </div>

      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "4%",
          width: "92%",
          height: "12%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#70243a",
          fontSize: 53 * scale,
          fontWeight: 900,
          letterSpacing: "-1px",
          lineHeight: 1,
        }}
      >
        AGENCIAS
      </div>
      <div
        style={{
          position: "absolute",
          top: "61%",
          left: "2%",
          width: "96%",
          height: "12%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#70243a",
          fontSize: 49 * scale,
          fontWeight: 900,
          letterSpacing: "-1.5px",
          lineHeight: 1,
        }}
      >
        CORRIENTES
      </div>

      <div
        style={{
          position: "absolute",
          top: "73.5%",
          left: "11%",
          width: "78%",
          height: `${4 * scale}px`,
          display: "flex",
          backgroundColor: "#70243a",
          borderRadius: `${4 * scale}px`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "76%",
          left: "5%",
          width: "90%",
          height: "7%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#70243a",
          fontSize: 22 * scale,
          fontWeight: 800,
          letterSpacing: 4 * scale,
          lineHeight: 1,
        }}
      >
        QUINIELA OFICIAL
      </div>

      <div
        style={{
          position: "absolute",
          left: "-2%",
          bottom: "-1%",
          width: "104%",
          height: "19%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#70243a",
          borderTopLeftRadius: "55% 25%",
          borderTopRightRadius: "55% 25%",
          borderBottomLeftRadius: "22%",
          borderBottomRightRadius: "22%",
          borderTop: `${Math.max(2, 5 * scale)}px solid #f5cf4d`,
        }}
      />
    </div>
  );
}
