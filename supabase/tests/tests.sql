\set ON_ERROR_STOP on
\pset pager off

-- Comptes : admin, organisateur (asso non vérifiée), deux membres
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test'),
  ('00000000-0000-0000-0000-00000000000b', 'orga@test'),
  ('00000000-0000-0000-0000-00000000000c', 'membre1@test'),
  ('00000000-0000-0000-0000-00000000000d', 'membre2@test'),
  ('00000000-0000-0000-0000-00000000000e', 'membre3@test');

-- Fonction d'aide : vérifier qu'une instruction échoue
create or replace function pg_temp.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ÉCHEC attendu non obtenu : %', p_label;
exception when others then
  if sqlerrm like 'ÉCHEC attendu%' then raise; end if;
  raise notice 'OK (refusé comme prévu) : % -> %', p_label, sqlerrm;
end $$;

-- 1. Création des profils par chaque utilisateur ------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into profiles (id, pseudo, adult_confirmed_at, sensitive_consent_at, role)
  values (auth.uid(), 'AdminEK', now(), now(), 'admin');   -- tente de se déclarer admin
select 'rôle forcé à member : ' || role from profiles where id = auth.uid();
reset role;
reset request.jwt.claim.sub;
update profiles set role = 'admin' where pseudo = 'AdminEK';   -- promotion faite côté serveur (éditeur SQL)
set role authenticated;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into profiles (id, pseudo, adult_confirmed_at, sensitive_consent_at) values (auth.uid(), 'RubberOuest', now(), now());
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into profiles (id, pseudo, adult_confirmed_at, sensitive_consent_at) values (auth.uid(), 'BlackRider', now(), now());
select pg_temp.expect_error($$update profiles set role = 'admin' where id = auth.uid()$$, 'un membre se promeut admin');
select pg_temp.expect_error($$insert into profiles (id, pseudo, adult_confirmed_at, sensitive_consent_at) values ('00000000-0000-0000-0000-00000000000d', 'Usurpateur', now(), now())$$, 'créer le profil d''un autre');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
insert into profiles (id, pseudo, adult_confirmed_at, sensitive_consent_at, attendance_visibility)
  values (auth.uid(), 'PupNantes', now(), now(), 'nobody');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select pg_temp.expect_error($$insert into profiles (id, pseudo, adult_confirmed_at, sensitive_consent_at) values (auth.uid(), 'blackrider', now(), now())$$, 'pseudo déjà pris (casse différente)');

-- 2. L'organisateur crée son asso, un lieu et une soirée ----------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into organizers (name, kind, city, is_verified) values ('Rubber Ouest', 'association', 'Nantes', true);
select 'organisateur vérifié ? ' || is_verified from organizers;
insert into venues (name, city, latitude, longitude) values ('L''Entrepôt', 'Nantes', 47.2184, -1.5536);

insert into events (organizer_id, venue_id, title, starts_at, ends_at, dress_code, price, booking, has_cloakroom, status)
select o.id, v.id, 'Black Rubber Night', now() - interval '30 minutes', now() + interval '5 hours',
       'required', 15, 'recommended', true, 'published'
from organizers o, venues v;
insert into event_event_types select e.id, t.id from events e, event_types t where t.slug = 'rubber';
select 'statut à la création : ' || status || ' / source : ' || source from events;

-- 3. Un membre ne voit pas la soirée en attente --------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select 'soirées visibles par membre1 avant validation : ' || count(*) from events;
with u as (update events set status = 'published' returning 1) select 'lignes modifiées par membre1 (attendu 0) : ' || count(*) from u;

-- 4. L'admin valide ; l'orga ne peut pas se vérifier lui-même --------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_error($$update organizers set is_verified = true$$, 'organisateur s''auto-vérifie');
select pg_temp.expect_error($$select moderate_event((select id from events limit 1), true)$$, 'organisateur valide sa soirée');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'validation admin : ' || moderate_event((select id from events limit 1), true);
update organizers set is_verified = true;
select 'organisateur vérifié par l''admin : ' || is_verified from organizers;

-- 5. Organisateur vérifié : publication directe ---------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into events (organizer_id, venue_id, title, starts_at, ends_at, dress_code, price, booking, frequency)
select o.id, v.id, 'Black Leather Ball', now() + interval '10 days', now() + interval '10 days 6 hours',
       'required', 45, 'required', 'yearly'
from organizers o, venues v;
insert into event_event_types select e.id, t.id from events e, event_types t where e.title = 'Black Leather Ball' and t.slug = 'leather';
select 'Black Leather Ball : ' || status from events where title = 'Black Leather Ball';

-- 6. Recherche (anonyme et connecté) -----------------------------------------
reset request.jwt.claim.sub;
set role anon;
select 'anon voit ' || count(*) || ' soirée(s)' from search_events();
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select title, price, distance_km, type_slugs from search_events(p_lat => 47.06, p_lon => -0.88, p_radius_km => 80);
select 'budget max 20 € : ' || string_agg(title, ', ') from search_events(p_budget_max => 20);
select 'type leather : ' || string_agg(title, ', ')
  from search_events(p_type_ids => array[(select id from event_types where slug = 'leather')]);
select 'sans réservation : ' || count(*) from search_events(p_no_booking => true);
select 'à Cholet rayon 10 km : ' || count(*) from search_events(p_lat => 47.06, p_lon => -0.88, p_radius_km => 10);

-- 7. Favoris, rappel, alerte, participation ------------------------------
insert into favorites (user_id, event_id) select auth.uid(), id from events where title = 'Black Leather Ball';
insert into reminders (user_id, event_id) select auth.uid(), id from events where title = 'Black Leather Ball';
insert into ticket_alerts (user_id, event_id) select auth.uid(), id from events where title = 'Black Leather Ball';
insert into attendances (user_id, event_id) select auth.uid(), id from events;
select 'rappel programmé (heure de Paris) : ' || to_char(remind_at at time zone 'Europe/Paris', 'DD/MM HH24:MI') from reminders;
select pg_temp.expect_error($$insert into favorites (user_id, event_id) select '00000000-0000-0000-0000-00000000000d', id from events limit 1$$, 'favori au nom d''un autre');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
insert into attendances (user_id, event_id) select auth.uid(), id from events where title = 'Black Rubber Night';
select 'membre2 voit les favoris de membre1 : ' || count(*) from favorites;
select 'membre2 voit les participations de membre1 (réglage « suivis », pas suivi) : ' || count(*) from attendances where user_id <> auth.uid();
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into member_follows values (auth.uid(), '00000000-0000-0000-0000-00000000000d');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select 'après que membre1 suit membre2, membre2 voit : ' || count(*) from attendances where user_id <> auth.uid();
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select 'membre1 voit les participations de membre2 (réglage « personne ») : ' || count(*) from attendances where user_id <> auth.uid();

-- 8. Validation de présence par géolocalisation -------------------------
select 'trop loin (Cholet) : ' || result || ' à ' || distance_m || ' m'
  from check_in((select id from events where title = 'Black Rubber Night'), 47.06, -0.88);
select 'hors créneau : ' || result from check_in((select id from events where title = 'Black Leather Ball'), 47.2184, -1.5536);
select 'devant le lieu : ' || result || ' à ' || distance_m || ' m, badges : ' || array_to_string(new_badges, ', ')
  from check_in((select id from events where title = 'Black Rubber Night'), 47.2190, -1.5530);
select 'deuxième fois : ' || result from check_in((select id from events where title = 'Black Rubber Night'), 47.2184, -1.5536);
select pg_temp.expect_error($$insert into checkins (user_id, event_id) select auth.uid(), id from events where title = 'Black Leather Ball'$$, 'présence insérée sans géolocalisation');
select pg_temp.expect_error($$select award_badges(auth.uid())$$, 'appel direct de l''attribution des badges');

-- 9. Passeport --------------------------------------------------------------
select name, progress || '/' || goal as progression, earned_at is not null as obtenu from passport();

-- 10. Signalement ---------------------------------------------------------
insert into reports (reporter_id, target_type, target_id, reason)
  select auth.uid(), 'event', id, 'Informations erronées' from events limit 1;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select 'membre2 voit le signalement de membre1 : ' || count(*) from reports;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'admin voit les signalements : ' || count(*) from reports;

-- 11. Import automatique (clé service, sans utilisateur) -----------------
reset request.jwt.claim.sub;
reset role;   -- équivalent de la clé service : pas d'utilisateur connecté
insert into events (organizer_id, venue_id, title, starts_at, ends_at, dress_code, booking, import_raw, status)
select o.id, v.id, 'Soirée importée', now() + interval '20 days', now() + interval '20 days 5 hours',
       'recommended', 'door_only', '{"url":"https://exemple.test"}', 'published'
from organizers o, venues v;
select 'soirée importée : ' || status || ' / ' || source from events where title = 'Soirée importée';

-- 12. Fonctions de l'appli connectée ------------------------------------
set role anon;
select 'pseudo BlackRider libre ? ' || pseudo_available('blackrider') || ' / NouveauPseudo libre ? ' || pseudo_available('NouveauPseudo') || ' / « ab » ? ' || pseudo_available('ab');
select 'compteurs visibles par anon : ' || count(*) || ' soirées, total ' || sum(attendees) from event_attendee_counts();
select pg_temp.expect_error($$select delete_my_account()$$, 'anon supprime un compte');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select delete_my_account();
reset role;
select 'membre2 supprimé : compte ' || (select count(*) from auth.users where id = '00000000-0000-0000-0000-00000000000d')
  || ', profil ' || (select count(*) from profiles where id = '00000000-0000-0000-0000-00000000000d')
  || ', participations ' || (select count(*) from attendances where user_id = '00000000-0000-0000-0000-00000000000d');

\echo '=== TOUS LES TESTS SONT PASSÉS ==='
