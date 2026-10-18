import { ImageResponse } from "next/og";
import { BrandAppIcon } from "@/components/BrandAppIcon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<BrandAppIcon />, { ...size });
}
