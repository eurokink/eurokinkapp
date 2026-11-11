-- =====================================================================
-- EuroKink — données de départ : réglages, types de soirée, badges
-- =====================================================================

insert into public.app_settings (key, value, description) values
  ('checkin_radius_m',      '300', 'Distance maximale (m) entre le membre et le lieu pour valider sa présence'),
  ('checkin_early_minutes', '60',  'Minutes avant le début de la soirée à partir desquelles la validation est possible'),
  ('pioneer_limit',         '500', 'Nombre de premiers inscrits qui reçoivent le badge Pionnier');

insert into public.event_types (slug, name, sort_order) values
  ('leather',     'Cuir',          1),
  ('rubber',      'Rubber',        2),
  ('sportswear',  'Sportswear',    3),
  ('skin-lads',   'Skin/Lads',     4),
  ('uniform',     'Uniforme',      5),
  ('military',    'Military',      6),
  ('workwear',    'Workwear',      7),
  ('sneaker',     'Sneaker',       8),
  ('puffer-down', 'Puffer/Down',   9),
  ('puppy',       'Puppy',        10),
  ('bondage',     'Bondage',      11),
  ('abdl',        'ABDL',         12),
  ('biker',       'Motard',       13),
  ('bears',       'Bears',        14),
  ('multi',       'Multi-fetish', 15);

insert into public.badges (code, name, description, goal, sort_order) values
  ('first_steps',    'Premiers pas',    'Ta première soirée validée avec EuroKink.',                   1, 1),
  ('tour_de_france', 'Tour de France',  'Des soirées dans 5 villes françaises différentes.',           5, 2),
  ('globetrotter',   'Globe-trotter',   'Des soirées dans 3 pays européens.',                          3, 3),
  ('loyal',          'Fidèle',          '5 soirées chez le même organisateur.',                        5, 4),
  ('explorer',       'Explorateur',     '5 types de soirée différents.',                               5, 5),
  ('pioneer',        'Pionnier',        'Parmi les 500 premiers membres d''EuroKink.',                 1, 6);
