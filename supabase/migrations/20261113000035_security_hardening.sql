-- Renforcement de la sécurité de la base
-- 1) Aucun droit inutile pour les visiteurs et membres : TRUNCATE (contourne la RLS), TRIGGER, REFERENCES
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- 2) Organisations et lieux : création uniquement par les fonctions contrôlées (demande d'accès, proposition de soirée)
drop policy if exists organizers_insert on public.organizers;
create policy organizers_insert on public.organizers for insert to authenticated with check (public.is_admin());
drop policy if exists venues_insert on public.venues;
create policy venues_insert on public.venues for insert to authenticated with check (public.is_admin());

-- 3) Fonctions de déclencheur : jamais appelables directement par l'API
do $$ declare f record; begin
  for f in select p.oid::regprocedure sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
alter function public.ntext_msg(text, text) set search_path = public;

-- 4) Nouveaux comptes : adresses e-mail jetables refusées (fonction utilisée par le hook « Before User Created »)
create table if not exists public.blocked_email_domains (domain text primary key);
alter table public.blocked_email_domains enable row level security;
insert into public.blocked_email_domains (domain) values
  ('yopmail.com'),('yopmail.fr'),('yopmail.net'),('mailinator.com'),('guerrillamail.com'),('guerrillamail.info'),('sharklasers.com'),
  ('10minutemail.com'),('10minutemail.net'),('tempmail.com'),('temp-mail.org'),('temp-mail.io'),('tempmail.net'),('throwawaymail.com'),
  ('trashmail.com'),('trashmail.de'),('getnada.com'),('maildrop.cc'),('dispostable.com'),('fakeinbox.com'),('mailnesia.com'),
  ('mohmal.com'),('emailondeck.com'),('mintemail.com'),('mytemp.email'),('tempr.email'),('discard.email'),('spamgourmet.com'),
  ('jetable.org'),('mail-temporaire.fr'),('crazymailing.com'),('mailcatch.com'),('moakt.com'),('tmpmail.org'),('tmpmail.net'),
  ('burnermail.io'),('mailpoof.com'),('33mail.com'),('anonaddy.me'),('emailfake.com'),('fakemail.net'),('inboxkitten.com'),
  ('mail.tm'),('mailsac.com'),('spambox.us'),('trbvm.com'),('wegwerfmail.de'),('einrot.com'),('byom.de'),('cuvox.de')
on conflict do nothing;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text := lower(coalesce(event->'user'->>'email', '')); v_domain text := split_part(v_email, '@', 2);
begin
  if v_domain = '' or exists (select 1 from blocked_email_domains d where v_domain = d.domain or v_domain like '%.' || d.domain) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400,
      'message', 'Les adresses e-mail jetables ne sont pas acceptées. Utilise ton adresse habituelle.'));
  end if;
  return '{}'::jsonb;
end $$;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant select on public.blocked_email_domains to supabase_auth_admin;
