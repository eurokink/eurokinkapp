-- Un admin peut créer une organisation seule (sans soirée), pour y lier des soirées
-- ou inviter plus tard ses gérants depuis l'espace organisateur.
create or replace function public.admin_create_organizer(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p->>'name', ''));
  v_site text := nullif(btrim(coalesce(p->>'website', '')), '');
  v_kind public.organizer_kind := coalesce(nullif(p->>'kind', ''), 'other')::public.organizer_kind;
  v_country text := upper(coalesce(nullif(p->>'country', ''), 'FR'));
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'Le nom doit faire entre 2 et 80 caractères'; end if;
  if v_site is not null and v_site !~* '^https?://\S+$' then raise exception 'Le site doit commencer par https://'; end if;
  if not exists (select 1 from countries where code = v_country) then raise exception 'Pays inconnu'; end if;
  if exists (select 1 from organizers where lower(name) = lower(v_name)) then
    raise exception 'Une organisation porte déjà ce nom';
  end if;
  insert into organizers (name, kind, website, city, country, description, created_by)
  values (v_name, v_kind, v_site, nullif(btrim(coalesce(p->>'city', '')), ''), v_country,
          nullif(btrim(coalesce(p->>'description', '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.admin_create_organizer(jsonb) from public, anon;
grant execute on function public.admin_create_organizer(jsonb) to authenticated;
