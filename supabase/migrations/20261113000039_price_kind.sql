-- Tarif : prix unique, plusieurs prix (« dès »), gratuit, ou non communiqué
alter table public.events add column if not exists price_kind text not null default 'fixed';
alter table public.events drop constraint if exists events_price_kind_check;
alter table public.events add constraint events_price_kind_check check (price_kind in ('fixed', 'from', 'free', 'unknown'));
-- un prix à 0 n'a jamais été confirmé comme gratuit : on le passe en « non communiqué »
update public.events set price_kind = 'unknown' where coalesce(price, 0) = 0 and price_kind = 'fixed';

-- À la création (robot compris), un prix vide ou à 0 sans précision devient « non communiqué »
create or replace function public.events_price_kind()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.price_kind = 'fixed' and coalesce(new.price, 0) = 0 then new.price_kind := 'unknown'; end if;
  if new.price_kind in ('free', 'unknown') then new.price := 0; new.presale_price := null; end if;
  return new;
end $$;
drop trigger if exists events_price_kind on public.events;
create trigger events_price_kind before insert or update of price, price_kind on public.events for each row execute function public.events_price_kind();
revoke execute on function public.events_price_kind() from public, anon, authenticated;

-- Formulaire : le choix du membre est enregistré (et contrôlé)
do $$
declare d text := pg_get_functiondef('public.submit_event(jsonb)'::regprocedure); o text := d;
begin
  d := replace(d, $q$insert into event_event_types (event_id, type_id) select v_event, unnest(v_types);$q$,
$q$if coalesce(p->>'price_kind', 'fixed') not in ('fixed', 'from', 'free', 'unknown') then raise exception 'Tarif invalide'; end if;
  if coalesce(p->>'price_kind', 'fixed') in ('fixed', 'from') and coalesce((p->>'price')::numeric, 0) <= 0 then raise exception 'Indique le prix d''entrée (ou choisis « Gratuit » ou « Non communiqué »)'; end if;
  update events set price_kind = coalesce(p->>'price_kind', case when coalesce((p->>'price')::numeric, 0) = 0 then 'unknown' else 'fixed' end)
   where id = v_event and price_kind is distinct from coalesce(p->>'price_kind', case when coalesce((p->>'price')::numeric, 0) = 0 then 'unknown' else 'fixed' end);
  insert into event_event_types (event_id, type_id) select v_event, unnest(v_types);$q$);
  if d = o then raise exception 'submit_event : point d''insertion introuvable'; end if;
  execute d;
  d := pg_get_functiondef('public.event_for_edit(uuid)'::regprocedure); o := d;
  d := regexp_replace(d, $q$'price',\s*e\.price,$q$, $q$'price', e.price, 'price_kind', e.price_kind,$q$);
  if d = o then raise exception 'event_for_edit : remplacement introuvable'; end if;
  execute d;
end $$;
