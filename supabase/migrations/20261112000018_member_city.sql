-- 18 : ville libre (code postal ou commune) avec coordonnées, pour la carte des membres
alter table public.profiles
  add column if not exists postal_code text check (postal_code is null or postal_code ~ '^[0-9A-Za-z \-]{2,10}$'),
  add column if not exists latitude double precision check (latitude is null or latitude between -90 and 90),
  add column if not exists longitude double precision check (longitude is null or longitude between -180 and 180);

-- Les profils existants reçoivent les coordonnées de leur grande ville
update public.profiles p set latitude = c.lat, longitude = c.lon
from (values
    ('Angers', 47.4784, -0.5632),
    ('Bordeaux', 44.8378, -0.5792),
    ('Brest', 48.3904, -4.4861),
    ('Bruxelles', 50.8503, 4.3517),
    ('Cholet', 47.0600, -0.8789),
    ('Grenoble', 45.1885, 5.7245),
    ('La Roche-sur-Yon', 46.6705, -1.4260),
    ('Le Mans', 48.0061, 0.1996),
    ('Lille', 50.6292, 3.0573),
    ('Lyon', 45.7640, 4.8357),
    ('Marseille', 43.2965, 5.3698),
    ('Montpellier', 43.6108, 3.8767),
    ('Nantes', 47.2184, -1.5536),
    ('Nice', 43.7102, 7.2620),
    ('Niort', 46.3237, -0.4588),
    ('Paris', 48.8566, 2.3522),
    ('Poitiers', 46.5802, 0.3404),
    ('Rennes', 48.1173, -1.6778),
    ('Rouen', 49.4432, 1.0999),
    ('Strasbourg', 48.5734, 7.7521),
    ('Toulouse', 43.6047, 1.4442),
    ('Tours', 47.3941, 0.6848)
  ) as c(name, lat, lon)
where p.city = c.name and p.latitude is null;

create index if not exists profiles_map_idx on public.profiles (latitude, longitude) where not is_invisible;
