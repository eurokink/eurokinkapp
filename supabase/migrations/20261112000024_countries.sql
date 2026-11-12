-- 24 : pays ouverts dans l'appli (ajouter un pays = ajouter une ligne) — utilisés par les soirées proposées et le robot d'import
create table if not exists public.countries (
  code     char(2) primary key,
  name_fr  text not null,
  currency char(3) not null default 'EUR' check (currency in ('EUR', 'CHF')),
  timezone text not null default 'Europe/Paris',
  enabled  boolean not null default true,
  added_at timestamptz not null default now()
);
alter table public.countries enable row level security;
drop policy if exists countries_read on public.countries;
create policy countries_read on public.countries for select to anon, authenticated using (true);
drop policy if exists countries_admin on public.countries;
create policy countries_admin on public.countries for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.countries (code, name_fr, currency, timezone) values
  ('FR', 'France', 'EUR', 'Europe/Paris'), ('BE', 'Belgique', 'EUR', 'Europe/Brussels'),
  ('CH', 'Suisse', 'CHF', 'Europe/Zurich'), ('DE', 'Allemagne', 'EUR', 'Europe/Berlin')
on conflict (code) do nothing;

do $mig$
declare d text; n text;
begin
  -- Soirées proposées : pays ouverts au lieu d'une liste figée
  d := pg_get_functiondef('public.submit_event(jsonb)'::regprocedure);
  n := replace(d, 'if v_country not in (''FR'', ''CH'', ''BE'', ''DE'') then raise exception ''Pays non pris en charge pour le moment''; end if;',
                  'if not exists (select 1 from countries where code = v_country and enabled) then raise exception ''Pays non pris en charge pour le moment''; end if;');
  if n = d then raise exception 'submit_event : liste des pays introuvable'; end if;
  d := replace(n, 'if v_lat not between 41 and 55.2 or v_lon not between -6 and 15.2 then raise exception ''Le lieu doit se trouver en France, en Belgique, en Suisse ou en Allemagne''; end if;',
                  'if v_lat not between 27 and 72 or v_lon not between -32 and 45 then raise exception ''Le lieu doit se trouver en Europe''; end if;');
  if d = n then raise exception 'submit_event : zone introuvable'; end if;
  execute d;

  -- Robot : pays fourni par le géocodage, devise du pays
  d := pg_get_functiondef('public.import_event(uuid,jsonb)'::regprocedure);
  n := replace(d, '  v_price numeric;', '  v_price numeric;
  v_country char(2) := upper(left(coalesce(nullif(btrim(p->>''country''), ''''), ''FR''), 2));
  v_money char(3);');
  if n = d then raise exception 'import_event : déclarations introuvables'; end if;
  d := replace(n, 'if v_lat is null or v_lon is null or v_lat not between 41 and 52 or v_lon not between -6 and 10 then return ''hors France''; end if;',
                  'select currency into v_money from countries where code = v_country and enabled;
  if v_money is null then return ''pays non ouvert''; end if;
  if v_lat is null or v_lon is null or v_lat not between 27 and 72 or v_lon not between -32 and 45 then return ''hors Europe''; end if;');
  if d = n then raise exception 'import_event : contrôle de zone introuvable'; end if;
  n := replace(d, 'select id into v_venue from venues where lower(name) = lower(v_vname) and lower(city) = lower(v_city) limit 1;',
                  'select id into v_venue from venues where lower(name) = lower(v_vname) and lower(city) = lower(v_city) and country = v_country limit 1;');
  if n = d then raise exception 'import_event : recherche du lieu introuvable'; end if;
  d := replace(n, '            v_city, ''FR'', v_lat, v_lon)', '            v_city, v_country, v_lat, v_lon)');
  if d = n then raise exception 'import_event : pays du lieu introuvable'; end if;
  n := replace(d, 'frequency, image_path, import_source_id, external_id, import_raw)', 'frequency, image_path, import_source_id, external_id, import_raw, currency)');
  if n = d then raise exception 'import_event : colonnes introuvables'; end if;
  d := replace(n, '''recommended'', v_url, ''once'', v_img, s.id, v_ext, p)', '''recommended'', v_url, ''once'', v_img, s.id, v_ext, p, v_money)');
  if d = n then raise exception 'import_event : valeurs introuvables'; end if;
  execute d;
end $mig$;
