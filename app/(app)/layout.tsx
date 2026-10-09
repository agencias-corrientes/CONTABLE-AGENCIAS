import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentContext } from "@/lib/accounting";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { organization, member, userEmail } = await getCurrentContext();

  if (!organization || !member) redirect("/setup");

  return (
    <AppShell organizationName={organization.name} userEmail={userEmail} userRole={member.role}>
      {children}
    </AppShell>
  );
}
