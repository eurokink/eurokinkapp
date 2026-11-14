-- admin_stats : messages, messages 7 j et discussions excluent les conversations avec le compte système EuroKink
-- (messages de bienvenue / annonces automatiques).
do $$ declare d text; begin
  select pg_get_functiondef('public.admin_stats()'::regprocedure) into d;
  d := replace(d, $x$(select count(*) from messages where created_at > now() - interval '7 days')$x$,
    $x$(select count(*) from messages m join conversations c on c.id = m.conversation_id where m.created_at > now() - interval '7 days' and public.system_id() not in (c.user_a, c.user_b))$x$);
  d := replace(d, $x$'messages', (select count(*) from messages)$x$,
    $x$'messages', (select count(*) from messages m join conversations c on c.id = m.conversation_id where public.system_id() not in (c.user_a, c.user_b))$x$);
  d := replace(d, $x$(select count(*) from conversations where status = 'active')$x$,
    $x$(select count(*) from conversations where status = 'active' and public.system_id() not in (user_a, user_b))$x$);
  execute d;
end $$;
