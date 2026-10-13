import type { TicketClosureData, TicketReceiptMetric } from "@/lib/agency-ticket-closure";

function peso(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
}

function metricText(metric: TicketReceiptMetric) {
  return (metric.count === null ? "—" : String(metric.count)) + " · " + peso(metric.amount);
}

function ReceiptLine({ label, metric }: { label: string; metric: TicketReceiptMetric }) {
  return <div className="ticket-closure-line"><span>{label}</span><strong>{metricText(metric)}</strong></div>;
}

export function TicketClosureReceipt({ data, compact = false }: { data: TicketClosureData; compact?: boolean }) {
  return (
    <section className={"ticket-closure-receipt" + (compact ? " is-compact" : "")} aria-label="Detalle leído del ticket de fin de jornada">
      <header className="ticket-closure-title">
        <span>COMPROBANTE OFICIAL · LECTURA AUTOMÁTICA</span>
        <h3>{data.header}</h3>
      </header>
      <div className="ticket-closure-identifiers">
        <span>AG: <strong>{data.agencyCode ?? "—"}</strong></span>
        <span>SUBAG: <strong>{data.subagentCode ?? "—"}</strong></span>
        <span>MAQ: <strong>{data.machineCode ?? "—"}</strong></span>
        <span>Domicilio: <strong>{data.address ?? "—"}</strong></span>
        <span>Terminal: <strong>{data.terminalId ?? "—"}</strong></span>
      </div>
      {data.openDraws.length > 0 && (
        <div className="ticket-closure-section ticket-closure-draws">
          <h4>Sorteos abiertos</h4>
          {data.openDraws.map((draw, index) => <div className="ticket-closure-line" key={draw.name + index}><span>{draw.name}</span><strong>{draw.status}</strong></div>)}
        </div>
      )}
      <div className="ticket-closure-grid">
        <div className="ticket-closure-section">
          <h4>Quiniela</h4>
          <ReceiptLine label="Válidos" metric={data.quiniela.valids} />
          <ReceiptLine label="Anulados Esp." metric={data.quiniela.cancelledSpecial} />
          <ReceiptLine label="Premios pagados" metric={data.quiniela.prizesPaid} />
        </div>
        <div className="ticket-closure-section">
          <h4>Quiniela al Toque</h4>
          <ReceiptLine label="Válidos" metric={data.quinielaAlToque.valids} />
          <ReceiptLine label="Premios pagados" metric={data.quinielaAlToque.prizesPaid} />
        </div>
        <div className="ticket-closure-section">
          <h4>Otros juegos</h4>
          {data.otherGames.map((game) => <ReceiptLine key={game.name} label={game.name} metric={{ count: game.count, amount: game.amount }} />)}
          <ReceiptLine label="Total otros juegos" metric={data.totalOtherGames} />
          <ReceiptLine label="Premios pagados (otros)" metric={data.otherGamesPrizes} />
        </div>
        <div className="ticket-closure-section">
          <h4>Totales del ticket</h4>
          <ReceiptLine label="Premios pagados total" metric={data.totalPrizes} />
          <ReceiptLine label="Total general" metric={data.generalTotal} />
        </div>
        <div className="ticket-closure-section">
          <h4>Medios digitales</h4>
          <ReceiptLine label="Cobros" metric={data.digital.cobros} />
          <ReceiptLine label="Devoluciones" metric={data.digital.devoluciones} />
        </div>
      </div>
      <div className="ticket-closure-footer">
        <span>Período N.º <strong>{data.periodNumber ?? "—"}</strong></span>
        <span>Impreso: <strong>{data.printedAt.raw ?? "—"}</strong></span>
        <span>Abierto: <strong>{data.openedAt.raw ?? "—"}</strong></span>
        <span>Cerrado: <strong>{data.closedAt.raw ?? "—"}</strong></span>
        <span>Descarga: <strong>{data.downloadStatus ?? "—"}</strong></span>
      </div>
      <p className={"ticket-closure-validation" + (data.consistency.salesTotalsMatch === true && data.consistency.prizeTotalsMatch === true ? " is-valid" : " is-review")}>
        {data.consistency.salesTotalsMatch === true && data.consistency.prizeTotalsMatch === true
          ? "Control automático: total de ventas y total de premios coinciden con sus renglones."
          : "Revisión necesaria: no se pudieron comprobar todos los subtotales. Compará la lectura con la foto antes de confirmar."}
      </p>
    </section>
  );
}
