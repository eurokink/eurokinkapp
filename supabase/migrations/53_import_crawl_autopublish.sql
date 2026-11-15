-- Robot d'import : lecture directe des sites d'organisateurs (mode « crawl ») et publication directe
-- pour les sources rattachées à un organisateur vérifié.
-- Le mode crawl part de import_sources.url, suit les liens qui correspondent à link_pattern et lit les données
-- « Event » schema.org de chaque page (voir supabase/functions/import-events).
alter table public.import_sources drop constraint if exists import_sources_kind_check;
alter table public.import_sources add constraint import_sources_kind_check check (kind in ('ical', 'jsonld', 'tribe', 'crawl'));
alter table public.import_sources add column if not exists link_pattern text;

-- import_event (appliqué en base par remplacement dans la définition existante) :
--  * même organisateur + même jour = soirée déjà connue (titre pouvant différer si la source est rattachée à l'organisateur) ;
--    la soirée existante est rattachée à la source (import_source_id, external_id) sans être modifiée ;
--  * après insertion, si la source est rattachée à un organisateur vérifié : status = 'published', retour 'publiée'.

-- Source Event Storm (site sur mesure, pages de soirée avec données schema.org)
insert into public.import_sources (name, url, organizer_id, is_active, kind, default_types, link_pattern)
select 'Event Storm (site)', 'https://event-storm.fr/', '21c9d783-0a1d-41b1-9a4c-cea880ee9b2e', true, 'crawl', '{multi}', '^/[a-z0-9-]+/[a-z0-9-]+/?$'
where not exists (select 1 from public.import_sources where url = 'https://event-storm.fr/');
