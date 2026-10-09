-- The role-management RPC is SECURITY INVOKER and must only be callable by signed-in users.
-- Its internal permission check remains in place; this revokes the implicit PUBLIC/anon grant.
revoke all on function public.set_member_role(uuid, uuid, public.organization_role) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, public.organization_role) to authenticated;
