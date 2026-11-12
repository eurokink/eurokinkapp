-- 25 : veille hebdomadaire — source « manuelle » (jamais lue par le robot) et types de soirée fournis par l'annonce
insert into public.import_sources (name, url, kind, is_active, default_types)
select 'Veille hebdomadaire (recherche web)', 'https://eurokink.eu/#veille', 'jsonld', false, '{multi}'
where not exists (select 1 from public.import_sources where url = 'https://eurokink.eu/#veille');

do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.import_event(uuid,jsonb)'::regprocedure);
  n := replace(d, '  select array_agg(id) into v_types from event_types where slug = any (s.default_types) and is_active;',
                  '  select array_agg(id) into v_types from event_types where is_active and slug in (select jsonb_array_elements_text(case when jsonb_typeof(p->''types'') = ''array'' then p->''types'' else ''[]''::jsonb end));
  if v_types is null then select array_agg(id) into v_types from event_types where slug = any (s.default_types) and is_active; end if;');
  if n = d then raise exception 'import_event : types introuvables'; end if;
  execute n;
end $mig$;
