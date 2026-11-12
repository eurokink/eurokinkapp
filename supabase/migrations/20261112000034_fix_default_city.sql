-- Profils placés à Nantes par défaut (ville jamais choisie à l'inscription) : on retire la position,
-- l'appli leur demande de choisir leur ville
update public.profiles set latitude = null, longitude = null
 where city = 'Nantes' and postal_code is null and created_at < '2026-11-12 21:00:00+00';
