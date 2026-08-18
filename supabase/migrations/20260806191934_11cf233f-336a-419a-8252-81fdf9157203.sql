UPDATE public.servers
SET ton_mining_rate = round(price_ton * 0.01 / 3.0, 6),
    usdt_mining_rate = round(price_ton * 0.03 / 3.0, 6);

CREATE OR REPLACE FUNCTION public.attach_referral_for_telegram(_telegram_id bigint, _code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid; v_ref uuid; v_current uuid;
BEGIN
  IF _code IS NULL OR length(trim(_code)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_code');
  END IF;

  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'no_profile'); END IF;

  SELECT referred_by INTO v_current FROM public.profiles WHERE id = v_uid;
  IF v_current IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'already_referred'); END IF;

  SELECT id INTO v_ref FROM public.profiles WHERE upper(referral_code) = upper(trim(_code)) LIMIT 1;
  IF v_ref IS NULL OR v_ref = v_uid THEN RETURN jsonb_build_object('success', false, 'reason', 'invalid_code'); END IF;

  UPDATE public.profiles SET referred_by = v_ref WHERE id = v_uid;
  RETURN jsonb_build_object('success', true, 'referrerId', v_ref);
END; $function$;

GRANT EXECUTE ON FUNCTION public.attach_referral_for_telegram(bigint, text) TO anon, authenticated, service_role;