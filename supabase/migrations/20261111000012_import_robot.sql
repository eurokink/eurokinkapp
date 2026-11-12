-- =====================================================================
-- EuroKink — robot d'import gratuit (iCal, données structurées, WordPress)
-- =====================================================================
alter table public.import_sources
  add column if not exists kind          text not null default 'jsonld' check (kind in ('ical', 'jsonld', 'tribe')),
  add column if not exists default_types text[] not null default '{multi}',
  add column if not exists last_found    integer,
  add column if not exists last_added    integer,
  add column if not exists last_error    text;

alter table public.events add column if not exists external_id text;
create unique index if not exists events_import_uniq on public.events (import_source_id, external_id)
  where import_source_id is not null and external_id is not null;

insert into public.app_settings (key, value, description)
values ('import_last_run', '"1970-01-01T00:00:00Z"', 'Dernier passage automatique du robot d''import')
on conflict (key) do nothing;

-- Une soirée trouvée par le robot -> file de validation (jamais publiée directement)
create or replace function public.import_event(p_source uuid, p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  s public.import_sources%rowtype;
  v_ext   text := left(btrim(coalesce(p->>'external_id', '')), 300);
  v_title text := left(btrim(coalesce(p->>'title', '')), 120);
  v_city  text := left(btrim(coalesce(p->>'city', '')), 80);
  v_vname text := left(btrim(coalesce(nullif(p->>'venue_name', ''), p->>'city', '')), 120);
  v_start timestamptz; v_end timestamptz;
  v_lat double precision; v_lon double precision;
  v_org uuid; v_venue uuid; v_event uuid; v_types smallint[];
  v_url text := nullif(btrim(coalesce(p->>'ticket_url', '')), '');
  v_img text := nullif(btrim(coalesce(p->>'image', '')), '');
  v_price numeric;
begin
  select * into s from import_sources where id = p_source;
  if not found then return 'source inconnue'; end if;
  begin
    v_start := (p->>'starts_at')::timestamptz;
    v_end := nullif(p->>'ends_at', '')::timestamptz;
    v_lat := (p->>'latitude')::double precision;
    v_lon := (p->>'longitude')::double precision;
    v_price := nullif(p->>'price', '')::numeric;
  exception when others then return 'données invalides';
  end;
  if v_ext = '' or char_length(v_title) < 3 or v_start is null then return 'incomplète'; end if;
  if v_start < now() or v_start > now() + interval '18 months' then return 'hors période'; end if;
  if v_lat is null or v_lon is null or v_lat not between 41 and 52 or v_lon not between -6 and 10 then return 'hors France'; end if;
  if v_city = '' then return 'incomplète'; end if;
  if v_end is null or v_end <= v_start or v_end > v_start + interval '7 days' then v_end := v_start + interval '5 hours'; end if;
  if exists (select 1 from events where import_source_id = s.id and external_id = v_ext) then return 'déjà connue'; end if;
  if v_url is not null and v_url !~* '^https?://[^\s]+$' then v_url := null; end if;
  if v_img is not null and v_img !~* '^https://[^\s"''<>]+$' then v_img := null; end if;
  if v_price is null or v_price not between 0 and 1000 then v_price := 0; end if;

  v_org := s.organizer_id;
  if v_org is null then
    select id into v_org from organizers where lower(name) = lower(coalesce(nullif(p->>'organizer_name', ''), s.name)) limit 1;
    if v_org is null then
      insert into organizers (name, kind, website) values (left(coalesce(nullif(p->>'organizer_name', ''), s.name), 80), 'other', null)
      returning id into v_org;
    end if;
  end if;
  -- même organisateur, même jour, même titre : déjà présente (ajout manuel par exemple)
  if exists (select 1 from events where organizer_id = v_org and lower(title) = lower(v_title)
             and starts_at::date = v_start::date and status <> 'rejected') then return 'déjà connue'; end if;

  select id into v_venue from venues where lower(name) = lower(v_vname) and lower(city) = lower(v_city) limit 1;
  if v_venue is null then
    insert into venues (name, address, postal_code, city, country, latitude, longitude)
    values (v_vname, nullif(left(btrim(coalesce(p->>'address', '')), 200), ''), nullif(left(btrim(coalesce(p->>'postal_code', '')), 10), ''),
            v_city, 'FR', v_lat, v_lon)
    returning id into v_venue;
  end if;

  insert into events (organizer_id, venue_id, title, description, starts_at, ends_at, dress_code, price, booking, ticket_url,
                      frequency, image_path, import_source_id, external_id, import_raw)
  values (v_org, v_venue, v_title, nullif(left(btrim(coalesce(p->>'description', '')), 4000), ''), v_start, v_end,
          'recommended', v_price, 'recommended', v_url, 'once', v_img, s.id, v_ext, p)
  returning id into v_event;

  select array_agg(id) into v_types from event_types where slug = any (s.default_types) and is_active;
  if v_types is null then select array_agg(id) into v_types from event_types where slug = 'multi'; end if;
  insert into event_event_types (event_id, type_id) select v_event, unnest(v_types);
  return 'ajoutée';
end $$;

create or replace function public.import_finish(p_source uuid, p_found integer, p_added integer, p_error text)
returns void language sql security definer set search_path = public as $$
  update import_sources set last_read_at = now(), last_found = p_found, last_added = p_added,
         last_error = nullif(left(p_error, 500), '') where id = p_source;
$$;

-- Réservées au robot (clé de service), jamais aux membres
revoke execute on function public.import_event(uuid, jsonb), public.import_finish(uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.import_event(uuid, jsonb), public.import_finish(uuid, integer, integer, text) to service_role;
