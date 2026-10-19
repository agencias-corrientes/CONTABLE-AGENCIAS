type BrandAppIconProps = {
  scale?: number;
};

/** Usa el archivo oficial del logo aprobado, sin redibujarlo con elementos genéricos. */
export function BrandAppIcon({ scale = 1 }: BrandAppIconProps) {
  return (
    <img
      src="/logo-agencias-corrientes.webp"
      alt="Agencias Corrientes — Quiniela Oficial"
      width={320}
      height={320}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "contain",
        transform: scale === 1 ? undefined : `scale(${scale})`,
      }}
    />
  );
}
