CREATE TABLE IF NOT EXISTS public.auto_notification_log (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic text NOT NULL DEFAULT 'mining',
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.auto_notification_log TO service_role;

ALTER TABLE public.auto_notification_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS auto_notification_log_last_sent_idx ON public.auto_notification_log (last_sent_at);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('auto-notifications-every-4h') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-notifications-every-4h');

SELECT cron.schedule(
  'auto-notifications-every-4h',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ltgampdtawuefwwayncx.supabase.co/functions/v1/auto-notifications',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  );
  $$
);