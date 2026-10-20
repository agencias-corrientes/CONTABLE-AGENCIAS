"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function EmailConfirmationAction({
  tokenHash,
  type,
}: {
  tokenHash: string;
  type: "signup" | "email";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function confirmEmail() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as EmailOtpType,
      });
      if (error) {
        setMessage("No pudimos confirmar este enlace. Puede haber vencido o haberse usado antes. Pedí un correo nuevo y abrílo en esta pantalla; no hace falta crear otra cuenta.");
        setBusy(false);
        return;
      }
      router.replace("/registro/confirmado");
      router.refresh();
    } catch {
      setMessage("No pudimos conectar con el servicio de confirmación. Volvé a intentarlo una vez desde el correo más reciente.");
      setBusy(false);
    }
  }

  return (
    <div className="form-stack">
      <p className="muted">Por seguridad, abrir el correo no confirma ni consume el enlace. Presioná el botón de abajo para completar la confirmación.</p>
      {message && <p className="message error-message" role="alert">{message}</p>}
      <button type="button" className="button primary full" onClick={() => void confirmEmail()} disabled={busy}>
        {busy ? "Confirmando correo…" : "Confirmar correo electrónico"}
      </button>
    </div>
  );
}
