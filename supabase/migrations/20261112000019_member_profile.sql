-- 19 : fiche membre — centres d'intérêt (types de soirée), en plus de la bio existante
alter table public.profiles
  add column if not exists interests text[] not null default '{}'
    check (cardinality(interests) <= 8);
