-- Notification push aux administrateurs à chaque nouveau membre
create or replace function public.profiles_notify_admins()
returns trigger language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if new.id = public.system_id() then return new; end if;
  for a in select id, coalesce(lang, 'fr') as lang from profiles where role = 'admin' and id <> public.system_id() and id <> new.id loop
    insert into push_outbox (user_id, title, body, url, tag)
    values (a.id,
      case a.lang when 'en' then 'New member 🎉' when 'de' then 'Neues Mitglied 🎉' else 'Nouveau membre 🎉' end,
      coalesce(new.pseudo, '?') || coalesce(' · ' || new.city, '')
        || coalesce(case a.lang when 'en' then ' · member #' when 'de' then ' · Mitglied Nr. ' else ' · membre n°' end || new.member_number, ''),
      '#/membre/' || new.id, 'newmember-' || new.id);
  end loop;
  perform net.http_post(url := 'https://odaruyzivqmuvxosvqfd.supabase.co/functions/v1/send-push',
    body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 30000);
  return new;
exception when others then
  return new; -- une notification ratée ne doit jamais bloquer une inscription
end $$;
revoke all on function public.profiles_notify_admins() from public, anon, authenticated;

drop trigger if exists profiles_notify_admins on public.profiles;
create trigger profiles_notify_admins after insert on public.profiles
  for each row execute function public.profiles_notify_admins();
