-- 23 : Belgique et Allemagne acceptées pour les soirées
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.submit_event(jsonb)'::regprocedure);
  n := replace(d, 'if v_country not in (''FR'', ''CH'') then', 'if v_country not in (''FR'', ''CH'', ''BE'', ''DE'') then');
  if n = d then raise exception 'submit_event : liste des pays introuvable'; end if;
  d := replace(n, 'if v_lat not between 41 and 52 or v_lon not between -6 and 11 then raise exception ''Le lieu doit se trouver en France ou en Suisse''; end if;',
                  'if v_lat not between 41 and 55.2 or v_lon not between -6 and 15.2 then raise exception ''Le lieu doit se trouver en France, en Belgique, en Suisse ou en Allemagne''; end if;');
  if d = n then raise exception 'submit_event : zone introuvable'; end if;
  execute d;
end $mig$;
