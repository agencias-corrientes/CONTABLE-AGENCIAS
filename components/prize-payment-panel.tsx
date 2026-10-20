"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import jsQR from "jsqr";
import { createAgencyPrizePayment, deleteAgencyPrizePayment, updateAgencyPrizePayment } from "@/app/(app)/agencias/actions";

type CaptureMode = "manual" | "photo" | "qr";
type PrizePayment = {
  id: string;
  coupon_number: string;
  game_name: string | null;
  prize_amount: number;
  payment_date: string;
  capture_method: string;
  notes: string | null;
  included_in_ticket_ocr: boolean;
};

function couponFromQrPayload(payload: string): string {
  const raw = payload.trim();
  if (!raw) return "";
  const keys = ["coupon_number", "coupon", "ticket_number", "ticket", "cupon", "numero_cupon", "number", "id"];
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const key of keys) {
      const value = data[key];
      if (typeof value === "string" || typeof value === "number") {
        const candidate = String(value).trim();
        if (candidate.length >= 2 && /\d/.test(candidate)) return candidate;
      }
    }
  } catch {
    // QR payloads can be URLs or plain text.
  }
  try {
    const url = new URL(raw);
    for (const key of keys) {
      const value = url.searchParams.get(key);
      if (value && value.length >= 2 && /\d/.test(value)) return value.trim();
    }
    const last = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    if (/^[A-Z0-9-]{2,64}$/i.test(last) && /\d/.test(last)) return last;
  } catch {
    // Continue with the plain-text form.
  }
  const labelled = raw.match(/\b(?:CUPON|TICKET|TKT|COMPROBANTE|N(?:RO|UMERO|[º°.#]))\b[^A-Z0-9]{0,16}([A-Z0-9][A-Z0-9-]{1,63})/i);
  if (labelled?.[1] && /\d/.test(labelled[1])) return labelled[1].trim();
  return /^[A-Z0-9-]{2,64}$/i.test(raw) && /\d/.test(raw) ? raw : "";
}

function moneyLabel(amount: number, currency: string) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: currency || "ARS" }).format(amount);
}

export function PrizePaymentPanel({
  canRegisterPayments,
  currencyCode,
  returnAgentId = "",
  recentPayments,
}: {
  canRegisterPayments: boolean;
  currencyCode: string;
  returnAgentId?: string;
  recentPayments: PrizePayment[];
}) {
  const [captureMode, setCaptureMode] = useState<CaptureMode>("manual");
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [captureChoiceOpen, setCaptureChoiceOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [cameraStreamVersion, setCameraStreamVersion] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const [couponNumber, setCouponNumber] = useState("");
  const [prizeAmount, setPrizeAmount] = useState("");
  const [gameName, setGameName] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState("");

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!cameraOpen || !cameraStreamRef.current || !cameraVideoRef.current) return;
    const video = cameraVideoRef.current;
    video.srcObject = cameraStreamRef.current;
    void video.play().catch(() => setCameraError("No se pudo iniciar la vista previa. Volvé a intentar o elegí una foto guardada."));
    return () => {
      if (video.srcObject === cameraStreamRef.current) video.srcObject = null;
    };
  }, [cameraOpen, cameraStreamVersion]);

  function stopPrizeCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) {
      cameraVideoRef.current.pause();
      cameraVideoRef.current.srcObject = null;
    }
    setCameraOpen(false);
    setCameraReady(false);
    setCameraStarting(false);
  }

  async function startPrizeCamera(facing: "environment" | "user") {
    setCameraError("");
    setCameraReady(false);
    setCameraStarting(true);
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Este navegador no permite abrir la cámara desde esta página.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraFacing(facing);
      setCameraOpen(true);
      setCameraStreamVersion((value) => value + 1);
    } catch (error) {
      setCameraError(error instanceof Error
        ? "No se pudo abrir la cámara. Revisá el permiso del navegador o elegí una foto guardada. " + error.message
        : "No se pudo abrir la cámara. Revisá el permiso del navegador o elegí una foto guardada.");
    } finally {
      setCameraStarting(false);
    }
  }

  function handleQrPayload(value: string) {
    setQrPayload(value);
    const detected = couponFromQrPayload(value);
    if (detected) {
      setCouponNumber(detected);
      setScanMessage("Número de cupón detectado desde el contenido QR. Verificalo con el comprobante antes de pagar.");
    }
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setCaptureChoiceOpen(false);
    setCameraError("");
    await processPhotoFile(file);
  }

  async function processPhotoFile(file: File) {
    // Keep QR mode mounted when a QR image is scanned so the decoded payload
    // remains part of the form submission; photo mode remains selected otherwise.
    if (captureMode !== "qr") setCaptureMode("photo");
    setScanMessage("");
    const declaredType = String(file.type ?? "").toLowerCase();
    const looksLikeImage = declaredType.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif)$/i.test(file.name);
    const isVideo = declaredType.startsWith("video/") || /\.(mp4|mov|m4v|avi|webm|3gp|mpeg|mpg|mkv|wmv)$/i.test(file.name);
    if (isVideo || (!looksLikeImage && declaredType && declaredType !== "application/octet-stream")) {
      setScanMessage("Elegí una foto fija del cupón desde Archivos o la cámara. Si el dispositivo no informa el tipo de archivo, igualmente intentaremos abrir la imagen.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setScanMessage("La imagen supera 12 MB. Elegí una foto más liviana.");
      return;
    }
    setReadingPhoto(true);
    try {
      let detectedQr = "";
      // QR decoding is optional: some browsers cannot create an ImageBitmap for HEIC/HEIF.
      // If that fails, continue to OCR instead of aborting the entire photo workflow.
      try {
        const bitmap = await createImageBitmap(file);
        try {
          const scale = Math.min(1, 1800 / bitmap.width, 1800 / bitmap.height);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (context) {
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            detectedQr = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" })?.data?.trim() ?? "";
          }
        } finally {
          bitmap.close();
        }
      } catch {
        // Fall through to Tesseract OCR below.
      }

      if (detectedQr) {
        setQrPayload(detectedQr);
        const qrCoupon = couponFromQrPayload(detectedQr);
        if (qrCoupon) {
          setCouponNumber(qrCoupon);
          setScanMessage("Se leyó el QR de la imagen. Comprobá que el cupón y el importe sean correctos antes de pagar.");
        } else {
          setCaptureMode("qr");
          setScanMessage("Se leyó el QR, pero no contiene un número de cupón reconocible. Revisá el contenido y completá el número manualmente.");
        }
        setReadingPhoto(false);
        return;
      }

      // Reutiliza el mismo preprocesamiento del lector oficial de tickets:
      // imagen ampliada, escala de grises y contraste moderado para papel térmico.
      let enhancedImage: HTMLCanvasElement | File = file;
      try {
        const bitmap = await createImageBitmap(file);
        try {
          const longestSide = Math.max(bitmap.width, bitmap.height);
          const scale = Math.max(1, Math.min(2, 3000 / longestSide));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (context) {
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = image.data;
            for (let i = 0; i < pixels.length; i += 4) {
              const gray = 0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!;
              const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.55 + 128));
              pixels[i] = contrasted;
              pixels[i + 1] = contrasted;
              pixels[i + 2] = contrasted;
            }
            context.putImageData(image, 0, 0);
            enhancedImage = canvas;
          }
        } finally {
          bitmap.close();
        }
      } catch {
        // Si el navegador no decodifica el formato (p. ej. HEIC), probar el archivo original.
      }

      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("spa+eng", 1, {
        logger: (message) => {
          if (message.status === "recognizing text" && typeof message.progress === "number") {
            setScanMessage("Leyendo la foto del cupón… " + Math.round(message.progress * 100) + "%");
          }
        },
      });
      try {
        const firstResult = await worker.recognize(enhancedImage);
        let recognized = String(firstResult.data.text ?? "");
        // Segunda pasada con el original si el texto de la imagen mejorada quedó vacío o muy corto.
        if (recognized.trim().length < 8 && enhancedImage !== file) {
          const originalResult = await worker.recognize(file);
          if (String(originalResult.data.text ?? "").trim().length > recognized.trim().length) {
            recognized = String(originalResult.data.text ?? "");
          }
        }
        const text = recognized.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        const couponPatterns = [
          /\b(?:CUPON|TICKET|TKT|COMPROBANTE)\s*(?:(?:NRO|NUM(?:ERO)?|N[º°]|N|#)\s*)?[:.#º°-]?\s*([A-Z0-9][A-Z0-9-]{1,63})\b/,
          /\b(?:NRO|NUM(?:ERO)?|N[º°]|#)\s*(?:DE\s*)?(?:CUPON|TICKET|COMPROBANTE)\s*[:.#º°-]?\s*([A-Z0-9][A-Z0-9-]{1,63})\b/,
        ];
        let detected = "";
        for (const pattern of couponPatterns) {
          const match = text.match(pattern);
          if (match?.[1] && /\d/.test(match[1])) {
            detected = match[1].replace(/[.,;:]$/, "");
            break;
          }
        }

        // Read prize values separately from coupon IDs; never assume a coupon number is an amount.
        const amountPatterns = [
          /\b(?:TOTAL\s+A\s+PAGAR|PREMIO(?:\s+(?:TOTAL|A\s+PAGAR|PAGADO))?|IMPORTE(?:\s+(?:DEL\s+)?PREMIO)?|MONTO(?:\s+DEL\s+PREMIO)?)\s*[:=]?\s*\$?\s*([0-9][0-9.,]{1,17})/m,
          /\$\s*([0-9][0-9.,]{2,17})/m,
        ];
        let detectedAmount: number | null = null;
        for (const pattern of amountPatterns) {
          const match = text.match(pattern);
          if (!match?.[1]) continue;
          let raw = match[1].replace(/[^0-9.,]/g, "");
          if (raw.includes(".") && raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
          else if (raw.includes(",")) {
            const decimals = raw.length - raw.lastIndexOf(",") - 1;
            raw = decimals > 0 && decimals <= 2 ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
          } else if (raw.includes(".")) {
            const decimals = raw.length - raw.lastIndexOf(".") - 1;
            if (decimals === 3) raw = raw.replace(/\./g, "");
          }
          const parsed = Number(raw);
          if (Number.isFinite(parsed) && parsed > 0 && parsed <= 999999999999.99) {
            detectedAmount = Math.round(parsed * 100) / 100;
            break;
          }
        }
        const gameMatch = text.match(/\b(?:JUEGO|PRODUCTO|MODALIDAD)\s*[:=-]?\s*([^\n\r]{3,60})/);
        if (gameMatch?.[1]) setGameName(gameMatch[1].trim().replace(/\s{2,}/g, " ").slice(0, 120));
        if (detected) setCouponNumber(detected);
        if (detectedAmount !== null) setPrizeAmount(String(detectedAmount).replace(".", ","));

        const found = [
          detected ? "cupón " + detected : "",
          detectedAmount !== null ? "importe " + new Intl.NumberFormat("es-AR", { style: "currency", currency: currencyCode || "ARS" }).format(detectedAmount) : "",
        ].filter(Boolean);
        if (found.length) {
          setScanMessage("Lectura de foto: " + found.join(" · ") + ". Verificá los datos contra el comprobante original antes de registrar el pago.");
        } else {
          setScanMessage("La foto se procesó, pero no identificamos con seguridad el número ni el importe. Completalos manualmente y verificá el premio.");
        }
      } finally {
        await worker.terminate();
      }
    } catch {
      setScanMessage("No pudimos leer la imagen. Podés volver a fotografiar el cupón o escribir el número manualmente.");
    } finally {
      setReadingPhoto(false);
    }
  }

  async function capturePrizeCameraPhoto() {
    const video = cameraVideoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setCameraError("La cámara todavía no está lista. Esperá un instante y volvé a tomar la foto.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("No se pudo preparar la foto. Cerrá la cámara y volvé a abrirla.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
    if (!blob) {
      setCameraError("No se pudo generar la foto. Volvé a intentarlo.");
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = new File([blob], "premio-camara-" + stamp + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
    stopPrizeCamera();
    setCaptureChoiceOpen(false);
    await processPhotoFile(file);
  }

  function renderPrizeCaptureDialogs() {
    return (
      <>
        {captureChoiceOpen && (
          <div className="ticket-capture-dialog-backdrop" role="presentation" onClick={() => setCaptureChoiceOpen(false)}>
            <section className="ticket-capture-dialog" role="dialog" aria-modal="true" aria-labelledby="prize-capture-title" onClick={(event) => event.stopPropagation()}>
              <div className="ticket-capture-dialog-heading">
                <h3 id="prize-capture-title">Elegí cómo cargar el comprobante del premio</h3>
                <p>La foto tomada con cámara y los archivos pasan por el mismo lector de cupón.</p>
              </div>
              {cameraError && <p className="ticket-read-error" role="alert">{cameraError}</p>}
              {cameraStarting && <p className="ticket-read-notice" role="status">Solicitando acceso a la cámara…</p>}
              <div className="ticket-capture-dialog-actions">
                <button type="button" className="button primary" disabled={cameraStarting || readingPhoto} onClick={() => void startPrizeCamera("environment")}>Usar cámara trasera</button>
                <button type="button" className="button secondary" disabled={cameraStarting || readingPhoto} onClick={() => void startPrizeCamera("user")}>Usar cámara frontal</button>
                <button
                  type="button"
                  className="ticket-photo-select-button ticket-dialog-file-choice"
                  disabled={readingPhoto}
                  onClick={() => {
                    const input = photoInputRef.current;
                    if (!input || readingPhoto) return;
                    input.click();
                    setCaptureChoiceOpen(false);
                  }}
                >Elegir foto o archivo</button>
              </div>
              <button type="button" className="button ghost ticket-capture-dialog-cancel" onClick={() => {
                setCaptureChoiceOpen(false);
                setCameraError("");
              }}>Cancelar</button>
            </section>
          </div>
        )}
        {cameraOpen && (
          <div className="ticket-capture-dialog-backdrop" role="presentation" onClick={stopPrizeCamera}>
            <section className="ticket-capture-dialog ticket-live-camera-dialog" role="dialog" aria-modal="true" aria-labelledby="prize-camera-title" onClick={(event) => event.stopPropagation()}>
              <div className="ticket-capture-dialog-heading">
                <h3 id="prize-camera-title">Tomar foto del comprobante</h3>
                <p>{cameraFacing === "environment" ? "Cámara trasera" : "Cámara frontal"} · Centrá el cupón completo en la imagen.</p>
              </div>
              <video
                ref={cameraVideoRef}
                className="ticket-live-camera-video"
                autoPlay
                playsInline
                muted
                onCanPlay={() => setCameraReady(true)}
                aria-label="Vista en vivo de la cámara para capturar el comprobante del premio"
              />
              {cameraError && <p className="ticket-read-error" role="alert">{cameraError}</p>}
              <div className="ticket-capture-dialog-actions">
                <button type="button" className="button secondary" disabled={cameraStarting || readingPhoto} onClick={() => void startPrizeCamera(cameraFacing === "environment" ? "user" : "environment")}>Cambiar a cámara {cameraFacing === "environment" ? "frontal" : "trasera"}</button>
                <button type="button" className="button primary" disabled={!cameraReady || cameraStarting || readingPhoto} onClick={() => void capturePrizeCameraPhoto()}>Tomar foto y leer comprobante</button>
                <button type="button" className="button ghost" onClick={stopPrizeCamera}>Cancelar</button>
              </div>
            </section>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="panel prize-payment-panel" aria-labelledby="prize-payment-heading">
      <div className="panel-head prize-payment-head">
        <div>
          <p className="eyebrow">CAJA · EGRESO</p>
          <h2 id="prize-payment-heading">Pagar premio</h2>
          <p className="muted">Identificá el cupón por número, foto o QR. Antes de entregar efectivo, verificá el premio y el importe en el sistema oficial de Lotería; esta pantalla registra el pago, pero no consulta ni valida premios en línea.</p>
        </div>
      </div>

      {!canRegisterPayments ? (
        <p className="message error-message">Tu usuario no tiene permiso para registrar pagos. El titular debe habilitar los cobros en Caja.</p>
      ) : (
        <form action={createAgencyPrizePayment} className="form-stack prize-payment-form">
          <input type="hidden" name="return_agent_id" value={returnAgentId} />
          <input type="hidden" name="capture_method" value={captureMode} />
          <div className="rendition-mode-toolbar prize-capture-toolbar">
            <div className="rendition-mode-switch" role="group" aria-label="Método para cargar el comprobante del premio">
              <button
                type="button"
                className={(captureMode === "photo" ? "active " : "") + "ticket-photo-source-label"}
                disabled={readingPhoto}
                onClick={() => { setCaptureMode("photo"); setScanMessage(""); setCameraError(""); setCaptureChoiceOpen(true); }}
              >Foto automático</button>
              <button
                type="button"
                className={captureMode === "manual" ? "active" : ""}
                disabled={readingPhoto}
                onClick={() => { setCaptureMode("manual"); setCaptureChoiceOpen(false); setScanMessage(""); }}
              >Carga manual</button>
            </div>
          </div>

          <input
            ref={photoInputRef}
            id="prize-photo-file-input"
            className="ticket-photo-native-input ticket-photo-operational-input"
            type="file"
            name="prize_photo"
            accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.bmp,.gif,.tif,.tiff"
            aria-label="Elegir foto del comprobante del premio"
            onChange={handlePhoto}
            disabled={readingPhoto}
          />
          {renderPrizeCaptureDialogs()}

          {captureMode === "qr" && (
            <>
              <label>Contenido del QR
                <textarea name="qr_payload" rows={2} value={qrPayload} onChange={(event) => handleQrPayload(event.target.value)} placeholder="Pegá el contenido del QR si ya lo escaneaste." />
              </label>
              <small className="muted">Si el QR proviene de una imagen cargada, el contenido se leerá automáticamente cuando sea posible.</small>
            </>
          )}

          {scanMessage && <p className="message" role="status">{readingPhoto ? "Leyendo la imagen…" : scanMessage}</p>}
          {readingPhoto && <p className="muted" role="status">Analizando la foto del cupón…</p>}

          <div className="prize-payment-grid">
            <label>Número de cupón
              <input name="coupon_number" required maxLength={128} value={couponNumber} onChange={(event) => setCouponNumber(event.target.value)} placeholder="Número impreso o detectado" autoComplete="off" />
            </label>
            <label>Juego (opcional)
              <input name="game_name" maxLength={120} value={gameName} onChange={(event) => setGameName(event.target.value)} placeholder="Nombre del juego" />
            </label>
            <label>Importe del premio
              <input name="prize_amount" type="text" inputMode="decimal" required value={prizeAmount} onChange={(event) => setPrizeAmount(event.target.value)} placeholder="Ej.: 125000,00" />
            </label>
            <label>Observaciones (opcional)
              <input name="notes" maxLength={1000} placeholder="Referencia, validación o nota" />
            </label>
          </div>
          <label className="prize-included-ocr"><input type="checkbox" name="included_in_ticket_ocr" /><span>Este premio ya está incluido en “Premios pagados” de un ticket OCR de hoy.<small>Marcá esta opción si el comprobante oficial ya suma este pago, para que no se descuente dos veces.</small></span></label>
          <button className="button primary" type="submit" disabled={readingPhoto}>Aceptar y registrar pago de premio en Caja</button>
          <p className="muted small-text">El número de cupón solo puede registrarse una vez por agencia. El alta del pago y la salida de Caja se guardan juntas, sin descontar dos veces un mismo cupón.</p>
        </form>
      )}

      <div className="prize-payment-recent">
        <h3>Últimos premios pagados</h3>
        {recentPayments.length ? (
          <div className="prize-payment-recent-list">
            {recentPayments.map((payment) => (
              <article className="prize-payment-recent-item" key={payment.id}>
                <span><strong>Cupón {payment.coupon_number}</strong><small>{payment.game_name || "Juego no indicado"} · {payment.payment_date}</small><small>{payment.included_in_ticket_ocr ? "Incluido en OCR · no se vuelve a descontar" : "Pago de Caja separado del total OCR"}</small>{payment.notes && <small>{payment.notes}</small>}</span>
                <strong>{moneyLabel(payment.prize_amount, currencyCode)}</strong>
                {canRegisterPayments && <div className="prize-payment-row-actions">
                  <button type="button" className="button ghost small" aria-expanded={editingPaymentId === payment.id} onClick={() => setEditingPaymentId((current) => current === payment.id ? "" : payment.id)}>{editingPaymentId === payment.id ? "Cerrar edición" : "Editar"}</button>
                  <form action={deleteAgencyPrizePayment} onSubmit={(event) => { if (!window.confirm("¿Eliminar el pago de este premio y su movimiento asociado de Caja?")) event.preventDefault(); }}>
                    <input type="hidden" name="prize_payment_id" value={payment.id} />
                    <input type="hidden" name="return_agent_id" value={returnAgentId} />
                    <button type="submit" className="button ghost small danger-button">Eliminar</button>
                  </form>
                </div>}
                {editingPaymentId === payment.id && <form action={updateAgencyPrizePayment} className="prize-payment-edit-form">
                  <input type="hidden" name="prize_payment_id" value={payment.id} />
                  <input type="hidden" name="return_agent_id" value={returnAgentId} />
                  <label>Número de cupón<input name="coupon_number" defaultValue={payment.coupon_number} maxLength={128} required /></label>
                  <label>Juego<input name="game_name" defaultValue={payment.game_name ?? ""} maxLength={120} /></label>
                  <label>Importe del premio<input name="prize_amount" defaultValue={payment.prize_amount.toFixed(2)} inputMode="decimal" required /></label>
                  <label>Fecha de pago<input name="payment_date" type="date" defaultValue={payment.payment_date} required /></label>
                  <label>Observaciones<textarea name="notes" defaultValue={payment.notes ?? ""} maxLength={1000} rows={2} /></label>
                  <label className="prize-included-ocr"><input type="checkbox" name="included_in_ticket_ocr" defaultChecked={payment.included_in_ticket_ocr} /><span>Ya está incluido en un cierre OCR de hoy<small>Se mantiene como movimiento de Caja, pero no se vuelve a descontar del total OCR.</small></span></label>
                  <div className="prize-payment-row-actions">
                    <button type="submit" className="button primary">Guardar cambios en premio y Caja</button>
                    <button type="button" className="button ghost" onClick={() => setEditingPaymentId("")}>Cancelar</button>
                  </div>
                </form>}
              </article>
            ))}
          </div>
        ) : <p className="muted">Todavía no hay premios pagados registrados.</p>}
      </div>
    </section>
  );
}
