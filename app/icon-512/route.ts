import { generateOfficialPwaIcon } from "@/lib/pwa-icon";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const icon = await generateOfficialPwaIcon(512);
  return new Response(icon, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
