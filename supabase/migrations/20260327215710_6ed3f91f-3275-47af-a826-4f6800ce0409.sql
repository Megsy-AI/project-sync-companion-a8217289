
-- Increase TON reward per damage from 0.001 to 0.002
-- Increase mining TON base and USDT minimum
-- Update perform_attack_for_telegram to give 0.002 TON per damage point
CREATE OR REPLACE FUNCTION public.perform_attack_for_telegram(_telegram_id bigint, _attack_type text DEFAULT 'free'::text, _package_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _profile public.profiles%ROWTYPE;
  _character public.characters%ROWTYPE;
  _inventory public.battle_inventory%ROWTYPE;
  _today_free_count INTEGER := 0;
  _damage INTEGER := 0;
  _new_hp INTEGER := 0;
  _ton_reward NUMERIC := 0;
  _random_char_id UUID;
  _pool_total NUMERIC := 0;
  _killer_share NUMERIC := 0;
  _top_attackers_share NUMERIC := 0;
  _top_attacker RECORD;
  _attacker_reward NUMERIC := 0;
  _total_damage_all NUMERIC := 0;
BEGIN
  SELECT * INTO _profile
  FROM public.profiles
  WHERE telegram_id = _telegram_id
  LIMIT 1;

  IF _profile.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROFILE_NOT_FOUND');
  END IF;

  SELECT * INTO _character
  FROM public.characters
  WHERE is_active = true
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF _character.id IS NULL THEN
    SELECT id INTO _random_char_id
    FROM public.characters
    WHERE is_active = false
    ORDER BY random()
    LIMIT 1;

    IF _random_char_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'NO_CHARACTERS_AVAILABLE');
    END IF;

    UPDATE public.characters
    SET is_active = true, current_hp = max_hp, defeated_by = NULL, ton_pool = 0, updated_at = now()
    WHERE id = _random_char_id
    RETURNING * INTO _character;
  END IF;

  IF _character.current_hp <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHARACTER_ALREADY_DEFEATED');
  END IF;

  IF COALESCE(_attack_type, 'free') = 'free' THEN
    SELECT COUNT(*) INTO _today_free_count
    FROM public.attacks
    WHERE user_id = _profile.id
      AND attack_type = 'free'
      AND created_at >= date_trunc('day', now());

    IF _today_free_count >= 3 THEN
      RETURN jsonb_build_object('success', false, 'error', 'NO_FREE_ATTACKS_LEFT');
    END IF;

    _damage := floor(random() * 8 + 1);
  ELSE
    SELECT * INTO _inventory
    FROM public.battle_inventory
    WHERE user_id = _profile.id
      AND category = _attack_type
      AND package_key = _package_key
      AND quantity > 0
    LIMIT 1
    FOR UPDATE;

    IF _inventory.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'ITEM_NOT_AVAILABLE');
    END IF;

    _damage := CASE
      WHEN _attack_type = 'attack' THEN floor(random() * 15 + 8)
      WHEN _attack_type = 'power' AND _package_key ILIKE '%mega%' THEN floor(random() * 61 + 60)
      WHEN _attack_type = 'power' THEN floor(random() * 31 + 25)
      WHEN _attack_type = 'boost' AND _package_key ILIKE '%critical%' THEN floor(random() * 21 + 40)
      WHEN _attack_type = 'boost' THEN floor(random() * 20 + 20)
      WHEN _attack_type = 'spell' AND _package_key ILIKE '%lightning%' THEN 150
      WHEN _attack_type = 'spell' AND _package_key ILIKE '%fire%' THEN 100
      WHEN _attack_type = 'spell' AND _package_key ILIKE '%ice%' THEN 65
      WHEN _attack_type = 'spell' AND _package_key ILIKE '%poison%' THEN 80
      ELSE floor(random() * 15 + 12)
    END;

    UPDATE public.battle_inventory
    SET quantity = quantity - 1
    WHERE id = _inventory.id;
  END IF;

  _new_hp := GREATEST(_character.current_hp - _damage, 0);
  -- Increased: 0.002 TON per damage point (was 0.001)
  _ton_reward := ROUND(_damage * 0.002, 4);

  INSERT INTO public.attacks (
    user_id, character_id, damage, ton_spent, is_killing_blow, attack_type, metadata
  ) VALUES (
    _profile.id, _character.id, _damage, 0, _new_hp <= 0,
    COALESCE(_attack_type, 'free'),
    jsonb_build_object('package_key', _package_key, 'ton_reward', _ton_reward)
  );

  UPDATE public.profiles
  SET ton_balance = COALESCE(ton_balance, 0) + _ton_reward
  WHERE id = _profile.id
  RETURNING * INTO _profile;

  UPDATE public.characters
  SET current_hp = _new_hp,
      ton_pool = COALESCE(ton_pool, 0) + _ton_reward,
      defeated_by = CASE WHEN _new_hp <= 0 THEN _profile.id ELSE defeated_by END,
      is_active = CASE WHEN _new_hp <= 0 THEN false ELSE is_active END,
      updated_at = now()
  WHERE id = _character.id
  RETURNING * INTO _character;

  IF _new_hp <= 0 THEN
    _pool_total := COALESCE(_character.ton_pool, 0);
    
    IF _pool_total > 0 THEN
      _killer_share := ROUND(_pool_total * 0.4, 4);
      _top_attackers_share := _pool_total - _killer_share;

      UPDATE public.profiles
      SET ton_balance = COALESCE(ton_balance, 0) + _killer_share
      WHERE id = _profile.id
      RETURNING * INTO _profile;

      SELECT COALESCE(SUM(damage), 1) INTO _total_damage_all
      FROM public.attacks
      WHERE character_id = _character.id;

      FOR _top_attacker IN (
        SELECT user_id, SUM(damage) as total_dmg
        FROM public.attacks
        WHERE character_id = _character.id
        GROUP BY user_id
        ORDER BY total_dmg DESC
        LIMIT 5
      ) LOOP
        _attacker_reward := ROUND(_top_attackers_share * (_top_attacker.total_dmg::numeric / _total_damage_all), 4);
        IF _attacker_reward > 0 THEN
          UPDATE public.profiles
          SET ton_balance = COALESCE(ton_balance, 0) + _attacker_reward
          WHERE id = _top_attacker.user_id;
        END IF;
      END LOOP;

      SELECT * INTO _profile FROM public.profiles WHERE id = _profile.id;
    END IF;

    PERFORM public.queue_telegram_notification(
      _profile.id, 'boss_defeated', 'Boss Defeated!',
      'You landed the killing blow on ' || _character.name || '! You earned ' || _killer_share || ' TON as killer bonus!',
      jsonb_build_object('character_id', _character.id, 'damage', _damage, 'pool_total', _pool_total, 'killer_share', _killer_share)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'damage', _damage,
    'tonReward', _ton_reward,
    'character', jsonb_build_object(
      'id', _character.id, 'name', _character.name,
      'current_hp', _character.current_hp, 'max_hp', _character.max_hp,
      'ton_pool', COALESCE(_character.ton_pool, 0), 'is_active', _character.is_active
    ),
    'inventory', public.get_battle_inventory_for_telegram(_telegram_id),
    'freeAttacksRemaining', GREATEST(0, 3 - (
      SELECT COUNT(*) FROM public.attacks
      WHERE user_id = _profile.id AND attack_type = 'free'
        AND created_at >= date_trunc('day', now())
    )),
    'balances', jsonb_build_object(
      'siri', COALESCE(_profile.siri_balance, 0),
      'ton', COALESCE(_profile.ton_balance, 0),
      'usdt', COALESCE(_profile.usdt_balance, 0)
    )
  );
END;
$function$;

-- Increase mining rewards: TON minimum 0.05 -> 0.08, USDT minimum 0.3 -> 0.5
CREATE OR REPLACE FUNCTION public.sync_mining_for_telegram(_telegram_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _profile public.profiles%ROWTYPE;
  _session public.mining_sessions%ROWTYPE;
  _boost_percent NUMERIC := 0;
  _ton_rate NUMERIC := 0;
  _usdt_rate NUMERIC := 0;
  _siri_reward NUMERIC := 0;
  _ton_reward NUMERIC := 0;
  _usdt_reward NUMERIC := 0;
BEGIN
  SELECT * INTO _profile
  FROM public.profiles
  WHERE telegram_id = _telegram_id
  LIMIT 1;

  IF _profile.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROFILE_NOT_FOUND');
  END IF;

  SELECT * INTO _session
  FROM public.mining_sessions
  WHERE user_id = _profile.id
    AND claimed = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF _session.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'isMining', false, 'claimed', false);
  END IF;

  IF _session.ends_at > now() THEN
    RETURN jsonb_build_object(
      'success', true, 'isMining', true, 'claimed', false,
      'endsAt', _session.ends_at, 'sessionId', _session.id
    );
  END IF;

  SELECT
    COALESCE(SUM(s.mining_boost), 0),
    COALESCE(SUM(s.ton_mining_rate), 0),
    COALESCE(SUM(s.usdt_mining_rate), 0)
  INTO _boost_percent, _ton_rate, _usdt_rate
  FROM public.user_servers us
  JOIN public.servers s ON s.id = us.server_id
  WHERE us.user_id = _profile.id;

  _siri_reward := ROUND(120 * (1 + (_boost_percent / 100.0)), 2);
  _ton_reward := ROUND(GREATEST((_ton_rate / 3.0), 0.08), 4);
  _usdt_reward := ROUND(GREATEST((_usdt_rate / 3.0), 0.5), 4);

  UPDATE public.mining_sessions
  SET claimed = true, reward_amount = _siri_reward
  WHERE id = _session.id;

  UPDATE public.profiles
  SET siri_balance = COALESCE(siri_balance, 0) + _siri_reward,
      ton_balance = COALESCE(ton_balance, 0) + _ton_reward,
      usdt_balance = COALESCE(usdt_balance, 0) + _usdt_reward
  WHERE id = _profile.id
  RETURNING * INTO _profile;

  PERFORM public.queue_telegram_notification(
    _profile.id, 'mining_completed', 'Mining Completed',
    'You earned ' || _siri_reward || ' $SIRI, ' || _ton_reward || ' TON and ' || _usdt_reward || ' USDT.',
    jsonb_build_object('siri_reward', _siri_reward, 'ton_reward', _ton_reward, 'usdt_reward', _usdt_reward, 'session_id', _session.id)
  );

  RETURN jsonb_build_object(
    'success', true, 'isMining', false, 'claimed', true,
    'sessionId', _session.id,
    'siriReward', _siri_reward, 'tonReward', _ton_reward, 'usdtReward', _usdt_reward,
    'balances', jsonb_build_object(
      'siri', COALESCE(_profile.siri_balance, 0),
      'ton', COALESCE(_profile.ton_balance, 0),
      'usdt', COALESCE(_profile.usdt_balance, 0)
    )
  );
END;
$function$;
