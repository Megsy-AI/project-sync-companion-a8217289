CREATE TABLE IF NOT EXISTS public.ad_watch_progress (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  ads_watched integer NOT NULL DEFAULT 0,
  total_claims integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ad_watch_progress TO service_role;
ALTER TABLE public.ad_watch_progress ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ad_watch_get_progress(_telegram_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_r public.ad_watch_progress%ROWTYPE;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'adsWatched', 0, 'totalClaims', 0); END IF;
  SELECT * INTO v_r FROM public.ad_watch_progress WHERE user_id = v_uid;
  RETURN jsonb_build_object('success', true, 'adsWatched', COALESCE(v_r.ads_watched, 0), 'totalClaims', COALESCE(v_r.total_claims, 0));
END; $$;

CREATE OR REPLACE FUNCTION public.ad_watch_increment(_telegram_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_count integer;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'adsWatched', 0); END IF;
  INSERT INTO public.ad_watch_progress (user_id, ads_watched)
  VALUES (v_uid, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET ads_watched = LEAST(public.ad_watch_progress.ads_watched + 1, 500),
        updated_at = now()
  RETURNING ads_watched INTO v_count;
  RETURN jsonb_build_object('success', true, 'adsWatched', v_count);
END; $$;

CREATE OR REPLACE FUNCTION public.ad_watch_claim(_telegram_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_count integer; v_p public.profiles%ROWTYPE;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'NO_PROFILE'); END IF;

  UPDATE public.ad_watch_progress
     SET ads_watched = ads_watched - 500,
         total_claims = total_claims + 1,
         updated_at = now()
   WHERE user_id = v_uid AND ads_watched >= 500
  RETURNING ads_watched INTO v_count;

  IF NOT FOUND THEN
    SELECT COALESCE(ads_watched, 0) INTO v_count FROM public.ad_watch_progress WHERE user_id = v_uid;
    RETURN jsonb_build_object('success', false, 'error', 'NOT_ENOUGH_ADS', 'adsWatched', COALESCE(v_count, 0));
  END IF;

  UPDATE public.profiles SET ton_balance = ton_balance + 0.5 WHERE id = v_uid;
  SELECT * INTO v_p FROM public.profiles WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'rewardAmount', 0.5, 'rewardType', 'ton', 'adsWatched', v_count,
    'balances', jsonb_build_object('siri', v_p.siri_balance, 'ton', v_p.ton_balance, 'usdt', v_p.usdt_balance));
END; $$;

GRANT EXECUTE ON FUNCTION public.ad_watch_get_progress(bigint) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ad_watch_increment(bigint) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ad_watch_claim(bigint) TO anon, authenticated, service_role;