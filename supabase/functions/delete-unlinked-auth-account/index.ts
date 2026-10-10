import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response(405, { code: "method_not_allowed" });

  const authorization = req.headers.get("Authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return response(401, { code: "authentication_required" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(500, { code: "server_configuration_error" });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  const caller = callerData.user;
  if (callerError || !caller) return response(401, { code: "invalid_session" });

  let body: { organization_id?: string; email?: string; confirmation?: string };
  try {
    body = await req.json();
  } catch {
    return response(400, { code: "invalid_request" });
  }

  const organizationId = String(body.organization_id ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const confirmation = String(body.confirmation ?? "");
  if (!organizationId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response(400, { code: "invalid_request" });
  }
  if (confirmation !== "ELIMINAR CUENTA: " + email) {
    return response(400, { code: "confirmation_mismatch" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: owner, error: ownerError } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .eq("user_id", caller.id)
    .eq("role", "owner")
    .maybeSingle();
  if (ownerError || !owner) return response(403, { code: "owner_required" });

  let target: { id: string; email?: string | null } | null = null;
  for (let page = 1; page <= 1000; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return response(500, { code: "account_lookup_failed" });
    const found = data.users.find((user) => (user.email ?? "").toLowerCase() === email);
    if (found) {
      target = { id: found.id, email: found.email };
      break;
    }
    if (data.users.length < 1000) break;
  }

  if (!target) return response(404, { code: "account_not_found" });
  if (target.id === caller.id) return response(400, { code: "cannot_delete_current_owner" });

  const { data: memberships, error: membershipsError } = await admin
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", target.id);
  if (membershipsError) return response(500, { code: "membership_check_failed" });

  // Distinguish a staff account attached to this agency from an owner of a
  // different agency. A different owner will not appear in this agency's team
  // list and must remove their own agency before their Auth account can be deleted.
  const targetMemberships = memberships ?? [];
  const ownsAnotherAgency = targetMemberships.some(
    (membership) => membership.role === "owner" && membership.organization_id !== organizationId,
  );
  if (ownsAnotherAgency) {
    return response(409, { code: "account_owner_of_other_agency" });
  }
  if (targetMemberships.some((membership) => membership.organization_id === organizationId)) {
    return response(409, { code: "account_still_linked" });
  }
  if (targetMemberships.length) {
    return response(409, { code: "account_linked_to_other_agency" });
  }

  const { error: permissionCleanupError } = await admin
    .from("organization_member_permissions")
    .delete()
    .eq("user_id", target.id);
  if (permissionCleanupError) return response(500, { code: "account_cleanup_failed" });

  const { error: deleteError } = await admin.auth.admin.deleteUser(target.id);
  if (deleteError) return response(500, { code: "account_delete_failed" });

  await admin.from("audit_log").insert({
    organization_id: organizationId,
    user_id: caller.id,
    action: "delete_unlinked_auth_account",
    entity: "auth_user",
    entity_id: target.id,
    payload: { email, reason: "owner_deleted_unlinked_test_account" },
  });

  return response(200, { ok: true });
});
