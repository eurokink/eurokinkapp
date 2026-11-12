-- 29 : présence en ligne (point vert) et accusés de distribution / lecture des messages
alter table public.profiles
  add column if not exists last_seen_at timestamptz,
  add column if not exists show_online boolean not null default true;
alter table public.conversations
  add column if not exists a_delivered_at timestamptz,
  add column if not exists b_delivered_at timestamptz;

-- Appelée par l'appli ouverte (toutes les minutes) : « en ligne » + messages reçus marqués distribués
create or replace function public.touch_presence()
returns void language sql security definer set search_path = public as $$
  update profiles set last_seen_at = case when show_online then now() else null end where id = auth.uid();
  update conversations set a_delivered_at = now() where user_a = auth.uid() and last_message_at > coalesce(a_delivered_at, '-infinity');
  update conversations set b_delivered_at = now() where user_b = auth.uid() and last_message_at > coalesce(b_delivered_at, '-infinity');
$$;

create or replace function public.mark_conversation_read(p_conv uuid)
returns void language sql security definer set search_path = public as $$
  update conversations set a_read_at = case when user_a = auth.uid() then now() else a_read_at end,
                           b_read_at = case when user_b = auth.uid() then now() else b_read_at end,
                           a_delivered_at = case when user_a = auth.uid() then now() else a_delivered_at end,
                           b_delivered_at = case when user_b = auth.uid() then now() else b_delivered_at end
   where id = p_conv and auth.uid() in (user_a, user_b);
$$;

create or replace function public.my_conversations()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'last_message_at' desc nulls last), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', c.id, 'status', c.status, 'mine', c.created_by = auth.uid(), 'last_message_at', c.last_message_at,
      'last_preview', c.last_preview, 'last_from_me', c.last_sender = auth.uid(),
      'other_read_at', case when c.user_a = auth.uid() then c.b_read_at else c.a_read_at end,
      'other_delivered_at', case when c.user_a = auth.uid() then c.b_delivered_at else c.a_delivered_at end,
      'other', jsonb_build_object('id', p.id, 'pseudo', p.pseudo, 'avatar_path', p.avatar_path, 'city', p.city,
                                  'last_seen_at', case when p.show_online then p.last_seen_at end),
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

revoke execute on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;
