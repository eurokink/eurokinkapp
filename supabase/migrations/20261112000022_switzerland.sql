-- 22 : la Suisse rejoint EuroKink — pays du lieu et devise de la soirée (EUR ou CHF)
alter table public.events
  add column if not exists currency char(3) not null default 'EUR' check (currency in ('EUR', 'CHF'));

-- submit_event et event_for_edit : modifiés par remplacements ciblés (chaque remplacement est vérifié)
do $mig$
declare d text; n text;
  procedure_rep text[][] := array[
    ['  v_site  text := nullif(btrim(coalesce(p->>''organizer_website'', '''')), '''');',
     '  v_site  text := nullif(btrim(coalesce(p->>''organizer_website'', '''')), '''');
  v_country text := upper(coalesce(nullif(btrim(p->>''country''), ''''), ''FR''));
  v_money char(3) := case when upper(coalesce(p->>''currency'', '''')) = ''CHF'' then ''CHF'' else ''EUR'' end;'],
    ['  if v_lat not between 41 and 52 or v_lon not between -6 and 10 then raise exception ''Le lieu doit se trouver en France''; end if;',
     '  if v_country not in (''FR'', ''CH'') then raise exception ''Pays non pris en charge pour le moment''; end if;
  if v_lat not between 41 and 52 or v_lon not between -6 and 11 then raise exception ''Le lieu doit se trouver en France ou en Suisse''; end if;'],
    ['   where lower(name) = lower(v_venue_name) and lower(city) = lower(v_city) limit 1;',
     '   where lower(name) = lower(v_venue_name) and lower(city) = lower(v_city) and country = v_country limit 1;'],
    ['            v_city, ''FR'', v_lat, v_lon, v_uid)', '            v_city, v_country, v_lat, v_lon, v_uid)'],
    ['has_cloakroom, cloakroom_paid, frequency, created_by)', 'has_cloakroom, cloakroom_paid, frequency, created_by, currency)'],
    ['            coalesce(p->>''frequency'', ''once'')::public.event_frequency, v_uid)', '            coalesce(p->>''frequency'', ''once'')::public.event_frequency, v_uid, v_money)'],
    ['           frequency = coalesce(p->>''frequency'', ''once'')::public.event_frequency,',
     '           frequency = coalesce(p->>''frequency'', ''once'')::public.event_frequency, currency = v_money,']
  ];
  i int;
begin
  d := pg_get_functiondef('public.submit_event(jsonb)'::regprocedure);
  for i in 1 .. array_length(procedure_rep, 1) loop
    n := replace(d, procedure_rep[i][1], procedure_rep[i][2]);
    if n = d then raise exception 'submit_event : remplacement % introuvable', i; end if;
    d := n;
  end loop;
  execute d;

  d := pg_get_functiondef('public.event_for_edit(uuid)'::regprocedure);
  n := replace(d, '''organizer_id'', e.organizer_id,', '''organizer_id'', e.organizer_id, ''currency'', e.currency,');
  if n = d then raise exception 'event_for_edit : organizer_id introuvable'; end if;
  d := replace(n, '''latitude'', ve.latitude, ''longitude'', ve.longitude)', '''latitude'', ve.latitude, ''longitude'', ve.longitude, ''country'', ve.country)');
  if d = n then raise exception 'event_for_edit : venue introuvable'; end if;
  execute d;
end $mig$;
