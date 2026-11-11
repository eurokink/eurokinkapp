-- =====================================================================
-- EuroKink — appli réservée aux membres : sans compte, aucune soirée lisible
-- =====================================================================
revoke select on public.events, public.organizers, public.venues, public.event_event_types from anon;
drop policy if exists "events_read" on public.events;
create policy "events_read" on public.events for select to authenticated
  using (status in ('published', 'cancelled') or public.is_organizer_member(organizer_id) or public.is_admin());
drop policy if exists "organizers_read" on public.organizers;
create policy "organizers_read" on public.organizers for select to authenticated using (true);
drop policy if exists "venues_read" on public.venues;
create policy "venues_read" on public.venues for select to authenticated using (true);
drop policy if exists "event_types_link_read" on public.event_event_types;
create policy "event_types_link_read" on public.event_event_types for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id));
revoke execute on function public.search_events(double precision, double precision, integer, timestamptz, timestamptz, smallint[], numeric, boolean, boolean, text, integer, integer) from public, anon;
revoke execute on function public.event_attendee_counts() from public, anon;
revoke execute on function public.attendee_count(uuid) from public, anon;
revoke execute on function public.distance_m(double precision, double precision, double precision, double precision) from public, anon;
