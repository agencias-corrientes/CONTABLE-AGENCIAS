import { TicketClosureReceipt } from "@/components/ticket-closure-receipt";
import type { TicketClosureData } from "@/lib/agency-ticket-closure";

type TicketOcrData = {
  type?: string;
  rawText?: string | null;
  ticketNumber?: string | null;
  recognizedAt?: string | null;
  tickets?: TicketOcrData[];
  [key: string]: unknown;
};

export function TicketOcrDetails({ data, compact = false }: { data: TicketOcrData | TicketClosureData | null | undefined; compact?: boolean }) {
  if (!data) return null;

  if (data.type === "loteria-corrientes-end-of-day-v1") {
    const receipt = data as TicketClosureData;
    if (compact) return <details className="ticket-ocr-compact"><summary>Ver comprobante OCR</summary><TicketOcrDetails data={receipt} /></details>;
    return (
      <div className="ticket-ocr-saved-details">
        <TicketClosureReceipt data={receipt} />
        {receipt.rawText?.trim() && (
          <details className="ticket-ocr-text" open>
            <summary>Texto OCR reconocido</summary>
            <pre>{receipt.rawText}</pre>
          </details>
        )}
      </div>
    );
  }

  if (data.type === "loteria-corrientes-end-of-day-batch-v1" && Array.isArray(data.tickets)) {
    if (compact) return <details className="ticket-ocr-compact"><summary>Ver comprobantes OCR ({data.tickets.length})</summary><TicketOcrDetails data={data} /></details>;
    return (
      <section className="weekly-ticket-receipt-history">
        <strong>Comprobantes oficiales leídos y guardados en esta rendición ({data.tickets.length})</strong>
        {data.tickets.map((ticket, index) => (
          <details open key={String(ticket.periodNumber ?? "sin-periodo") + "-" + index}>
            <summary>Cupón {index + 1} · Período {String(ticket.periodNumber ?? "no detectado")}</summary>
            <TicketOcrDetails data={ticket} />
          </details>
        ))}
      </section>
    );
  }

  if (data.type !== "loteria-corrientes-ticket-ocr-v1") return null;
  return (
    <section className="ticket-ocr-saved-details" aria-label="Comprobante y datos reconocidos del ticket">
      <header className="ticket-ocr-saved-heading">
        <span>COMPROBANTE · LECTURA OCR</span>
        <h3>{data.ticketNumber ? "Ticket " + data.ticketNumber : "Ticket leído"}</h3>
        {data.recognizedAt && <small>Lectura guardada</small>}
      </header>
      {data.rawText?.trim() ? (
        <details className="ticket-ocr-text" open={!compact}>
          <summary>Datos reconocidos del comprobante</summary>
          <pre>{data.rawText}</pre>
        </details>
      ) : <p className="muted">No se guardó texto OCR para este comprobante.</p>}
    </section>
  );
}
