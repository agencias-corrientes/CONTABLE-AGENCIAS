"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ className = "button ghost full" }: { className?: string }) {
  const router = useRouter();

  async function signOut() {
    const confirmed = window.confirm("¿Querés cerrar sesión? Elegí Cancelar para seguir dentro de la agencia.");
    if (!confirmed) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return <button type="button" className={className} onClick={signOut}>Cerrar sesión</button>;
}
