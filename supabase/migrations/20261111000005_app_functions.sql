-- =====================================================================
-- EuroKink — fonctions utilisées par l'appli connectée
-- =====================================================================

-- Le pseudo est-il libre ? (vérifié avant l'inscription)
create or replace function public.pseudo_available(p_pseudo text)
returns boolean language sql stable security definer set search_path = public as $$
  select char_length(trim(p_pseudo)) between 3 and 30
     and not exists (select 1 from public.profiles where lower(pseudo) = lower(trim(p_pseudo)));
$$;
revoke execute on function public.pseudo_available(text) from public;
grant execute on function public.pseudo_available(text) to anon, authenticated;

-- Nombre de participants annoncés pour toutes les soirées à venir (un seul appel pour l'appli)
create or replace function public.event_attendee_counts()
returns table (event_id uuid, attendees bigint)
language sql stable security definer set search_path = public as $$
  select e.id, count(a.user_id)
  from public.events e left join public.attendances a on a.event_id = e.id
  where e.status = 'published' and e.ends_at >= now()
  group by e.id;
$$;
revoke execute on function public.event_attendee_counts() from public;
grant execute on function public.event_attendee_counts() to anon, authenticated;

-- Suppression définitive de son propre compte (RGPD) : le profil et toutes les
-- données liées disparaissent en cascade avec le compte.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
