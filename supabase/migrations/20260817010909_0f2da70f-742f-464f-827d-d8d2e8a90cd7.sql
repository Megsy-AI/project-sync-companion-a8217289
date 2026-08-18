CREATE TABLE IF NOT EXISTS public.prize_broadcast_log (
  profile_id uuid PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.prize_broadcast_log TO service_role;

ALTER TABLE public.prize_broadcast_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages prize broadcast log"
ON public.prize_broadcast_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);