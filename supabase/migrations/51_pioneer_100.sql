-- Badge Pionnier : réservé aux 100 premiers membres (au lieu de 500)
insert into public.app_settings (key, value) values ('pioneer_limit', '100'::jsonb)
on conflict (key) do update set value = excluded.value;
update public.badges set description = 'Parmi les 100 premiers membres d''EuroKink.' where code = 'pioneer';
