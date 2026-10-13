-- Keep database order aligned to the printed end-of-day receipt sequence.
update public.agency_game_types
set sort_order = case lower(trim(name))
  when 'quiniela correntina' then 10
  when 'quiniela al toque' then 20
  when 'loto plus' then 40
  when 'quini 6' then 50
  when 'pozo quiniela' then 55
  when 'brinco' then 60
  when 'loto 5 plus' then 70
  when 'lotería online' then 75
  when 'quiniela poceada correntina' then 77
  when 'telekino' then 80
  else sort_order
end
where lower(trim(name)) in (
  'quiniela correntina','quiniela al toque','loto plus','quini 6','pozo quiniela',
  'brinco','loto 5 plus','lotería online','quiniela poceada correntina','telekino'
);

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
    (new.id, 'Pozo Quiniela', 'Otros juegos', true, 55, new.created_by),
    (new.id, 'Lotería Online', 'Otros juegos', true, 75, new.created_by)
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
