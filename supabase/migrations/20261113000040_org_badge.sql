-- Badge « Organisateur » : noms des organisations gérées, recopiés sur le profil (lecture publique)
alter table public.profiles add column if not exists org_names text[];

create or replace function public.sync_org_names(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('ek.org_sync', 'on', true);
  update profiles set org_names = (select array_agg(o.name order by o.name) from organizer_members m join organizers o on o.id = m.organizer_id where m.user_id = p_user)
   where id = p_user;
  perform set_config('ek.org_sync', 'off', true);
end $$;

create or replace function public.org_members_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform public.sync_org_names(new.user_id); end if;
  if tg_op in ('DELETE', 'UPDATE') then perform public.sync_org_names(old.user_id); end if;
  return null;
end $$;
drop trigger if exists org_members_sync on public.organizer_members;
create trigger org_members_sync after insert or update or delete on public.organizer_members for each row execute function public.org_members_sync();

create or replace function public.organizers_name_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id from organizer_members where organizer_id = new.id loop perform public.sync_org_names(r.user_id); end loop;
  return null;
end $$;
drop trigger if exists organizers_name_sync on public.organizers;
create trigger organizers_name_sync after update of name on public.organizers for each row execute function public.organizers_name_sync();
revoke execute on function public.sync_org_names(uuid), public.org_members_sync(), public.organizers_name_sync() from public, anon, authenticated;

-- Personne ne peut s'attribuer un badge organisateur à la main
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.role <> 'member' and not public.is_admin() then new.role := 'member'; end if;
    if not public.is_trusted() then new.org_names := null; end if;
  else
    if new.role is distinct from old.role and not public.is_trusted() then raise exception 'Seul un administrateur peut modifier un rôle'; end if;
    if new.org_names is distinct from old.org_names and not public.is_trusted() and coalesce(current_setting('ek.org_sync', true), '') <> 'on' then
      new.org_names := old.org_names;
    end if;
  end if;
  if (tg_op = 'INSERT' or new.pseudo is distinct from old.pseudo) and public.pseudo_reserved(new.pseudo) and not public.is_trusted() then
    raise exception 'Ce pseudo est réservé à l’équipe EuroKink, choisis-en un autre.';
  end if;
  return new;
end $$;

-- Remplissage initial
do $$ declare r record; begin
  for r in select distinct user_id from organizer_members loop perform public.sync_org_names(r.user_id); end loop;
end $$;

-- Messagerie : indique si l'interlocuteur est organisateur
do $$
declare d text := pg_get_functiondef('public.my_conversations()'::regprocedure); o text := d;
begin
  d := replace(d, $q$'team', p.role = 'admin',$q$, $q$'team', p.role = 'admin', 'org', p.org_names is not null,$q$);
  if d = o then raise exception 'my_conversations : remplacement introuvable'; end if;
  execute d;
end $$;
