-- New players receive the 10,000 USD welcome prize, valid for 24 hours.
CREATE OR REPLACE FUNCTION public.grant_welcome_prize(_telegram_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE telegram_id = _telegram_id LIMIT 1;
  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'no_profile');
  END IF;

  -- Already holding a live prize: keep the original deadline.
  IF COALESCE(v_profile.reward_balance, 0) > 0
     AND v_profile.reward_expires_at IS NOT NULL
     AND v_profile.reward_expires_at > now() THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'already_active',
                              'expires_at', v_profile.reward_expires_at);
  END IF;

  -- Prize is one-time: never re-grant to someone whose window already passed.
  IF v_profile.reward_expires_at IS NOT NULL THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'already_used');
  END IF;

  UPDATE public.profiles
  SET reward_balance = 10000,
      reward_expires_at = now() + interval '24 hours'
  WHERE id = v_profile.id;

  RETURN jsonb_build_object('granted', true, 'amount', 10000,
                            'expires_at', now() + interval '24 hours');
END;
$$;

CREATE OR REPLACE FUNCTION public.game_create_own_profile(_telegram_id bigint, _first_name text, _last_name text, _username text, _photo_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_code text;
BEGIN
  IF _telegram_id IS NULL OR _telegram_id = 0 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
  FROM public.profiles
  WHERE telegram_id = _telegram_id
  LIMIT 1;

  IF v_id IS NULL THEN
    v_code := upper('SIRI' || _telegram_id::text || to_char(clock_timestamp(), 'SSSSFF3'));

    INSERT INTO public.profiles (
      telegram_id,
      first_name,
      last_name,
      username,
      photo_url,
      referral_code,
      reward_balance,
      reward_expires_at
    )
    VALUES (
      _telegram_id,
      coalesce(nullif(_first_name, ''), 'Player'),
      coalesce(_last_name, ''),
      coalesce(_username, ''),
      coalesce(_photo_url, ''),
      v_code,
      10000,
      now() + interval '24 hours'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN public.game_get_own_profile(_telegram_id);
END;
$function$;