import { ImageResponse } from "next/og";
import { BrandAppIcon } from "@/components/BrandAppIcon";

export async function GET() {
  return new ImageResponse(<BrandAppIcon />, {
    width: 192,
    height: 192,
  });
}
