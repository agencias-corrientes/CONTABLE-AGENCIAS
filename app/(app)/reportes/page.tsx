import Link from "next/link";
const reports = [
  ["Libro diario", "Asientos contables por período.", "/reportes/diario"],
  ["Balance de sumas y saldos", "Débitos, créditos y saldos por cuenta.", "/reportes/balance"],
  ["Libro mayor", "Movimientos detallados por cuenta.", "/reportes/mayor"],
  ["Estado de resultados", "Ingresos, egresos y resultado del período.", "/reportes/resultados"],
  ["Situación patrimonial", "Activo, pasivo y patrimonio neto.", "/reportes/patrimonial"],
];
export default function ReportesPage() {
  return <div className="page"><div className="topbar"><div><p className="eyebrow">INFORMACIÓN</p><h1>Reportes</h1><p className="muted">Información financiera y contable.</p></div></div><div className="report-grid">{reports.map(([title, desc, href]) => <Link className="report-card" href={href} key={href}><strong>{title}</strong><span>{desc}</span><em>→</em></Link>)}</div></div>;
}
