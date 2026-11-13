-- Messagerie : un admin écrit à qui il veut, sans demande à accepter ni limites d'envoi
create or replace function public.send_message(p_to uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $function$
declare v_me uuid := auth.uid(); v_admin boolean := public.is_admin(); v_a uuid; v_b uuid; c public.conversations%rowtype; v_body text := btrim(coalesce(p_body, ''));
begin
  if v_me is null or not exists (select 1 from profiles where id = v_me) then raise exception 'Connecte-toi pour envoyer un message'; end if;
  if p_to is null or p_to = v_me then raise exception 'Destinataire invalide'; end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'Message vide ou trop long (2 000 caractères maximum)'; end if;
  if not exists (select 1 from profiles where id = p_to) then raise exception 'Ce membre n’existe plus'; end if;
  if not v_admin then
    if public.is_blocked_between(v_me, p_to) then raise exception 'Impossible d’envoyer un message à ce membre'; end if;
    if (select count(*) from messages where sender_id = v_me and created_at > now() - interval '1 minute') >= 20 then
      raise exception 'Tu envoies beaucoup de messages : patiente un instant';
    end if;
  end if;
  v_a := least(v_me, p_to); v_b := greatest(v_me, p_to);
  select * into c from conversations where user_a = v_a and user_b = v_b for update;
  if not found then
    if not v_admin then
      if (select is_invisible from profiles where id = p_to) then raise exception 'Ce membre ne reçoit pas de messages'; end if;
      if (select count(*) from conversations where created_by = v_me and created_at > now() - interval '1 day') >= 15 then
        raise exception 'Limite atteinte : 15 nouvelles conversations par jour';
      end if;
    end if;
    insert into conversations (user_a, user_b, created_by) values (v_a, v_b, v_me) returning * into c;
    if v_admin then update conversations set status = 'active', accepted_at = now() where id = c.id; end if;
  elsif v_admin then
    if c.status <> 'active' then update conversations set status = 'active', accepted_at = coalesce(accepted_at, now()) where id = c.id; end if;
  elsif c.status = 'declined' then
    raise exception 'Ce membre n’a pas accepté ta demande de message';
  elsif c.status = 'request' then
    if c.created_by = v_me then
      if (select count(*) from messages where conversation_id = c.id) >= 3 then
        raise exception 'Attends que ce membre accepte ta demande avant d’envoyer d’autres messages';
      end if;
    else
      update conversations set status = 'active', accepted_at = now() where id = c.id;
    end if;
  end if;
  insert into messages (conversation_id, sender_id, body) values (c.id, v_me, v_body);
  update conversations set last_message_at = now(), last_sender = v_me, last_preview = left(v_body, 140),
         a_read_at = case when v_a = v_me then now() else a_read_at end,
         b_read_at = case when v_b = v_me then now() else b_read_at end,
         a_hidden_at = null, b_hidden_at = null
   where id = c.id;
  return c.id;
end $function$;
