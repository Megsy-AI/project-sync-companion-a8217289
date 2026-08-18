CREATE TABLE public.star_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid,
  telegram_id bigint,
  product text NOT NULL,
  stars integer NOT NULL,
  payload text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  charge_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

GRANT ALL ON public.star_payments TO service_role;

ALTER TABLE public.star_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages star payments"
ON public.star_payments FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_star_payments_profile ON public.star_payments (profile_id);