import { createElement } from "react";
import { ImageResponse } from "next/og";
import { BrandAppIcon } from "@/components/BrandAppIcon";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    createElement(BrandAppIcon, { scale: 192 / 512 }),
    { width: 192, height: 192 }
  );
}