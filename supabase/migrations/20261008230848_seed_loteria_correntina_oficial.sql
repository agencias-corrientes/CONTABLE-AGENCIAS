-- Seed the official agency game catalogue in every organization.
-- Idempotent by organization + normalized game name; keeps existing rendition history intact.

update public.agency_game_types as game
set name = 'Loto Plus', category = 'Otros juegos', sort_order = 40, updated_at = now()
where lower(trim(game.name)) = 'loto'
  and not exists (
    select 1 from public.agency_game_types as existing
    where existing.organization_id = game.organization_id
      and lower(trim(existing.name)) = 'loto plus'
  );

update public.agency_game_types as game
set name = 'Quiniela - Nocturna', category = 'Quiniela', sort_order = 15, updated_at = now()
where lower(trim(game.name)) = 'quiniela nocturna'
  and not exists (
    select 1 from public.agency_game_types as existing
    where existing.organization_id = game.organization_id
      and lower(trim(existing.name)) = 'quiniela - nocturna'
  );

with official_games(name, category, sort_order) as (
  values
    ('Quiniela - La Previa', 'Quiniela', 11),
    ('Quiniela - Primera', 'Quiniela', 12),
    ('Quiniela - Matutina', 'Quiniela', 13),
    ('Quiniela - Vespertina', 'Quiniela', 14),
    ('Quiniela Al Toque', 'Quiniela', 16),
    ('Quiniela Poceada Correntina', 'Poceadas', 21),
    ('Quiniela Poceada Extra', 'Poceadas', 22),
    ('Quiniela Poceada Navidad', 'Poceadas', 23),
    ('Loto Plus Extra', 'Otros juegos', 41),
    ('Loto 5 Plus', 'Otros juegos', 45),
    ('Quini 6', 'Otros juegos', 30),
    ('Brinco', 'Otros juegos', 50),
    ('Telekino', 'Otros juegos', 60)
)
insert into public.agency_game_types
  (organization_id, name, category, enabled, sort_order, created_by)
select
  organization.id,
  official_games.name,
  official_games.category,
  true,
  official_games.sort_order,
  organization.created_by
from public.organizations as organization
cross join official_games
where not exists (
  select 1
  from public.agency_game_types as existing
  where existing.organization_id = organization.id
    and lower(trim(existing.name)) = lower(trim(official_games.name))
);
