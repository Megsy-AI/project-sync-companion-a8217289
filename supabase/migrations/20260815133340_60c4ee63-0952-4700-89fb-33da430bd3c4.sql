CREATE TABLE IF NOT EXISTS public.ai_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'none',
  expires_at timestamptz,
  period_start timestamptz NOT NULL DEFAULT now(),
  images_used integer NOT NULL DEFAULT 0,
  videos_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_subscriptions TO service_role;
ALTER TABLE public.ai_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_subscriptions_service_only" ON public.ai_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  kind text NOT NULL,
  model text NOT NULL,
  prompt text NOT NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_generations TO service_role;
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_generations_service_only" ON public.ai_generations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS ai_generations_profile_idx ON public.ai_generations (profile_id, created_at DESC);

CREATE TRIGGER ai_subscriptions_set_updated_at
BEFORE UPDATE ON public.ai_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.game_touch_updated_at();

CREATE OR REPLACE FUNCTION public.ai_activate_plan(_profile_id uuid, _plan text, _price numeric)
RETURNS public.ai_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bal numeric;
  _row public.ai_subscriptions;
BEGIN
  SELECT COALESCE(usdt_balance, 0) INTO _bal FROM public.profiles WHERE id = _profile_id FOR UPDATE;
  IF _bal IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
  IF _bal < _price THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE public.profiles SET usdt_balance = COALESCE(usdt_balance, 0) - _price WHERE id = _profile_id;

  INSERT INTO public.ai_subscriptions (profile_id, plan, status, expires_at, period_start, images_used, videos_used)
  VALUES (_profile_id, _plan, 'active', now() + interval '30 days', now(), 0, 0)
  ON CONFLICT (profile_id) DO UPDATE
    SET plan = EXCLUDED.plan,
        status = 'active',
        expires_at = now() + interval '30 days',
        period_start = now(),
        images_used = 0,
        videos_used = 0
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_activate_plan(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_activate_plan(uuid, text, numeric) TO service_role;