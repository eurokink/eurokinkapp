-- EuroKink — envoi des notifications toutes les 10 minutes
select cron.schedule('eurokink-notifications', '*/10 * * * *', $$
  select net.http_post(url := 'https://odaruyzivqmuvxosvqfd.supabase.co/functions/v1/send-push',
    body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 60000);
$$);
