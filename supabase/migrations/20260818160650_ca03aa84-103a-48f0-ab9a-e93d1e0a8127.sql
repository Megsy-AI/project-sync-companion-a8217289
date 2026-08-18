ALTER TABLE public.ad_watch_progress
  ADD COLUMN IF NOT EXISTS ads_watched_b integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_claims_b integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.ad_watch_get_progress(_telegram_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_r public.ad_watch_progress%ROWTYPE;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'adsWatched', 0, 'totalClaims', 0, 'adsWatchedB', 0, 'totalClaimsB', 0); END IF;
  SELECT * INTO v_r FROM public.ad_watch_progress WHERE user_id = v_uid;
  RETURN jsonb_build_object(
    'success', true,
    'adsWatched', COALESCE(v_r.ads_watched, 0),
    'totalClaims', COALESCE(v_r.total_claims, 0),
    'adsWatchedB', COALESCE(v_r.ads_watched_b, 0),
    'totalClaimsB', COALESCE(v_r.total_claims_b, 0)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.ad_watch_increment(_telegram_id bigint, _tier text DEFAULT 'a')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_a integer; v_b integer;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'adsWatched', 0, 'adsWatchedB', 0); END IF;

  IF _tier = 'b' THEN
    INSERT INTO public.ad_watch_progress (user_id, ads_watched_b)
    VALUES (v_uid, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET ads_watched_b = LEAST(public.ad_watch_progress.ads_watched_b + 1, 1000),
          updated_at = now()
    RETURNING ads_watched, ads_watched_b INTO v_a, v_b;
  ELSE
    INSERT INTO public.ad_watch_progress (user_id, ads_watched)
    VALUES (v_uid, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET ads_watched = LEAST(public.ad_watch_progress.ads_watched + 1, 500),
          updated_at = now()
    RETURNING ads_watched, ads_watched_b INTO v_a, v_b;
  END IF;

  RETURN jsonb_build_object('success', true, 'adsWatched', COALESCE(v_a, 0), 'adsWatchedB', COALESCE(v_b, 0));
END; $$;

CREATE OR REPLACE FUNCTION public.ad_watch_claim(_telegram_id bigint, _tier text DEFAULT 'a')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_count integer; v_p public.profiles%ROWTYPE; v_goal integer; v_reward numeric;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'NO_PROFILE'); END IF;

  IF _tier = 'b' THEN
    v_goal := 1000; v_reward := 5;
    UPDATE public.ad_watch_progress
       SET ads_watched_b = ads_watched_b - v_goal,
           total_claims_b = total_claims_b + 1,
           updated_at = now()
     WHERE user_id = v_uid AND ads_watched_b >= v_goal
    RETURNING ads_watched_b INTO v_count;
  ELSE
    v_goal := 500; v_reward := 0.5;
    UPDATE public.ad_watch_progress
       SET ads_watched = ads_watched - v_goal,
           total_claims = total_claims + 1,
           updated_at = now()
     WHERE user_id = v_uid AND ads_watched >= v_goal
    RETURNING ads_watched INTO v_count;
  END IF;

  IF NOT FOUND THEN
    IF _tier = 'b' THEN
      SELECT COALESCE(ads_watched_b, 0) INTO v_count FROM public.ad_watch_progress WHERE user_id = v_uid;
    ELSE
      SELECT COALESCE(ads_watched, 0) INTO v_count FROM public.ad_watch_progress WHERE user_id = v_uid;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'NOT_ENOUGH_ADS', 'adsWatched', COALESCE(v_count, 0));
  END IF;

  UPDATE public.profiles SET ton_balance = ton_balance + v_reward WHERE id = v_uid;
  SELECT * INTO v_p FROM public.profiles WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'rewardAmount', v_reward, 'rewardType', 'ton', 'adsWatched', v_count,
    'balances', jsonb_build_object('siri', v_p.siri_balance, 'ton', v_p.ton_balance, 'usdt', v_p.usdt_balance));
END; $$;

GRANT EXECUTE ON FUNCTION public.ad_watch_get_progress(bigint) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ad_watch_increment(bigint, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ad_watch_claim(bigint, text) TO anon, authenticated, service_role;