-- 1) PROFILES: remove public exposure
DROP POLICY IF EXISTS "Game players can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Game players can create profile" ON public.profiles;

-- own profile (full, incl. balances) by telegram id
CREATE OR REPLACE FUNCTION public.game_get_own_profile(_telegram_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(t) FROM (
    SELECT id, telegram_id, first_name, last_name, username, photo_url, referral_code,
           referred_by, siri_balance, ton_balance, usdt_balance, reward_balance, reward_expires_at
    FROM public.profiles WHERE telegram_id = _telegram_id LIMIT 1
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.game_create_own_profile(
  _telegram_id bigint, _first_name text, _last_name text, _username text, _photo_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_code text;
BEGIN
  IF _telegram_id IS NULL OR _telegram_id = 0 THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM public.profiles WHERE telegram_id = _telegram_id LIMIT 1;
  IF v_id IS NULL THEN
    v_code := upper('SIRI' || _telegram_id::text || to_char(now(), 'SSSSFF3'));
    INSERT INTO public.profiles (telegram_id, first_name, last_name, username, photo_url, referral_code)
    VALUES (_telegram_id, coalesce(nullif(_first_name,''),'Player'), coalesce(_last_name,''),
            coalesce(_username,''), coalesce(_photo_url,''), v_code)
    ON CONFLICT (telegram_id) DO NOTHING;
  END IF;
  RETURN public.game_get_own_profile(_telegram_id);
END; $$;

-- public (non-financial) info for leaderboards / attack feed
CREATE OR REPLACE FUNCTION public.game_public_profiles(_ids uuid[])
RETURNS TABLE(id uuid, username text, first_name text, photo_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.first_name, p.photo_url
  FROM public.profiles p
  WHERE p.id = ANY(coalesce(_ids, '{}'::uuid[]))
  LIMIT 500;
$$;

-- 2) TRANSACTIONS: remove public read/insert
DROP POLICY IF EXISTS "transactions readable" ON public.transactions;
DROP POLICY IF EXISTS "transactions insertable" ON public.transactions;

CREATE OR REPLACE FUNCTION public.game_is_wallet_verified(_telegram_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transactions t
    JOIN public.profiles p ON p.id = t.user_id
    WHERE p.telegram_id = _telegram_id
      AND t.type = 'wallet_verification' AND t.status = 'completed'
  );
$$;

CREATE OR REPLACE FUNCTION public.game_create_transaction(
  _telegram_id bigint, _type text, _amount numeric, _currency text,
  _wallet_address text, _tx_hash text DEFAULT NULL, _status text DEFAULT 'pending'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_id uuid;
BEGIN
  SELECT id INTO v_profile FROM public.profiles WHERE telegram_id = _telegram_id LIMIT 1;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'no_profile'); END IF;
  IF _type NOT IN ('deposit','withdrawal','wallet_verification') THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_type');
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_amount');
  END IF;
  IF _currency NOT IN ('ton','usdt','siri') THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_currency');
  END IF;
  INSERT INTO public.transactions (user_id, type, amount, currency, status, wallet_address, tx_hash)
  VALUES (v_profile, _type, _amount, _currency,
          CASE WHEN _status = 'completed' AND _type = 'wallet_verification' THEN 'completed' ELSE 'pending' END,
          _wallet_address, _tx_hash)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END; $$;

-- 3) TELEGRAM_ADMINS: remove public read/write
DROP POLICY IF EXISTS "admins readable" ON public.telegram_admins;
DROP POLICY IF EXISTS "admins updatable" ON public.telegram_admins;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.telegram_admins FROM anon, authenticated;
GRANT ALL ON public.telegram_admins TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_welcome_image_for_telegram(_telegram_id bigint, _url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin');
  END IF;
  UPDATE public.telegram_admins SET welcome_image_url = _url WHERE telegram_id = _telegram_id;
  RETURN jsonb_build_object('success', true);
END; $$;

-- 4) BOLT_PLAYERS: remove public read of wallets/balances
DROP POLICY IF EXISTS "bolt_players_public_read" ON public.bolt_players;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.bolt_players FROM anon, authenticated;
GRANT ALL ON public.bolt_players TO service_role;

-- Execute grants
GRANT EXECUTE ON FUNCTION public.game_get_own_profile(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.game_create_own_profile(bigint, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.game_public_profiles(uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.game_is_wallet_verified(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.game_create_transaction(bigint, text, numeric, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_welcome_image_for_telegram(bigint, text) TO anon, authenticated;