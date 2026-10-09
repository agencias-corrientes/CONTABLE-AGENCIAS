-- Keep the active agency catalog aligned with games published by Lotería Correntina.
-- Historic game rows and all rendition amounts are kept; legacy/non-official names are disabled, not deleted.
with official_games(name, category, sort_order, enabled_by_default) as (
  values
    ('Quiniela Correntina', 'Quiniela', 10, true),
    ('Quiniela Al Toque', 'Quiniela', 20, true),
    ('Quiniela Poceada Correntina', 'Poceada', 30, true),
    ('Loto Plus', 'Otros juegos', 40, true),
    ('Loto 5 Plus', 'Otros juegos', 50, true),
    ('Quini 6', 'Otros juegos', 60, true),
    ('Brinco', 'Otros juegos', 70, true),
    ('Telekino', 'Otros juegos', 80, true),
    ('Quiniela Poceada Extra', 'Poceada', 130, false),
    ('Quiniela Poceada Navidad', 'Poceada', 140, false),
    ('Loto Plus Extra', 'Otros juegos', 150, false)
)
update public.agency_game_types game
set category = official_games.category, sort_order = official_games.sort_order,
    enabled = official_games.enabled_by_default, updated_at = now()
from official_games where lower(trim(game.name)) = lower(trim(official_games.name));

update public.agency_game_types game set enabled = false, updated_at = now()
where not exists (
  select 1 from (values
    ('Quiniela Correntina'), ('Quiniela Al Toque'), ('Quiniela Poceada Correntina'),
    ('Loto Plus'), ('Loto 5 Plus'), ('Quini 6'), ('Brinco'), ('Telekino'),
    ('Quiniela Poceada Extra'), ('Quiniela Poceada Navidad'), ('Loto Plus Extra')
  ) official(name) where lower(trim(game.name)) = lower(trim(official.name))
);

with official_games(name, category, sort_order, enabled_by_default) as (
  values
    ('Quiniela Correntina', 'Quiniela', 10, true),
    ('Quiniela Al Toque', 'Quiniela', 20, true),
    ('Quiniela Poceada Correntina', 'Poceada', 30, true),
    ('Loto Plus', 'Otros juegos', 40, true),
    ('Loto 5 Plus', 'Otros juegos', 50, true),
    ('Quini 6', 'Otros juegos', 60, true),
    ('Brinco', 'Otros juegos', 70, true),
    ('Telekino', 'Otros juegos', 80, true),
    ('Quiniela Poceada Extra', 'Poceada', 130, false),
    ('Quiniela Poceada Navidad', 'Poceada', 140, false),
    ('Loto Plus Extra', 'Otros juegos', 150, false)
)
insert into public.agency_game_types (organization_id,name,category,enabled,sort_order,created_by)
select o.id, g.name, g.category, g.enabled_by_default, g.sort_order, o.created_by
from public.organizations o cross join official_games g
where not exists (
  select 1 from public.agency_game_types existing
  where existing.organization_id=o.id and lower(trim(existing.name))=lower(trim(g.name))
);
