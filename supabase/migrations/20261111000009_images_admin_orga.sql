-- =====================================================================
-- EuroKink — visuels de soirée, édition avant validation, admin organisateur
-- =====================================================================

-- Visuel : lien https externe ou fichier du bucket « event-images » (<dossier uuid>/<fichier>)
create or replace function public.set_event_image(p_event uuid, p_image text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.events%rowtype; v text := nullif(btrim(coalesce(p_image, '')), '');
begin
  select * into e from events where id = p_event;
  if not found or not (public.is_admin() or public.is_organizer_member(e.organizer_id)
                       or (e.created_by = auth.uid() and e.status = 'pending')) then
    raise exception 'Tu ne peux pas modifier cette soirée';
  end if;
  if v is not null and char_length(v) > 500 then raise exception 'Lien d''image trop long'; end if;
  if v is not null and v !~* '^https://[^\s"''<>]+$' and v !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$' then
    raise exception 'Image invalide : colle un lien commençant par https://';
  end if;
  update events set image_path = v where id = p_event;
end $$;

-- Toutes les infos d'une soirée pour la modifier (gestionnaire ou admin)
create or replace function public.event_for_edit(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'id', e.id, 'title', e.title, 'description', e.description, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'price', e.price, 'presale_price', e.presale_price, 'dress_code', e.dress_code, 'dress_code_details', e.dress_code_details,
    'booking', e.booking, 'ticket_url', e.ticket_url, 'sales_open_at', e.sales_open_at, 'is_sold_out', e.is_sold_out,
    'has_cloakroom', e.has_cloakroom, 'cloakroom_paid', e.cloakroom_paid, 'frequency', e.frequency,
    'status', e.status, 'image_path', e.image_path, 'organizer_id', e.organizer_id,
    'venue', jsonb_build_object('name', ve.name, 'address', ve.address, 'postal_code', ve.postal_code, 'city', ve.city,
                                'latitude', ve.latitude, 'longitude', ve.longitude),
    'types', (select coalesce(jsonb_agg(t.slug order by t.sort_order), '[]'::jsonb)
                from event_event_types et join event_types t on t.id = et.type_id where et.event_id = e.id))
    into v
    from events e join venues ve on ve.id = e.venue_id
   where e.id = p_event and (public.is_admin() or public.is_organizer_member(e.organizer_id));
  if v is null then raise exception 'Tu ne peux pas modifier cette soirée'; end if;
  return v;
end $$;

-- L'admin est organisateur d'office : il gère toutes les organisations
create or replace function public.my_organizer_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'organizations', case when public.is_admin()
      then (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'kind', o.kind, 'is_verified', o.is_verified) order by lower(o.name)), '[]'::jsonb) from organizers o)
      else (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'kind', o.kind, 'is_verified', o.is_verified) order by lower(o.name)), '[]'::jsonb)
              from organizer_members m join organizers o on o.id = m.organizer_id where m.user_id = auth.uid()) end,
    'all', public.is_admin(),
    'request', (select jsonb_build_object('name', r.name, 'status', r.status, 'rejection_reason', r.rejection_reason, 'created_at', r.created_at)
                  from organizer_requests r where r.user_id = auth.uid() order by r.created_at desc limit 1));
$$;

revoke execute on function public.set_event_image(uuid, text), public.event_for_edit(uuid), public.my_organizer_status() from public, anon;
grant execute on function public.set_event_image(uuid, text), public.event_for_edit(uuid), public.my_organizer_status() to authenticated;
