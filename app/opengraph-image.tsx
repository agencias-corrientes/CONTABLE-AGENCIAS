import { ImageResponse } from "next/og";
import { BrandAppIcon } from "@/components/BrandAppIcon";

export const alt = "Agencias Corrientes — Quiniela Oficial";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Square share card: the original app logo only, with no third-party branding. */
export default function OpenGraphImage() {
  return new ImageResponse(<BrandAppIcon />, { ...size });
}
