-- 21 : invitations des organisateurs — lien personnel pour rejoindre la gestion d'une organisation
create table if not exists public.organizer_invites (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique default replace(gen_random_uuid()::text, '-', ''),
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  created_by   uuid references public.profiles (id) on delete set null,
  note         text check (char_length(note) <= 100),
  verify       boolean not null default false,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days',
  used_by      uuid references public.profiles (id) on delete set null,
  used_at      timestamptz
);
create index if not exists organizer_invites_org_idx on public.organizer_invites (organizer_id);
alter table public.organizer_invites enable row level security;   -- accès uniquement par les fonctions ci-dessous

-- Vérification d'un organisateur par une invitation de l'admin (drapeau local à la transaction)
create or replace function public.is_trusted()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or public.is_admin() or coalesce(current_setting('ek.invite_verify', true), '') = 'on';
$$;

create or replace function public.can_manage_org(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_organizer_member(p_org);
$$;

create or replace function public.create_organizer_invite(p_org uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.organizer_invites%rowtype;
begin
  if auth.uid() is null or not public.can_manage_org(p_org) then raise exception 'Tu ne gères pas cette organisation'; end if;
  if (select count(*) from organizer_invites where organizer_id = p_org and used_at is null and expires_at > now()) >= 10 then
    raise exception 'Trop d''invitations en attente : supprimes-en une avant d''en créer une autre';
  end if;
  insert into organizer_invites (organizer_id, created_by, note, verify)
  values (p_org, auth.uid(), nullif(left(trim(coalesce(p_note, '')), 100), ''), public.is_admin())
  returning * into r;
  return jsonb_build_object('id', r.id, 'token', r.token, 'note', r.note, 'expires_at', r.expires_at);
end $$;

create or replace function public.org_invites(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_manage_org(p_org) then raise exception 'Tu ne gères pas cette organisation'; end if;
  return jsonb_build_object(
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'token', i.token, 'note', i.note,
        'created_at', i.created_at, 'expires_at', i.expires_at, 'used_at', i.used_at,
        'used_by', (select pseudo from profiles where id = i.used_by)) order by i.created_at desc)
      from organizer_invites i where i.organizer_id = p_org and (i.used_at is not null or i.expires_at > now())), '[]'::jsonb),
    'managers', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'pseudo', p.pseudo, 'avatar_path', p.avatar_path) order by m.added_at)
      from organizer_members m join profiles p on p.id = m.user_id where m.organizer_id = p_org), '[]'::jsonb));
end $$;

create or replace function public.revoke_organizer_invite(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organizer_id into v_org from organizer_invites where id = p_id;
  if v_org is null then return; end if;
  if auth.uid() is null or not public.can_manage_org(v_org) then raise exception 'Tu ne gères pas cette organisation'; end if;
  delete from organizer_invites where id = p_id and used_at is null;
end $$;

-- Lisible sans compte : le nom de l'organisation et l'état du lien, rien d'autre
create or replace function public.invite_info(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare i public.organizer_invites%rowtype; o public.organizers%rowtype;
begin
  select * into i from organizer_invites where token = p_token;
  if not found then return jsonb_build_object('status', 'unknown'); end if;
  select * into o from organizers where id = i.organizer_id;
  return jsonb_build_object(
    'status', case when i.used_at is not null then 'used' when i.expires_at <= now() then 'expired' else 'valid' end,
    'expires_at', i.expires_at, 'verify', i.verify,
    'organizer', jsonb_build_object('id', o.id, 'name', o.name, 'kind', o.kind, 'city', o.city, 'logo_path', o.logo_path, 'is_verified', o.is_verified),
    'member', auth.uid() is not null and exists (select 1 from organizer_members where organizer_id = o.id and user_id = auth.uid()));
end $$;

create or replace function public.accept_organizer_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare i public.organizer_invites%rowtype;
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Connecte-toi pour accepter l''invitation'; end if;
  select * into i from organizer_invites where token = p_token for update;
  if not found then raise exception 'Invitation introuvable'; end if;
  if exists (select 1 from organizer_members where organizer_id = i.organizer_id and user_id = auth.uid()) then
    return i.organizer_id;
  end if;
  if i.used_at is not null then raise exception 'Cette invitation a déjà été utilisée'; end if;
  if i.expires_at <= now() then raise exception 'Cette invitation a expiré : demande un nouveau lien'; end if;
  insert into organizer_members (organizer_id, user_id) values (i.organizer_id, auth.uid()) on conflict do nothing;
  update organizer_invites set used_by = auth.uid(), used_at = now() where id = i.id;
  if i.verify then
    perform set_config('ek.invite_verify', 'on', true);
    update organizers set is_verified = true where id = i.organizer_id and not is_verified;
    perform set_config('ek.invite_verify', '', true);
  end if;
  update organizer_requests set status = 'approved' where user_id = auth.uid() and status = 'pending'
    and lower(name) = lower((select name from organizers where id = i.organizer_id));
  return i.organizer_id;
end $$;

revoke execute on function public.create_organizer_invite(uuid, text), public.org_invites(uuid), public.revoke_organizer_invite(uuid),
  public.accept_organizer_invite(text), public.can_manage_org(uuid), public.invite_info(text) from public;
grant execute on function public.create_organizer_invite(uuid, text), public.org_invites(uuid), public.revoke_organizer_invite(uuid),
  public.accept_organizer_invite(text), public.can_manage_org(uuid) to authenticated;
grant execute on function public.invite_info(text) to anon, authenticated;
revoke execute on function public.create_organizer_invite(uuid, text), public.org_invites(uuid), public.revoke_organizer_invite(uuid),
  public.accept_organizer_invite(text), public.can_manage_org(uuid) from anon;
