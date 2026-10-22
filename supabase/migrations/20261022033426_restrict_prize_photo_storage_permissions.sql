-- Scope prize-photo uploads and deletion to the prize folder and authorized staff.
-- Prevent the older broad member policies from bypassing rendition/photo permissions.

drop policy if exists agency_prize_photos_insert on storage.objects;
create policy agency_prize_photos_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'agency-rendition-tickets'
  and (storage.foldername(name))[1] is not null
  and (storage.foldername(name))[2] = 'prizes'
  and exists (
    select 1
    from public.organization_members om
    where om.organization_id::text = (storage.foldername(name))[1]
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin', 'accountant')
      and private.has_org_permission(om.organization_id, 'can_register_payments', (select auth.uid()))
  )
);

drop policy if exists agency_prize_photos_delete on storage.objects;
create policy agency_prize_photos_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'agency-rendition-tickets'
  and (storage.foldername(name))[1] is not null
  and (storage.foldername(name))[2] = 'prizes'
  and exists (
    select 1
    from public.organization_members om
    where om.organization_id::text = (storage.foldername(name))[1]
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin', 'accountant')
      and private.has_org_permission(om.organization_id, 'can_register_payments', (select auth.uid()))
  )
);
