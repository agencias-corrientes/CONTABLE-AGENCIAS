import { getCurrentContext } from "@/lib/accounting";
import { createAccount } from "./actions";

export default async function CuentasPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id,code,name,type,is_active,allow_posting")
    .eq("organization_id", organization.id)
    .order("code");

  return (
    <div className="page">
      <div className="topbar">
        <div><p className="eyebrow">CONTABILIDAD</p><h1>Plan de cuentas</h1><p className="muted">Estructura contable de {organization.name}.</p></div>
      </div>
      <section className="panel">
        <div className="panel-head"><h2>Nueva cuenta</h2></div>
        <form action={createAccount} className="inline-form">
          <input name="code" placeholder="Código" required />
          <input name="name" placeholder="Nombre de la cuenta" required />
          <select name="type" defaultValue="expense">
            <option value="asset">Activo</option>
            <option value="liability">Pasivo</option>
            <option value="equity">Patrimonio</option>
            <option value="income">Ingreso</option>
            <option value="expense">Egreso</option>
          </select>
          <button className="button primary">Agregar</button>
        </form>
      </section>
      <section className="panel table-panel">
        <div className="panel-head"><h2>Cuentas registradas</h2><span className="muted">{accounts?.length ?? 0} cuentas</span></div>
        {error ? <div className="message">{error.message}</div> : (
          <div className="table-wrap"><table><thead><tr><th>Código</th><th>Cuenta</th><th>Tipo</th><th>Estado</th></tr></thead>
          <tbody>{(accounts ?? []).map((account) => <tr key={account.id}><td className="mono">{account.code}</td><td>{account.name}</td><td>{account.type}</td><td>{account.is_active ? "Activa" : "Inactiva"}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
