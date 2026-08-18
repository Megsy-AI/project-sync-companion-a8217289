
CREATE OR REPLACE FUNCTION public.perform_attack_for_telegram(
  _telegram_id bigint,
  _attack_type text DEFAULT 'free',
  _package_key text DEFAULT NULL
)
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

  -- Auto-activate a random monster if none is active
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
    SET is_active = true,
        current_hp = max_hp,
        defeated_by = NULL,
        ton_pool = 0,
        updated_at = now()
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

    IF _today_free_count >= 2 THEN
      RETURN jsonb_build_object('success', false, 'error', 'NO_FREE_ATTACKS_LEFT');
    END IF;

    _damage := floor(random() * 5 + 1);
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
      WHEN _attack_type = 'attack' THEN floor(random() * 11 + 5)
      WHEN _attack_type = 'power' AND _package_key ILIKE '%mega%' THEN floor(random() * 51 + 50)
      WHEN _attack_type = 'power' THEN floor(random() * 21 + 20)
      WHEN _attack_type = 'boost' AND _package_key ILIKE '%critical%' THEN floor(random() * 16 + 30)
      WHEN _attack_type = 'boost' THEN floor(random() * 15 + 16)
      WHEN _attack_type = 'spell' AND _package_key ILIKE '%lightning%' THEN 120
      WHEN _attack_type = 'spell' AND _package_key ILIKE '%fire%' THEN 80
      WHEN _attack_type = 'spell' AND _package_key ILIKE '%ice%' THEN 50
      WHEN _attack_type = 'spell' AND _package_key ILIKE '%poison%' THEN 65
      ELSE floor(random() * 11 + 10)
    END;

    UPDATE public.battle_inventory
    SET quantity = quantity - 1
    WHERE id = _inventory.id;
  END IF;

  _new_hp := GREATEST(_character.current_hp - _damage, 0);
  -- Each hit gives TON reward based on damage
  _ton_reward := ROUND(_damage * 0.001, 4);

  -- Record the attack
  INSERT INTO public.attacks (
    user_id, character_id, damage, ton_spent, is_killing_blow, attack_type, metadata
  ) VALUES (
    _profile.id, _character.id, _damage, 0, _new_hp <= 0,
    COALESCE(_attack_type, 'free'),
    jsonb_build_object('package_key', _package_key, 'ton_reward', _ton_reward)
  );

  -- Give instant TON reward for the hit
  UPDATE public.profiles
  SET ton_balance = COALESCE(ton_balance, 0) + _ton_reward
  WHERE id = _profile.id
  RETURNING * INTO _profile;

  -- Add TON to the monster's pool (each hit contributes)
  UPDATE public.characters
  SET current_hp = _new_hp,
      ton_pool = COALESCE(ton_pool, 0) + _ton_reward,
      defeated_by = CASE WHEN _new_hp <= 0 THEN _profile.id ELSE defeated_by END,
      is_active = CASE WHEN _new_hp <= 0 THEN false ELSE is_active END,
      updated_at = now()
  WHERE id = _character.id
  RETURNING * INTO _character;

  -- When monster dies, distribute the pool
  IF _new_hp <= 0 THEN
    _pool_total := COALESCE(_character.ton_pool, 0);
    
    IF _pool_total > 0 THEN
      -- 40% to the killing blow player
      _killer_share := ROUND(_pool_total * 0.4, 4);
      -- 60% distributed among top 5 attackers by total damage
      _top_attackers_share := _pool_total - _killer_share;

      -- Give killer their share
      UPDATE public.profiles
      SET ton_balance = COALESCE(ton_balance, 0) + _killer_share
      WHERE id = _profile.id
      RETURNING * INTO _profile;

      -- Get total damage from all attackers on this character
      SELECT COALESCE(SUM(damage), 1) INTO _total_damage_all
      FROM public.attacks
      WHERE character_id = _character.id;

      -- Distribute remaining 60% proportionally to top 5 attackers by damage
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

      -- Refresh profile if killer is also a top attacker (they got double)
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
    'freeAttacksRemaining', GREATEST(0, 2 - (
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
