-- Mini-jeu « Bouche bée » : meilleurs scores et classement
create table if not exists public.game_scores (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  best integer not null default 0 check (best >= 0),
  plays integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.game_scores enable row level security;
revoke all on public.game_scores from anon, authenticated;

-- Phase de test : jeu réservé aux administrateurs. À l'ouverture publique : remplacer par « select true ».
create or replace function public.game_open() returns boolean
language sql stable security definer set search_path = public as $$ select public.is_admin() $$;

create or replace function public.game_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_best int;
begin
  if v_me is null or not public.game_open() then raise exception 'Jeu indisponible'; end if;
  select best into v_best from game_scores where user_id = v_me;
  return jsonb_build_object(
    'best', coalesce(v_best, 0),
    'rank', case when coalesce(v_best, 0) > 0 then (select count(*) + 1 from game_scores where best > v_best) end,
    'players', (select count(*) from game_scores where best > 0),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('pseudo', t.pseudo, 'best', t.best, 'me', t.user_id = v_me) order by t.best desc, t.updated_at), '[]'::jsonb)
              from (select g.user_id, g.best, g.updated_at, p.pseudo from game_scores g join profiles p on p.id = g.user_id
                     where g.best > 0 and (not p.is_invisible or g.user_id = v_me)
                       and (p.suspended_until is null or p.suspended_until < now())
                     order by g.best desc, g.updated_at limit 20) t));
end $$;

create or replace function public.game_submit(p_score integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null or not public.game_open() then raise exception 'Jeu indisponible'; end if;
  perform public.assert_not_suspended();
  if p_score is null or p_score < 0 or p_score > 3000 then raise exception 'Score invalide'; end if;
  insert into game_scores (user_id, best, plays) values (v_me, p_score, 1)
  on conflict (user_id) do update set plays = game_scores.plays + 1,
    updated_at = case when excluded.best > game_scores.best then now() else game_scores.updated_at end,
    best = greatest(game_scores.best, excluded.best);
  return public.game_board();
end $$;

revoke all on function public.game_open(), public.game_board(), public.game_submit(integer) from public, anon;
grant execute on function public.game_open(), public.game_board(), public.game_submit(integer) to authenticated;
