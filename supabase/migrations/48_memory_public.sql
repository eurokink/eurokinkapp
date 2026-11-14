-- MemoryKink ouvert à tous les membres ; Bouche bée reste réservé aux administrateurs
create or replace function public.game_open(p_game text) returns boolean
language sql stable security definer set search_path = public as $$ select p_game = 'memory' or (p_game = 'bouche' and public.is_admin()) $$;
