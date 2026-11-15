-- Sites d'organisateurs : kind « site » = site en texte libre, lu chaque semaine par l'assistant (tâche planifiée
-- « Lecture des sites organisateurs »), qui injecte les soirées via public.import_event (doublons évités,
-- publication directe pour un organisateur vérifié). Ces sources restent inactives pour le robot quotidien.
alter table public.import_sources drop constraint if exists import_sources_kind_check;
alter table public.import_sources add constraint import_sources_kind_check check (kind in ('ical', 'jsonld', 'tribe', 'crawl', 'site'));

insert into public.organizers (name, kind, website)
select v.name, 'other', v.web from (values ('Gear''n''Dance', 'https://www.gearndance.de/de/home'), ('GearBlast:EU', 'https://eu.gearblast.com/'), ('GearBlast:UK', 'https://uk.gearblast.com/')) v(name, web)
where not exists (select 1 from public.organizers o where lower(o.name) = lower(v.name));

insert into public.import_sources (name, url, organizer_id, is_active, kind, default_types)
select v.sname, v.url, (select id from public.organizers where lower(name) = lower(v.oname) limit 1), v.active, v.kind, v.types
from (values
  ('Folsom Europe (agenda WordPress)', 'https://folsomeurope.berlin/', 'Folsom Europe', true, 'tribe', '{leather,multi}'::text[]),
  ('French Rubbermen (site)', 'https://frenchrubbermen.fr/', 'French Rubbermen', false, 'site', '{rubber}'::text[]),
  ('KinkX (site)', 'https://kinkx.fr/', 'KinkX', false, 'site', '{multi}'::text[]),
  ('XGEAR (site)', 'https://xgear.events/en/', 'XGEAR', false, 'site', '{multi,puppy}'::text[]),
  ('OstBlock (site)', 'https://aasssoxx.pl/ostblock', 'aasssoxx', false, 'site', '{multi}'::text[]),
  ('Gear''n''Dance (site)', 'https://www.gearndance.de/de/home', 'Gear''n''Dance', false, 'site', '{multi,puppy}'::text[]),
  ('GearBlast:UK (site)', 'https://uk.gearblast.com/', 'GearBlast:UK', false, 'site', '{multi}'::text[]),
  ('GearBlast:EU (site)', 'https://eu.gearblast.com/', 'GearBlast:EU', false, 'site', '{multi}'::text[]),
  ('Les Patounes (site)', 'https://lespatounes.fr/', 'Les Patounes', false, 'site', '{puppy}'::text[])
) v(sname, url, oname, active, kind, types)
where not exists (select 1 from public.import_sources s where s.url = v.url);
