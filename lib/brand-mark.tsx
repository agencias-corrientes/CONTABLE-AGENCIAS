import type { CSSProperties } from "react";

export function BrandMark({ size = 512 }: { size?: number }) {
  const u = (n: number) => Math.round((n * size) / 512);
  const px = (n: number) => `${u(n)}px`;
  const style = (s: CSSProperties): CSSProperties => s;
  const cell: CSSProperties = {
    width: px(24), height: px(27), background: "#740021",
    borderRadius: px(2), margin: px(4),
  };

  return (
    <div style={style({
      position: "relative", display: "flex", flexDirection: "column",
      width: px(512), height: px(512), flexShrink: 0, overflow: "hidden",
      borderRadius: px(43), background: "linear-gradient(135deg, #ffe52a 0%, #ffd400 50%, #ffea45 100%)",
      border: `${u(2)}px solid #f8ca22`,
      fontFamily: "Arial, Helvetica, sans-serif",
    })}>
      <div style={style({
        position: "absolute", left: px(-30), top: px(385), width: px(572), height: px(180),
        background: "linear-gradient(140deg, #7c0023 0%, #570017 100%)",
        borderTopLeftRadius: "48% 27%", borderTopRightRadius: "48% 27%",
      })} />
      <div style={style({
        position: "absolute", left: px(120), top: px(47), width: px(184), height: px(151),
        borderTop: `${u(12)}px solid #740021`, borderLeft: `${u(10)}px solid #740021`,
        borderRadius: "50%", transform: "rotate(-24deg)",
      })} />
      <div style={style({
        position: "absolute", left: px(273), top: px(36), width: px(126), height: px(178),
        border: `${u(10)}px solid #740021`, borderRadius: px(15),
        transform: "rotate(12deg)", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "linear-gradient(140deg, #ffe936, #ffd21b)",
      })}>
        <div style={{ display: "flex", flexDirection: "row" }}>
          <div style={cell} /><div style={cell} /><div style={cell} />
        </div>
        <div style={{ display: "flex", flexDirection: "row" }}>
          <div style={cell} /><div style={cell} /><div style={cell} />
        </div>
        <div style={{ display: "flex", flexDirection: "row" }}>
          <div style={cell} /><div style={cell} /><div style={cell} />
        </div>
        <div style={{ display: "flex", flexDirection: "row" }}>
          <div style={cell} /><div style={cell} /><div style={cell} />
        </div>
      </div>
      <div style={style({
        position: "absolute", left: px(155), top: px(92), width: px(207), height: px(207),
        borderRadius: "50%", background: "#740021", border: `${u(8)}px solid #f8ca22`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 ${px(5)} ${px(9)} rgba(70,0,20,0.28)`,
      })}>
        <div style={style({
          width: px(174), height: px(174), borderRadius: "50%", background: "#fff8e8",
          border: `${u(3)}px solid #ffffff`, display: "flex", alignItems: "center",
          justifyContent: "center", color: "#740021", fontSize: u(142), fontWeight: 900,
          lineHeight: 1,
        })}>1</div>
      </div>
      <div style={style({
        position: "absolute", top: px(234), left: px(28), width: px(456), height: px(54),
        color: "#740021", fontSize: u(47), fontWeight: 900, textAlign: "center",
        lineHeight: 1, letterSpacing: px(0.5), whiteSpace: "nowrap",
      })}>AGENCIAS</div>
      <div style={style({
        position: "absolute", top: px(286), left: px(18), width: px(476), height: px(59),
        color: "#740021", fontSize: u(50), fontWeight: 900, textAlign: "center",
        lineHeight: 1, letterSpacing: px(-1.4), whiteSpace: "nowrap",
      })}>CORRIENTES</div>
      <div style={style({
        position: "absolute", top: px(364), left: px(56), width: px(400), height: px(4),
        background: "#740021", borderRadius: px(4),
      })} />
      <div style={style({
        position: "absolute", top: px(378), left: px(55), width: px(402), height: px(28),
        color: "#740021", fontSize: u(22), fontWeight: 700, letterSpacing: px(7.2),
        whiteSpace: "nowrap", textAlign: "center", lineHeight: 1.1,
      })}>QUINIELA OFICIAL</div>
      <div style={style({
        position: "absolute", left: px(57), bottom: px(53), width: px(150),
        height: px(6), background: "#f5cf4d", borderRadius: px(5),
      })} />
      <div style={style({
        position: "absolute", left: px(57), bottom: px(35), width: px(95),
        height: px(4), background: "#fff5d3", borderRadius: px(5),
      })} />
    </div>
  );
}
