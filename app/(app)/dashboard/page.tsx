import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";

export default async function DashboardPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const orgId = organization.id;
  const [accounts, contacts, sales, purchases, cashMovements, agencyAgents] = await Promise.all([
    supabase.from("accounts").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("sales_invoices").select("total_amount").eq("organization_id", orgId),
    supabase.from("purchase_bills").select("total_amount").eq("organization_id", orgId),
    supabase.from("cash_movements").select("direction,amount").eq("organization_id", orgId),
    supabase.from("agency_agents").select("id,kind", { count: "exact", head: false }).eq("organization_id", orgId),
  ]);

  const salesTotal = (sales.data ?? []).reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
  const purchasesTotal = (purchases.data ?? []).reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
  const cashBalance = (cashMovements.data ?? []).reduce(
    (sum, row) => sum + (row.direction === "incoming" ? 1 : -1) * Number(row.amount ?? 0),
    0,
  );

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <p className="eyebrow">RESUMEN GENERAL</p>
          <h1>Panel principal</h1>
          <p className="muted">Operación contable de {organization.name}.</p>
        </div>
        <Link href="/cuentas" className="button primary">Plan de cuentas</Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>Cuentas</span><strong>{accounts.count ?? 0}</strong><small>plan contable</small></div>
        <div className="stat-card"><span>Contactos</span><strong>{contacts.count ?? 0}</strong><small>clientes y proveedores</small></div>
        <div className="stat-card"><span>Ventas</span><strong>{money(salesTotal, organization.currency_code)}</strong><small>registradas</small></div>
        <div className="stat-card"><span>Saldo de fondos</span><strong>{money(cashBalance, organization.currency_code)}</strong><small>movimientos registrados</small></div>
      </div>

      <section className="dashboard-grid">
        <div className="panel large">
          <div className="panel-head"><div><h2>Centro de operaciones</h2><p className="muted">Accesos directos para el trabajo diario.</p></div></div>
          <div className="quick-grid">
            <Link href="/ventas" className="quick-card"><strong>Registrar venta</strong><span>Factura y cuenta por cobrar</span></Link>
            <Link href="/compras" className="quick-card"><strong>Registrar compra</strong><span>Comprobante y cuenta por pagar</span></Link>
            <Link href="/movimientos" className="quick-card"><strong>Movimiento de caja</strong><span>Ingresos y egresos</span></Link>
            <Link href="/agencias" className="quick-card quick-card-agencies"><strong>Subagentes y ambulantes</strong><span>{agencyAgents.data?.filter(a => a.kind === "subagent").length ?? 0} subagentes · {agencyAgents.data?.filter(a => a.kind === "ambulant").length ?? 0} ambulantes</span></Link>
            <Link href="/pagos" className="quick-card"><strong>Registrar pago</strong><span>Cobros y pagos</span></Link>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Estado del sistema</h2></div>
          <div className="check-list">
            <div><span>✓</span> Base de datos conectada</div>
            <div><span>✓</span> Seguridad RLS activa</div>
            <div><span>✓</span> Período fiscal inicial</div>
            <div><span>✓</span> Plan de cuentas base</div>
          </div>
        </div>
      </section>
    </div>
  );
}
