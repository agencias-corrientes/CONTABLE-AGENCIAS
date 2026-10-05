import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (claims?.sub) redirect("/dashboard");

  return <main className="landing"><section className="landing-card">
    <div className="brand-mark">AC</div>
    <p className="eyebrow">AGENCIAS CORRIENTES</p>
    <h1>Control de agencia</h1>
    <p className="lead">Panel administrativo para que la agencia oficial controle a sus subagentes y ambulantes, sus rendiciones y el dinero recibido.</p>
    <div className="landing-actions"><Link className="button primary" href="/login">Ingresar al sistema</Link><Link className="button ghost" href="/login?mode=signup">Crear usuario</Link></div>
    <div className="feature-strip"><span>✓ Subagentes</span><span>✓ Ambulantes</span><span>✓ Rendiciones</span><span>✓ Caja de la agencia</span></div>
  </section></main>;
}
