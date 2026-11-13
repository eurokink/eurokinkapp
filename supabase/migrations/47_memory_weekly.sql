-- Mini-jeu « Memory Fetish » et défi de la semaine (classement remis à zéro chaque lundi, heure de Paris)
create or replace function public.game_week(p_offset integer default 0) returns date
language sql stable set search_path = public as $$
  select (date_trunc('week', now() at time zone 'Europe/Paris') + make_interval(weeks => p_offset))::date $$;

create table if not exists public.game_weekly (
  user_id uuid not null references public.profiles(id) on delete cascade,
  game text not null,
  week date not null,
  best integer not null default 0 check (best >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, game, week)
);
create index if not exists game_weekly_board on public.game_weekly (game, week, best desc);
alter table public.game_weekly enable row level security;
revoke all on public.game_weekly from anon, authenticated;

-- Phase de test : jeux réservés aux administrateurs. Pour ouvrir Memory à tous : « p_game = 'memory' or (… and is_admin()) ».
create or replace function public.game_open(p_game text) returns boolean
language sql stable security definer set search_path = public as $$ select p_game in ('memory', 'bouche') and public.is_admin() $$;

-- Champion d'un jeu = meilleur score de la semaine précédente (profil visible et non suspendu)
create or replace function public.game_champion(p_game text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', w.user_id, 'pseudo', p.pseudo, 'best', w.best)
    from game_weekly w join profiles p on p.id = w.user_id
   where w.game = p_game and w.week = public.game_week(-1) and w.best > 0
     and not p.is_invisible and (p.suspended_until is null or p.suspended_until < now())
   order by w.best desc, w.updated_at limit 1 $$;

-- Identifiants des champions en titre (pour afficher le badge sur les profils)
create or replace function public.game_champions() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then '[]'::jsonb
    else coalesce((select jsonb_agg(c -> 'id') from (select public.game_champion('memory') c) s where c is not null), '[]'::jsonb) end $$;

create or replace function public.game_board(p_game text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_best int; v_week int; v_w date := public.game_week();
begin
  if v_me is null or not public.game_open(p_game) then raise exception 'Jeu indisponible'; end if;
  select best into v_best from game_scores where user_id = v_me and game = p_game;
  select best into v_week from game_weekly where user_id = v_me and game = p_game and week = v_w;
  return jsonb_build_object(
    'best', coalesce(v_best, 0),
    'week_best', coalesce(v_week, 0),
    'rank', case when coalesce(v_week, 0) > 0 then (select count(*) + 1 from game_weekly where game = p_game and week = v_w and best > v_week) end,
    'players', (select count(*) from game_weekly where game = p_game and week = v_w and best > 0),
    'days_left', (v_w + 7) - (now() at time zone 'Europe/Paris')::date,
    'champion', public.game_champion(p_game),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('pseudo', t.pseudo, 'best', t.best, 'me', t.user_id = v_me) order by t.best desc, t.updated_at), '[]'::jsonb)
              from (select g.user_id, g.best, g.updated_at, p.pseudo from game_weekly g join profiles p on p.id = g.user_id
                     where g.game = p_game and g.week = v_w and g.best > 0 and (not p.is_invisible or g.user_id = v_me)
                       and (p.suspended_until is null or p.suspended_until < now())
                     order by g.best desc, g.updated_at limit 20) t));
end $$;

create or replace function public.game_submit(p_game text, p_score integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null or not public.game_open(p_game) then raise exception 'Jeu indisponible'; end if;
  perform public.assert_not_suspended();
  if p_score is null or p_score < 0 or p_score > 3000 or (p_game = 'memory' and p_score > 1000) then raise exception 'Score invalide'; end if;
  insert into game_scores (user_id, game, best, plays) values (v_me, p_game, p_score, 1)
  on conflict (user_id, game) do update set plays = game_scores.plays + 1,
    updated_at = case when excluded.best > game_scores.best then now() else game_scores.updated_at end,
    best = greatest(game_scores.best, excluded.best);
  insert into game_weekly (user_id, game, week, best) values (v_me, p_game, public.game_week(), p_score)
  on conflict (user_id, game, week) do update set
    updated_at = case when excluded.best > game_weekly.best then now() else game_weekly.updated_at end,
    best = greatest(game_weekly.best, excluded.best);
  return public.game_board(p_game);
end $$;

revoke all on function public.game_week(integer), public.game_open(text), public.game_champion(text), public.game_champions(), public.game_board(text), public.game_submit(text, integer) from public, anon;
grant execute on function public.game_week(integer), public.game_open(text), public.game_champions(), public.game_board(text), public.game_submit(text, integer) to authenticated;
