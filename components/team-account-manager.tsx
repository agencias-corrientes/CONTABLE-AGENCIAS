"use client";

import { useState } from "react";
import { ConfirmDeleteAccountButton } from "@/components/confirm-delete-account-button";

type FormAction = (formData: FormData) => Promise<void>;
type PermissionLabel = readonly [string, string];

export function TeamAccountManager({
  addAction,
  deleteAction,
  permissionLabels,
}: {
  addAction: FormAction;
  deleteAction: FormAction;
  permissionLabels: readonly PermissionLabel[];
}) {
  const [view, setView] = useState<"add" | "delete">("add");
  const [role, setRole] = useState<"owner" | "accountant">("accountant");

  return (
    <div className="team-account-manager">
      <div className="team-account-toggle" role="group" aria-label="Administrar cuentas">
        <button type="button" className={view === "add" ? "is-active" : ""} aria-pressed={view === "add"} onClick={() => setView("add")}>Agregar cuenta</button>
        <button type="button" className={view === "delete" ? "is-active" : ""} aria-pressed={view === "delete"} onClick={() => setView("delete")}>Eliminar cuenta</button>
      </div>

      {view === "add" ? (
        <section className="team-account-action-card">
          <h3>Agregar una cuenta</h3>
          <p className="muted">Si el correo ya existe, se vincula sin crear otro usuario. Para una cuenta nueva, ingresá una contraseña inicial de al menos 8 caracteres.</p>
          <form action={addAction} className="team-add-form">
            <label>Correo de acceso
              <input type="email" name="email" placeholder="correo@empleado.com" required autoComplete="off" />
            </label>
            <label>Contraseña inicial (solo cuenta nueva)
              <input type="password" name="password" placeholder="Solo para correo nuevo · 8 caracteres" minLength={8} autoComplete="new-password" />
            </label>
            <label>Rol inicial
              <select name="role" value={role} onChange={(event) => setRole(event.target.value === "owner" ? "owner" : "accountant")}>
                <option value="owner">Propietario</option>
                <option value="accountant">Empleado</option>
              </select>
            </label>
            {role === "accountant" && (
              <section className="team-new-permissions">
                <h4>Permisos del empleado</h4>
                <p className="muted small-text">Marcá únicamente las operaciones que esta cuenta necesita realizar. Todo lo que quede sin marcar estará deshabilitado.</p>
                <div className="team-permission-grid">
                  {permissionLabels.map(([name, label]) => (
                    <label key={name} className="team-permission-option">
                      <input type="checkbox" name={name} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </section>
            )}
            <button className="button primary" type="submit">Crear cuenta y asignar rol</button>
          </form>
        </section>
      ) : (
        <section className="team-account-action-card is-delete">
          <h3>Eliminar cuenta</h3>
          <p className="muted">Ingresá el correo y tu contraseña de titular. Al confirmar, se elimina la cuenta de acceso y automáticamente su vínculo como empleado, cuando no sea Propietario ni tenga acceso a otra agencia. Las rendiciones, cobros e historial se conservan.</p>
          <form action={deleteAction} className="team-auth-delete-form">
            <label>Correo de la cuenta a eliminar
              <input type="email" name="target_email" placeholder="correo@gmail.com" autoComplete="off" required />
            </label>
            <label>Tu contraseña
              <input type="password" name="owner_password" placeholder="Contraseña actual del titular" autoComplete="current-password" required />
            </label>
            <input type="hidden" name="delete_account_confirmed" value="" />
            <ConfirmDeleteAccountButton className="button danger">Eliminar cuenta y empleado</ConfirmDeleteAccountButton>
          </form>
        </section>
      )}
    </div>
  );
}
