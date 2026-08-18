CREATE OR REPLACE FUNCTION public.game_create_own_profile(
  _telegram_id bigint,
  _first_name text,
  _last_name text,
  _username text,
  _photo_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      referral_code
    )
    VALUES (
      _telegram_id,
      coalesce(nullif(_first_name, ''), 'Player'),
      coalesce(_last_name, ''),
      coalesce(_username, ''),
      coalesce(_photo_url, ''),
      v_code
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN public.game_get_own_profile(_telegram_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.game_create_own_profile(bigint, text, text, text, text) TO anon, authenticated;