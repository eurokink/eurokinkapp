-- Pseudos réservés à l'équipe (anti-usurpation) et badge « Équipe EuroKink » dans la messagerie
create or replace function public.pseudo_reserved(p text)
returns boolean language sql immutable set search_path = public as $$
  select regexp_replace(lower(translate(coalesce(p, ''), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc')), '[^a-z0-9]', '', 'g')
    ~ '(eurokink|admin|moderat|staff|support|officiel|official)';
$$;

create or replace function public.pseudo_available(p_pseudo text)
returns boolean language sql stable security definer set search_path = public as $$
  select char_length(trim(p_pseudo)) between 3 and 30 and not public.pseudo_reserved(p_pseudo)
     and not exists (select 1 from public.profiles where lower(pseudo) = lower(trim(p_pseudo)));
$$;

create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.role <> 'member' and not public.is_admin() then new.role := 'member'; end if;
  elsif new.role is distinct from old.role and not public.is_trusted() then
    raise exception 'Seul un administrateur peut modifier un rôle';
  end if;
  if (tg_op = 'INSERT' or new.pseudo is distinct from old.pseudo) and public.pseudo_reserved(new.pseudo) and not public.is_trusted() then
    raise exception 'Ce pseudo est réservé à l’équipe EuroKink, choisis-en un autre.';
  end if;
  return new;
end $$;

do $$
declare d text := pg_get_functiondef('public.my_conversations()'::regprocedure); o text := d;
begin
  d := regexp_replace(d, $q$'city',\s*p\.city,$q$, $q$'city', p.city, 'team', p.role = 'admin',$q$);
  if d = o then raise exception 'my_conversations : remplacement introuvable'; end if;
  execute d;
end $$;
