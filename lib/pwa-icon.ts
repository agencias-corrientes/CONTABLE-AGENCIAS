import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const officialLogoPath = join(process.cwd(), "public", "logo-agencias-corrientes.webp");

export async function generateOfficialPwaIcon(size: 192 | 512): Promise<ArrayBuffer> {
  const logo = await readFile(officialLogoPath);
  const png = await sharp(logo)
    .resize(size, size, { fit: "contain" })
    .png()
    .toBuffer();

  // Copy bytes into a standalone ArrayBuffer so Response accepts it under
  // the project's current TypeScript/Node typed-array definitions.
  const arrayBuffer = new ArrayBuffer(png.byteLength);
  new Uint8Array(arrayBuffer).set(png);
  return arrayBuffer;
}
