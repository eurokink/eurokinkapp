-- Corrections de l'audit du 13/11/2026

-- A) Profils : les autres membres ne lisent que les colonnes publiques ; mon profil complet via my_profile()
create or replace function public.my_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) from profiles p where p.id = auth.uid();
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;
revoke select on public.profiles from anon, authenticated;
grant select (id, pseudo, city, country, bio, role, is_invisible, member_number, created_at, avatar_path, postal_code,
  latitude, longitude, interests, last_seen_at, show_online, suspended_until, suspension_reason, org_names) on public.profiles to authenticated;

-- B) Membre suspendu : plus aucune action, même avec une session encore ouverte
create or replace function public.am_suspended()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and suspended_until > now());
$$;
create or replace function public.assert_not_suspended()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.am_suspended() then raise exception 'Ton compte est suspendu. Pour toute question : contact@eurokink.eu'; end if;
end $$;
revoke all on function public.am_suspended(), public.assert_not_suspended() from public, anon;
grant execute on function public.am_suspended(), public.assert_not_suspended() to authenticated;

do $$ declare t text; begin
  foreach t in array array['attendances','favorites','reminders','ticket_alerts','member_follows','organizer_follows','reports','push_subscriptions','profiles','events','organizers','venues','event_event_types'] loop
    execute format('drop policy if exists %I on public.%I', 'not_suspended_ins', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not public.am_suspended())', 'not_suspended_ins', t);
    execute format('drop policy if exists %I on public.%I', 'not_suspended_upd', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (not public.am_suspended())', 'not_suspended_upd', t);
  end loop;
end $$;

do $$ declare f text; d text; o text; begin
  foreach f in array array['send_message(uuid,text)','submit_event(jsonb)','request_organizer(jsonb)','check_in(uuid,double precision,double precision)',
    'respond_request(uuid,boolean)','accept_organizer_invite(text)','create_organizer_invite(uuid,text)','org_event_action(uuid,text)',
    'set_event_image(uuid,text,integer,integer)','set_event_sales_close(uuid,timestamp with time zone)'] loop
    d := pg_get_functiondef(('public.' || f)::regprocedure); o := d;
    d := regexp_replace(d, '\mbegin\M', 'begin perform public.assert_not_suspended();', 'i');
    if d = o then raise exception 'patch introuvable : %', f; end if;
    execute d;
  end loop;
end $$;

-- Un membre ne peut pas modifier lui-même ses champs de sanction
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.role <> 'member' and not public.is_admin() then new.role := 'member'; end if;
    if not public.is_trusted() then new.org_names := null; new.suspended_until := null; new.suspension_reason := null; end if;
  else
    if new.role is distinct from old.role and not public.is_trusted() then raise exception 'Seul un administrateur peut modifier un rôle'; end if;
    if new.org_names is distinct from old.org_names and not public.is_trusted() and coalesce(current_setting('ek.org_sync', true), '') <> 'on' then
      new.org_names := old.org_names;
    end if;
    if not public.is_trusted() then new.suspended_until := old.suspended_until; new.suspension_reason := old.suspension_reason; end if;
  end if;
  if (tg_op = 'INSERT' or new.pseudo is distinct from old.pseudo) and public.pseudo_reserved(new.pseudo) and not public.is_trusted() then
    raise exception 'Ce pseudo est réservé à l’équipe EuroKink, choisis-en un autre.';
  end if;
  return new;
end $$;

-- C) Signalements : 10 par jour au maximum
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and (select count(*) from public.reports r where r.reporter_id = auth.uid() and r.created_at > now() - interval '1 day') < 10);

-- D) Blocages : seuls les deux membres concernés (ou un admin) peuvent le vérifier
create or replace function public.is_blocked_between(p_x uuid, p_y uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or auth.uid() in (p_x, p_y) or public.is_admin())
     and exists (select 1 from blocks where (blocker_id = p_x and blocked_id = p_y) or (blocker_id = p_y and blocked_id = p_x));
$$;

-- E) Visiteurs non connectés : plus aucun droit sur les tables, sauf la lecture des listes publiques
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on public.%I from anon', t.tablename);
  end loop;
end $$;
grant select on public.countries, public.event_types, public.badges, public.app_settings to anon;
alter default privileges in schema public revoke all on tables from anon;
