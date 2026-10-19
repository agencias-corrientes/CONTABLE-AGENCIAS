"use client";

import { useState, type ChangeEvent } from "react";
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
  const [couponNumber, setCouponNumber] = useState("");
  const [prizeAmount, setPrizeAmount] = useState("");
  const [gameName, setGameName] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState("");

  function handleQrPayload(value: string) {
    setQrPayload(value);
    const detected = couponFromQrPayload(value);
    if (detected) {
      setCouponNumber(detected);
      setScanMessage("Número de cupón detectado desde el contenido QR. Verificalo con el comprobante antes de pagar.");
    }
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    // Keep QR mode mounted when a QR image is scanned so the decoded payload
    // remains part of the form submission; photo mode remains selected otherwise.
    if (captureMode !== "qr") setCaptureMode("photo");
    setScanMessage("");
    if (!file.type.startsWith("image/")) {
      setScanMessage("Elegí una imagen del cupón.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setScanMessage("La imagen supera 5 MB. Sacá otra foto más liviana.");
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

      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("spa+eng", 1);
      try {
        const result = await worker.recognize(file);
        const text = String(result.data.text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
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
          <div className="prize-capture-options" role="group" aria-label="Método para identificar el cupón">
            <button type="button" className={captureMode === "manual" ? "button primary" : "button ghost"} aria-pressed={captureMode === "manual"} onClick={() => { setCaptureMode("manual"); setScanMessage(""); }}>Número de cupón</button>
            <button type="button" className={captureMode === "photo" ? "button primary" : "button ghost"} aria-pressed={captureMode === "photo"} onClick={() => { setCaptureMode("photo"); setScanMessage(""); }}>Foto del cupón</button>
            <button type="button" className={captureMode === "qr" ? "button primary" : "button ghost"} aria-pressed={captureMode === "qr"} onClick={() => { setCaptureMode("qr"); setScanMessage(""); }}>QR</button>
          </div>

          {captureMode === "photo" && (
            <label className="ticket-photo-picker prize-photo-picker">
              <strong>Fotografiar o adjuntar cupón</strong>
              <span>Elegí la imagen del cupón directamente desde el selector del dispositivo.</span>
              <input className="prize-photo-file-input" type="file" name="prize_photo" accept="image/*,.heic,.heif,.avif,.bmp,.gif,.tif,.tiff" capture="environment" onChange={handlePhoto} disabled={readingPhoto} />
              <small className="muted">Revisá el número detectado y el importe antes de registrar el premio.</small>
            </label>
          )}

          {captureMode === "qr" && (
            <>
              <label className="ticket-photo-picker prize-photo-picker">
                <strong>Adjuntar imagen del QR (opcional)</strong>
                <input className="prize-photo-file-input" type="file" name="prize_photo" accept="image/*,.heic,.heif,.avif,.bmp,.gif,.tif,.tiff" onChange={handlePhoto} disabled={readingPhoto} />
              </label>
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
