import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";
import { agencyBusinessDateForCutoff, formatAgencyDate } from "@/lib/agency-datetime";
import { receiveAgencyRendition } from "../agencias/actions";

type PendingDebt = {
  id: string;
  agent_id: string;
  rendition_date: string;
  operational_date: string;
  created_at: string;
  game_period: string | null;
  amount_due: number;
  net_due: number | null;
  received: number;
  pending: number;
  payments: any[];
};

export default async function PreviousDebtsPage({
  searchParams,
}: {
  searchParams?: Promise<{ resultado?: string; error?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const { supabase, organization, member, userId } = await getCurrentContext();
  if (!organization || !member) return null;

  const [{ data: operationalSettings }, { data: agents }, { data: permissions }] = await Promise.all([
    supabase.from("agency_operational_settings").select("rendition_cutoff_time").eq("organization_id", organization.id).maybeSingle(),
    supabase.from("agency_agents").select("id,kind,code,full_name,is_active").eq("organization_id", organization.id),
    member.role === "owner"
      ? Promise.resolve({ data: { can_register_payments: true } })
      : supabase.from("organization_member_permissions").select("can_register_payments").eq("organization_id", organization.id).eq("user_id", userId).maybeSingle(),
  ]);

  const canRegisterPayments = member.role === "owner" || Boolean(permissions?.can_register_payments);
  const cutoffTime = String(operationalSettings?.rendition_cutoff_time ?? "00:00").slice(0, 5);
  const today = agencyBusinessDateForCutoff(cutoffTime);

  const allRows: any[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("agency_renditions")
      .select("id,agent_id,rendition_date,created_at,game_period,amount_due,net_due,status,agency_rendition_payments!agency_rendition_payments_rendition_id_fkey(id,payment_date,amount,reference)")
      .eq("organization_id", organization.id)
      .neq("status", "void")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("No se pudieron cargar las deudas anteriores: " + error.message);
    const batch = data ?? [];
    allRows.push(...batch);
    if (batch.length < pageSize) break;
  }

  const agentsById = new Map((agents ?? []).map((agent: any) => [String(agent.id), agent]));
  const debts: PendingDebt[] = allRows.flatMap((row: any) => {
    const operationalDate = agencyBusinessDateForCutoff(cutoffTime, String(row.created_at ?? ""));
    if (operationalDate >= today) return [];
    const payments = Array.isArray(row.agency_rendition_payments) ? row.agency_rendition_payments : [];
    const received = payments.reduce((sum: number, payment: any) => sum + Number(payment.amount ?? 0), 0);
    const due = Number(row.net_due ?? row.amount_due ?? 0);
    const pending = Math.max(0, due - received);
    if (pending <= 0.005) return [];
    return [{
      id: String(row.id),
      agent_id: String(row.agent_id),
      rendition_date: String(row.rendition_date),
      operational_date: operationalDate,
      created_at: String(row.created_at),
      game_period: row.game_period ? String(row.game_period) : null,
      amount_due: Number(row.amount_due ?? 0),
      net_due: row.net_due === null || row.net_due === undefined ? null : Number(row.net_due),
      received,
      pending,
      payments,
    }];
  }).sort((a, b) => b.operational_date.localeCompare(a.operational_date) || b.created_at.localeCompare(a.created_at));

  const totalPending = debts.reduce((sum, row) => sum + row.pending, 0);
  const totalPaid = debts.reduce((sum, row) => sum + row.received, 0);
  const resultMessage = params.resultado === "cobro-registrado" ? "El pago quedó registrado en Caja y se descontó de la deuda original." : "";
  const errorMessage = params.error === "sin-permiso-cobro" ? "No tenés permiso para registrar pagos de deudas."
    : params.error === "cobro-caja-no-disponible" ? "No se encontró una cuenta Caja activa para registrar el pago."
    : params.error === "cobro-supera-saldo" ? "El importe ingresado supera el saldo pendiente."
    : params.error ? "No se pudo registrar el pago. Revisá el saldo y volvé a intentarlo." : "";

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <p className="eyebrow">CONTROL DE SALDOS</p>
          <h1>Deudas de jornadas anteriores</h1>
          <p className="muted">Importes que quedaron pendientes en rendiciones anteriores. Los pagos se aplican a la deuda original y no se suman a la rendición de hoy.</p>
        </div>
        <Link href="/inicio" className="button ghost">Volver al panel general</Link>
      </div>

      {resultMessage && <p className="previous-debts-feedback" role="status">{resultMessage}</p>}
      {errorMessage && <p className="error-message" role="alert">{errorMessage}</p>}

      <div className="previous-debts-summary">
        <div className="previous-debts-stat"><span>Saldo pendiente anterior</span><strong>{money(totalPending, organization.currency_code)}</strong></div>
        <div className="previous-debts-stat"><span>Rendiciones con deuda</span><strong>{debts.length}</strong></div>
        <div className="previous-debts-stat"><span>Pagos aplicados a saldos activos</span><strong>{money(totalPaid, organization.currency_code)}</strong></div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Detalle de deudas</h2>
            <p className="muted">Cada saldo conserva su fecha y rendición de origen.</p>
          </div>
        </div>
        {debts.length ? (
          <div className="previous-debts-list">
            {debts.map((debt) => {
              const agent = agentsById.get(debt.agent_id) as any;
              const agentKind = agent?.kind === "ambulant" ? "Ambulante" : "Subagente";
              const agentCode = String(agent?.code ?? "—");
              const agentName = String(agent?.full_name ?? agentKind);
              const reference = "Cancelación de deuda anterior · " + agentKind + " " + agentCode + " · " + formatAgencyDate(debt.operational_date);
              const note = "Pago aplicado a la rendición del " + formatAgencyDate(debt.operational_date) + "; no corresponde a la rendición del día actual.";
              return (
                <article className="previous-debt-card" key={debt.id}>
                  <div className="previous-debt-card-head">
                    <div className="previous-debt-agent">
                      <strong>{agentKind} {agentCode} · {agentName}</strong>
                      <small>Jornada pendiente: {formatAgencyDate(debt.operational_date)}{debt.game_period ? " · " + debt.game_period : ""}</small>
                    </div>
                    <strong className="previous-debt-amount">{money(debt.pending, organization.currency_code)}</strong>
                  </div>
                  <div className="previous-debt-details">
                    <span>Importe neto original: <strong>{money(debt.net_due ?? debt.amount_due, organization.currency_code)}</strong></span>
                    <span>Ya recibido: <strong>{money(debt.received, organization.currency_code)}</strong></span>
                    <span>Fecha de rendición: <strong>{formatAgencyDate(debt.rendition_date)}</strong></span>
                  </div>
                  {debt.payments.length > 0 && (
                    <p className="previous-debt-notice">
                      {debt.payments.length} pago(s) registrado(s). El saldo visible ya descuenta esos importes.
                    </p>
                  )}
                  {canRegisterPayments ? (
                    <form action={receiveAgencyRendition} className="previous-debt-pay">
                      <input type="hidden" name="rendition_id" value={debt.id} />
                      <input type="hidden" name="agent_id" value={debt.agent_id} />
                      <input type="hidden" name="return_to" value="deudas-anteriores" />
                      <input type="hidden" name="reference" value={reference} />
                      <input type="hidden" name="notes" value={note} />
                      <label>Fecha de pago
                        <input type="date" name="payment_date" defaultValue={today} required />
                      </label>
                      <label>Importe a cancelar (podés hacer un pago parcial)
                        <input type="number" name="amount" min="0.01" max={debt.pending} step="0.01" defaultValue={debt.pending.toFixed(2)} required />
                      </label>
                      <button className="button primary" type="submit">Registrar pago de deuda</button>
                    </form>
                  ) : (
                    <p className="previous-debt-notice">No tenés permiso para registrar pagos. El titular de la agencia debe habilitar esa operación.</p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="previous-debts-empty">No hay deudas pendientes de jornadas anteriores. Las rendiciones ya canceladas se conservan en el historial.</div>
        )}
      </section>
    </div>
  );
}
