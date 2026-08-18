ALTER TABLE public.ton_payment_intents
  ADD COLUMN IF NOT EXISTS base_amount_nano bigint,
  ADD COLUMN IF NOT EXISTS discount_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason text;

UPDATE public.ton_payment_intents SET base_amount_nano = amount_nano WHERE base_amount_nano IS NULL;

CREATE OR REPLACE FUNCTION public.get_payment_discount_for_telegram(_telegram_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spent numeric := 0;
  v_count integer := 0;
  v_tier text := 'none';
  v_label text := 'Newcomer';
  v_pct numeric := 0;
  v_first boolean := false;
  v_next_pct numeric := NULL;
  v_next_at numeric := NULL;
BEGIN
  SELECT COALESCE(SUM(COALESCE(base_amount_nano, amount_nano)) / 1e9, 0), COUNT(*)
    INTO v_spent, v_count
  FROM public.ton_payment_intents
  WHERE telegram_id = _telegram_id AND status = 'confirmed';

  IF v_spent >= 100 THEN
    v_tier := 'diamond'; v_label := 'Diamond'; v_pct := 25;
  ELSIF v_spent >= 40 THEN
    v_tier := 'gold'; v_label := 'Gold'; v_pct := 15; v_next_pct := 25; v_next_at := 100;
  ELSIF v_spent >= 15 THEN
    v_tier := 'silver'; v_label := 'Silver'; v_pct := 10; v_next_pct := 15; v_next_at := 40;
  ELSIF v_spent >= 5 THEN
    v_tier := 'bronze'; v_label := 'Bronze'; v_pct := 5; v_next_pct := 10; v_next_at := 15;
  ELSE
    v_tier := 'none'; v_label := 'Newcomer'; v_pct := 0; v_next_pct := 5; v_next_at := 5;
  END IF;

  IF v_count = 0 THEN
    v_first := true;
    v_pct := GREATEST(v_pct, 20);
  END IF;

  v_pct := LEAST(v_pct, 50);

  RETURN jsonb_build_object(
    'total_spent_ton', ROUND(v_spent, 4),
    'payments', v_count,
    'tier', v_tier,
    'tier_label', v_label,
    'discount_pct', v_pct,
    'first_purchase', v_first,
    'next_tier_pct', v_next_pct,
    'next_tier_ton', v_next_at,
    'remaining_to_next_ton', CASE WHEN v_next_at IS NULL THEN NULL ELSE GREATEST(ROUND(v_next_at - v_spent, 4), 0) END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_discount_for_telegram(bigint) TO anon, authenticated, service_role;