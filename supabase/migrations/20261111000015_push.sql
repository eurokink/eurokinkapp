-- =====================================================================
-- EuroKink — notifications sur le téléphone (Web Push, gratuit)
-- =====================================================================

-- Abonnements des téléphones (un par appareil)
create table public.push_subscriptions (
  endpoint   text primary key check (endpoint ~* '^https://' and char_length(endpoint) <= 1000),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "push_own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;

-- Préférences de notification (enregistrées sur le serveur)
alter table public.profiles
  add column if not exists notif_reminders boolean not null default true,
  add column if not exists notif_tickets   boolean not null default true,
  add column if not exists notif_follows   boolean not null default true,
  add column if not exists notif_neutral   boolean not null default true,
  add column if not exists notif_admin     boolean not null default true;

-- File d'envoi
create table public.push_outbox (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  body       text not null,
  url        text not null default '#/',
  tag        text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   integer not null default 0,
  last_error text
);
create index push_outbox_todo_idx on public.push_outbox (created_at) where sent_at is null;
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;

-- Annonce aux abonnés : seulement les soirées publiées à partir de maintenant
alter table public.events add column if not exists followers_notified_at timestamptz;
update public.events set followers_notified_at = now() where followers_notified_at is null;
insert into public.app_settings (key, value, description)
values ('admin_notified_at', to_jsonb(now()), 'Dernière notification « à valider » envoyée à l''admin')
on conflict (key) do nothing;

-- Complet -> remis en vente : les alertes billetterie peuvent repartir
create or replace function public.events_soldout_alerts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_sold_out and not old.is_sold_out then
    update ticket_alerts set notified_at = null where event_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists events_soldout_alerts on public.events;
create trigger events_soldout_alerts after update of is_sold_out on public.events
  for each row execute function public.events_soldout_alerts();

-- Prépare les notifications à envoyer (appelée par le robot d'envoi toutes les 10 min)
create or replace function public.queue_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; k integer; v_since timestamptz; v_count integer;
begin
  -- 1. Rappels de soirée
  with due as (
    update reminders r set sent_at = now()
      from events e, profiles p
     where e.id = r.event_id and p.id = r.user_id and r.sent_at is null and r.remind_at <= now()
       and e.status = 'published' and e.starts_at > now() - interval '2 hours'
    returning r.user_id, e.id, e.title, e.starts_at, e.venue_id, p.notif_reminders, p.notif_neutral)
  insert into push_outbox (user_id, title, body, url, tag)
  select d.user_id,
         case when d.notif_neutral then 'EuroKink' else d.title end,
         case when d.notif_neutral then 'Rappel : ta sortie du ' else 'Rappel : c’est le ' end
           || to_char(d.starts_at at time zone 'Europe/Paris', 'DD/MM "à" HH24"h"MI')
           || coalesce(' · ' || (select city from venues where id = d.venue_id), ''),
         '#/soiree/' || d.id, 'rem-' || d.id
    from due d where d.notif_reminders;
  get diagnostics k = row_count; n := n + k;

  -- 2. Billetterie ouverte (ou places remises en vente)
  with due as (
    update ticket_alerts t set notified_at = now()
      from events e, profiles p
     where e.id = t.event_id and p.id = t.user_id and t.notified_at is null
       and e.status = 'published' and not e.is_sold_out and e.starts_at > now()
       and (e.sales_open_at is null or e.sales_open_at <= now())
       and (e.sales_close_at is null or e.sales_close_at > now())
    returning t.user_id, e.id, e.title, p.notif_tickets, p.notif_neutral)
  insert into push_outbox (user_id, title, body, url, tag)
  select d.user_id,
         case when d.notif_neutral then 'EuroKink' else 'Billetterie ouverte' end,
         case when d.notif_neutral then 'Les places pour ta sortie sont disponibles.' else 'Les places pour « ' || d.title || ' » sont disponibles.' end,
         '#/soiree/' || d.id, 'tix-' || d.id
    from due d where d.notif_tickets;
  get diagnostics k = row_count; n := n + k;

  -- 3. Nouvelle soirée d'un organisateur suivi
  with ev as (
    update events e set followers_notified_at = now()
     where e.status = 'published' and e.followers_notified_at is null
    returning e.id, e.title, e.starts_at, e.organizer_id)
  insert into push_outbox (user_id, title, body, url, tag)
  select f.user_id,
         case when p.notif_neutral then 'EuroKink' else 'Nouvelle soirée : ' || ev.title end,
         case when p.notif_neutral then 'Un organisateur que tu suis annonce une nouvelle sortie.'
              else (select name from organizers where id = ev.organizer_id) || ' · ' || to_char(ev.starts_at at time zone 'Europe/Paris', 'DD/MM "à" HH24"h"MI') end,
         '#/soiree/' || ev.id, 'new-' || ev.id
    from ev join organizer_follows f on f.organizer_id = ev.organizer_id
            join profiles p on p.id = f.user_id
   where p.notif_follows and ev.starts_at > now();
  get diagnostics k = row_count; n := n + k;

  -- 4. Admin : nouveautés à valider
  select (value #>> '{}')::timestamptz into v_since from app_settings where key = 'admin_notified_at';
  select (select count(*) from events where status = 'pending' and created_at > v_since)
       + (select count(*) from organizer_requests where status = 'pending' and created_at > v_since)
       + (select count(*) from reports where status = 'open' and created_at > v_since)
    into v_count;
  if v_count > 0 then
    insert into push_outbox (user_id, title, body, url, tag)
    select id, 'Espace admin', v_count || case when v_count > 1 then ' nouveautés à valider' else ' nouveauté à valider' end, '#/admin', 'admin'
      from profiles where role = 'admin' and notif_admin;
    get diagnostics k = row_count; n := n + k;
    update app_settings set value = to_jsonb(now()) where key = 'admin_notified_at';
  end if;
  return n;
end $$;

-- Notification de test pour soi-même
create or replace function public.push_test()
returns void language sql security definer set search_path = public as $$
  insert into push_outbox (user_id, title, body, url, tag)
  select auth.uid(), 'EuroKink', 'Les notifications fonctionnent sur ce téléphone 🎉', '#/parametres', 'test'
   where auth.uid() is not null
     and (select count(*) from push_outbox where user_id = auth.uid() and tag = 'test' and created_at > now() - interval '1 minute') < 3;
$$;

revoke execute on function public.queue_notifications() from public, anon, authenticated;
grant execute on function public.queue_notifications() to service_role;
revoke execute on function public.push_test() from public, anon;
grant execute on function public.push_test() to authenticated;
revoke execute on function public.events_soldout_alerts() from public, anon, authenticated;

-- Pas de rattrapage : ce qui était déjà dû avant la mise en route n'est pas envoyé
update public.ticket_alerts t set notified_at = now()
  from public.events e
 where e.id = t.event_id and t.notified_at is null and not e.is_sold_out
   and (e.sales_open_at is null or e.sales_open_at <= now());
update public.reminders set sent_at = now() where sent_at is null and remind_at < now() - interval '1 hour';

-- Coffre interne : clés VAPID créées par le service d'envoi lui-même (jamais lisibles par l'appli)
create table if not exists public.app_secrets (
  key        text primary key,
  value      jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- Clé publique (seule partie partageable) pour abonner un téléphone
create or replace function public.push_public_key()
returns text language sql stable security definer set search_path = public as $$
  select value->>'public' from app_secrets where key = 'vapid';
$$;
grant execute on function public.push_public_key() to authenticated;
revoke execute on function public.push_public_key() from public, anon;
