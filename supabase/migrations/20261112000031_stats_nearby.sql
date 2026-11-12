-- 1) Alerte « nouvelle soirée près de chez toi »
alter table public.profiles add column if not exists notif_nearby boolean not null default true;
alter table public.profiles add column if not exists nearby_km integer not null default 100;
alter table public.profiles drop constraint if exists profiles_nearby_km_check;
alter table public.profiles add constraint profiles_nearby_km_check check (nearby_km between 10 and 500);
alter table public.events add column if not exists nearby_notified_at timestamptz;
-- les soirées déjà publiées ne déclenchent pas d'alerte
update public.events set nearby_notified_at = now() where nearby_notified_at is null and status = 'published';

create or replace function public.km_between(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select 6371 * 2 * asin(least(1, sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
       + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2))));
$$;

-- Textes des notifications (FR / EN / DE)
do $$
declare d text := pg_get_functiondef('public.ntext(text,text)'::regprocedure); o text := d;
begin
  d := replace(d, $q$when 'test' then 'Notifications work on this phone 🎉'$q$,
    $q$when 'near' then 'Near you: ' when 'near_neutral' then 'A new night out was announced near you.' when 'near_many' then ' new events near you'
      when 'test' then 'Notifications work on this phone 🎉'$q$);
  d := replace(d, $q$when 'test' then 'Benachrichtigungen funktionieren auf diesem Telefon 🎉'$q$,
    $q$when 'near' then 'In deiner Nähe: ' when 'near_neutral' then 'In deiner Nähe wurde ein neuer Abend angekündigt.' when 'near_many' then ' neue Partys in deiner Nähe'
      when 'test' then 'Benachrichtigungen funktionieren auf diesem Telefon 🎉'$q$);
  d := replace(d, $q$when 'test' then 'Les notifications fonctionnent sur ce téléphone 🎉'$q$,
    $q$when 'near' then 'Près de chez toi : ' when 'near_neutral' then 'Une nouvelle sortie est annoncée près de chez toi.' when 'near_many' then ' nouvelles soirées près de chez toi'
      when 'test' then 'Les notifications fonctionnent sur ce téléphone 🎉'$q$);
  if (length(d) - length(o)) < 300 or d not like '%near_many%near_many%near_many%' then raise exception 'ntext : remplacement incomplet'; end if;
  execute d;
end $$;

-- File d'envoi : un message par membre et par passage (regroupé si plusieurs soirées)
do $$
declare d text := pg_get_functiondef('public.queue_notifications()'::regprocedure); o text := d;
begin
  d := replace(d, $q$  select (value #>> '{}')::timestamptz into v_since from app_settings where key = 'admin_notified_at';$q$,
$q$  with ev as (
    update events e set nearby_notified_at = now()
     where e.status = 'published' and e.nearby_notified_at is null
    returning e.id, e.title, e.starts_at, e.organizer_id, e.venue_id),
  hits as (
    select p.id as user_id, p.lang, p.notif_neutral, ev.id, ev.title, ev.starts_at, ev.venue_id,
           round(km_between(p.latitude, p.longitude, v.latitude, v.longitude))::int as km,
           count(*) over (partition by p.id) as n,
           row_number() over (partition by p.id order by ev.starts_at) as rk
      from ev join venues v on v.id = ev.venue_id
      join profiles p on p.notif_nearby and p.latitude is not null and p.longitude is not null
     where ev.starts_at > now() and v.latitude is not null
       and km_between(p.latitude, p.longitude, v.latitude, v.longitude) <= p.nearby_km
       and not (p.notif_follows and exists (select 1 from organizer_follows f where f.organizer_id = ev.organizer_id and f.user_id = p.id)))
  insert into push_outbox (user_id, title, body, url, tag)
  select h.user_id,
         case when h.notif_neutral or h.n > 1 then 'EuroKink' else ntext(h.lang, 'near') || h.title end,
         case when h.n > 1 then h.n || ntext(h.lang, 'near_many')
              when h.notif_neutral then ntext(h.lang, 'near_neutral')
              else ndate(h.lang, h.starts_at, h.venue_id) || coalesce(' · ' || (select city from venues where id = h.venue_id), '') || ' · ' || h.km || ' km' end,
         case when h.n > 1 then '#/explorer' else '#/soiree/' || h.id end,
         case when h.n > 1 then 'near' else 'near-' || h.id end
    from hits h where h.rk = 1;
  get diagnostics k = row_count; n := n + k;

  select (value #>> '{}')::timestamptz into v_since from app_settings where key = 'admin_notified_at';$q$);
  if d = o then raise exception 'queue_notifications : point d''insertion introuvable'; end if;
  execute d;
end $$;

-- 2) Statistiques de l'espace admin
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  select jsonb_build_object(
    'members', (select jsonb_build_object(
        'total', count(*),
        'new_1d', count(*) filter (where created_at > now() - interval '1 day'),
        'new_7d', count(*) filter (where created_at > now() - interval '7 days'),
        'new_30d', count(*) filter (where created_at > now() - interval '30 days'),
        'active_1d', count(*) filter (where last_seen_at > now() - interval '1 day'),
        'active_7d', count(*) filter (where last_seen_at > now() - interval '7 days'),
        'active_30d', count(*) filter (where last_seen_at > now() - interval '30 days'),
        'invisible', count(*) filter (where is_invisible),
        'with_avatar', count(*) filter (where avatar_path is not null),
        'with_city', count(*) filter (where latitude is not null),
        'nearby_on', count(*) filter (where notif_nearby)) from profiles),
    'push_users', (select count(distinct user_id) from push_subscriptions),
    'signups', (select jsonb_agg(jsonb_build_object('d', d::date, 'n', (select count(*) from profiles where created_at::date = d::date)) order by d)
                  from generate_series(current_date - 29, current_date, interval '1 day') d),
    'langs', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]') from
                (select coalesce(lang, 'fr') k, count(*) n from profiles group by 1) s),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]') from
                (select coalesce(country, '?') k, count(*) n from profiles group by 1) s),
    'cities', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]') from
                (select city k, count(*) n from profiles where city is not null group by 1 order by 2 desc limit 8) s),
    'events', (select jsonb_build_object(
        'upcoming', count(*) filter (where status = 'published' and ends_at > now()),
        'pending', count(*) filter (where status = 'pending'),
        'past', count(*) filter (where status = 'published' and ends_at <= now()),
        'new_7d', count(*) filter (where status = 'published' and created_at > now() - interval '7 days')) from events),
    'event_countries', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]') from
                (select v.country k, count(*) n from events e join venues v on v.id = e.venue_id
                  where e.status = 'published' and e.ends_at > now() group by 1) s),
    'organizers', (select jsonb_build_object('total', count(*), 'with_team', count(*) filter (where exists (select 1 from organizer_members m where m.organizer_id = o.id))) from organizers o),
    'engagement', jsonb_build_object(
        'going', (select count(*) from attendances),
        'favorites', (select count(*) from favorites),
        'reminders', (select count(*) from reminders),
        'ticket_alerts', (select count(*) from ticket_alerts),
        'checkins', (select count(*) from checkins),
        'views_7d', (select count(*) from event_views where day > current_date - 7),
        'messages_7d', (select count(*) from messages where created_at > now() - interval '7 days'),
        'messages', (select count(*) from messages),
        'conversations', (select count(*) from conversations where status = 'active'),
        'member_follows', (select count(*) from member_follows),
        'org_follows', (select count(*) from organizer_follows)),
    'top_events', (select coalesce(jsonb_agg(t order by t.score desc), '[]') from (
        select e.id, e.title, e.starts_at,
               (select count(*) from event_views w where w.event_id = e.id) as views,
               (select count(*) from attendances a where a.event_id = e.id) as going,
               (select count(*) from favorites f where f.event_id = e.id) as favs,
               (select count(*) from event_views w where w.event_id = e.id) + 5 * (select count(*) from attendances a where a.event_id = e.id)
                 + 2 * (select count(*) from favorites f where f.event_id = e.id) as score
          from events e where e.status = 'published' and e.ends_at > now()
         order by score desc limit 5) t)
  ) into r;
  return r;
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
