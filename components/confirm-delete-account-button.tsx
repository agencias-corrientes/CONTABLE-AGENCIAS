"use client";

export function ConfirmDeleteAccountButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        const form = event.currentTarget.form;
        const email = form?.querySelector<HTMLInputElement>('input[name="target_email"]')?.value.trim();
        if (!email || !window.confirm('¿Confirmás eliminar definitivamente la cuenta "' + email + '"? Esta acción no se puede deshacer.')) {
          event.preventDefault();
          return;
        }
        const confirmationField = form?.querySelector<HTMLInputElement>('input[name="delete_account_confirmed"]');
        if (confirmationField) confirmationField.value = "yes";
      }}
    >
      {children}
    </button>
  );
}
