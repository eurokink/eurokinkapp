-- EuroKink — cadrage du visuel (point visible en %, 50/50 = centre)
alter table public.events
  add column if not exists image_x smallint not null default 50 check (image_x between 0 and 100),
  add column if not exists image_y smallint not null default 50 check (image_y between 0 and 100);

drop function if exists public.set_event_image(uuid, text);
create or replace function public.set_event_image(p_event uuid, p_image text, p_x integer default 50, p_y integer default 50)
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
  update events set image_path = v,
         image_x = greatest(0, least(100, coalesce(p_x, 50))),
         image_y = greatest(0, least(100, coalesce(p_y, 50)))
   where id = p_event;
end $$;

create or replace function public.event_for_edit(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'id', e.id, 'title', e.title, 'description', e.description, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'price', e.price, 'presale_price', e.presale_price, 'dress_code', e.dress_code, 'dress_code_details', e.dress_code_details,
    'booking', e.booking, 'ticket_url', e.ticket_url, 'sales_open_at', e.sales_open_at, 'is_sold_out', e.is_sold_out,
    'has_cloakroom', e.has_cloakroom, 'cloakroom_paid', e.cloakroom_paid, 'frequency', e.frequency,
    'status', e.status, 'image_path', e.image_path, 'image_x', e.image_x, 'image_y', e.image_y, 'organizer_id', e.organizer_id,
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

revoke execute on function public.set_event_image(uuid, text, integer, integer) from public, anon;
grant execute on function public.set_event_image(uuid, text, integer, integer) to authenticated;
