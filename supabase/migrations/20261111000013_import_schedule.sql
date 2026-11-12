-- EuroKink — passage automatique du robot chaque jour à 6 h 17 (heure de Paris en hiver)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.schedule('eurokink-import-quotidien', '17 5 * * *', $$
  select net.http_post(url := 'https://odaruyzivqmuvxosvqfd.supabase.co/functions/v1/import-events',
    body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 150000);
$$);
