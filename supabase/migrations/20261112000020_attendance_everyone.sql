-- 20 : « Qui y va ? » — par défaut, les sorties d'un membre sont visibles de tous les membres connectés
alter table public.profiles alter column attendance_visibility set default 'everyone';
update public.profiles set attendance_visibility = 'everyone' where attendance_visibility = 'followed';
