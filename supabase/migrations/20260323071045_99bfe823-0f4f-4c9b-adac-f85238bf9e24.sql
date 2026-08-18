
-- 1) Update perform_attack to auto-activate a random monster when none is active
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
    WHERE is_active = false AND current_hp <= 0
    ORDER BY random()
    LIMIT 1;

    IF _random_char_id IS NULL THEN
      SELECT id INTO _random_char_id
      FROM public.characters
      WHERE is_active = false
      ORDER BY random()
      LIMIT 1;
    END IF;

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
  _ton_reward := ROUND(_damage * 0.001, 4);

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
      defeated_by = CASE WHEN _new_hp <= 0 THEN _profile.id ELSE defeated_by END,
      is_active = CASE WHEN _new_hp <= 0 THEN false ELSE is_active END,
      updated_at = now()
  WHERE id = _character.id
  RETURNING * INTO _character;

  IF _new_hp <= 0 THEN
    PERFORM public.queue_telegram_notification(
      _profile.id, 'boss_defeated', 'Boss Defeated',
      'You landed the final blow on ' || _character.name || ' and earned the TON pool!',
      jsonb_build_object('character_id', _character.id, 'damage', _damage, 'ton_pool', COALESCE(_character.ton_pool, 0))
    );

    IF COALESCE(_character.ton_pool, 0) > 0 THEN
      UPDATE public.profiles
      SET ton_balance = COALESCE(ton_balance, 0) + _character.ton_pool
      WHERE id = _profile.id
      RETURNING * INTO _profile;
    END IF;
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

-- 2) Add verification_type column to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS verification_type text NOT NULL DEFAULT 'none';
-- 'none' = no verification (admin tasks), 'referral_count' = check referral count, 'mining_hours' = check mining, 'server_purchase' = check server, 'kill_monster' = check attacks

-- 3) Update complete_task to verify conditions
CREATE OR REPLACE FUNCTION public.complete_task_for_telegram(_telegram_id bigint, _task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _profile public.profiles%ROWTYPE;
  _task public.tasks%ROWTYPE;
  _inserted_id UUID;
  _ver_type TEXT;
  _ref_count INTEGER;
  _mining_count INTEGER;
  _server_count INTEGER;
  _kill_count INTEGER;
BEGIN
  SELECT * INTO _profile
  FROM public.profiles
  WHERE telegram_id = _telegram_id
  LIMIT 1;

  IF _profile.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROFILE_NOT_FOUND');
  END IF;

  SELECT * INTO _task
  FROM public.tasks
  WHERE id = _task_id AND is_active = true
  LIMIT 1;

  IF _task.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TASK_NOT_FOUND');
  END IF;

  _ver_type := COALESCE(_task.verification_type, 'none');

  -- Verify task conditions
  IF _ver_type = 'referral_count' THEN
    SELECT COUNT(*) INTO _ref_count FROM public.profiles WHERE referred_by = _profile.id;
    IF _ref_count < 3 THEN
      RETURN jsonb_build_object('success', false, 'error', 'NEED_3_REFERRALS', 'current', _ref_count, 'required', 3);
    END IF;
  ELSIF _ver_type = 'mining_hours' THEN
    SELECT COUNT(*) INTO _mining_count FROM public.mining_sessions WHERE user_id = _profile.id AND claimed = true;
    IF _mining_count < 3 THEN
      RETURN jsonb_build_object('success', false, 'error', 'NEED_3_MINING_SESSIONS', 'current', _mining_count, 'required', 3);
    END IF;
  ELSIF _ver_type = 'server_purchase' THEN
    SELECT COUNT(*) INTO _server_count FROM public.user_servers WHERE user_id = _profile.id;
    IF _server_count < 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'NEED_SERVER_PURCHASE', 'current', _server_count, 'required', 1);
    END IF;
  ELSIF _ver_type = 'kill_monster' THEN
    SELECT COUNT(*) INTO _kill_count FROM public.attacks WHERE user_id = _profile.id AND is_killing_blow = true;
    IF _kill_count < 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'NEED_MONSTER_KILL', 'current', _kill_count, 'required', 1);
    END IF;
  END IF;
  -- 'none' = no verification needed (admin-added tasks)

  INSERT INTO public.user_tasks (user_id, task_id)
  VALUES (_profile.id, _task.id)
  ON CONFLICT (user_id, task_id) DO NOTHING
  RETURNING id INTO _inserted_id;

  IF _inserted_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'alreadyCompleted', true);
  END IF;

  UPDATE public.profiles
  SET siri_balance = CASE WHEN LOWER(_task.reward_type) = 'siri' THEN COALESCE(siri_balance, 0) + _task.reward_amount ELSE siri_balance END,
      ton_balance = CASE WHEN LOWER(_task.reward_type) = 'ton' THEN COALESCE(ton_balance, 0) + _task.reward_amount ELSE ton_balance END,
      usdt_balance = CASE WHEN LOWER(_task.reward_type) = 'usdt' THEN COALESCE(usdt_balance, 0) + _task.reward_amount ELSE usdt_balance END
  WHERE id = _profile.id
  RETURNING * INTO _profile;

  PERFORM public.queue_telegram_notification(
    _profile.id, 'task_completed', 'Task Completed',
    'You completed "' || _task.title || '" and earned ' || _task.reward_amount || ' ' || UPPER(_task.reward_type) || '.',
    jsonb_build_object('task_id', _task.id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'alreadyCompleted', false,
    'rewardAmount', _task.reward_amount,
    'rewardType', _task.reward_type,
    'balances', jsonb_build_object(
      'siri', COALESCE(_profile.siri_balance, 0),
      'ton', COALESCE(_profile.ton_balance, 0),
      'usdt', COALESCE(_profile.usdt_balance, 0)
    )
  );
END;
$function$;
