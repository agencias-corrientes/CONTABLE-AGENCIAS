import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 3.4 * 1024 * 1024;

type VisionVertex = { x?: number; y?: number };
type VisionWord = {
  symbols?: Array<{ text?: string }>;
  boundingBox?: { vertices?: VisionVertex[] };
  confidence?: number;
};

function wordToBox(word: VisionWord) {
  const text = (word.symbols ?? []).map((symbol) => String(symbol.text ?? "")).join("").trim();
  const vertices = Array.isArray(word.boundingBox?.vertices) ? word.boundingBox!.vertices! : [];
  if (!text || vertices.length === 0) return null;

  const xs = vertices.map((point) => Number(point.x ?? 0)).filter(Number.isFinite);
  const ys = vertices.map((point) => Number(point.y ?? 0)).filter(Number.isFinite);
  if (xs.length === 0 || ys.length === 0) return null;

  return {
    text,
    confidence: Number.isFinite(Number(word.confidence)) ? Number(word.confidence) : 0,
    bbox: {
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      x1: Math.max(...xs),
      y1: Math.max(...ys),
    },
  };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "La sesión venció. Iniciá sesión nuevamente." }, { status: 401 });
    }

    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "El lector de documentos todavía no está configurado." }, { status: 503 });
    }

    const formData = await request.formData();
    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "No se recibió una foto válida del cupón." }, { status: 400 });
    }
    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ error: "El archivo enviado no es una imagen." }, { status: 415 });
    }
    if (image.size <= 0 || image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "La foto supera el tamaño permitido para la lectura segura." }, { status: 413 });
    }

    const imageBase64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const upstream = await fetch(
      "https://vision.googleapis.com/v1/images:annotate?key=" + encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(9000),
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            imageContext: { languageHints: ["es", "en"] },
          }],
        }),
      }
    );

    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      return NextResponse.json(
        { error: upstream.status === 429
            ? "El lector externo alcanzó su límite temporal. Probá nuevamente en unos segundos."
            : "El lector externo no pudo procesar esta foto. Se puede intentar con el lector local." },
        { status }
      );
    }

    const payload = await upstream.json();
    const annotation = payload?.responses?.[0]?.fullTextAnnotation;
    if (payload?.responses?.[0]?.error?.message) {
      return NextResponse.json(
        { error: "El lector externo informó un error al interpretar la foto." },
        { status: 502 }
      );
    }

    const words: ReturnType<typeof wordToBox>[] = [];
    for (const page of annotation?.pages ?? []) {
      for (const block of page.blocks ?? []) {
        for (const paragraph of block.paragraphs ?? []) {
          for (const word of paragraph.words ?? []) {
            const box = wordToBox(word);
            if (box) words.push(box);
          }
        }
      }
    }

    return NextResponse.json(
      { text: String(annotation?.text ?? "").trim(), words },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      { error: timedOut
          ? "El lector externo tardó más de lo esperado. Podés volver a intentar."
          : "No se pudo conectar con el lector externo de documentos." },
      { status: timedOut ? 504 : 500 }
    );
  }
}
