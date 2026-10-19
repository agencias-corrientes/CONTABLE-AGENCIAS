import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentContext } from "@/lib/accounting";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, organization, member, userEmail } = await getCurrentContext();

  if (!organization || !member) redirect("/setup");

  const { data: isPlatformAdmin } = await (supabase as any).rpc("is_platform_admin");

  return (
    <AppShell organizationName={organization.name} userEmail={userEmail} userRole={member.role} isPlatformAdmin={isPlatformAdmin === true}>
      {children}
    </AppShell>
  );
}
