-- Envoi des notifications : chaque ligne n'est prise que par un seul envoi à la fois (évite les doublons quand plusieurs envois tournent en même temps)
alter table public.push_outbox add column if not exists claimed_at timestamptz;
create or replace function public.claim_push_batch(p_limit integer default 300)
returns setof public.push_outbox language sql security definer set search_path = public as $$
  update push_outbox o set claimed_at = now()
   where o.id in (select id from push_outbox
                   where sent_at is null and attempts < 5 and created_at > now() - interval '2 days'
                     and (claimed_at is null or claimed_at < now() - interval '5 minutes')
                   order by id limit p_limit for update skip locked)
  returning o.*;
$$;
revoke execute on function public.claim_push_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;
