-- 27 : langue des membres (notifications traduites) et cache des traductions automatiques
alter table public.profiles add column if not exists lang text not null default 'fr' check (lang in ('fr', 'en', 'de'));

create table if not exists public.translations (
  src_hash   text not null,
  lang       text not null check (lang in ('fr', 'en', 'de')),
  src_lang   text,
  text       text not null,
  created_at timestamptz not null default now(),
  primary key (src_hash, lang)
);
alter table public.translations enable row level security;   -- lu et écrit uniquement par la fonction « translate »

-- Textes des notifications selon la langue
create or replace function public.ntext(p_lang text, p_key text)
returns text language sql immutable set search_path = public as $$
  select case coalesce(p_lang, 'fr')
    when 'en' then case p_key
      when 'rem_neutral' then 'Reminder: your night out on ' when 'rem' then 'Reminder: it’s on '
      when 'tix_title' then 'Tickets on sale' when 'tix_neutral' then 'Tickets for your night out are available.'
      when 'tix_a' then 'Tickets for “' when 'tix_b' then '” are available.'
      when 'new' then 'New event: ' when 'new_neutral' then 'An organiser you follow has announced a new night out.'
      when 'admin' then 'Admin area' when 'admin_one' then ' new item to review' when 'admin_many' then ' new items to review'
      when 'test' then 'Notifications work on this phone 🎉' end
    when 'de' then case p_key
      when 'rem_neutral' then 'Erinnerung: dein Abend am ' when 'rem' then 'Erinnerung: es ist am '
      when 'tix_title' then 'Ticketverkauf gestartet' when 'tix_neutral' then 'Die Tickets für deinen Abend sind verfügbar.'
      when 'tix_a' then 'Die Tickets für „' when 'tix_b' then '“ sind verfügbar.'
      when 'new' then 'Neue Party: ' when 'new_neutral' then 'Ein Veranstalter, dem du folgst, kündigt einen neuen Abend an.'
      when 'admin' then 'Adminbereich' when 'admin_one' then ' Neuigkeit zu prüfen' when 'admin_many' then ' Neuigkeiten zu prüfen'
      when 'test' then 'Benachrichtigungen funktionieren auf diesem Telefon 🎉' end
    else case p_key
      when 'rem_neutral' then 'Rappel : ta sortie du ' when 'rem' then 'Rappel : c’est le '
      when 'tix_title' then 'Billetterie ouverte' when 'tix_neutral' then 'Les places pour ta sortie sont disponibles.'
      when 'tix_a' then 'Les places pour « ' when 'tix_b' then ' » sont disponibles.'
      when 'new' then 'Nouvelle soirée : ' when 'new_neutral' then 'Un organisateur que tu suis annonce une nouvelle sortie.'
      when 'admin' then 'Espace admin' when 'admin_one' then ' nouveauté à valider' when 'admin_many' then ' nouveautés à valider'
      when 'test' then 'Les notifications fonctionnent sur ce téléphone 🎉' end
  end;
$$;

-- Date et heure dans la langue et le fuseau du lieu
create or replace function public.ndate(p_lang text, p_ts timestamptz, p_venue uuid)
returns text language sql stable set search_path = public as $$
  select to_char(p_ts at time zone coalesce((select c.timezone from venues v join countries c on c.code = v.country where v.id = p_venue), 'Europe/Paris'),
    case coalesce(p_lang, 'fr') when 'en' then 'DD/MM "at" HH24:MI' when 'de' then 'DD.MM. "um" HH24:MI' else 'DD/MM "à" HH24"h"MI' end);
$$;

create or replace function public.queue_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; k integer; v_since timestamptz; v_count integer;
begin
  with due as (
    update reminders r set sent_at = now()
      from events e, profiles p
     where e.id = r.event_id and p.id = r.user_id and r.sent_at is null and r.remind_at <= now()
       and e.status = 'published' and e.starts_at > now() - interval '2 hours'
    returning r.user_id, e.id, e.title, e.starts_at, e.venue_id, p.notif_reminders, p.notif_neutral, p.lang)
  insert into push_outbox (user_id, title, body, url, tag)
  select d.user_id,
         case when d.notif_neutral then 'EuroKink' else d.title end,
         ntext(d.lang, case when d.notif_neutral then 'rem_neutral' else 'rem' end) || ndate(d.lang, d.starts_at, d.venue_id)
           || coalesce(' · ' || (select city from venues where id = d.venue_id), ''),
         '#/soiree/' || d.id, 'rem-' || d.id
    from due d where d.notif_reminders;
  get diagnostics k = row_count; n := n + k;

  with due as (
    update ticket_alerts t set notified_at = now()
      from events e, profiles p
     where e.id = t.event_id and p.id = t.user_id and t.notified_at is null
       and e.status = 'published' and not e.is_sold_out and e.starts_at > now()
       and (e.sales_open_at is null or e.sales_open_at <= now())
       and (e.sales_close_at is null or e.sales_close_at > now())
    returning t.user_id, e.id, e.title, p.notif_tickets, p.notif_neutral, p.lang)
  insert into push_outbox (user_id, title, body, url, tag)
  select d.user_id,
         case when d.notif_neutral then 'EuroKink' else ntext(d.lang, 'tix_title') end,
         case when d.notif_neutral then ntext(d.lang, 'tix_neutral') else ntext(d.lang, 'tix_a') || d.title || ntext(d.lang, 'tix_b') end,
         '#/soiree/' || d.id, 'tix-' || d.id
    from due d where d.notif_tickets;
  get diagnostics k = row_count; n := n + k;

  with ev as (
    update events e set followers_notified_at = now()
     where e.status = 'published' and e.followers_notified_at is null
    returning e.id, e.title, e.starts_at, e.organizer_id, e.venue_id)
  insert into push_outbox (user_id, title, body, url, tag)
  select f.user_id,
         case when p.notif_neutral then 'EuroKink' else ntext(p.lang, 'new') || ev.title end,
         case when p.notif_neutral then ntext(p.lang, 'new_neutral')
              else (select name from organizers where id = ev.organizer_id) || ' · ' || ndate(p.lang, ev.starts_at, ev.venue_id) end,
         '#/soiree/' || ev.id, 'new-' || ev.id
    from ev join organizer_follows f on f.organizer_id = ev.organizer_id
            join profiles p on p.id = f.user_id
   where p.notif_follows and ev.starts_at > now();
  get diagnostics k = row_count; n := n + k;

  select (value #>> '{}')::timestamptz into v_since from app_settings where key = 'admin_notified_at';
  select (select count(*) from events where status = 'pending' and created_at > v_since)
       + (select count(*) from organizer_requests where status = 'pending' and created_at > v_since)
       + (select count(*) from reports where status = 'open' and created_at > v_since)
    into v_count;
  if v_count > 0 then
    insert into push_outbox (user_id, title, body, url, tag)
    select id, ntext(lang, 'admin'), v_count || ntext(lang, case when v_count > 1 then 'admin_many' else 'admin_one' end), '#/admin', 'admin'
      from profiles where role = 'admin' and notif_admin;
    get diagnostics k = row_count; n := n + k;
    update app_settings set value = to_jsonb(now()) where key = 'admin_notified_at';
  end if;
  return n;
end $$;

create or replace function public.push_test()
returns void language sql security definer set search_path = public as $$
  insert into push_outbox (user_id, title, body, url, tag)
  select auth.uid(), 'EuroKink', ntext((select lang from profiles where id = auth.uid()), 'test'), '#/parametres', 'test'
   where auth.uid() is not null
     and (select count(*) from push_outbox where user_id = auth.uid() and tag = 'test' and created_at > now() - interval '1 minute') < 3;
$$;
