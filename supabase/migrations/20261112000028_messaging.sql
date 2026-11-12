-- 28 : messagerie privée entre membres — texte uniquement, premier message = demande à accepter
alter table public.profiles add column if not exists notif_messages boolean not null default true;

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.profiles (id) on delete cascade,
  user_b          uuid not null references public.profiles (id) on delete cascade,
  created_by      uuid not null references public.profiles (id) on delete cascade,
  status          text not null default 'request' check (status in ('request', 'active', 'declined')),
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  last_message_at timestamptz,
  last_sender     uuid,
  last_preview    text,
  a_read_at       timestamptz,
  b_read_at       timestamptz,
  a_hidden_at     timestamptz,
  b_hidden_at     timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index if not exists conversations_a_idx on public.conversations (user_a, last_message_at desc);
create index if not exists conversations_b_idx on public.conversations (user_b, last_message_at desc);

create table if not exists public.messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at      timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, id);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
drop policy if exists conversations_read on public.conversations;
create policy conversations_read on public.conversations for select to authenticated
  using (auth.uid() in (user_a, user_b));
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)));
drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks for select to authenticated using (blocker_id = auth.uid());
-- Écritures uniquement par les fonctions ci-dessous

create or replace function public.is_blocked_between(p_x uuid, p_y uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = p_x and blocked_id = p_y) or (blocker_id = p_y and blocked_id = p_x));
$$;

-- Envoyer un message (crée la conversation au premier message, sous forme de demande)
create or replace function public.send_message(p_to uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_a uuid; v_b uuid; c public.conversations%rowtype; v_body text := btrim(coalesce(p_body, ''));
begin
  if v_me is null or not exists (select 1 from profiles where id = v_me) then raise exception 'Connecte-toi pour envoyer un message'; end if;
  if p_to is null or p_to = v_me then raise exception 'Destinataire invalide'; end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'Message vide ou trop long (2 000 caractères maximum)'; end if;
  if not exists (select 1 from profiles where id = p_to) then raise exception 'Ce membre n’existe plus'; end if;
  if public.is_blocked_between(v_me, p_to) then raise exception 'Impossible d’envoyer un message à ce membre'; end if;
  if (select count(*) from messages where sender_id = v_me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Tu envoies beaucoup de messages : patiente un instant';
  end if;
  v_a := least(v_me, p_to); v_b := greatest(v_me, p_to);
  select * into c from conversations where user_a = v_a and user_b = v_b for update;
  if not found then
    if (select is_invisible from profiles where id = p_to) then raise exception 'Ce membre ne reçoit pas de messages'; end if;
    if (select count(*) from conversations where created_by = v_me and created_at > now() - interval '1 day') >= 15 then
      raise exception 'Limite atteinte : 15 nouvelles conversations par jour';
    end if;
    insert into conversations (user_a, user_b, created_by) values (v_a, v_b, v_me) returning * into c;
  elsif c.status = 'declined' then
    raise exception 'Ce membre n’a pas accepté ta demande de message';
  elsif c.status = 'request' then
    if c.created_by = v_me then
      if (select count(*) from messages where conversation_id = c.id) >= 3 then
        raise exception 'Attends que ce membre accepte ta demande avant d’envoyer d’autres messages';
      end if;
    else
      update conversations set status = 'active', accepted_at = now() where id = c.id;   -- répondre = accepter
    end if;
  end if;
  insert into messages (conversation_id, sender_id, body) values (c.id, v_me, v_body);
  update conversations set last_message_at = now(), last_sender = v_me, last_preview = left(v_body, 140),
         a_read_at = case when v_a = v_me then now() else a_read_at end,
         b_read_at = case when v_b = v_me then now() else b_read_at end,
         a_hidden_at = null, b_hidden_at = null
   where id = c.id;
  return c.id;
end $$;

create or replace function public.respond_request(p_conv uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.conversations%rowtype;
begin
  select * into c from conversations where id = p_conv;
  if not found or auth.uid() not in (c.user_a, c.user_b) or c.created_by = auth.uid() or c.status <> 'request' then
    raise exception 'Demande introuvable';
  end if;
  update conversations set status = case when p_accept then 'active' else 'declined' end,
         accepted_at = case when p_accept then now() else null end,
         a_hidden_at = case when not p_accept and user_a = auth.uid() then now() else a_hidden_at end,
         b_hidden_at = case when not p_accept and user_b = auth.uid() then now() else b_hidden_at end
   where id = p_conv;
end $$;

create or replace function public.mark_conversation_read(p_conv uuid)
returns void language sql security definer set search_path = public as $$
  update conversations set a_read_at = case when user_a = auth.uid() then now() else a_read_at end,
                           b_read_at = case when user_b = auth.uid() then now() else b_read_at end
   where id = p_conv and auth.uid() in (user_a, user_b);
$$;

-- Masquer une conversation de sa liste (elle réapparaît si un nouveau message arrive)
create or replace function public.hide_conversation(p_conv uuid)
returns void language sql security definer set search_path = public as $$
  update conversations set a_hidden_at = case when user_a = auth.uid() then now() else a_hidden_at end,
                           b_hidden_at = case when user_b = auth.uid() then now() else b_hidden_at end
   where id = p_conv and auth.uid() in (user_a, user_b);
$$;

create or replace function public.block_member(p_user uuid, p_block boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_user is null or p_user = auth.uid() then raise exception 'Membre invalide'; end if;
  if p_block then
    insert into blocks (blocker_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
    update conversations set a_hidden_at = case when user_a = auth.uid() then now() else a_hidden_at end,
                             b_hidden_at = case when user_b = auth.uid() then now() else b_hidden_at end
     where user_a = least(auth.uid(), p_user) and user_b = greatest(auth.uid(), p_user);
  else
    delete from blocks where blocker_id = auth.uid() and blocked_id = p_user;
  end if;
end $$;

-- Liste de mes conversations, avec l'autre membre et le nombre de messages non lus
create or replace function public.my_conversations()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'last_message_at' desc nulls last), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', c.id, 'status', c.status, 'mine', c.created_by = auth.uid(), 'last_message_at', c.last_message_at,
      'last_preview', c.last_preview, 'last_from_me', c.last_sender = auth.uid(),
      'other', jsonb_build_object('id', p.id, 'pseudo', p.pseudo, 'avatar_path', p.avatar_path, 'city', p.city),
      'blocked', exists (select 1 from blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id),
      'unread', (select count(*) from messages m where m.conversation_id = c.id and m.sender_id <> auth.uid()
                  and m.created_at > coalesce(case when c.user_a = auth.uid() then c.a_read_at else c.b_read_at end, '-infinity'))) as x
      from conversations c
      join profiles p on p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
     where auth.uid() in (c.user_a, c.user_b)
       and c.last_message_at is not null
       and (case when c.user_a = auth.uid() then c.a_hidden_at else c.b_hidden_at end) is null
       and not (c.status = 'declined' and c.created_by <> auth.uid())
  ) s;
$$;

create or replace function public.unread_messages()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from messages m join conversations c on c.id = m.conversation_id
   where auth.uid() in (c.user_a, c.user_b) and m.sender_id <> auth.uid() and c.status <> 'declined'
     and (case when c.user_a = auth.uid() then c.a_hidden_at else c.b_hidden_at end) is null
     and m.created_at > coalesce(case when c.user_a = auth.uid() then c.a_read_at else c.b_read_at end, '-infinity');
$$;

-- Notification à chaque message (envoi immédiat)
create or replace function public.ntext_msg(p_lang text, p_key text)
returns text language sql immutable as $$
  select case coalesce(p_lang, 'fr')
    when 'en' then case p_key when 'neutral' then 'You have a new message.' when 'request' then 'New message request' end
    when 'de' then case p_key when 'neutral' then 'Du hast eine neue Nachricht.' when 'request' then 'Neue Nachrichtenanfrage' end
    else case p_key when 'neutral' then 'Tu as un nouveau message.' when 'request' then 'Nouvelle demande de message' end end;
$$;

create or replace function public.messages_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.conversations%rowtype; v_to uuid; p public.profiles%rowtype; v_from text;
begin
  select * into c from conversations where id = new.conversation_id;
  v_to := case when c.user_a = new.sender_id then c.user_b else c.user_a end;
  select * into p from profiles where id = v_to;
  if not found or not p.notif_messages or c.status = 'declined' or public.is_blocked_between(v_to, new.sender_id) then return new; end if;
  select pseudo into v_from from profiles where id = new.sender_id;
  insert into push_outbox (user_id, title, body, url, tag)
  values (v_to,
          case when p.notif_neutral then 'EuroKink' when c.status = 'request' then public.ntext_msg(p.lang, 'request') else v_from end,
          case when p.notif_neutral then public.ntext_msg(p.lang, 'neutral')
               when c.status = 'request' then v_from || ' : ' || left(new.body, 80) else left(new.body, 120) end,
          '#/messages/' || c.id, 'msg-' || c.id);
  perform net.http_post(url := 'https://odaruyzivqmuvxosvqfd.supabase.co/functions/v1/send-push',
    body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 30000);
  return new;
end $$;
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages for each row execute function public.messages_notify();

revoke execute on function public.send_message(uuid, text), public.respond_request(uuid, boolean), public.mark_conversation_read(uuid),
  public.hide_conversation(uuid), public.block_member(uuid, boolean), public.my_conversations(), public.unread_messages(),
  public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.send_message(uuid, text), public.respond_request(uuid, boolean), public.mark_conversation_read(uuid),
  public.hide_conversation(uuid), public.block_member(uuid, boolean), public.my_conversations(), public.unread_messages() to authenticated;
