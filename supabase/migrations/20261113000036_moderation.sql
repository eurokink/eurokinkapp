-- Modération des membres par les admins : avertissement, suspension, suppression définitive
alter table public.profiles add column if not exists suspended_until timestamptz;
alter table public.profiles add column if not exists suspension_reason text;

create table if not exists public.member_warnings (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 3 and 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.member_warnings enable row level security;
drop policy if exists warnings_read on public.member_warnings;
create policy warnings_read on public.member_warnings for select to authenticated using (user_id = auth.uid() or public.is_admin());
create index if not exists member_warnings_user on public.member_warnings (user_id, read_at);

-- Un profil suspendu disparaît pour les autres membres (lui-même et les admins le voient)
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or (not is_invisible and (suspended_until is null or suspended_until < now())));

-- Un admin ne peut pas modérer un autre admin
create or replace function public.mod_target_check(p_user uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if p_user = auth.uid() then raise exception 'Tu ne peux pas te sanctionner toi-même'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'Membre introuvable'; end if;
  if exists (select 1 from profiles where id = p_user and role = 'admin') then raise exception 'Impossible de sanctionner un administrateur'; end if;
end $$;

create or replace function public.admin_warn(p_user uuid, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare v_lang text;
begin
  perform public.mod_target_check(p_user);
  insert into member_warnings (user_id, message, created_by) values (p_user, btrim(p_message), auth.uid());
  select lang into v_lang from profiles where id = p_user;
  insert into push_outbox (user_id, title, body, url, tag)
  values (p_user, 'EuroKink',
    case v_lang when 'en' then 'You have received a warning from the EuroKink team.' when 'de' then 'Du hast eine Verwarnung vom EuroKink-Team erhalten.'
      else 'Tu as reçu un avertissement de l’équipe EuroKink.' end, '#/', 'warn');
end $$;

-- p_days : nombre de jours (null = jusqu'à nouvel ordre, 0 = lever la suspension)
create or replace function public.admin_suspend(p_user uuid, p_days integer, p_reason text)
returns timestamptz language plpgsql security definer set search_path = public, auth as $$
declare v_until timestamptz;
begin
  perform public.mod_target_check(p_user);
  if p_days = 0 then v_until := null;
  elsif p_days is null then v_until := now() + interval '100 years';
  elsif p_days between 1 and 365 then v_until := now() + make_interval(days => p_days);
  else raise exception 'Durée invalide'; end if;
  update profiles set suspended_until = v_until, suspension_reason = case when v_until is null then null else nullif(btrim(coalesce(p_reason, '')), '') end where id = p_user;
  update auth.users set banned_until = v_until where id = p_user;
  -- déconnexion immédiate : les sessions en cours ne peuvent plus être prolongées
  if v_until is not null then delete from auth.refresh_tokens where user_id = p_user::text; delete from auth.sessions where user_id = p_user; end if;
  return v_until;
end $$;

create or replace function public.admin_delete_member(p_user uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.mod_target_check(p_user);
  delete from auth.users where id = p_user;
end $$;

create or replace function public.my_warnings()
returns setof public.member_warnings language sql stable security definer set search_path = public as $$
  select * from member_warnings where user_id = auth.uid() and read_at is null order by created_at;
$$;
create or replace function public.ack_warning(p_id bigint)
returns void language sql security definer set search_path = public as $$
  update member_warnings set read_at = now() where id = p_id and user_id = auth.uid();
$$;

revoke all on function public.mod_target_check(uuid), public.admin_warn(uuid, text), public.admin_suspend(uuid, integer, text),
  public.admin_delete_member(uuid), public.my_warnings(), public.ack_warning(bigint) from public, anon;
grant execute on function public.admin_warn(uuid, text), public.admin_suspend(uuid, integer, text),
  public.admin_delete_member(uuid), public.my_warnings(), public.ack_warning(bigint) to authenticated;

-- La liste admin des membres indique les suspensions et avertissements
create or replace function public.admin_members()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'pseudo', p.pseudo, 'city', p.city, 'country', p.country, 'lang', p.lang, 'role', p.role,
      'invisible', p.is_invisible, 'avatar', p.avatar_path, 'number', p.member_number,
      'created_at', p.created_at, 'last_seen_at', p.last_seen_at,
      'suspended_until', case when p.suspended_until > now() then p.suspended_until end,
      'warnings', (select count(*) from member_warnings w where w.user_id = p.id),
      'push', exists (select 1 from push_subscriptions s where s.user_id = p.id),
      'going', (select count(*) from attendances a where a.user_id = p.id),
      'manages', (select string_agg(o.name, ', ') from organizer_members m join organizers o on o.id = m.organizer_id where m.user_id = p.id)
    ) order by p.created_at desc), '[]') from profiles p);
end $$;
