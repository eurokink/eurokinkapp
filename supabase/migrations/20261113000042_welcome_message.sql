-- Message de bienvenue automatique envoyé par le compte système « EuroKink » (sans réponse possible)
do $$
declare v_sys uuid := 'e0e0e0e0-0000-4000-8000-000000000001';
begin
  if not exists (select 1 from auth.users where id = v_sys) then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, banned_until,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_sys, 'authenticated', 'authenticated', 'system@eurokink.eu', '',
      now(), now() + interval '200 years', '{"provider":"system","providers":[]}', '{"system":true}', now(), now(), '', '', '', '');
  end if;
  if not exists (select 1 from public.profiles where id = v_sys) then
    insert into public.profiles (id, pseudo, city, country, role, is_invisible, member_number, adult_confirmed_at, sensitive_consent_at, show_online, notif_messages)
    overriding system value values (v_sys, 'EuroKink', 'Europe', 'FR', 'admin', true, 0, now(), now(), false, false);
    update public.profiles set role = 'admin' where id = v_sys;
    delete from public.user_badges where user_id = v_sys;
  end if;
end $$;

create or replace function public.system_id() returns uuid language sql immutable as $$ select 'e0e0e0e0-0000-4000-8000-000000000001'::uuid $$;

create or replace function public.welcome_text(p_lang text, p_pseudo text)
returns text language sql immutable set search_path = public as $$
  select case coalesce(p_lang, 'fr')
  when 'en' then 'Welcome to the EuroKink community, ' || p_pseudo || '! 🖤

EuroKink brings every gay fetish event in Europe together in one app, free and ad-free. Here''s what you can do:

🗺️ Explore events on the map and filter by style, date, budget and distance.
📌 Plan your nights out: favourites, reminders, ticket alerts, “I''m going” to see who''ll be there, and accommodation near the event in one tap.
👥 Meet the community: members near you and messages to chat before the party.
🏅 Fill your passport by checking in at events to unlock badges.
📣 Help the agenda grow: an event is missing? Suggest it. You''re an organiser? Ask for your organiser access.

Install the app on your home screen and turn on notifications so you don''t miss anything.

A question, an idea, a problem? Write to us at contact@eurokink.eu.

Enjoy your nights out!
The EuroKink Team'
  when 'de' then 'Willkommen in der EuroKink-Community, ' || p_pseudo || '! 🖤

EuroKink bündelt alle schwulen Fetisch-Partys Europas in einer App, kostenlos und werbefrei. Das kannst du tun:

🗺️ Partys auf der Karte entdecken und nach Stil, Datum, Budget und Entfernung filtern.
📌 Deine Abende planen: Favoriten, Erinnerungen, Ticket-Hinweise, „Ich gehe hin“, um zu sehen, wer dabei ist, und mit einem Tipp eine Unterkunft in der Nähe der Party finden.
👥 Die Community treffen: Mitglieder in deiner Nähe und Nachrichten, um vor der Party zu schreiben.
🏅 Deinen Pass füllen, indem du vor Ort eincheckst, und Abzeichen freischalten.
📣 Den Kalender wachsen lassen: Fehlt eine Party? Schlag sie vor. Du veranstaltest? Beantrage deinen Veranstalter-Zugang.

Installiere die App auf deinem Startbildschirm und aktiviere die Benachrichtigungen, damit du nichts verpasst.

Eine Frage, eine Idee, ein Problem? Schreib uns an contact@eurokink.eu.

Viel Spaß beim Ausgehen!
Das EuroKink-Team'
  else 'Bienvenue dans la communauté EuroKink, ' || p_pseudo || ' ! 🖤

EuroKink rassemble toutes les soirées fetish gay d’Europe dans une seule appli, gratuite et sans pub. Voici ce que tu peux faire :

🗺️ Explorer les soirées sur la carte et filtrer par style, date, budget et distance.
📌 Préparer tes sorties : favoris, rappels, alertes billetterie, « J’y vais » pour voir qui sera là, et un hébergement à trouver près de la soirée en un geste.
👥 Rencontrer la communauté : les membres près de chez toi et la messagerie pour se parler avant la soirée.
🏅 Remplir ton passeport en validant ta présence sur place pour débloquer des badges.
📣 Faire grandir l’agenda : une soirée manque ? Propose-la. Tu organises ? Demande ton accès organisateur.

Pense à installer l’appli sur ton écran d’accueil et à activer les notifications pour ne rien rater.

Une question, une idée, un souci ? Écris-nous à contact@eurokink.eu.

Bonnes soirées !
L’équipe EuroKink' end;
$$;

create or replace function public.send_welcome(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_sys uuid := public.system_id(); v_conv uuid; p record; v_body text;
begin
  select id, pseudo, lang into p from profiles where id = p_user;
  if not found or p_user = v_sys then return; end if;
  if exists (select 1 from conversations where user_a = least(v_sys, p_user) and user_b = greatest(v_sys, p_user)) then return; end if;
  v_body := public.welcome_text(p.lang, p.pseudo);
  insert into conversations (user_a, user_b, created_by, status, accepted_at)
  values (least(v_sys, p_user), greatest(v_sys, p_user), v_sys, 'active', now()) returning id into v_conv;
  insert into messages (conversation_id, sender_id, body) values (v_conv, v_sys, v_body);
  update conversations set last_message_at = now(), last_sender = v_sys, last_preview = left(v_body, 140),
    a_read_at = case when user_a = v_sys then now() else a_read_at end, b_read_at = case when user_b = v_sys then now() else b_read_at end
   where id = v_conv;
end $$;
revoke execute on function public.send_welcome(uuid), public.welcome_text(text, text) from public, anon, authenticated;

create or replace function public.profiles_welcome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin perform public.send_welcome(new.id); exception when others then null; end;  -- ne bloque jamais une inscription
  return null;
end $$;
drop trigger if exists profiles_welcome on public.profiles;
create trigger profiles_welcome after insert on public.profiles for each row execute function public.profiles_welcome();
revoke execute on function public.profiles_welcome() from public, anon, authenticated;

-- On ne répond pas au compte système
do $$
declare d text := pg_get_functiondef('public.send_message(uuid,text)'::regprocedure); o text := d;
begin
  d := replace(d, $q$if p_to is null or p_to = v_me then$q$, $q$if p_to is null or p_to = v_me or p_to = public.system_id() then$q$);
  if d = o then raise exception 'send_message : point d''insertion introuvable'; end if;
  execute d;
end $$;

-- Membres déjà inscrits
do $$ declare r record; begin
  for r in select id from public.profiles where id <> public.system_id() order by created_at loop perform public.send_welcome(r.id); end loop;
end $$;
