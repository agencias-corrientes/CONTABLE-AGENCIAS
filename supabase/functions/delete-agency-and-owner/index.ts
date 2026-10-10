import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const JSON_HEADERS = { "Content-Type": "application/json" };

function respond(status: number, code: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ code, ...extra }), { status, headers: JSON_HEADERS });
}

async function removeAgencyFiles(admin: ReturnType<typeof createClient>, organizationId: string) {
  const bucket = admin.storage.from("agency-rendition-tickets");
  const paths: string[] = [];

  async function walk(prefix: string, depth = 0): Promise<boolean> {
    if (depth > 10) return false;
    const { data, error } = await bucket.list(prefix, { limit: 1000 });
    if (error) return false;
    for (const item of data ?? []) {
      const path = prefix ? prefix + "/" + item.name : item.name;
      if (item.id) paths.push(path);
      else if (!(await walk(path, depth + 1))) return false;
    }
    return true;
  }

  if (!(await walk(organizationId))) return false;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await bucket.remove(paths.slice(i, i + 100));
    if (error) return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respond(405, "method_not_allowed");
  const authorization = req.headers.get("Authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return respond(401, "authentication_required");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return respond(500, "server_configuration_error");

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  const caller = callerData.user;
  if (callerError || !caller?.email) return respond(401, "invalid_session");

  let body: { organization_id?: string; confirmation?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return respond(400, "invalid_request");
  }
  const organizationId = String(body.organization_id ?? "").trim();
  const confirmation = String(body.confirmation ?? "");
  const password = String(body.password ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId) ||
      !password || password.length > 1024) return respond(400, "invalid_request");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verifier = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: passwordError } = await verifier.auth.signInWithPassword({ email: caller.email, password });
  if (passwordError) return respond(401, "password_verification_failed");

  const { data: memberships, error: membershipsError } = await admin
    .from("organization_members").select("organization_id,role").eq("user_id", caller.id);
  if (membershipsError) return respond(500, "membership_check_failed");

  const member = (memberships ?? []).find((m) => m.organization_id === organizationId && m.role === "owner");
  if (!member) return respond(403, "owner_required");
  if ((memberships ?? []).length !== 1) return respond(409, "account_linked_to_other_agencies");

  const { data: org, error: orgError } = await admin
    .from("organizations").select("id,name").eq("id", organizationId).maybeSingle();
  if (orgError || !org) return respond(404, "agency_not_found");
  if (confirmation !== "ELIMINAR: " + org.name) return respond(400, "confirmation_mismatch");

  if (!(await removeAgencyFiles(admin, organizationId))) return respond(500, "agency_files_cleanup_failed");

  const { error: agencyDeleteError } = await callerClient.rpc("delete_agency_organization", {
    p_organization_id: organizationId,
    p_confirmation: confirmation,
  });
  if (agencyDeleteError) {
    if (agencyDeleteError.code === "42501") return respond(403, "owner_required");
    return respond(500, "agency_delete_failed");
  }

  let deletionError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await admin.auth.admin.deleteUser(caller.id);
    if (!error) {
      deletionError = null;
      break;
    }
    deletionError = error;
  }
  if (deletionError) {
    console.error("delete-agency-and-owner: agency deleted but Auth account deletion failed", {
      userId: caller.id,
      organizationId,
      message: deletionError instanceof Error ? deletionError.message : "unknown",
    });
    return respond(500, "agency_deleted_account_remains");
  }
  return respond(200, "ok", { ok: true });
});
