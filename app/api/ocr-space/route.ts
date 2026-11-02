import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const OCR_SPACE_MAX_BYTES = 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const configuredKey = process.env.OCR_SPACE_API_KEY;
  if (!configuredKey) {
    return Response.json({ error: "El motor OCR alternativo no está configurado para este entorno." }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES + 128 * 1024) {
    return Response.json({ error: "La foto supera el tamaño máximo permitido." }, { status: 413 });
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return Response.json({ error: "Solicitud no permitida." }, { status: 403 });
      }
    } catch {
      return Response.json({ error: "Solicitud no permitida." }, { status: 403 });
    }
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Iniciá sesión para procesar el ticket." }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "No se recibió una foto válida." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return Response.json({ error: "El archivo debe ser una imagen JPG, PNG o WEBP." }, { status: 415 });
    }
    if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: "La foto debe pesar menos de 12 MB." }, { status: 413 });
    }

    const input = Buffer.from(await file.arrayBuffer());
    let output = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 76, mozjpeg: true })
      .toBuffer();

    if (output.byteLength > OCR_SPACE_MAX_BYTES) {
      output = await sharp(input, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 66, mozjpeg: true })
        .toBuffer();
    }
    if (output.byteLength > OCR_SPACE_MAX_BYTES) {
      return Response.json({ error: "No se pudo reducir la foto al límite gratuito de 1 MB. Probá con una imagen más liviana." }, { status: 413 });
    }

    const upstreamForm = new FormData();
    upstreamForm.append("file", new Blob([new Uint8Array(output)], { type: "image/jpeg" }), "ticket.jpg");
    upstreamForm.append("OCREngine", "2");
    upstreamForm.append("language", "auto");
    upstreamForm.append("isOverlayRequired", "true");

    const upstream = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: configuredKey, Accept: "application/json" },
      body: upstreamForm,
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });

    const payload = await upstream.json().catch(() => null) as {
      IsErroredOnProcessing?: boolean;
      ErrorMessage?: string | string[];
      ParsedResults?: Array<{
        ParsedText?: string;
        ErrorMessage?: string;
        TextOverlay?: { Lines?: Array<{ Words?: Array<{ WordText?: string; Left?: number; Top?: number; Width?: number; Height?: number }> }> };
      }>;
    } | null;

    if (!upstream.ok || !payload || payload.IsErroredOnProcessing) {
      const message = Array.isArray(payload?.ErrorMessage) ? payload.ErrorMessage.join(" ") : payload?.ErrorMessage;
      return Response.json({ error: message || "OCR.Space no pudo procesar la foto." }, { status: 502 });
    }

    const page = payload.ParsedResults?.[0];
    const text = String(page?.ParsedText ?? "").trim();
    if (!text) {
      return Response.json({ error: page?.ErrorMessage || "OCR.Space no encontró texto legible en la foto." }, { status: 422 });
    }

    const words = (page?.TextOverlay?.Lines ?? []).flatMap((line) =>
      (line.Words ?? []).flatMap((word) => {
        const x = Number(word.Left);
        const y = Number(word.Top);
        const width = Number(word.Width);
        const height = Number(word.Height);
        const wordText = String(word.WordText ?? "").trim();
        if (!wordText || ![x, y, width, height].every(Number.isFinite)) return [];
        return [{ text: wordText, bbox: { x0: x, y0: y, x1: x + width, y1: y + height } }];
      })
    );

    return Response.json(
      { text, words, engine: "OCR.Space Engine 2", inputBytes: file.size, processedBytes: output.byteLength },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "OCR.Space tardó demasiado en responder."
      : "No se pudo completar la lectura con OCR.Space.";
    return Response.json({ error: message }, { status: 502 });
  }
}
