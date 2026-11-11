-- =====================================================================
-- EuroKink — schéma de base de données (Supabase / PostgreSQL)
-- Migration 1 : types, tables, index, sécurité par ligne (RLS),
-- fonctions métier (recherche, validation de présence, badges).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Types énumérés
-- ---------------------------------------------------------------------
create type public.app_role as enum ('member', 'admin');
create type public.dress_code_level as enum ('required', 'recommended', 'free');
create type public.booking_policy as enum ('required', 'recommended', 'door_only');
create type public.event_frequency as enum ('once', 'weekly', 'monthly', 'yearly');
create type public.event_status as enum ('pending', 'published', 'rejected', 'cancelled');
create type public.event_source as enum ('import', 'organizer', 'admin');
create type public.organizer_kind as enum ('club', 'bar', 'association', 'group', 'other');
create type public.attendance_visibility as enum ('everyone', 'followed', 'nobody');
create type public.report_target as enum ('event', 'profile', 'organizer');
create type public.report_status as enum ('open', 'handled', 'dismissed');

-- ---------------------------------------------------------------------
-- 2. Réglages de l'application (modifiables par l'admin)
-- ---------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text
);

-- ---------------------------------------------------------------------
-- 3. Profils membres (1 ligne par compte auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  pseudo                   text not null check (char_length(pseudo) between 3 and 30),
  city                     text,
  country                  char(2) not null default 'FR',
  bio                      text check (char_length(bio) <= 500),
  role                     public.app_role not null default 'member',
  attendance_visibility    public.attendance_visibility not null default 'followed',
  is_invisible             boolean not null default false,
  adult_confirmed_at       timestamptz not null,           -- case « J'ai 18 ans ou plus »
  sensitive_consent_at     timestamptz not null,           -- consentement RGPD art. 9
  member_number            bigint generated always as identity unique,
  created_at               timestamptz not null default now()
);
create unique index profiles_pseudo_ci on public.profiles (lower(pseudo));

-- Membres suivis (sert à la visibilité « membres que je suis »)
create table public.member_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

-- ---------------------------------------------------------------------
-- 4. Référentiels : types de soirée, organisateurs, lieux
-- ---------------------------------------------------------------------
create table public.event_types (
  id         smallint generated always as identity primary key,
  slug       text not null unique,
  name       text not null,
  sort_order smallint not null default 0,
  is_active  boolean not null default true
);

create table public.organizers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  kind        public.organizer_kind not null default 'other',
  description text check (char_length(description) <= 2000),
  website     text,
  city        text,
  country     char(2) not null default 'FR',
  is_verified boolean not null default false,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.organizer_members (
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (organizer_id, user_id)
);

create table public.venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  postal_code text,
  city        text not null,
  country     char(2) not null default 'FR',
  latitude    double precision not null check (latitude between -90 and 90),
  longitude   double precision not null check (longitude between -180 and 180),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index venues_city_idx on public.venues (country, lower(city));

-- ---------------------------------------------------------------------
-- 5. Import automatique (sites d'organisateurs et billetteries)
-- ---------------------------------------------------------------------
create table public.import_sources (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  url          text not null unique,
  organizer_id uuid references public.organizers (id) on delete set null,
  is_active    boolean not null default true,
  last_read_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Soirées
-- ---------------------------------------------------------------------
create table public.events (
  id                    uuid primary key default gen_random_uuid(),
  organizer_id          uuid not null references public.organizers (id) on delete cascade,
  venue_id              uuid not null references public.venues (id),
  title                 text not null check (char_length(title) between 3 and 120),
  description           text check (char_length(description) <= 4000),
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  dress_code            public.dress_code_level not null,
  dress_code_details    text,
  price                 numeric(7, 2) not null default 0 check (price >= 0),  -- entrée, 0 = gratuit
  presale_price         numeric(7, 2) check (presale_price >= 0),
  member_price          numeric(7, 2) check (member_price >= 0),
  booking               public.booking_policy not null,
  ticket_url            text,
  sales_open_at         timestamptz,                 -- déclenche l'alerte billetterie
  is_sold_out           boolean not null default false,
  has_cloakroom         boolean,
  cloakroom_paid        boolean,
  frequency             public.event_frequency not null default 'once',
  languages             text[] not null default '{fr}',
  image_path            text,                        -- chemin dans le bucket « event-images »
  status                public.event_status not null default 'pending',
  source                public.event_source not null default 'organizer',
  import_source_id      uuid references public.import_sources (id) on delete set null,
  import_raw            jsonb,                       -- données brutes extraites par l'IA
  rejection_reason      text,
  created_by            uuid references public.profiles (id) on delete set null,
  validated_by          uuid references public.profiles (id) on delete set null,
  validated_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index events_published_start_idx on public.events (starts_at) where status = 'published';
create index events_pending_idx on public.events (created_at) where status = 'pending';
create index events_organizer_idx on public.events (organizer_id);
create index events_venue_idx on public.events (venue_id);

create table public.event_event_types (
  event_id uuid not null references public.events (id) on delete cascade,
  type_id  smallint not null references public.event_types (id),
  primary key (event_id, type_id)
);
create index event_event_types_type_idx on public.event_event_types (type_id);

-- ---------------------------------------------------------------------
-- 7. Actions des membres
-- ---------------------------------------------------------------------
create table public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table public.reminders (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  remind_at timestamptz not null,
  sent_at   timestamptz,
  primary key (user_id, event_id)
);
create index reminders_due_idx on public.reminders (remind_at) where sent_at is null;

create table public.ticket_alerts (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  primary key (user_id, event_id)
);

-- « Je participe » (intention, ne compte pas pour les badges)
create table public.attendances (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index attendances_event_idx on public.attendances (event_id);

-- Présence validée par géolocalisation (aucune position conservée)
create table public.checkins (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  event_id     uuid not null references public.events (id) on delete cascade,
  validated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table public.organizer_follows (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, organizer_id)
);

-- ---------------------------------------------------------------------
-- 8. Passeport : badges
-- ---------------------------------------------------------------------
create table public.badges (
  code        text primary key,
  name        text not null,
  description text not null,
  goal        integer not null default 1,   -- seuil à atteindre
  sort_order  smallint not null default 0
);

create table public.user_badges (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  badge_code text not null references public.badges (code) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (user_id, badge_code)
);

-- ---------------------------------------------------------------------
-- 9. Modération et notifications
-- ---------------------------------------------------------------------
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target not null,
  target_id   uuid not null,
  reason      text not null check (char_length(reason) between 3 and 100),
  details     text check (char_length(details) <= 1000),
  status      public.report_status not null default 'open',
  handled_by  uuid references public.profiles (id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index reports_open_idx on public.reports (created_at) where status = 'open';

create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- 10. Fonctions utilitaires (SECURITY DEFINER : contournent la RLS
--     pour éviter les boucles, avec search_path verrouillé)
-- =====================================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Appel « de confiance » : admin, ou serveur sans utilisateur connecté
-- (clé service, éditeur SQL). Le rôle anon n'a aucun droit d'écriture.
create or replace function public.is_trusted()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or public.is_admin();
$$;

create or replace function public.is_organizer_member(p_organizer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizer_members
                 where organizer_id = p_organizer and user_id = auth.uid());
$$;

create or replace function public.is_organizer_verified(p_organizer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_verified from public.organizers where id = p_organizer), false);
$$;

-- Le membre p_owner autorise-t-il l'utilisateur courant à voir ses sorties ?
create or replace function public.can_see_attendance(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_owner = auth.uid() then true
    when public.is_admin() then true
    else coalesce((
      select not p.is_invisible and (
               p.attendance_visibility = 'everyone'
            or (p.attendance_visibility = 'followed' and exists (
                  select 1 from public.member_follows f
                  where f.follower_id = p_owner and f.followed_id = auth.uid())))
      from public.profiles p where p.id = p_owner), false)
  end;
$$;

-- Nombre de participants annoncés (chiffre global, sans révéler qui)
create or replace function public.attendee_count(p_event uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.attendances where event_id = p_event;
$$;

-- Distance en mètres entre deux points (formule de haversine)
create or replace function public.distance_m(lat1 double precision, lon1 double precision,
                                             lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2)
         + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)));
$$;

create or replace function public.setting_int(p_key text, p_default integer)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::integer from public.app_settings where key = p_key), p_default);
$$;

-- =====================================================================
-- 11. Déclencheurs (règles qu'un client ne peut pas contourner)
-- =====================================================================

-- Profils : seul un admin peut changer un rôle ; le badge Pionnier
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.role <> 'member' and not public.is_admin() then
      new.role := 'member';
    end if;
  elsif new.role is distinct from old.role and not public.is_trusted() then
    raise exception 'Seul un administrateur peut modifier un rôle';
  end if;
  return new;
end $$;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.profiles_guard();

create or replace function public.profiles_pioneer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.member_number <= public.setting_int('pioneer_limit', 500) then
    insert into public.user_badges (user_id, badge_code) values (new.id, 'pioneer')
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger profiles_pioneer after insert on public.profiles
  for each row execute function public.profiles_pioneer();

-- Organisateurs : le créateur devient membre ; seul l'admin vérifie
create or replace function public.organizers_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_trusted() then
      new.is_verified := false;
    end if;
    new.created_by := coalesce(new.created_by, auth.uid());
  elsif new.is_verified is distinct from old.is_verified and not public.is_trusted() then
    raise exception 'Seul un administrateur peut vérifier un organisateur';
  end if;
  return new;
end $$;
create trigger organizers_guard before insert or update on public.organizers
  for each row execute function public.organizers_guard();

create or replace function public.organizers_add_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.organizer_members (organizer_id, user_id)
    values (new.id, new.created_by) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger organizers_add_creator after insert on public.organizers
  for each row execute function public.organizers_add_creator();

-- Soirées : statut fixé par le serveur
--   admin -> publiée ; organisateur vérifié -> publiée ; sinon -> à valider
create or replace function public.events_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    if public.is_admin() then
      new.source := case when new.source = 'import' then 'import'::public.event_source else 'admin' end;
      if new.source = 'import' then
        new.status := 'pending';
      else
        new.status := 'published';
        new.validated_by := auth.uid();
        new.validated_at := now();
      end if;
    elsif auth.uid() is null then
      -- robot d'import (clé service) : toujours à valider
      new.source := 'import';
      new.status := 'pending';
    else
      new.source := 'organizer';
      if public.is_organizer_verified(new.organizer_id) then
        new.status := 'published';
        new.validated_at := now();
      else
        new.status := 'pending';
      end if;
      new.import_raw := null;
    end if;
  else
    if new.status is distinct from old.status and not public.is_trusted() then
      -- un organisateur peut seulement annuler sa soirée
      if not (new.status = 'cancelled' and public.is_organizer_member(old.organizer_id)) then
        raise exception 'Changement de statut réservé à l''administrateur';
      end if;
    end if;
    if new.status = 'published' and old.status <> 'published' then
      new.validated_by := auth.uid();
      new.validated_at := now();
    end if;
    -- une soirée non vérifiée modifiée par un organisateur non vérifié repasse en validation
    if old.status = 'published' and not public.is_trusted()
       and not public.is_organizer_verified(old.organizer_id)
       and new.status = 'published' then
      new.status := 'pending';
    end if;
    new.source := old.source;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
create trigger events_guard before insert or update on public.events
  for each row execute function public.events_guard();

-- Rappel par défaut : la veille à 18 h (heure de Paris) si non précisé
create or replace function public.reminders_default()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.remind_at is null then
    select ((date_trunc('day', e.starts_at at time zone 'Europe/Paris') - interval '1 day' + interval '18 hours')
            at time zone 'Europe/Paris')
      into new.remind_at from public.events e where e.id = new.event_id;
  end if;
  return new;
end $$;
create trigger reminders_default before insert on public.reminders
  for each row execute function public.reminders_default();

-- =====================================================================
-- 12. Fonctions appelées par l'appli
-- =====================================================================

-- Recherche (écran Explorer). p_budget_max null = tous budgets.
create or replace function public.search_events(
  p_lat              double precision default null,
  p_lon              double precision default null,
  p_radius_km        integer default null,
  p_from             timestamptz default now(),
  p_to               timestamptz default null,
  p_type_ids         smallint[] default null,
  p_budget_max       numeric default null,
  p_no_booking       boolean default false,
  p_cloakroom        boolean default false,
  p_query            text default null,
  p_limit            integer default 50,
  p_offset           integer default 0
)
returns table (
  id uuid, title text, starts_at timestamptz, ends_at timestamptz,
  price numeric, booking public.booking_policy, has_cloakroom boolean,
  organizer_id uuid, organizer_name text, organizer_verified boolean,
  venue_name text, city text, country char(2),
  type_slugs text[], distance_km numeric, attendees bigint, image_path text
)
language sql stable security invoker set search_path = public as $$
  select e.id, e.title, e.starts_at, e.ends_at, e.price, e.booking, e.has_cloakroom,
         o.id, o.name, o.is_verified,
         v.name, v.city, v.country,
         coalesce((select array_agg(t.slug order by t.sort_order)
                   from public.event_event_types et join public.event_types t on t.id = et.type_id
                   where et.event_id = e.id), '{}'),
         case when p_lat is null or p_lon is null then null
              else round((public.distance_m(p_lat, p_lon, v.latitude, v.longitude) / 1000)::numeric, 0) end,
         public.attendee_count(e.id),
         e.image_path
  from public.events e
  join public.organizers o on o.id = e.organizer_id
  join public.venues v on v.id = e.venue_id
  where e.status = 'published'
    and e.ends_at >= coalesce(p_from, now())
    and (p_to is null or e.starts_at <= p_to)
    and (p_budget_max is null or e.price <= p_budget_max)
    and (not p_no_booking or e.booking = 'door_only')
    and (not p_cloakroom or e.has_cloakroom is true)
    and (p_type_ids is null or cardinality(p_type_ids) = 0 or exists (
          select 1 from public.event_event_types et
          where et.event_id = e.id and et.type_id = any (p_type_ids)))
    and (p_radius_km is null or p_lat is null or p_lon is null
         or public.distance_m(p_lat, p_lon, v.latitude, v.longitude) <= p_radius_km * 1000)
    and (p_query is null or e.title ilike '%' || p_query || '%'
         or o.name ilike '%' || p_query || '%' or v.city ilike '%' || p_query || '%')
  order by e.starts_at
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

-- Attribution des badges d'un membre (appelée après chaque présence validée)
create or replace function public.award_badges(p_user uuid)
returns setof text language plpgsql security definer set search_path = public as $$
declare
  v_checkins  integer;
  v_fr_cities integer;
  v_countries integer;
  v_loyal     integer;
  v_types     integer;
begin
  select count(*) into v_checkins from public.checkins where user_id = p_user;

  select count(distinct lower(v.city)) into v_fr_cities
  from public.checkins c join public.events e on e.id = c.event_id join public.venues v on v.id = e.venue_id
  where c.user_id = p_user and v.country = 'FR';

  select count(distinct v.country) into v_countries
  from public.checkins c join public.events e on e.id = c.event_id join public.venues v on v.id = e.venue_id
  where c.user_id = p_user;

  select coalesce(max(n), 0) into v_loyal from (
    select count(*) n from public.checkins c join public.events e on e.id = c.event_id
    where c.user_id = p_user group by e.organizer_id) s;

  select count(distinct et.type_id) into v_types
  from public.checkins c join public.event_event_types et on et.event_id = c.event_id
  where c.user_id = p_user;

  return query
  insert into public.user_badges (user_id, badge_code)
  select p_user, b.code from public.badges b
  where (b.code = 'first_steps'   and v_checkins  >= b.goal)
     or (b.code = 'tour_de_france' and v_fr_cities >= b.goal)
     or (b.code = 'globetrotter'  and v_countries >= b.goal)
     or (b.code = 'loyal'         and v_loyal     >= b.goal)
     or (b.code = 'explorer'      and v_types     >= b.goal)
  on conflict do nothing
  returning badge_code;
end $$;

-- Progression du passeport (écran Profil)
create or replace function public.passport(p_user uuid default null)
returns table (code text, name text, description text, goal integer, progress integer, earned_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
begin
  if v_user is distinct from auth.uid() and not public.can_see_attendance(v_user) then
    raise exception 'Passeport non visible';
  end if;
  return query
  with c as (
    select e.organizer_id, v.city, v.country, e.id as event_id
    from public.checkins ck join public.events e on e.id = ck.event_id join public.venues v on v.id = e.venue_id
    where ck.user_id = v_user)
  select b.code, b.name, b.description, b.goal,
         least(b.goal, case b.code
           when 'first_steps'    then (select count(*) from c)::integer
           when 'tour_de_france' then (select count(distinct lower(city)) from c where country = 'FR')::integer
           when 'globetrotter'   then (select count(distinct country) from c)::integer
           when 'loyal'          then (select coalesce(max(n), 0) from (select count(*) n from c group by organizer_id) s)::integer
           when 'explorer'       then (select count(distinct et.type_id) from c join public.event_event_types et on et.event_id = c.event_id)::integer
           when 'pioneer'        then (case when ub.user_id is null then 0 else 1 end)
           else 0 end),
         ub.earned_at
  from public.badges b
  left join public.user_badges ub on ub.badge_code = b.code and ub.user_id = v_user
  order by b.sort_order;
end $$;

-- Validation de présence par géolocalisation.
-- La position reçue sert uniquement au calcul et n'est jamais enregistrée.
create or replace function public.check_in(p_event uuid, p_lat double precision, p_lon double precision)
returns table (result text, distance_m integer, new_badges text[])
language plpgsql security definer set search_path = public as $$
declare
  v_user     uuid := auth.uid();
  v_event    record;
  v_dist     double precision;
  v_radius   integer := public.setting_int('checkin_radius_m', 300);
  v_early    integer := public.setting_int('checkin_early_minutes', 60);
  v_inserted integer;
  v_badges   text[];
begin
  if v_user is null then
    raise exception 'Connexion requise';
  end if;

  select e.status, e.starts_at, e.ends_at, v.latitude, v.longitude into v_event
  from public.events e join public.venues v on v.id = e.venue_id where e.id = p_event;

  if not found or v_event.status <> 'published' then
    raise exception 'Soirée introuvable';
  end if;
  if now() < v_event.starts_at - make_interval(mins => v_early) or now() > v_event.ends_at then
    return query select 'outside_time_window'::text, null::integer, '{}'::text[];
    return;
  end if;

  v_dist := public.distance_m(p_lat, p_lon, v_event.latitude, v_event.longitude);
  if v_dist > v_radius then
    return query select 'too_far'::text, round(v_dist)::integer, '{}'::text[];
    return;
  end if;

  insert into public.checkins (user_id, event_id) values (v_user, p_event) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return query select 'already_validated'::text, round(v_dist)::integer, '{}'::text[];
    return;
  end if;

  select coalesce(array_agg(b), '{}') into v_badges from public.award_badges(v_user) b;
  return query select 'validated'::text, round(v_dist)::integer, v_badges;
end $$;

-- Validation / refus d'une soirée par l'admin (file « à valider »)
create or replace function public.moderate_event(p_event uuid, p_publish boolean, p_reason text default null)
returns public.event_status language plpgsql security definer set search_path = public as $$
declare v_status public.event_status;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administrateur';
  end if;
  update public.events
     set status = case when p_publish then 'published'::public.event_status else 'rejected'::public.event_status end,
         rejection_reason = case when p_publish then null else p_reason end
   where id = p_event
  returning status into v_status;
  if v_status is null then
    raise exception 'Soirée introuvable';
  end if;
  return v_status;
end $$;

-- =====================================================================
-- 13. Sécurité par ligne (RLS)
-- =====================================================================
alter table public.app_settings      enable row level security;
alter table public.profiles          enable row level security;
alter table public.member_follows    enable row level security;
alter table public.event_types       enable row level security;
alter table public.organizers        enable row level security;
alter table public.organizer_members enable row level security;
alter table public.venues            enable row level security;
alter table public.import_sources    enable row level security;
alter table public.events            enable row level security;
alter table public.event_event_types enable row level security;
alter table public.favorites         enable row level security;
alter table public.reminders         enable row level security;
alter table public.ticket_alerts     enable row level security;
alter table public.attendances       enable row level security;
alter table public.checkins          enable row level security;
alter table public.organizer_follows enable row level security;
alter table public.badges            enable row level security;
alter table public.user_badges       enable row level security;
alter table public.reports           enable row level security;
alter table public.push_tokens       enable row level security;

-- Réglages et référentiels : lecture publique, écriture admin
create policy "settings_read"  on public.app_settings for select using (true);
create policy "settings_admin" on public.app_settings for all using (public.is_admin()) with check (public.is_admin());

create policy "types_read"  on public.event_types for select using (true);
create policy "types_admin" on public.event_types for all using (public.is_admin()) with check (public.is_admin());

create policy "badges_read"  on public.badges for select using (true);
create policy "badges_admin" on public.badges for all using (public.is_admin()) with check (public.is_admin());

-- Profils
create policy "profiles_read" on public.profiles for select to authenticated
  using (id = auth.uid() or not is_invisible or public.is_admin());
create policy "profiles_insert_self" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "profiles_delete_self" on public.profiles for delete to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "member_follows_read" on public.member_follows for select to authenticated
  using (follower_id = auth.uid() or followed_id = auth.uid());
create policy "member_follows_own" on public.member_follows for insert to authenticated
  with check (follower_id = auth.uid());
create policy "member_follows_delete" on public.member_follows for delete to authenticated
  using (follower_id = auth.uid());

-- Organisateurs
create policy "organizers_read" on public.organizers for select using (true);
create policy "organizers_insert" on public.organizers for insert to authenticated
  with check (auth.uid() is not null);
create policy "organizers_update" on public.organizers for update to authenticated
  using (public.is_organizer_member(id) or public.is_admin())
  with check (public.is_organizer_member(id) or public.is_admin());
create policy "organizers_delete" on public.organizers for delete to authenticated
  using (public.is_admin());

create policy "org_members_read" on public.organizer_members for select to authenticated
  using (user_id = auth.uid() or public.is_organizer_member(organizer_id) or public.is_admin());
create policy "org_members_admin" on public.organizer_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Lieux
create policy "venues_read" on public.venues for select using (true);
create policy "venues_insert" on public.venues for insert to authenticated
  with check (auth.uid() is not null);
create policy "venues_update" on public.venues for update to authenticated
  using (public.is_admin() or created_by = auth.uid())
  with check (public.is_admin() or created_by = auth.uid());

-- Sources d'import : admin seulement
create policy "import_sources_admin" on public.import_sources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Soirées : publiées pour tous ; les autres pour l'organisateur et l'admin
create policy "events_read" on public.events for select
  using (status in ('published', 'cancelled')
         or public.is_organizer_member(organizer_id) or public.is_admin());
create policy "events_insert" on public.events for insert to authenticated
  with check (public.is_organizer_member(organizer_id) or public.is_admin());
create policy "events_update" on public.events for update to authenticated
  using (public.is_organizer_member(organizer_id) or public.is_admin())
  with check (public.is_organizer_member(organizer_id) or public.is_admin());
create policy "events_delete" on public.events for delete to authenticated
  using (public.is_admin());

create policy "event_types_link_read" on public.event_event_types for select
  using (exists (select 1 from public.events e where e.id = event_id));
create policy "event_types_link_write" on public.event_event_types for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id
                 and (public.is_organizer_member(e.organizer_id) or public.is_admin())))
  with check (exists (select 1 from public.events e where e.id = event_id
                 and (public.is_organizer_member(e.organizer_id) or public.is_admin())));

-- Favoris, rappels, alertes, suivis : chacun ne voit que les siens
create policy "favorites_own" on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reminders_own" on public.reminders for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ticket_alerts_own" on public.ticket_alerts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "organizer_follows_own" on public.organizer_follows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_tokens_own" on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- « Je participe » : visible selon les réglages de confidentialité du membre
create policy "attendances_read" on public.attendances for select to authenticated
  using (public.can_see_attendance(user_id));
create policy "attendances_insert" on public.attendances for insert to authenticated
  with check (user_id = auth.uid());
create policy "attendances_delete" on public.attendances for delete to authenticated
  using (user_id = auth.uid());

-- Présences validées : lecture seule (écriture uniquement via check_in)
create policy "checkins_read" on public.checkins for select to authenticated
  using (public.can_see_attendance(user_id));

-- Badges obtenus : visibles comme les sorties
create policy "user_badges_read" on public.user_badges for select to authenticated
  using (public.can_see_attendance(user_id));

-- Signalements
create policy "reports_insert" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "reports_read" on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy "reports_admin" on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- 14. Droits d'accès des rôles Supabase
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select on public.app_settings, public.event_types, public.badges, public.organizers,
                public.venues, public.events, public.event_event_types to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.checkins, public.user_badges from authenticated;
revoke execute on function public.award_badges(uuid) from public, anon, authenticated;
grant execute on function public.search_events(double precision, double precision, integer, timestamptz,
  timestamptz, smallint[], numeric, boolean, boolean, text, integer, integer) to anon, authenticated;
grant execute on function public.check_in(uuid, double precision, double precision) to authenticated;
grant execute on function public.passport(uuid) to authenticated;
grant execute on function public.moderate_event(uuid, boolean, text) to authenticated;
