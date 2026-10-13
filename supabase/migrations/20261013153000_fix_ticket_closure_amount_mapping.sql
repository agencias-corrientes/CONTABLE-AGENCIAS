-- Add the two extra rows printed on end-of-day quiniela receipts.
with ticket_games(name, category, sort_order) as (
  values ('Pozo Quiniela', 'Otros juegos', 85), ('Lotería Online', 'Otros juegos', 90)
)
insert into public.agency_game_types
  (organization_id, name, category, enabled, sort_order, created_by)
select org.id, ticket_games.name, ticket_games.category, true, ticket_games.sort_order, org.created_by
from public.organizations org cross join ticket_games
where not exists (
  select 1 from public.agency_game_types existing
  where existing.organization_id = org.id and lower(trim(existing.name)) = lower(trim(ticket_games.name))
);

insert into public.agency_game_commission_defaults
  (organization_id, game_type_id, commission_percent, created_by)
select game.organization_id, game.id, 0, game.created_by
from public.agency_game_types game
where lower(trim(game.name)) in ('pozo quiniela', 'lotería online')
on conflict do nothing;

create or replace function public.seed_ticket_closure_game_types()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.agency_game_types
    (organization_id, name, category, enabled, sort_order, created_by)
  values
    (new.id, 'Pozo Quiniela', 'Otros juegos', true, 85, new.created_by),
    (new.id, 'Lotería Online', 'Otros juegos', true, 90, new.created_by)
  on conflict do nothing;

  insert into public.agency_game_commission_defaults
    (organization_id, game_type_id, commission_percent, created_by)
  select game.organization_id, game.id, 0, game.created_by
  from public.agency_game_types game
  where game.organization_id = new.id
    and lower(trim(game.name)) in ('pozo quiniela', 'lotería online')
  on conflict do nothing;
  return new;
end;
$function$;

drop trigger if exists seed_ticket_closure_game_types_after_organization on public.organizations;
create trigger seed_ticket_closure_game_types_after_organization
after insert on public.organizations
for each row execute function public.seed_ticket_closure_game_types();
