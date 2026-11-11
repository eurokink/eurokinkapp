-- =====================================================================
-- EuroKink — comptes organisateurs : demandes, espace organisateur, stats
-- =====================================================================

-- 1. Demandes « Devenir organisateur » ---------------------------------
create type public.request_status as enum ('pending', 'approved', 'rejected');
create table public.organizer_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  name             text not null check (char_length(name) between 2 and 80),
  kind             public.organizer_kind not null default 'association',
  city             text check (char_length(city) <= 80),
  website          text check (char_length(website) <= 300),
  contact_email    text check (char_length(contact_email) <= 200),   -- privé : vu seulement par l'admin
  message          text check (char_length(message) <= 1000),
  status           public.request_status not null default 'pending',
  organizer_id     uuid references public.organizers (id) on delete set null,
  rejection_reason text,
  handled_by       uuid references public.profiles (id) on delete set null,
  handled_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index organizer_requests_pending_idx on public.organizer_requests (created_at) where status = 'pending';
alter table public.organizer_requests enable row level security;
revoke all on public.organizer_requests from anon, authenticated;   -- accès uniquement par les fonctions

-- 2. Vues des fiches (statistiques organisateur, 1 vue par membre et par jour)
create table public.event_views (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  day      date not null default current_date,
  primary key (event_id, user_id, day)
);
alter table public.event_views enable row level security;
revoke all on public.event_views from anon, authenticated;

create or replace function public.log_view(p_event uuid)
returns void language sql security definer set search_path = public as $$
  insert into event_views (event_id, user_id)
  select p_event, auth.uid() where auth.uid() is not null and exists (select 1 from events where id = p_event)
  on conflict do nothing;
$$;

-- 3. Garde-fous : seul l'admin renomme ou vérifie un organisateur ---------
create or replace function public.organizers_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_trusted() then
      new.is_verified := false;
    end if;
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    if new.is_verified is distinct from old.is_verified and not public.is_trusted() then
      raise exception 'Seul un administrateur peut vérifier un organisateur';
    end if;
    if new.name is distinct from old.name and not public.is_trusted() then
      raise exception 'Pour changer le nom de ton organisation, contacte l''équipe EuroKink';
    end if;
  end if;
  return new;
end $$;

-- Soirées : marquer « complet » ne fait pas repasser en validation ;
-- une soirée refusée corrigée par son organisateur repart en validation
create or replace function public.events_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_meta text[] := array['is_sold_out', 'updated_at', 'status', 'validated_at', 'validated_by', 'rejection_reason'];
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
      new.source := 'import';
      new.status := 'pending';
    else
      new.source := 'organizer';
      if public.is_organizer_verified(new.organizer_id) and public.is_organizer_member(new.organizer_id) then
        new.status := 'published';
        new.validated_at := now();
      else
        new.status := 'pending';
      end if;
      new.import_raw := null;
    end if;
  else
    if new.status is distinct from old.status and not public.is_trusted() then
      if not ((new.status = 'cancelled' or (new.status = 'pending' and old.status = 'rejected'))
              and public.is_organizer_member(old.organizer_id)) then
        raise exception 'Changement de statut réservé à l''administrateur';
      end if;
    end if;
    if new.status = 'published' and old.status <> 'published' then
      new.validated_by := auth.uid();
      new.validated_at := now();
    end if;
    if old.status = 'published' and new.status = 'published' and not public.is_trusted()
       and not public.is_organizer_verified(old.organizer_id)
       and (to_jsonb(new) - v_meta) is distinct from (to_jsonb(old) - v_meta) then
      new.status := 'pending';
    end if;
    new.source := old.source;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

-- 4. Proposer OU modifier une soirée ------------------------------------
--   p.id           : soirée à modifier (organisateur membre ou admin)
--   p.organizer_id : organisation choisie par un organisateur
--   sinon          : signalement d'un membre (organisateur indiqué par son nom)
create or replace function public.submit_event(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_cur   public.events%rowtype;
  v_given uuid;
  v_org   uuid;
  v_venue uuid;
  v_event uuid;
  v_status public.event_status;
  v_types smallint[];
  v_new_org boolean := false;
  v_org_name text := btrim(coalesce(p->>'organizer_name', ''));
  v_venue_name text := btrim(coalesce(p->>'venue_name', ''));
  v_city  text := btrim(coalesce(p->>'city', ''));
  v_title text := btrim(coalesce(p->>'title', ''));
  v_lat double precision;
  v_lon double precision;
  v_start timestamptz;
  v_end   timestamptz;
  v_sales timestamptz;
  v_url   text := nullif(btrim(coalesce(p->>'ticket_url', '')), '');
  v_site  text := nullif(btrim(coalesce(p->>'organizer_website', '')), '');
begin
  if v_uid is null or not exists (select 1 from profiles where id = v_uid) then
    raise exception 'Connecte-toi pour proposer une soirée';
  end if;
  begin
    v_id := nullif(p->>'id', '')::uuid;
    v_given := nullif(p->>'organizer_id', '')::uuid;
    v_lat := (p->>'latitude')::double precision;
    v_lon := (p->>'longitude')::double precision;
    v_start := (p->>'starts_at')::timestamptz;
    v_end := (p->>'ends_at')::timestamptz;
    v_sales := nullif(p->>'sales_open_at', '')::timestamptz;
  exception when others then
    raise exception 'Date ou lieu invalide';
  end;

  if v_id is not null then
    select * into v_cur from events where id = v_id;
    if not found or not (public.is_admin() or public.is_organizer_member(v_cur.organizer_id)) then
      raise exception 'Tu ne peux pas modifier cette soirée';
    end if;
    if v_cur.status = 'cancelled' then raise exception 'Cette soirée est annulée'; end if;
  elsif not public.is_admin()
     and (select count(*) from events where created_by = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Limite atteinte : 10 propositions par jour au maximum';
  end if;

  if char_length(v_title) not between 3 and 120 then raise exception 'Titre : 3 à 120 caractères'; end if;
  if v_id is null and v_given is null and char_length(v_org_name) not between 2 and 80 then raise exception 'Organisateur : 2 à 80 caractères'; end if;
  if char_length(v_venue_name) not between 2 and 120 then raise exception 'Nom du lieu : 2 à 120 caractères'; end if;
  if char_length(v_city) not between 1 and 80 then raise exception 'Ville manquante'; end if;
  if char_length(coalesce(p->>'description', '')) > 4000 then raise exception 'Description trop longue (4 000 caractères maximum)'; end if;
  if v_lat is null or v_lon is null then raise exception 'Choisis l''adresse dans la liste proposée'; end if;
  if v_lat not between 41 and 52 or v_lon not between -6 and 10 then raise exception 'Le lieu doit se trouver en France'; end if;
  if v_start is null or v_end is null then raise exception 'Dates de début et de fin obligatoires'; end if;
  if v_start < now() and (v_id is null or v_start <> v_cur.starts_at) then raise exception 'La soirée doit être à venir'; end if;
  if v_end <= v_start then raise exception 'La fin doit être après le début'; end if;
  if v_end > v_start + interval '7 days' then raise exception 'Une soirée dure 7 jours au maximum'; end if;
  if v_start > now() + interval '2 years' then raise exception 'Date trop lointaine'; end if;
  if coalesce(p->>'dress_code', '') not in ('required', 'recommended', 'free') then raise exception 'Dress code invalide'; end if;
  if coalesce(p->>'booking', '') not in ('required', 'recommended', 'door_only') then raise exception 'Réservation invalide'; end if;
  if coalesce(p->>'frequency', 'once') not in ('once', 'weekly', 'monthly', 'yearly') then raise exception 'Fréquence invalide'; end if;
  if coalesce(p->>'organizer_kind', 'other') not in ('club', 'bar', 'association', 'group', 'other') then raise exception 'Type d''organisateur invalide'; end if;
  if v_url is not null and v_url !~* '^https?://[^\s]+$' then raise exception 'Lien de billetterie invalide (il doit commencer par https://)'; end if;
  if v_site is not null and v_site !~* '^https?://[^\s]+$' then raise exception 'Site de l''organisateur invalide (il doit commencer par https://)'; end if;
  if coalesce((p->>'price')::numeric, 0) not between 0 and 1000
     or coalesce((p->>'presale_price')::numeric, 0) not between 0 and 1000 then
    raise exception 'Prix invalide';
  end if;

  select array_agg(id) into v_types
    from event_types
   where is_active and slug in (select jsonb_array_elements_text(coalesce(p->'types', '[]'::jsonb)));
  if coalesce(cardinality(v_types), 0) not between 1 and 4 then raise exception 'Choisis entre 1 et 4 types'; end if;

  -- Organisation
  if v_id is not null then
    v_org := v_cur.organizer_id;
  elsif v_given is not null then
    if not (public.is_admin() or public.is_organizer_member(v_given)) then
      raise exception 'Tu ne gères pas cette organisation';
    end if;
    v_org := v_given;
  else
    select id into v_org from organizers where lower(name) = lower(v_org_name)
     order by is_verified desc, created_at limit 1;
    if v_org is null then
      insert into organizers (name, kind, website, city, created_by)
      values (v_org_name, coalesce(p->>'organizer_kind', 'other')::public.organizer_kind, v_site, v_city, v_uid)
      returning id into v_org;
      v_new_org := true;
    end if;
  end if;

  -- Lieu
  select id into v_venue from venues
   where lower(name) = lower(v_venue_name) and lower(city) = lower(v_city) limit 1;
  if v_venue is null then
    insert into venues (name, address, postal_code, city, country, latitude, longitude, created_by)
    values (v_venue_name, nullif(btrim(coalesce(p->>'address', '')), ''), nullif(btrim(coalesce(p->>'postal_code', '')), ''),
            v_city, 'FR', v_lat, v_lon, v_uid)
    returning id into v_venue;
  end if;

  if v_id is null then
    insert into events (organizer_id, venue_id, title, description, starts_at, ends_at, dress_code, dress_code_details,
                        price, presale_price, booking, ticket_url, sales_open_at, has_cloakroom, cloakroom_paid, frequency, created_by)
    values (v_org, v_venue, v_title, nullif(btrim(coalesce(p->>'description', '')), ''), v_start, v_end,
            (p->>'dress_code')::public.dress_code_level, nullif(btrim(coalesce(p->>'dress_code_details', '')), ''),
            coalesce((p->>'price')::numeric, 0), (p->>'presale_price')::numeric,
            (p->>'booking')::public.booking_policy, v_url, v_sales,
            (p->>'has_cloakroom')::boolean, (p->>'cloakroom_paid')::boolean,
            coalesce(p->>'frequency', 'once')::public.event_frequency, v_uid)
    returning id, status into v_event, v_status;
    -- un simple signalement ne fait pas du membre le gestionnaire de l'organisation
    if v_new_org and not public.is_admin() then
      delete from organizer_members where organizer_id = v_org and user_id = v_uid;
    end if;
  else
    update events set venue_id = v_venue, title = v_title,
           description = nullif(btrim(coalesce(p->>'description', '')), ''),
           starts_at = v_start, ends_at = v_end,
           dress_code = (p->>'dress_code')::public.dress_code_level,
           dress_code_details = nullif(btrim(coalesce(p->>'dress_code_details', '')), ''),
           price = coalesce((p->>'price')::numeric, 0), presale_price = (p->>'presale_price')::numeric,
           booking = (p->>'booking')::public.booking_policy, ticket_url = v_url, sales_open_at = v_sales,
           has_cloakroom = (p->>'has_cloakroom')::boolean, cloakroom_paid = (p->>'cloakroom_paid')::boolean,
           frequency = coalesce(p->>'frequency', 'once')::public.event_frequency,
           status = case when status = 'rejected' then 'pending'::public.event_status else status end,
           rejection_reason = case when status = 'rejected' then null else rejection_reason end
     where id = v_id
    returning id, status into v_event, v_status;
    delete from event_event_types where event_id = v_id;
  end if;

  insert into event_event_types (event_id, type_id) select v_event, unnest(v_types);
  return jsonb_build_object('id', v_event, 'status', v_status);
end $$;

-- 5. Côté organisateur ---------------------------------------------------
create or replace function public.request_organizer(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := btrim(coalesce(p->>'name', ''));
  v_site text := nullif(btrim(coalesce(p->>'website', '')), '');
  v_mail text := nullif(btrim(coalesce(p->>'contact_email', '')), '');
  v_id   uuid;
begin
  if v_uid is null or not exists (select 1 from profiles where id = v_uid) then raise exception 'Connecte-toi d''abord'; end if;
  if exists (select 1 from organizer_requests where user_id = v_uid and status = 'pending') then
    raise exception 'Ta demande précédente est encore en cours d''examen';
  end if;
  if (select count(*) from organizer_requests where user_id = v_uid and created_at > now() - interval '7 days') >= 3 then
    raise exception 'Trop de demandes cette semaine : réessaie plus tard';
  end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'Nom de l''organisation : 2 à 80 caractères'; end if;
  if coalesce(p->>'kind', 'association') not in ('club', 'bar', 'association', 'group', 'other') then raise exception 'Type invalide'; end if;
  if v_site is null or v_site !~* '^https?://[^\s]+$' then raise exception 'Indique le site ou la page officielle (lien commençant par https://)'; end if;
  if v_mail is null or v_mail !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse e-mail de contact invalide'; end if;
  if char_length(coalesce(p->>'message', '')) > 1000 then raise exception 'Message trop long'; end if;
  insert into organizer_requests (user_id, name, kind, city, website, contact_email, message)
  values (v_uid, v_name, coalesce(p->>'kind', 'association')::public.organizer_kind,
          nullif(btrim(coalesce(p->>'city', '')), ''), v_site, v_mail, nullif(btrim(coalesce(p->>'message', '')), ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'pending');
end $$;

-- Mes organisations et ma dernière demande
create or replace function public.my_organizer_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'organizations', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'kind', o.kind, 'is_verified', o.is_verified) order by o.name), '[]'::jsonb)
                        from organizer_members m join organizers o on o.id = m.organizer_id where m.user_id = auth.uid()),
    'request', (select jsonb_build_object('name', r.name, 'status', r.status, 'rejection_reason', r.rejection_reason, 'created_at', r.created_at)
                  from organizer_requests r where r.user_id = auth.uid() order by r.created_at desc limit 1));
$$;

-- Tableau de bord d'une organisation : fiche, abonnés, soirées et statistiques
create or replace function public.org_dashboard(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not (public.is_admin() or public.is_organizer_member(p_org)) then raise exception 'Tu ne gères pas cette organisation'; end if;
  select jsonb_build_object(
    'organizer', jsonb_build_object('id', o.id, 'name', o.name, 'kind', o.kind, 'city', o.city, 'website', o.website,
                                    'description', o.description, 'is_verified', o.is_verified,
                                    'followers', (select count(*) from organizer_follows f where f.organizer_id = o.id)),
    'events', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'title', e.title, 'description', e.description, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
        'price', e.price, 'presale_price', e.presale_price, 'dress_code', e.dress_code, 'dress_code_details', e.dress_code_details,
        'booking', e.booking, 'ticket_url', e.ticket_url, 'sales_open_at', e.sales_open_at, 'is_sold_out', e.is_sold_out,
        'has_cloakroom', e.has_cloakroom, 'cloakroom_paid', e.cloakroom_paid, 'frequency', e.frequency,
        'status', e.status, 'rejection_reason', e.rejection_reason,
        'venue', jsonb_build_object('name', ve.name, 'address', ve.address, 'postal_code', ve.postal_code, 'city', ve.city,
                                    'latitude', ve.latitude, 'longitude', ve.longitude),
        'types', (select coalesce(jsonb_agg(t.slug order by t.sort_order), '[]'::jsonb)
                    from event_event_types et join event_types t on t.id = et.type_id where et.event_id = e.id),
        'stats', jsonb_build_object(
           'views', (select count(distinct user_id) from event_views x where x.event_id = e.id),
           'favorites', (select count(*) from favorites x where x.event_id = e.id),
           'attending', (select count(*) from attendances x where x.event_id = e.id),
           'reminders', (select count(*) from reminders x where x.event_id = e.id),
           'alerts', (select count(*) from ticket_alerts x where x.event_id = e.id),
           'checkins', (select count(*) from checkins x where x.event_id = e.id)))
        order by e.starts_at desc), '[]'::jsonb)
        from events e join venues ve on ve.id = e.venue_id where e.organizer_id = o.id))
    into v from organizers o where o.id = p_org;
  return v;
end $$;

-- Marquer complet / disponible, annuler
create or replace function public.org_event_action(p_event uuid, p_action text)
returns public.event_status language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_status public.event_status;
begin
  select organizer_id into v_org from events where id = p_event;
  if v_org is null or not (public.is_admin() or public.is_organizer_member(v_org)) then raise exception 'Tu ne gères pas cette soirée'; end if;
  if p_action = 'soldout' then update events set is_sold_out = true where id = p_event returning status into v_status;
  elsif p_action = 'available' then update events set is_sold_out = false where id = p_event returning status into v_status;
  elsif p_action = 'cancel' then update events set status = 'cancelled' where id = p_event returning status into v_status;
  else raise exception 'Action inconnue'; end if;
  return v_status;
end $$;

-- Page publique d'un organisateur
create or replace function public.organizer_public(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'name', o.name, 'kind', o.kind, 'city', o.city, 'website', o.website,
           'description', o.description, 'is_verified', o.is_verified,
           'followers', (select count(*) from organizer_follows f where f.organizer_id = o.id),
           'following', exists (select 1 from organizer_follows f where f.organizer_id = o.id and f.user_id = auth.uid()),
           'manager', public.is_organizer_member(o.id))
    from organizers o where o.id = p_org and auth.uid() is not null;
$$;

-- 6. Admin : demandes d'organisateurs -----------------------------------
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_pending jsonb; v_reports jsonb; v_requests jsonb;
begin
  if not public.is_admin() then raise exception 'Réservé à l''administrateur'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'title', e.title, 'description', e.description,
           'starts_at', e.starts_at, 'ends_at', e.ends_at, 'price', e.price, 'presale_price', e.presale_price,
           'dress_code', e.dress_code, 'dress_code_details', e.dress_code_details, 'booking', e.booking,
           'ticket_url', e.ticket_url, 'sales_open_at', e.sales_open_at,
           'has_cloakroom', e.has_cloakroom, 'cloakroom_paid', e.cloakroom_paid, 'frequency', e.frequency,
           'source', e.source, 'created_at', e.created_at,
           'organizer', jsonb_build_object('id', o.id, 'name', o.name, 'kind', o.kind, 'website', o.website, 'is_verified', o.is_verified),
           'venue', jsonb_build_object('name', v.name, 'address', v.address, 'postal_code', v.postal_code, 'city', v.city,
                                       'latitude', v.latitude, 'longitude', v.longitude),
           'types', (select coalesce(jsonb_agg(t.slug order by t.sort_order), '[]'::jsonb)
                       from event_event_types et join event_types t on t.id = et.type_id where et.event_id = e.id),
           'submitter', (select pseudo from profiles where id = e.created_by),
           'by_manager', exists (select 1 from organizer_members m where m.organizer_id = o.id and m.user_id = e.created_by))
         order by e.created_at), '[]'::jsonb)
    into v_pending
    from events e join organizers o on o.id = e.organizer_id join venues v on v.id = e.venue_id
   where e.status = 'pending';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'reason', r.reason, 'details', r.details, 'created_at', r.created_at,
           'target_type', r.target_type, 'target_id', r.target_id,
           'reporter', (select pseudo from profiles where id = r.reporter_id),
           'event_title', (select title from events where id = r.target_id),
           'event_status', (select status from events where id = r.target_id))
         order by r.created_at), '[]'::jsonb)
    into v_reports
    from reports r where r.status = 'open';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'name', q.name, 'kind', q.kind, 'city', q.city, 'website', q.website,
           'contact_email', q.contact_email, 'message', q.message, 'created_at', q.created_at,
           'requester', (select pseudo from profiles where id = q.user_id),
           'existing', (select jsonb_build_object('id', o.id, 'name', o.name, 'is_verified', o.is_verified,
                               'managers', (select count(*) from organizer_members m where m.organizer_id = o.id))
                          from organizers o where lower(o.name) = lower(q.name) order by o.is_verified desc limit 1))
         order by q.created_at), '[]'::jsonb)
    into v_requests
    from organizer_requests q where q.status = 'pending';

  return jsonb_build_object('pending', v_pending, 'reports', v_reports, 'requests', v_requests);
end $$;

create or replace function public.handle_organizer_request(p_request uuid, p_approve boolean, p_trust boolean default false, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.organizer_requests%rowtype; v_org uuid;
begin
  if not public.is_admin() then raise exception 'Réservé à l''administrateur'; end if;
  select * into r from organizer_requests where id = p_request and status = 'pending';
  if not found then raise exception 'Demande introuvable ou déjà traitée'; end if;
  if p_approve then
    select id into v_org from organizers where lower(name) = lower(r.name) order by is_verified desc, created_at limit 1;
    if v_org is null then
      insert into organizers (name, kind, website, city, created_by)
      values (r.name, r.kind, r.website, r.city, r.user_id) returning id into v_org;
    end if;
    insert into organizer_members (organizer_id, user_id) values (v_org, r.user_id) on conflict do nothing;
    if p_trust then update organizers set is_verified = true where id = v_org; end if;
    update organizer_requests set status = 'approved', organizer_id = v_org, handled_by = auth.uid(), handled_at = now() where id = r.id;
  else
    update organizer_requests set status = 'rejected', rejection_reason = nullif(btrim(coalesce(p_reason, '')), ''),
           handled_by = auth.uid(), handled_at = now() where id = r.id;
  end if;
  return v_org;
end $$;

-- 7. Droits --------------------------------------------------------------
revoke execute on function public.log_view(uuid) from public, anon;
revoke execute on function public.request_organizer(jsonb) from public, anon;
revoke execute on function public.my_organizer_status() from public, anon;
revoke execute on function public.org_dashboard(uuid) from public, anon;
revoke execute on function public.org_event_action(uuid, text) from public, anon;
revoke execute on function public.organizer_public(uuid) from public, anon;
revoke execute on function public.handle_organizer_request(uuid, boolean, boolean, text) from public, anon;
revoke execute on function public.submit_event(jsonb) from public, anon;
revoke execute on function public.admin_dashboard() from public, anon;
grant execute on function public.log_view(uuid), public.request_organizer(jsonb), public.my_organizer_status(),
  public.org_dashboard(uuid), public.org_event_action(uuid, text), public.organizer_public(uuid),
  public.handle_organizer_request(uuid, boolean, boolean, text), public.submit_event(jsonb), public.admin_dashboard() to authenticated;
