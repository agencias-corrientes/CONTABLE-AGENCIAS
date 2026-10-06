import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentContext, money } from "@/lib/accounting";
import { createAgencyRendition, receiveAgencyRendition } from "../actions";

export default async function AgencyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const [{ data: agent }, { data: renditions }, { data: cash }] = await Promise.all([
    supabase.from("agency_agents").select("id,kind,code,full_name,dni,email,phone,whatsapp,address,notes,is_active,created_at").eq("id", id).eq("organization_id", organization.id).maybeSingle(),
    supabase.from("agency_renditions").select("id,rendition_date,period_start,period_end,amount_due,status,reference,notes,agency_rendition_payments!agency_rendition_payments_rendition_id_fkey(id,payment_date,amount,reference,cash_account_id,cash_accounts(name))").eq("agent_id", id).eq("organization_id", organization.id).neq("status", "void").order("rendition_date", { ascending: false }),
    supabase.from("cash_accounts").select("id,name,currency_code,is_active").eq("organization_id", organization.id).eq("is_active", true).order("name"),
  ]);
  if (!agent) notFound();

  const rows = (renditions ?? []).map(row => {
    const payments = Array.isArray(row.agency_rendition_payments) ? row.agency_rendition_payments : [];
    const received = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    return { ...row, received, pending: Math.max(0, Number(row.amount_due ?? 0) - received), payments };
  });
  const totalDue = rows.reduce((s, r) => s + Number(r.amount_due ?? 0), 0);
  const totalReceived = rows.reduce((s, r) => s + r.received, 0);
  const totalPending = Math.max(0, totalDue - totalReceived);
  const typeLabel = agent.kind === "subagent" ? "Subagente" : "Ambulante";

  return (
    <div className={`page agency-detail-page ${agent.kind === "subagent" ? "detail-subagent" : "detail-ambulant"}`}>
      <div className="topbar">
        <div><Link href="/agencias" className="back-link">← Volver a Subagentes y ambulantes</Link><p className="eyebrow">{typeLabel.toUpperCase()}</p><h1>{agent.code}</h1><p className="muted">{typeLabel} · {agent.full_name} · {agent.is_active ? "Activo" : "Inactivo"}</p></div>
      </div>

      <section className="agency-profile">
        <div className="agency-profile-main"><div className="agency-avatar large">{agent.code.slice(-2)}</div><div><span className="agency-kind">{typeLabel.toUpperCase()}</span><h2>{agent.code}</h2><p>{agent.full_name} · administración, datos y rendiciones.</p></div></div>
        <div className="agency-profile-data"><div><span>Nombre</span><strong>{agent.full_name}</strong></div><div><span>Código</span><strong>{agent.code}</strong></div><div><span>DNI</span><strong>{agent.dni || "—"}</strong></div><div><span>Teléfono</span><strong>{agent.phone || "—"}</strong></div><div><span>WhatsApp</span><strong>{agent.whatsapp || "—"}</strong></div><div><span>Alta</span><strong>{agent.created_at.slice(0,10)}</strong></div></div>
      </section>

      <div className="stats-grid compact">
        <div className="stat-card"><span>Total rendido</span><strong>{money(totalDue, organization.currency_code)}</strong><small>importe generado</small></div>
        <div className="stat-card"><span>Total cobrado</span><strong>{money(totalReceived, organization.currency_code)}</strong><small>cobros registrados</small></div>
        <div className="stat-card"><span>Saldo pendiente</span><strong>{money(totalPending, organization.currency_code)}</strong><small>de {typeLabel.toLowerCase()} {agent.code}</small></div>
      </div>

      <section className="agency-admin-grid">
        <div className="panel">
          <div className="panel-head"><div><h2>Nueva rendición</h2><p className="muted">Generá la rendición del {typeLabel.toLowerCase()} {agent.code}.</p></div></div>
          <form action={createAgencyRendition} className="form-stack">
            <input type="hidden" name="agent_id" value={agent.id} />
            <div className="detail-grid"><label>Fecha<input type="date" name="rendition_date" required /></label><label>Desde<input type="date" name="period_start" required /></label><label>Hasta<input type="date" name="period_end" required /></label></div>
            <div className="detail-grid"><label>Importe a rendir<input type="number" name="amount_due" min="0.01" step="0.01" required /></label><label>Referencia<input name="reference" placeholder="Ej. turno / período" /></label><label>Observaciones<input name="notes" /></label></div>
            <button className="button primary">Registrar rendición</button>
          </form>
        </div>
        <div className="panel"><div className="panel-head"><div><h2>Datos del {typeLabel.toLowerCase()}</h2><p className="muted">Información administrativa.</p></div></div><div className="detail-grid agency-notes-grid"><div><span>Dirección</span><strong>{agent.address || "—"}</strong></div><div><span>Notas</span><strong>{agent.notes || "—"}</strong></div></div></div>
      </section>

      <section className="panel table-panel"><div className="panel-head"><div><h2>Rendiciones de {typeLabel.toLowerCase()} {agent.code}</h2><p className="muted">Historial de importes generados y cobrados.</p></div><span className="muted">{rows.length} registros</span></div>
        <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Período</th><th>Importe</th><th>Cobrado</th><th>Pendiente</th><th>Estado</th><th>Administrar</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}><td>{row.rendition_date}</td><td>{row.period_start || "—"} → {row.period_end || "—"}</td><td className="mono">{money(row.amount_due, organization.currency_code)}</td><td className="mono">{money(row.received, organization.currency_code)}</td><td className="mono">{money(row.pending, organization.currency_code)}</td><td><span className={row.pending <= 0 ? "badge success" : "badge"}>{row.pending <= 0 ? "Cobrada" : row.status === "closed" ? "Cerrada" : "Pendiente"}</span></td><td>{row.pending > 0 ? <details className="agency-pay-details"><summary>Registrar cobro</summary><form action={receiveAgencyRendition} className="agency-pay-form"><input type="hidden" name="rendition_id" value={row.id}/><input type="hidden" name="agent_id" value={agent.id}/><input type="date" name="payment_date" required/><input type="number" name="amount" min="0.01" max={row.pending} step="0.01" placeholder="Importe" required/><select name="cash_account_id" required><option value="">Caja / banco</option>{(cash ?? []).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><input name="reference" placeholder="Referencia"/><button className="button primary">Cobrar</button></form></details> : "—"}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}