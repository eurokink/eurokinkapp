-- EuroKink — logo des organisateurs (lien https ou fichier du bucket « event-images »)
alter table public.organizers add column if not exists logo_path text
  check (logo_path is null or (char_length(logo_path) <= 500
         and (logo_path ~* '^https://[^\s"''<>]+$' or logo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$')));
