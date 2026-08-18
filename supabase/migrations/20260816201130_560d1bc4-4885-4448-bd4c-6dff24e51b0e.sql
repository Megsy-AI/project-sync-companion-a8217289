CREATE TABLE IF NOT EXISTS public.ai_smart_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  bonus_pct numeric NOT NULL DEFAULT 0,
  headline text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  cta text NOT NULL DEFAULT '',
  focus text NOT NULL DEFAULT 'general',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_smart_offers TO service_role;
ALTER TABLE public.ai_smart_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages smart offers"
  ON public.ai_smart_offers FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS ai_smart_offers_tg_idx ON public.ai_smart_offers (telegram_id, expires_at DESC);

CREATE OR REPLACE FUNCTION public.get_payment_discount_for_telegram(_telegram_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_spent numeric := 0;
  v_count integer := 0;
  v_tier text := 'none';
  v_label text := 'Newcomer';
  v_pct numeric := 0;
  v_first boolean := false;
  v_next_pct numeric := NULL;
  v_next_at numeric := NULL;
  v_ai record;
  v_ai_pct numeric := 0;
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

  SELECT * INTO v_ai
  FROM public.ai_smart_offers
  WHERE telegram_id = _telegram_id AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_ai.id IS NOT NULL THEN
    v_ai_pct := LEAST(GREATEST(COALESCE(v_ai.bonus_pct, 0), 0), 15);
  END IF;

  v_pct := LEAST(v_pct + v_ai_pct, 50);

  RETURN jsonb_build_object(
    'total_spent_ton', ROUND(v_spent, 4),
    'payments', v_count,
    'tier', v_tier,
    'tier_label', v_label,
    'discount_pct', v_pct,
    'first_purchase', v_first,
    'ai_bonus_pct', v_ai_pct,
    'ai_headline', COALESCE(v_ai.headline, ''),
    'ai_message', COALESCE(v_ai.message, ''),
    'ai_cta', COALESCE(v_ai.cta, ''),
    'ai_expires_at', v_ai.expires_at,
    'next_tier_pct', v_next_pct,
    'next_tier_ton', v_next_at,
    'remaining_to_next_ton', CASE WHEN v_next_at IS NULL THEN NULL ELSE GREATEST(ROUND(v_next_at - v_spent, 4), 0) END
  );
END;
$function$;