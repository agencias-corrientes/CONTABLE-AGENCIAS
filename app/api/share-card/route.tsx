import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const logoUrl = new URL("/logo-agencias-corrientes-v2.webp", request.url);
    const logoResponse = await fetch(logoUrl, { cache: "force-cache" });

    if (!logoResponse.ok) {
      console.error("Share card could not load brand logo", logoResponse.status);
      return new Response("No se pudo cargar el logo de Agencias Corrientes", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const sourceLogo = Buffer.from(await logoResponse.arrayBuffer());
    const logo = await sharp(sourceLogo)
      .resize({
        width: 450,
        height: 450,
        fit: "contain",
        background: { r: 255, g: 210, b: 26, alpha: 0 },
      })
      .png()
      .toBuffer();

    const background = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">' +
        '<rect width="1200" height="630" fill="#FFD21A"/>' +
        '<rect x="0" y="472" width="1200" height="158" fill="#70243A"/>' +
      '</svg>',
    );

    const jpeg = await sharp(background)
      .composite([{ input: logo, left: 375, top: 12 }])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    return new Response(jpeg, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.byteLength),
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to generate WhatsApp share card", error);
    return new Response("No se pudo generar la tarjeta de compartir", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
