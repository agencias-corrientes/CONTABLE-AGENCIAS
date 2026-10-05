import { getCurrentContext } from "@/lib/accounting";
import { createContact } from "./actions";

export default async function ContactosPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id,type,display_name,tax_id,email,phone,is_active")
    .eq("organization_id", organization.id)
    .order("display_name");

  return (
    <div className="page">
      <div className="topbar"><div><p className="eyebrow">MAESTROS</p><h1>Contactos</h1><p className="muted">Clientes, proveedores, empleados y otros contactos.</p></div></div>
      <section className="panel">
        <div className="panel-head"><h2>Nuevo contacto</h2></div>
        <form action={createContact} className="inline-form wrap">
          <select name="type" defaultValue="customer"><option value="customer">Cliente</option><option value="vendor">Proveedor</option><option value="employee">Empleado</option><option value="other">Otro</option></select>
          <input name="display_name" placeholder="Nombre o razón social" required />
          <input name="tax_id" placeholder="CUIT / identificación" />
          <input name="email" type="email" placeholder="Email" />
          <input name="phone" placeholder="Teléfono" />
          <button className="button primary">Agregar</button>
        </form>
      </section>
      <section className="panel table-panel">
        <div className="panel-head"><h2>Listado</h2><span className="muted">{contacts?.length ?? 0} registros</span></div>
        <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Tipo</th><th>CUIT</th><th>Contacto</th><th>Estado</th></tr></thead>
        <tbody>{(contacts ?? []).map((contact) => <tr key={contact.id}><td>{contact.display_name}</td><td>{contact.type}</td><td className="mono">{contact.tax_id || "—"}</td><td>{contact.email || contact.phone || "—"}</td><td>{contact.is_active ? "Activo" : "Inactivo"}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}
