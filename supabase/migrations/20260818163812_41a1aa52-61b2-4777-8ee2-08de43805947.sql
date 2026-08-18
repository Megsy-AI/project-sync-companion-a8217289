CREATE OR REPLACE FUNCTION public.create_smart_offer_for_telegram(_telegram_id bigint, _surface text DEFAULT 'general')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_focus text := CASE WHEN _surface IN ('servers','shop','ai','general') THEN _surface ELSE 'general' END;
  v_spent numeric := 0;
  v_payments int := 0;
  v_bonus numeric;
  v_headline text;
  v_message text;
  v_existing record;
BEGIN
  IF _telegram_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_TELEGRAM_ID');
  END IF;

  SELECT * INTO v_existing
  FROM public.ai_smart_offers
  WHERE telegram_id = _telegram_id AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'bonus_pct', v_existing.bonus_pct, 'headline', v_existing.headline,
                              'message', v_existing.message, 'cta', v_existing.cta, 'existing', true);
  END IF;

  SELECT COALESCE(SUM(amount_ton), 0), COUNT(*) INTO v_spent, v_payments
  FROM public.transactions
  WHERE telegram_id = _telegram_id AND type = 'purchase';

  v_bonus := LEAST(15, GREATEST(3, ROUND(3 + (v_payments * 1.5) + LEAST(6, v_spent))));

  v_headline := CASE v_focus
    WHEN 'servers' THEN 'Extra ' || v_bonus || '% off servers'
    WHEN 'shop' THEN 'Extra ' || v_bonus || '% off battle gear'
    WHEN 'ai' THEN 'Extra ' || v_bonus || '% off AI credits'
    ELSE 'Extra ' || v_bonus || '% off today'
  END;

  v_message := 'Personal bonus unlocked for the next 24 hours. It stacks on top of your member discount.';

  INSERT INTO public.ai_smart_offers (telegram_id, bonus_pct, headline, message, cta, focus, context, expires_at)
  VALUES (_telegram_id, v_bonus, v_headline, v_message, 'Claim now', v_focus,
          jsonb_build_object('spent_ton', v_spent, 'payments', v_payments, 'source', 'rpc'),
          now() + interval '24 hours');

  RETURN jsonb_build_object('success', true, 'bonus_pct', v_bonus, 'headline', v_headline, 'message', v_message, 'cta', 'Claim now');
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_smart_offer_for_telegram(bigint, text) TO anon, authenticated, service_role;