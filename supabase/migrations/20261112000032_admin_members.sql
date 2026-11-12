-- Liste complète des inscrits pour l'admin (y compris les profils invisibles)
create or replace function public.admin_members()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'pseudo', p.pseudo, 'city', p.city, 'country', p.country, 'lang', p.lang, 'role', p.role,
      'invisible', p.is_invisible, 'avatar', p.avatar_path, 'number', p.member_number,
      'created_at', p.created_at, 'last_seen_at', p.last_seen_at,
      'push', exists (select 1 from push_subscriptions s where s.user_id = p.id),
      'going', (select count(*) from attendances a where a.user_id = p.id),
      'manages', (select string_agg(o.name, ', ') from organizer_members m join organizers o on o.id = m.organizer_id where m.user_id = p.id)
    ) order by p.created_at desc), '[]') from profiles p);
end $$;
revoke all on function public.admin_members() from public, anon;
grant execute on function public.admin_members() to authenticated;
