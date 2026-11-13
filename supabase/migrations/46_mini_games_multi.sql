-- Plusieurs mini-jeux : un score par membre et par jeu (voir la base pour le détail des fonctions game_open / game_board / game_submit)
alter table public.game_scores add column if not exists game text not null default 'bouche';
alter table public.game_scores drop constraint if exists game_scores_pkey;
alter table public.game_scores add primary key (user_id, game);
create index if not exists game_scores_board on public.game_scores (game, best desc);
-- game_open(p_game text), game_board(p_game text), game_submit(p_game text, p_score integer) remplacent les versions sans p_game.
-- Phase de test : game_open = p_game in ('gearup','bouche') and is_admin().
