import { getCurrentContext } from "@/lib/accounting";
import { createDraftJournal, postJournal } from "./actions";

export default async function AsientosPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const [{ data: entries }, { data: accounts }] = await Promise.all([
    supabase.from("journal_entries")
      .select("id,entry_number,entry_date,description,reference,status,posted_at")
      .eq("organization_id", organization.id)
      .order("entry_date", { ascending: false })
      .order("entry_number", { ascending: false })
      .limit(100),
    supabase.from("accounts")
      .select("id,code,name,type,allow_posting")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .eq("allow_posting", true)
      .order("code"),
  ]);

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <p className="eyebrow">CONTABILIDAD</p>
          <h1>Asientos contables</h1>
          <p className="muted">Registrá operaciones de partida doble y publicalas cuando estén balanceadas.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Nuevo asiento</h2>
            <p className="muted">La primera versión trabaja con dos partidas; el total del Debe y Haber debe coincidir.</p>
          </div>
        </div>

        <form action={createDraftJournal} className="form-stack">
          <div className="detail-grid">
            <label>Fecha<input type="date" name="entry_date" required /></label>
            <label>Descripción<input name="description" required placeholder="Ej.: Pago de servicio" /></label>
            <label>Referencia<input name="reference" placeholder="Número, comprobante o nota" /></label>
          </div>

          <div className="journal-grid">
            <div className="journal-line">
              <h3>Partida 1</h3>
              <select name="account_1" required>
                <option value="">Cuenta</option>
                {(accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
              </select>
              <input name="debit_1" type="number" min="0" step="0.01" placeholder="Debe" required />
              <input name="credit_1" type="number" min="0" step="0.01" placeholder="Haber" required />
            </div>
            <div className="journal-line">
              <h3>Partida 2</h3>
              <select name="account_2" required>
                <option value="">Cuenta</option>
                {(accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
              </select>
              <input name="debit_2" type="number" min="0" step="0.01" placeholder="Debe" required />
              <input name="credit_2" type="number" min="0" step="0.01" placeholder="Haber" required />
            </div>
          </div>

          <button className="button primary">Guardar asiento en borrador</button>
        </form>
      </section>

      <section className="panel table-panel">
        <div className="panel-head"><h2>Libro de asientos</h2><span className="muted">{entries?.length ?? 0} registros</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>N°</th><th>Fecha</th><th>Descripción</th><th>Referencia</th><th>Estado</th><th>Acción</th></tr></thead>
            <tbody>
              {(entries ?? []).map((entry) => (
                <tr key={entry.id}>
                  <td className="mono">{entry.entry_number}</td>
                  <td>{entry.entry_date}</td>
                  <td>{entry.description}</td>
                  <td>{entry.reference || "—"}</td>
                  <td><span className={entry.status === "posted" ? "badge success" : entry.status === "void" ? "badge danger" : "badge"}>{entry.status}</span></td>
                  <td>
                    {entry.status === "draft" ? (
                      <form action={postJournal} className="inline-action">
                        <input type="hidden" name="entry_id" value={entry.id} />
                        <button className="button ghost">Contabilizar</button>
                      </form>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
