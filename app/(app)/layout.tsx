import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentContext } from "@/lib/accounting";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, organization, member, userEmail } = await getCurrentContext();

  if (!organization || !member) redirect("/setup");

  const { data: isPlatformAdmin } = await (supabase as any).rpc("is_platform_admin");
  let registeredAgencyCount: number | null = null;
  if (isPlatformAdmin === true) {
    const { data: platformAgencyRows, error: platformAgencyError } = await (supabase as any).rpc("list_platform_agencies_and_users_v2");
    if (platformAgencyError) throw new Error("No se pudo obtener el total de agencias registradas.");
    registeredAgencyCount = new Set(
      (Array.isArray(platformAgencyRows) ? platformAgencyRows : [])
        .map((row: { organization_id?: string | null }) => row.organization_id)
        .filter((id: string | null | undefined): id is string => Boolean(id))
    ).size;
  }

  return (
    <AppShell organizationName={organization.name} agencyCode={organization.agency_code ?? null} registeredAgencyCount={registeredAgencyCount} userEmail={userEmail} userRole={member.role} isPlatformAdmin={isPlatformAdmin === true}>
      {children}
    </AppShell>
  );
}
