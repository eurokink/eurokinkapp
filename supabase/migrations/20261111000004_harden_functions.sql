-- =====================================================================
-- EuroKink — durcissement des droits sur les fonctions
-- (suite au contrôle de sécurité Supabase)
-- =====================================================================

-- Chemin de recherche figé pour toutes les fonctions
alter function public.distance_m(double precision, double precision, double precision, double precision)
  set search_path = public;

-- Fonctions de déclencheurs : jamais appelées directement
revoke execute on function public.profiles_guard()          from public, anon, authenticated;
revoke execute on function public.profiles_pioneer()        from public, anon, authenticated;
revoke execute on function public.organizers_guard()        from public, anon, authenticated;
revoke execute on function public.organizers_add_creator()  from public, anon, authenticated;
revoke execute on function public.events_guard()            from public, anon, authenticated;
revoke execute on function public.reminders_default()       from public, anon, authenticated;

-- Fonctions internes, utilisées uniquement par d'autres fonctions du serveur
revoke execute on function public.is_trusted()                       from public, anon, authenticated;
revoke execute on function public.is_organizer_verified(uuid)        from public, anon, authenticated;
revoke execute on function public.setting_int(text, integer)         from public, anon, authenticated;
revoke execute on function public.award_badges(uuid)                 from public, anon, authenticated;

-- Fonctions réservées aux membres connectés
revoke execute on function public.check_in(uuid, double precision, double precision) from public, anon;
revoke execute on function public.passport(uuid)                                       from public, anon;
revoke execute on function public.moderate_event(uuid, boolean, text)                  from public, anon;
revoke execute on function public.can_see_attendance(uuid)                             from public, anon;
grant  execute on function public.check_in(uuid, double precision, double precision) to authenticated;
grant  execute on function public.passport(uuid)                                       to authenticated;
grant  execute on function public.moderate_event(uuid, boolean, text)                  to authenticated;
grant  execute on function public.can_see_attendance(uuid)                             to authenticated;

-- Restent ouvertes, volontairement, car utilisées par les règles de sécurité (RLS)
-- ou la recherche publique : is_admin, is_organizer_member, attendee_count, distance_m, search_events.
-- Elles ne renvoient que des informations sans risque (« suis-je admin ? », un nombre de participants…).
