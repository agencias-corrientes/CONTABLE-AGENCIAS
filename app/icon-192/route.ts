import { createElement } from "react";
import { ImageResponse } from "next/og";
import { BrandMark } from "@/lib/brand-mark";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    createElement(BrandMark, { size: 192 }),
    { width: 192, height: 192 }
  );
}
