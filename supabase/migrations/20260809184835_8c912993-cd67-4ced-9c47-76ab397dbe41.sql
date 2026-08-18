CREATE TABLE IF NOT EXISTS public.mining_reminders (
  profile_id uuid PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  sent_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mining_reminders TO service_role;
ALTER TABLE public.mining_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages mining reminders" ON public.mining_reminders FOR ALL TO service_role USING (true) WITH CHECK (true);