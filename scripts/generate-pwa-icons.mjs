import sharp from "sharp";
import { fileURLToPath } from "node:url";

const input = fileURLToPath(new URL("../public/Esfera_brillante_de_Agencias_Corrientes-removebg-preview.png", import.meta.url));
const outputs = [
  { size: 192, path: fileURLToPath(new URL("../public/icon-192x192.png", import.meta.url)) },
  { size: 512, path: fileURLToPath(new URL("../public/icon-512x512.png", import.meta.url)) },
];

for (const output of outputs) {
  await sharp(input)
    .resize(output.size, output.size, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toFile(output.path);
  console.log(`Generated PWA icon ${output.size}x${output.size}`);
}
