-- admin_stats : « abonnés orgas » = nombre de membres distincts qui suivent au moins un organisateur
-- (avant : nombre d'abonnements, un membre qui suit 2 organisateurs comptait 2 fois).
-- Appliqué en base en remplaçant, dans admin_stats(), l'expression de 'org_follows' par :
--   (select count(distinct user_id) from organizer_follows)
do $$ declare d text; begin
  select pg_get_functiondef('public.admin_stats()'::regprocedure) into d;
  d := replace(d, $x$(select count(*) from organizer_follows)$x$, $x$(select count(distinct user_id) from organizer_follows)$x$);
  execute d;
end $$;
