type BrandAppIconProps = {
  scale?: number;
};

/**
 * Identidad visual original de Agencias Corrientes.
 * Diseño propio para esta aplicación: fondo amarillo, franja bordó,
 * ticket de quiniela y bolilla con el número 1.
 */
export function BrandAppIcon({ scale = 1 }: BrandAppIconProps) {
  const edge = Math.max(2, 6 * scale);
  const cellGap = Math.max(2, 4 * scale);

  const titleStyle = {
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    color: "#70243a",
    fontWeight: 900,
    lineHeight: 1,
    whiteSpace: "nowrap" as const,
    zIndex: 2,
  };

  return (
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
        boxSizing: "border-box",
        borderRadius: "17%",
        border: `${edge}px solid #e9c52d`,
        background: "linear-gradient(145deg, #fff04c 0%, #ffdc18 58%, #f2bf08 100%)",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "18%",
          display: "flex",
          backgroundColor: "#70243a",
          borderTop: `${Math.max(2, 5 * scale)}px solid #f5cf4d`,
          borderTopLeftRadius: "50% 24%",
          borderTopRightRadius: "50% 24%",
          zIndex: 0,
        }}
      />

      <div
        style={{
          display: "flex",
          flex: "0 0 42%",
          width: "100%",
          height: "42%",
          marginTop: "2%",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "11%",
            right: "18%",
            width: "31%",
            height: "69%",
            display: "flex",
            flexDirection: "column",
            padding: `${8 * scale}px`,
            boxSizing: "border-box",
            borderRadius: `${8 * scale}px`,
            backgroundColor: "#fff8e7",
            border: `${Math.max(2, 5 * scale)}px solid #70243a`,
            transform: "rotate(10deg)",
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              flex: "0 0 13%",
              width: "100%",
              backgroundColor: "#70243a",
              borderRadius: `${2 * scale}px`,
            }}
          />
          <div
            style={{
              display: "flex",
              flex: 1,
              gap: `${cellGap}px`,
              marginTop: `${cellGap}px`,
            }}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ display: "flex", flex: 1, flexDirection: "column", gap: `${cellGap}px` }}>
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j} style={{ display: "flex", flex: 1, backgroundColor: "#70243a", borderRadius: `${1.5 * scale}px` }} />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: "12%",
            left: "28%",
            width: "34%",
            height: "75%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            borderRadius: "50%",
            background: "radial-gradient(circle at 32% 25%, #fffefa 0%, #fff8e7 65%, #e9d4a5 100%)",
            border: `${Math.max(3, 9 * scale)}px solid #70243a`,
            boxShadow: "0 3px 0 rgba(56, 16, 31, .2)",
            color: "#70243a",
            fontSize: 88 * scale,
            fontWeight: 900,
            lineHeight: 1,
            zIndex: 3,
          }}
        >
          1
        </div>
      </div>

      <div style={{ ...titleStyle, flex: "0 0 12%", height: "12%", fontSize: 53 * scale, letterSpacing: "-1px" }}>
        AGENCIAS
      </div>
      <div style={{ ...titleStyle, flex: "0 0 13%", height: "13%", fontSize: 47 * scale, letterSpacing: "-1.2px" }}>
        CORRIENTES
      </div>
      <div
        style={{
          display: "flex",
          flex: "0 0 1.4%",
          height: "1.4%",
          width: "78%",
          borderRadius: `${3 * scale}px`,
          backgroundColor: "#70243a",
          zIndex: 2,
        }}
      />
      <div
        style={{
          display: "flex",
          flex: "0 0 9%",
          height: "9%",
          width: "92%",
          alignItems: "center",
          justifyContent: "center",
          color: "#70243a",
          fontSize: 20 * scale,
          fontWeight: 900,
          letterSpacing: 3 * scale,
          lineHeight: 1,
          whiteSpace: "nowrap",
          zIndex: 2,
        }}
      >
        QUINIELA OFICIAL
      </div>
    </div>
  );
}
