
CREATE TABLE public.staking_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('ton','siri')),
  duration_days integer NOT NULL CHECK (duration_days > 0),
  apr numeric NOT NULL CHECK (apr >= 0),
  min_amount numeric NOT NULL DEFAULT 0,
  max_amount numeric,
  early_exit_fee_pct numeric NOT NULL DEFAULT 20,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.staking_plans TO anon;
GRANT SELECT ON public.staking_plans TO authenticated;
GRANT ALL ON public.staking_plans TO service_role;

ALTER TABLE public.staking_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active staking plans"
  ON public.staking_plans FOR SELECT
  USING (true);

CREATE TABLE public.stakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.staking_plans(id),
  currency text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  apr numeric NOT NULL,
  duration_days integer NOT NULL,
  early_exit_fee_pct numeric NOT NULL DEFAULT 20,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  last_claim_at timestamptz NOT NULL DEFAULT now(),
  claimed_yield numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','early_closed')),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stakes TO authenticated;
GRANT ALL ON public.stakes TO service_role;

ALTER TABLE public.stakes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to stakes"
  ON public.stakes FOR SELECT
  USING (false);

CREATE INDEX idx_stakes_profile ON public.stakes(profile_id, status);

CREATE TRIGGER trg_staking_plans_updated_at BEFORE UPDATE ON public.staking_plans
  FOR EACH ROW EXECUTE FUNCTION public.game_touch_updated_at();
CREATE TRIGGER trg_stakes_updated_at BEFORE UPDATE ON public.stakes
  FOR EACH ROW EXECUTE FUNCTION public.game_touch_updated_at();

INSERT INTO public.staking_plans (name, currency, duration_days, apr, min_amount, early_exit_fee_pct, sort_order) VALUES
  ('TON Flex Bond', 'ton', 7, 18, 0.5, 25, 1),
  ('TON Growth Bond', 'ton', 30, 42, 1, 20, 2),
  ('TON Elite Bond', 'ton', 90, 90, 3, 15, 3),
  ('NOVA Flex Bond', 'siri', 7, 60, 1000, 25, 4),
  ('NOVA Growth Bond', 'siri', 30, 140, 5000, 20, 5),
  ('NOVA Elite Bond', 'siri', 90, 300, 20000, 15, 6);

CREATE OR REPLACE FUNCTION public.staking_pending_yield(_stake public.stakes)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT GREATEST(0, _stake.amount * (_stake.apr / 100.0)
    * (EXTRACT(EPOCH FROM (LEAST(now(), _stake.ends_at) - _stake.last_claim_at)) / 86400.0) / 365.0);
$$;

CREATE OR REPLACE FUNCTION public.staking_get_overview_for_telegram(_telegram_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pid uuid;
BEGIN
  SELECT id INTO _pid FROM public.profiles WHERE telegram_id = _telegram_id;

  RETURN jsonb_build_object(
    'success', true,
    'plans', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.sort_order)
      FROM public.staking_plans p WHERE p.is_active
    ), '[]'::jsonb),
    'stakes', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) || jsonb_build_object(
        'pending_yield', public.staking_pending_yield(s),
        'plan_name', pl.name
      ) ORDER BY s.created_at DESC)
      FROM public.stakes s
      JOIN public.staking_plans pl ON pl.id = s.plan_id
      WHERE s.profile_id = _pid
    ), '[]'::jsonb),
    'balances', (
      SELECT jsonb_build_object('ton', COALESCE(ton_balance,0), 'siri', COALESCE(siri_balance,0))
      FROM public.profiles WHERE id = _pid
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staking_create_for_telegram(_telegram_id bigint, _plan_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pid uuid;
  _plan public.staking_plans;
  _bal numeric;
  _stake_id uuid;
BEGIN
  SELECT id INTO _pid FROM public.profiles WHERE telegram_id = _telegram_id;
  IF _pid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;

  SELECT * INTO _plan FROM public.staking_plans WHERE id = _plan_id AND is_active;
  IF _plan.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'plan_not_found'); END IF;

  IF _amount IS NULL OR _amount <= 0 OR _amount < _plan.min_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount_too_low');
  END IF;
  IF _plan.max_amount IS NOT NULL AND _amount > _plan.max_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount_too_high');
  END IF;

  IF _plan.currency = 'ton' THEN
    SELECT COALESCE(ton_balance,0) INTO _bal FROM public.profiles WHERE id = _pid FOR UPDATE;
  ELSE
    SELECT COALESCE(siri_balance,0) INTO _bal FROM public.profiles WHERE id = _pid FOR UPDATE;
  END IF;

  IF _bal < _amount THEN RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance'); END IF;

  IF _plan.currency = 'ton' THEN
    UPDATE public.profiles SET ton_balance = COALESCE(ton_balance,0) - _amount WHERE id = _pid;
  ELSE
    UPDATE public.profiles SET siri_balance = COALESCE(siri_balance,0) - _amount WHERE id = _pid;
  END IF;

  INSERT INTO public.stakes (profile_id, plan_id, currency, amount, apr, duration_days, early_exit_fee_pct, ends_at)
  VALUES (_pid, _plan.id, _plan.currency, _amount, _plan.apr, _plan.duration_days, _plan.early_exit_fee_pct,
          now() + (_plan.duration_days || ' days')::interval)
  RETURNING id INTO _stake_id;

  RETURN jsonb_build_object('success', true, 'stake_id', _stake_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.staking_claim_for_telegram(_telegram_id bigint, _stake_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pid uuid;
  _stake public.stakes;
  _yield numeric;
BEGIN
  SELECT id INTO _pid FROM public.profiles WHERE telegram_id = _telegram_id;
  IF _pid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;

  SELECT * INTO _stake FROM public.stakes WHERE id = _stake_id AND profile_id = _pid AND status = 'active' FOR UPDATE;
  IF _stake.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'stake_not_found'); END IF;

  _yield := public.staking_pending_yield(_stake);
  IF _yield <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'nothing_to_claim'); END IF;

  IF _stake.currency = 'ton' THEN
    UPDATE public.profiles SET ton_balance = COALESCE(ton_balance,0) + _yield WHERE id = _pid;
  ELSE
    UPDATE public.profiles SET siri_balance = COALESCE(siri_balance,0) + _yield WHERE id = _pid;
  END IF;

  UPDATE public.stakes
  SET last_claim_at = LEAST(now(), ends_at), claimed_yield = claimed_yield + _yield
  WHERE id = _stake.id;

  RETURN jsonb_build_object('success', true, 'claimed', _yield, 'currency', _stake.currency);
END;
$$;

CREATE OR REPLACE FUNCTION public.staking_unstake_for_telegram(_telegram_id bigint, _stake_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pid uuid;
  _stake public.stakes;
  _yield numeric;
  _fee numeric := 0;
  _payout numeric;
  _early boolean;
BEGIN
  SELECT id INTO _pid FROM public.profiles WHERE telegram_id = _telegram_id;
  IF _pid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;

  SELECT * INTO _stake FROM public.stakes WHERE id = _stake_id AND profile_id = _pid AND status = 'active' FOR UPDATE;
  IF _stake.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'stake_not_found'); END IF;

  _early := now() < _stake.ends_at;
  _yield := public.staking_pending_yield(_stake);

  IF _early THEN
    _yield := 0;
    _fee := _stake.amount * (_stake.early_exit_fee_pct / 100.0);
  END IF;

  _payout := _stake.amount - _fee + _yield;

  IF _stake.currency = 'ton' THEN
    UPDATE public.profiles SET ton_balance = COALESCE(ton_balance,0) + _payout WHERE id = _pid;
  ELSE
    UPDATE public.profiles SET siri_balance = COALESCE(siri_balance,0) + _payout WHERE id = _pid;
  END IF;

  UPDATE public.stakes
  SET status = CASE WHEN _early THEN 'early_closed' ELSE 'closed' END,
      closed_at = now(),
      last_claim_at = LEAST(now(), ends_at),
      claimed_yield = claimed_yield + _yield
  WHERE id = _stake.id;

  RETURN jsonb_build_object('success', true, 'payout', _payout, 'fee', _fee, 'yield', _yield,
                            'early', _early, 'currency', _stake.currency);
END;
$$;
