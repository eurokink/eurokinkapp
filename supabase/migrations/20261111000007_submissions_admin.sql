-- =====================================================================
-- EuroKink — propositions de soirées par les membres et espace admin
-- =====================================================================

-- Publication directe seulement pour un MEMBRE d'un organisateur vérifié
-- (sinon n'importe qui pourrait publier au nom d'un organisateur vérifié)
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

-- ---------------------------------------------------------------------
-- Proposer une soirée (formulaire de l'appli)
-- ---------------------------------------------------------------------
create or replace function public.submit_event(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_venue uuid;
  v_event uuid;
  v_status public.event_status;
  v_types smallint[];
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
  if not public.is_admin()
     and (select count(*) from events where created_by = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Limite atteinte : 10 propositions par jour au maximum';
  end if;

  -- Contrôles
  if char_length(v_title) not between 3 and 120 then raise exception 'Titre : 3 à 120 caractères'; end if;
  if char_length(v_org_name) not between 2 and 80 then raise exception 'Organisateur : 2 à 80 caractères'; end if;
  if char_length(v_venue_name) not between 2 and 120 then raise exception 'Nom du lieu : 2 à 120 caractères'; end if;
  if char_length(v_city) not between 1 and 80 then raise exception 'Ville manquante'; end if;
  if char_length(coalesce(p->>'description', '')) > 4000 then raise exception 'Description trop longue (4 000 caractères maximum)'; end if;
  begin
    v_lat := (p->>'latitude')::double precision;
    v_lon := (p->>'longitude')::double precision;
    v_start := (p->>'starts_at')::timestamptz;
    v_end := (p->>'ends_at')::timestamptz;
    v_sales := nullif(p->>'sales_open_at', '')::timestamptz;
  exception when others then
    raise exception 'Date ou lieu invalide';
  end;
  if v_lat is null or v_lon is null then raise exception 'Choisis l''adresse dans la liste proposée'; end if;
  if v_lat not between 41 and 52 or v_lon not between -6 and 10 then raise exception 'Le lieu doit se trouver en France'; end if;
  if v_start is null or v_end is null then raise exception 'Dates de début et de fin obligatoires'; end if;
  if v_start < now() then raise exception 'La soirée doit être à venir'; end if;
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

  -- Organisateur : réutilisé s'il existe déjà (même nom), sinon créé (non vérifié)
  select id into v_org from organizers where lower(name) = lower(v_org_name)
   order by is_verified desc, created_at limit 1;
  if v_org is null then
    insert into organizers (name, kind, website, city, created_by)
    values (v_org_name, coalesce(p->>'organizer_kind', 'other')::public.organizer_kind, v_site, v_city, v_uid)
    returning id into v_org;
  end if;

  -- Lieu : réutilisé s'il existe déjà (même nom, même ville), sinon créé
  select id into v_venue from venues
   where lower(name) = lower(v_venue_name) and lower(city) = lower(v_city) limit 1;
  if v_venue is null then
    insert into venues (name, address, postal_code, city, country, latitude, longitude, created_by)
    values (v_venue_name, nullif(btrim(coalesce(p->>'address', '')), ''), nullif(btrim(coalesce(p->>'postal_code', '')), ''),
            v_city, 'FR', v_lat, v_lon, v_uid)
    returning id into v_venue;
  end if;

  insert into events (organizer_id, venue_id, title, description, starts_at, ends_at, dress_code, dress_code_details,
                      price, presale_price, booking, ticket_url, sales_open_at, has_cloakroom, cloakroom_paid, frequency, created_by)
  values (v_org, v_venue, v_title, nullif(btrim(coalesce(p->>'description', '')), ''), v_start, v_end,
          (p->>'dress_code')::public.dress_code_level, nullif(btrim(coalesce(p->>'dress_code_details', '')), ''),
          coalesce((p->>'price')::numeric, 0), (p->>'presale_price')::numeric,
          (p->>'booking')::public.booking_policy, v_url, v_sales,
          (p->>'has_cloakroom')::boolean, (p->>'cloakroom_paid')::boolean,
          coalesce(p->>'frequency', 'once')::public.event_frequency, v_uid)
  returning id, status into v_event, v_status;

  insert into event_event_types (event_id, type_id) select v_event, unnest(v_types);
  return jsonb_build_object('id', v_event, 'status', v_status);
end $$;

-- Mes propositions et leur statut
create or replace function public.my_submissions()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'city', v.city,
           'status', e.status, 'rejection_reason', e.rejection_reason, 'created_at', e.created_at)
         order by e.created_at desc), '[]'::jsonb)
    from events e join venues v on v.id = e.venue_id
   where e.created_by = auth.uid() and auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------
-- Espace admin : file de validation et signalements
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_pending jsonb; v_reports jsonb;
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
           'submitter', (select pseudo from profiles where id = e.created_by))
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

  return jsonb_build_object('pending', v_pending, 'reports', v_reports);
end $$;

create or replace function public.handle_report(p_report uuid, p_dismiss boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''administrateur'; end if;
  update reports set status = case when p_dismiss then 'dismissed'::public.report_status else 'handled'::public.report_status end,
         handled_by = auth.uid(), handled_at = now()
   where id = p_report and status = 'open';
end $$;

revoke execute on function public.submit_event(jsonb) from public, anon;
revoke execute on function public.my_submissions() from public, anon;
revoke execute on function public.admin_dashboard() from public, anon;
revoke execute on function public.handle_report(uuid, boolean) from public, anon;
grant execute on function public.submit_event(jsonb) to authenticated;
grant execute on function public.my_submissions() to authenticated;
grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.handle_report(uuid, boolean) to authenticated;
