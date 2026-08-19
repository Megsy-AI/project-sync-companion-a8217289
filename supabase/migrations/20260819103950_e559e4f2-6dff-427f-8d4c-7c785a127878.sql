-- 1. Track consumption of confirmed payment intents
ALTER TABLE public.ton_payment_intents ADD COLUMN IF NOT EXISTS credited_at timestamptz;

-- 2. Internal helper: atomically consume a confirmed intent, returning TON amount
CREATE OR REPLACE FUNCTION public.consume_ton_intent(_intent_id uuid, _telegram_id bigint, _action text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_row public.ton_payment_intents%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.ton_payment_intents
  WHERE id = _intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_found'; END IF;
  IF v_row.telegram_id <> _telegram_id THEN RAISE EXCEPTION 'intent_owner_mismatch'; END IF;
  IF v_row.action <> _action THEN RAISE EXCEPTION 'intent_action_mismatch'; END IF;
  IF v_row.status <> 'confirmed' THEN RAISE EXCEPTION 'intent_not_confirmed'; END IF;
  IF v_row.credited_at IS NOT NULL THEN RAISE EXCEPTION 'intent_already_used'; END IF;

  UPDATE public.ton_payment_intents SET credited_at = now() WHERE id = _intent_id;
  RETURN round(v_row.amount_nano::numeric / 1000000000, 9);
END; $$;

REVOKE ALL ON FUNCTION public.consume_ton_intent(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ton_intent(uuid, bigint, text) TO service_role;

-- 3. Intent-bound purchase wrappers for client use
CREATE OR REPLACE FUNCTION public.purchase_server_with_intent(
  _telegram_id bigint, _server_id uuid, _intent_id uuid, _wallet_address text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_ton numeric;
BEGIN
  v_ton := public.consume_ton_intent(_intent_id, _telegram_id, 'server');
  RETURN public.purchase_server_for_telegram(_telegram_id, _server_id, v_ton, _wallet_address, _intent_id::text);
END; $$;

CREATE OR REPLACE FUNCTION public.purchase_battle_item_with_intent(
  _telegram_id bigint, _category text, _package_key text, _package_name text,
  _quantity integer, _intent_id uuid, _wallet_address text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_ton numeric;
BEGIN
  v_ton := public.consume_ton_intent(_intent_id, _telegram_id, 'battle_item');
  RETURN public.purchase_battle_item_for_telegram(_telegram_id, _category, _package_key, _package_name,
    _quantity, v_ton, _wallet_address, _intent_id::text);
END; $$;

CREATE OR REPLACE FUNCTION public.ai_activate_plan_with_intent(
  _profile_id uuid, _telegram_id bigint, _plan text, _intent_id uuid)
RETURNS public.ai_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_row public.ai_subscriptions;
BEGIN
  PERFORM public.consume_ton_intent(_intent_id, _telegram_id, 'ai_pro');
  SELECT * INTO v_row FROM public.ai_activate_plan(_profile_id, _plan, 0);
  RETURN v_row;
END; $$;

GRANT EXECUTE ON FUNCTION public.purchase_server_with_intent(bigint, uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purchase_battle_item_with_intent(bigint, text, text, text, integer, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_activate_plan_with_intent(uuid, bigint, text, uuid) TO anon, authenticated, service_role;

-- 4. Close the unauthenticated crediting paths
REVOKE ALL ON FUNCTION public.purchase_server_for_telegram(bigint, uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_server_for_telegram(bigint, uuid, numeric, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.purchase_battle_item_for_telegram(bigint, text, text, text, integer, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_battle_item_for_telegram(bigint, text, text, text, integer, numeric, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.ai_activate_plan(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_activate_plan(uuid, text, numeric) TO service_role;

-- 5. Restore task verification that a later migration had dropped
CREATE OR REPLACE FUNCTION public.complete_task_for_telegram(_telegram_id bigint, _task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid; v_t public.tasks%ROWTYPE; v_p public.profiles%ROWTYPE; v_new boolean := true;
  v_ver text; v_n integer;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false); END IF;
  SELECT * INTO v_t FROM public.tasks WHERE id = _task_id AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'TASK_NOT_FOUND'); END IF;

  v_ver := COALESCE(v_t.verification_type, 'none');

  IF v_ver = 'referral_count' THEN
    SELECT COUNT(*) INTO v_n FROM public.profiles WHERE referred_by = v_uid;
    IF v_n < 3 THEN RETURN jsonb_build_object('success', false, 'error', 'NEED_3_REFERRALS', 'current', v_n, 'required', 3); END IF;
  ELSIF v_ver = 'mining_hours' THEN
    SELECT COUNT(*) INTO v_n FROM public.mining_sessions WHERE user_id = v_uid AND claimed = true;
    IF v_n < 3 THEN RETURN jsonb_build_object('success', false, 'error', 'NEED_3_MINING_SESSIONS', 'current', v_n, 'required', 3); END IF;
  ELSIF v_ver = 'server_purchase' THEN
    SELECT COUNT(*) INTO v_n FROM public.user_servers WHERE user_id = v_uid;
    IF v_n < 1 THEN RETURN jsonb_build_object('success', false, 'error', 'NEED_SERVER_PURCHASE', 'current', v_n, 'required', 1); END IF;
  ELSIF v_ver = 'kill_monster' THEN
    SELECT COUNT(*) INTO v_n FROM public.attacks WHERE user_id = v_uid AND is_killing_blow = true;
    IF v_n < 1 THEN RETURN jsonb_build_object('success', false, 'error', 'NEED_MONSTER_KILL', 'current', v_n, 'required', 1); END IF;
  END IF;

  INSERT INTO public.user_tasks (user_id, task_id, reward_amount, reward_type)
  VALUES (v_uid, _task_id, v_t.reward_amount, v_t.reward_type)
  ON CONFLICT (user_id, task_id) DO NOTHING;
  IF NOT FOUND THEN v_new := false; END IF;

  IF v_new THEN
    UPDATE public.profiles SET
      siri_balance = siri_balance + CASE WHEN v_t.reward_type = 'siri' THEN v_t.reward_amount ELSE 0 END,
      ton_balance  = ton_balance  + CASE WHEN v_t.reward_type = 'ton'  THEN v_t.reward_amount ELSE 0 END,
      usdt_balance = usdt_balance + CASE WHEN v_t.reward_type = 'usdt' THEN v_t.reward_amount ELSE 0 END
    WHERE id = v_uid;
  END IF;

  SELECT * INTO v_p FROM public.profiles WHERE id = v_uid;
  RETURN jsonb_build_object('success', true, 'alreadyCompleted', NOT v_new,
    'rewardAmount', v_t.reward_amount, 'rewardType', v_t.reward_type,
    'balances', jsonb_build_object('siri', v_p.siri_balance, 'ton', v_p.ton_balance, 'usdt', v_p.usdt_balance));
END; $$;

-- 6. Ad watching: enforce a minimum interval between counted views
CREATE OR REPLACE FUNCTION public.ad_watch_increment(_telegram_id bigint, _tier text DEFAULT 'a'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid; v_a integer; v_b integer; v_last timestamptz;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'adsWatched', 0, 'adsWatchedB', 0); END IF;

  SELECT updated_at, ads_watched, ads_watched_b INTO v_last, v_a, v_b
  FROM public.ad_watch_progress WHERE user_id = v_uid;

  IF v_last IS NOT NULL AND v_last > now() - interval '10 seconds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'too_fast',
      'adsWatched', COALESCE(v_a, 0), 'adsWatchedB', COALESCE(v_b, 0));
  END IF;

  IF _tier = 'b' THEN
    INSERT INTO public.ad_watch_progress (user_id, ads_watched_b)
    VALUES (v_uid, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET ads_watched_b = LEAST(public.ad_watch_progress.ads_watched_b + 1, 1000), updated_at = now()
    RETURNING ads_watched, ads_watched_b INTO v_a, v_b;
  ELSE
    INSERT INTO public.ad_watch_progress (user_id, ads_watched)
    VALUES (v_uid, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET ads_watched = LEAST(public.ad_watch_progress.ads_watched + 1, 500), updated_at = now()
    RETURNING ads_watched, ads_watched_b INTO v_a, v_b;
  END IF;

  RETURN jsonb_build_object('success', true, 'adsWatched', COALESCE(v_a, 0), 'adsWatchedB', COALESCE(v_b, 0));
END; $$;

-- Retire the ambiguous single-argument overload
DROP FUNCTION IF EXISTS public.ad_watch_increment(bigint);