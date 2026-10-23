import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const officialLogoPath = join(process.cwd(), "public", "logo-agencias-corrientes.webp");

export async function generateOfficialPwaIcon(size: 192 | 512): Promise<Uint8Array> {
  const logo = await readFile(officialLogoPath);
  const png = await sharp(logo)
    .resize(size, size, { fit: "contain" })
    .png()
    .toBuffer();
  return new Uint8Array(png);
}
