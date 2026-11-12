-- 26 : toute l'Europe — pays ouverts, devises et taux approximatifs vers l'euro (pour le filtre budget)
alter table public.events drop constraint if exists events_currency_check;
alter table public.events add constraint events_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.countries drop constraint if exists countries_currency_check;
alter table public.countries add constraint countries_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.countries add column if not exists eur_rate numeric not null default 1;

insert into public.countries (code, name_fr, currency, timezone, eur_rate) values
  ('AD', 'Andorre', 'EUR', 'Europe/Andorra', 1), ('AL', 'Albanie', 'ALL', 'Europe/Tirane', 0.0105),
  ('AT', 'Autriche', 'EUR', 'Europe/Vienna', 1), ('BA', 'Bosnie-Herzégovine', 'BAM', 'Europe/Sarajevo', 0.511),
  ('BG', 'Bulgarie', 'EUR', 'Europe/Sofia', 1), ('CY', 'Chypre', 'EUR', 'Asia/Nicosia', 1),
  ('CZ', 'Tchéquie', 'CZK', 'Europe/Prague', 0.040), ('DK', 'Danemark', 'DKK', 'Europe/Copenhagen', 0.134),
  ('EE', 'Estonie', 'EUR', 'Europe/Tallinn', 1), ('ES', 'Espagne', 'EUR', 'Europe/Madrid', 1),
  ('FI', 'Finlande', 'EUR', 'Europe/Helsinki', 1), ('GB', 'Royaume-Uni', 'GBP', 'Europe/London', 1.17),
  ('GR', 'Grèce', 'EUR', 'Europe/Athens', 1), ('HR', 'Croatie', 'EUR', 'Europe/Zagreb', 1),
  ('HU', 'Hongrie', 'HUF', 'Europe/Budapest', 0.0025), ('IE', 'Irlande', 'EUR', 'Europe/Dublin', 1),
  ('IS', 'Islande', 'ISK', 'Atlantic/Reykjavik', 0.0066), ('IT', 'Italie', 'EUR', 'Europe/Rome', 1),
  ('LI', 'Liechtenstein', 'CHF', 'Europe/Vaduz', 1.07), ('LT', 'Lituanie', 'EUR', 'Europe/Vilnius', 1),
  ('LU', 'Luxembourg', 'EUR', 'Europe/Luxembourg', 1), ('LV', 'Lettonie', 'EUR', 'Europe/Riga', 1),
  ('MC', 'Monaco', 'EUR', 'Europe/Monaco', 1), ('MD', 'Moldavie', 'MDL', 'Europe/Chisinau', 0.051),
  ('ME', 'Monténégro', 'EUR', 'Europe/Podgorica', 1), ('MK', 'Macédoine du Nord', 'MKD', 'Europe/Skopje', 0.0163),
  ('MT', 'Malte', 'EUR', 'Europe/Malta', 1), ('NL', 'Pays-Bas', 'EUR', 'Europe/Amsterdam', 1),
  ('NO', 'Norvège', 'NOK', 'Europe/Oslo', 0.085), ('PL', 'Pologne', 'PLN', 'Europe/Warsaw', 0.235),
  ('PT', 'Portugal', 'EUR', 'Europe/Lisbon', 1), ('RO', 'Roumanie', 'RON', 'Europe/Bucharest', 0.20),
  ('RS', 'Serbie', 'RSD', 'Europe/Belgrade', 0.0085), ('SE', 'Suède', 'SEK', 'Europe/Stockholm', 0.088),
  ('SI', 'Slovénie', 'EUR', 'Europe/Ljubljana', 1), ('SK', 'Slovaquie', 'EUR', 'Europe/Bratislava', 1),
  ('SM', 'Saint-Marin', 'EUR', 'Europe/San_Marino', 1), ('UA', 'Ukraine', 'UAH', 'Europe/Kyiv', 0.021)
on conflict (code) do nothing;
update public.countries set eur_rate = 1.07 where code = 'CH';
