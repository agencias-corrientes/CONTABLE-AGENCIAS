import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/accounting";

export default async function ConfigurationLayout({ children }: { children: React.ReactNode }) {
  const { member } = await getCurrentContext();
  if (!member || member.role !== "owner") redirect("/pagos?error=solo-titular-configuracion");
  return children;
}
