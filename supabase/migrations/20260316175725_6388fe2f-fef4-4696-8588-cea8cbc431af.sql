-- Core backend extensions for real gameplay persistence, referrals, admin actions, and Telegram notifications

CREATE TABLE IF NOT EXISTS public.telegram_admins (
  telegram_id BIGINT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.battle_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  package_key TEXT NOT NULL,
  package_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  total_purchased INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT battle_inventory_category_check CHECK (category IN ('attack', 'power', 'boost', 'spell')),
  CONSTRAINT battle_inventory_quantity_check CHECK (quantity >= 0),
  CONSTRAINT battle_inventory_total_purchased_check CHECK (total_purchased >= 0),
  CONSTRAINT battle_inventory_user_package_unique UNIQUE (user_id, category, package_key)
);

ALTER TABLE public.battle_inventory ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID,
  ton_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.telegram_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT telegram_notifications_status_check CHECK (status IN ('pending', 'sent', 'failed'))
);

ALTER TABLE public.telegram_notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.attacks
  ADD COLUMN IF NOT EXISTS attack_type TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_battle_inventory_user_id ON public.battle_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_battle_inventory_category ON public.battle_inventory(category);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_id ON public.referral_rewards(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referred_user_id ON public.referral_rewards(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_notifications_profile_id ON public.telegram_notifications(profile_id);
CREATE INDEX IF NOT EXISTS idx_telegram_notifications_status_scheduled_for ON public.telegram_notifications(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_attacks_character_created_at ON public.attacks(character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attacks_user_created_at ON public.attacks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_tasks_user_task ON public.user_tasks(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_user_servers_user_server ON public.user_servers(user_id, server_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_tasks_user_id_task_id_key'
  ) THEN
    ALTER TABLE public.user_tasks
      ADD CONSTRAINT user_tasks_user_id_task_id_key UNIQUE (user_id, task_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_servers_user_id_server_id_key'
  ) THEN
    ALTER TABLE public.user_servers
      ADD CONSTRAINT user_servers_user_id_server_id_key UNIQUE (user_id, server_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_battle_inventory_updated_at ON public.battle_inventory;
CREATE TRIGGER update_battle_inventory_updated_at
BEFORE UPDATE ON public.battle_inventory
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_telegram_notifications_updated_at ON public.telegram_notifications;
CREATE TRIGGER update_telegram_notifications_updated_at
BEFORE UPDATE ON public.telegram_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_telegram_admin(_telegram_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.telegram_admins
    WHERE telegram_id = _telegram_id
  );
$$;

CREATE OR REPLACE FUNCTION public.queue_telegram_notification(
  _profile_id UUID,
  _notification_type TEXT,
  _title TEXT,
  _message TEXT,
  _metadata JSONB DEFAULT '{}'::jsonb,
  _scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT now()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _notification_id UUID;
BEGIN
  INSERT INTO public.telegram_notifications (
    profile_id,
    notification_type,
    title,
    message,
    metadata,
    scheduled_for
  )
  VALUES (
    _profile_id,
    _notification_type,
    _title,
    _message,
    COALESCE(_metadata, '{}'::jsonb),
    COALESCE(_scheduled_for, now())
  )
  RETURNING id INTO _notification_id;

  RETURN _notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_referral_reward(
  _buyer_profile_id UUID,
  _source_type TEXT,
  _source_id UUID,
  _ton_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referrer_id UUID;
  _reward NUMERIC := ROUND(GREATEST(COALESCE(_ton_amount, 0), 0) * 0.5, 4);
BEGIN
  IF _reward <= 0 THEN
    RETURN 0;
  END IF;

  SELECT referred_by INTO _referrer_id
  FROM public.profiles
  WHERE id = _buyer_profile_id;

  IF _referrer_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.referral_rewards (
    referrer_id,
    referred_user_id,
    source_type,
    source_id,
    ton_amount
  ) VALUES (
    _referrer_id,
    _buyer_profile_id,
    _source_type,
    _source_id,
    _reward
  );

  UPDATE public.profiles
  SET ton_balance = COALESCE(ton_balance, 0) + _reward
  WHERE id = _referrer_id;

  PERFORM public.queue_telegram_notification(
    _referrer_id,
    'referral_reward',
    'Referral Reward',
    'You received ' || _reward || ' TON from a referral purchase.',
    jsonb_build_object(
      'source_type', _source_type,
      'source_id', _source_id,
      'amount', _reward,
      'buyer_profile_id', _buyer_profile_id
    )
  );

  RETURN _reward;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_battle_inventory_for_telegram(_telegram_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile_id UUID;
BEGIN
  SELECT id INTO _profile_id
  FROM public.profiles
  WHERE telegram_id = _telegram_id
  LIMIT 1;

  IF _profile_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', bi.id,
        'category', bi.category,
        'package_key', bi.package_key,
        'package_name', bi.package_name,
        'quantity', bi.quantity,
        'total_purchased', bi.total_purchased,
        'updated_at', bi.updated_at
      )
      ORDER BY bi.category, bi.package_name
    )
    FROM public.battle_inventory bi
    WHERE bi.user_id = _profile_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_referral_summary_for_telegram(_telegram_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile_id UUID;
BEGIN
  SELECT id INTO _profile_id
  FROM public.profiles
  WHERE telegram_id = _telegram_id
  LIMIT 1;

  IF _profile_id IS NULL THEN
    RETURN jsonb_build_object(
      'count', 0,
      'ton_earned', 0,
      'users', '[]'::jsonb,
      'rewards', '[]'::jsonb
    );
  END IF;

  RETURN jsonb_build_object(
    'count', (
      SELECT COUNT(*)
      FROM public.profiles p
      WHERE p.referred_by = _profile_id
    ),
    'ton_earned', COALESCE((
      SELECT ROUND(SUM(rr.ton_amount), 4)
      FROM public.referral_rewards rr
      WHERE rr.referrer_id = _profile_id
    ), 0),
    'users', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'first_name', p.first_name,
          'username', p.username,
          'photo_url', p.photo_url,
          'joined_at', p.created_at
        )
        ORDER BY p.created_at DESC
      )
      FROM public.profiles p
      WHERE p.referred_by = _profile_id
    ), '[]'::jsonb),
    'rewards', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', rr.id,
          'source_type', rr.source_type,
          'ton_amount', rr.ton_amount,
          'created_at', rr.created_at,
          'referred_user_id', rr.referred_user_id
        )
        ORDER BY rr.created_at DESC
      )
      FROM public.referral_rewards rr
      WHERE rr.referrer_id = _profile_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_mining_for_telegram(_telegram_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile public.profiles%ROWTYPE;
  _active_session public.mining_sessions%ROWTYPE;
  _end_time TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT * INTO _profile
  FROM public.profiles
  WHERE telegram_id = _telegram_id
  LIMIT 1;

  IF _profile.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROFILE_NOT_FOUND');
  END IF;

  SELECT * INTO _active_session
  FROM public.mining_sessions
  WHERE user_id = _profile.id
    AND claimed = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF _active_session.id IS NOT NULL AND _active_session.ends_at > now() THEN
    RETURN jsonb_build_object(
      'success', true,
      'isMining', true,
      'endsAt', _active_session.ends_at,
      'sessionId', _active_session.id
    );
  END IF;

  _end_time := now() + interval '8 hours';

  INSERT INTO public.mining_sessions (user_id, started_at, ends_at, reward_amount, claimed)
  VALUES (_profile.id, now(), _end_time, 100, false)
  RETURNING * INTO _active_session;

  PERFORM public.queue_telegram_notification(
    _profile.id,
    'mining_started',
    'Mining Started',
    'Your 8-hour mining session has started successfully.',
    jsonb_build_object('ends_at', _end_time)
  );

  RETURN jsonb_build_object(
    'success', true,
    'isMining', true,
    'endsAt', _active_session.ends_at,
    'sessionId', _active_session.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_mining_for_telegram(_telegram_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      'success', true,
      'isMining', true,
      'claimed', false,
      'endsAt', _session.ends_at,
      'sessionId', _session.id
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

  _siri_reward := ROUND(100 * (1 + (_boost_percent / 100.0)), 2);
  _ton_reward := ROUND((_ton_rate / 3.0), 4);
  _usdt_reward := ROUND(GREATEST((_usdt_rate / 3.0), 0.3), 4);

  UPDATE public.mining_sessions
  SET claimed = true,
      reward_amount = _siri_reward
  WHERE id = _session.id;

  UPDATE public.profiles
  SET siri_balance = COALESCE(siri_balance, 0) + _siri_reward,
      ton_balance = COALESCE(ton_balance, 0) + _ton_reward,
      usdt_balance = COALESCE(usdt_balance, 0) + _usdt_reward
  WHERE id = _profile.id
  RETURNING * INTO _profile;

  PERFORM public.queue_telegram_notification(
    _profile.id,
    'mining_completed',
    'Mining Completed',
    'You earned ' || _siri_reward || ' $SIRI, ' || _ton_reward || ' TON and ' || _usdt_reward || ' USDT.',
    jsonb_build_object(
      'siri_reward', _siri_reward,
      'ton_reward', _ton_reward,
      'usdt_reward', _usdt_reward,
      'session_id', _session.id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'isMining', false,
    'claimed', true,
    'sessionId', _session.id,
    'siriReward', _siri_reward,
    'tonReward', _ton_reward,
    'usdtReward', _usdt_reward,
    'balances', jsonb_build_object(
      'siri', COALESCE(_profile.siri_balance, 0),
      'ton', COALESCE(_profile.ton_balance, 0),
      'usdt', COALESCE(_profile.usdt_balance, 0)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_task_for_telegram(_telegram_id BIGINT, _task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile public.profiles%ROWTYPE;
  _task public.tasks%ROWTYPE;
  _inserted_id UUID;
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
  WHERE id = _task_id
    AND is_active = true
  LIMIT 1;

  IF _task.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TASK_NOT_FOUND');
  END IF;

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
    _profile.id,
    'task_completed',
    'Task Completed',
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
$$;

CREATE OR REPLACE FUNCTION public.purchase_server_for_telegram(
  _telegram_id BIGINT,
  _server_id UUID,
  _ton_paid NUMERIC,
  _wallet_address TEXT DEFAULT NULL,
  _tx_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile public.profiles%ROWTYPE;
  _server public.servers%ROWTYPE;
  _transaction_id UUID;
  _referral_reward NUMERIC := 0;
BEGIN
  SELECT * INTO _profile
  FROM public.profiles
  WHERE telegram_id = _telegram_id
  LIMIT 1;

  IF _profile.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROFILE_NOT_FOUND');
  END IF;

  SELECT * INTO _server
  FROM public.servers
  WHERE id = _server_id
    AND is_active = true
  LIMIT 1;

  IF _server.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SERVER_NOT_FOUND');
  END IF;

  INSERT INTO public.user_servers (user_id, server_id, ton_paid)
  VALUES (_profile.id, _server.id, COALESCE(_ton_paid, _server.price_ton))
  ON CONFLICT (user_id, server_id) DO UPDATE
    SET ton_paid = EXCLUDED.ton_paid,
        purchased_at = now();

  INSERT INTO public.transactions (
    user_id,
    amount,
    currency,
    type,
    status,
    tx_hash,
    wallet_address,
    metadata
  ) VALUES (
    _profile.id,
    COALESCE(_ton_paid, _server.price_ton),
    'ton',
    'server_purchase',
    'completed',
    COALESCE(_tx_hash, ''),
    COALESCE(_wallet_address, ''),
    jsonb_build_object('server_id', _server.id, 'server_name', _server.name)
  ) RETURNING id INTO _transaction_id;

  _referral_reward := public.grant_referral_reward(_profile.id, 'server_purchase', _transaction_id, COALESCE(_ton_paid, _server.price_ton));

  PERFORM public.queue_telegram_notification(
    _profile.id,
    'server_purchase',
    'Server Purchased',
    'You purchased ' || _server.name || ' successfully.',
    jsonb_build_object(
      'server_id', _server.id,
      'server_name', _server.name,
      'referral_reward', _referral_reward
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'serverId', _server.id,
    'transactionId', _transaction_id,
    'referralReward', _referral_reward
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_battle_item_for_telegram(
  _telegram_id BIGINT,
  _category TEXT,
  _package_key TEXT,
  _package_name TEXT,
  _quantity INTEGER,
  _ton_paid NUMERIC,
  _wallet_address TEXT DEFAULT NULL,
  _tx_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile public.profiles%ROWTYPE;
  _transaction_id UUID;
  _active_character_id UUID;
  _referral_reward NUMERIC := 0;
BEGIN
  SELECT * INTO _profile
  FROM public.profiles
  WHERE telegram_id = _telegram_id
  LIMIT 1;

  IF _profile.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROFILE_NOT_FOUND');
  END IF;

  IF _category NOT IN ('attack', 'power', 'boost', 'spell') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CATEGORY');
  END IF;

  INSERT INTO public.battle_inventory (
    user_id,
    category,
    package_key,
    package_name,
    quantity,
    total_purchased
  ) VALUES (
    _profile.id,
    _category,
    _package_key,
    _package_name,
    GREATEST(_quantity, 1),
    GREATEST(_quantity, 1)
  )
  ON CONFLICT (user_id, category, package_key) DO UPDATE
    SET quantity = public.battle_inventory.quantity + GREATEST(EXCLUDED.quantity, 1),
        total_purchased = public.battle_inventory.total_purchased + GREATEST(EXCLUDED.total_purchased, 1),
        package_name = EXCLUDED.package_name,
        updated_at = now();

  INSERT INTO public.transactions (
    user_id,
    amount,
    currency,
    type,
    status,
    tx_hash,
    wallet_address,
    metadata
  ) VALUES (
    _profile.id,
    GREATEST(COALESCE(_ton_paid, 0), 0),
    'ton',
    'battle_purchase',
    'completed',
    COALESCE(_tx_hash, ''),
    COALESCE(_wallet_address, ''),
    jsonb_build_object(
      'category', _category,
      'package_key', _package_key,
      'package_name', _package_name,
      'quantity', GREATEST(_quantity, 1)
    )
  ) RETURNING id INTO _transaction_id;

  SELECT id INTO _active_character_id
  FROM public.characters
  WHERE is_active = true
  ORDER BY updated_at DESC
  LIMIT 1;

  IF _active_character_id IS NOT NULL THEN
    UPDATE public.characters
    SET ton_pool = COALESCE(ton_pool, 0) + GREATEST(COALESCE(_ton_paid, 0), 0)
    WHERE id = _active_character_id;
  END IF;

  _referral_reward := public.grant_referral_reward(_profile.id, 'battle_purchase', _transaction_id, GREATEST(COALESCE(_ton_paid, 0), 0));

  PERFORM public.queue_telegram_notification(
    _profile.id,
    'battle_purchase',
    'Battle Item Purchased',
    'You purchased ' || _package_name || ' successfully.',
    jsonb_build_object(
      'category', _category,
      'package_key', _package_key,
      'quantity', GREATEST(_quantity, 1),
      'referral_reward', _referral_reward
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'transactionId', _transaction_id,
    'referralReward', _referral_reward,
    'inventory', public.get_battle_inventory_for_telegram(_telegram_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.perform_attack_for_telegram(
  _telegram_id BIGINT,
  _attack_type TEXT DEFAULT 'free',
  _package_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile public.profiles%ROWTYPE;
  _character public.characters%ROWTYPE;
  _inventory public.battle_inventory%ROWTYPE;
  _today_free_count INTEGER := 0;
  _damage INTEGER := 0;
  _new_hp INTEGER := 0;
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
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACTIVE_CHARACTER');
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

  INSERT INTO public.attacks (
    user_id,
    character_id,
    damage,
    ton_spent,
    is_killing_blow,
    attack_type,
    metadata
  ) VALUES (
    _profile.id,
    _character.id,
    _damage,
    0,
    _new_hp <= 0,
    COALESCE(_attack_type, 'free'),
    jsonb_build_object('package_key', _package_key)
  );

  UPDATE public.characters
  SET current_hp = _new_hp,
      defeated_by = CASE WHEN _new_hp <= 0 THEN _profile.id ELSE defeated_by END,
      is_active = CASE WHEN _new_hp <= 0 THEN false ELSE is_active END,
      updated_at = now()
  WHERE id = _character.id
  RETURNING * INTO _character;

  IF _new_hp <= 0 THEN
    PERFORM public.queue_telegram_notification(
      _profile.id,
      'boss_defeated',
      'Boss Defeated',
      'You landed the final blow on ' || _character.name || '.',
      jsonb_build_object('character_id', _character.id, 'damage', _damage)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'damage', _damage,
    'character', jsonb_build_object(
      'id', _character.id,
      'name', _character.name,
      'current_hp', _character.current_hp,
      'max_hp', _character.max_hp,
      'ton_pool', COALESCE(_character.ton_pool, 0),
      'is_active', _character.is_active
    ),
    'inventory', public.get_battle_inventory_for_telegram(_telegram_id),
    'freeAttacksRemaining', GREATEST(0, 2 - (
      SELECT COUNT(*)
      FROM public.attacks
      WHERE user_id = _profile.id
        AND attack_type = 'free'
        AND created_at >= date_trunc('day', now())
    ))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_task_for_telegram(
  _telegram_id BIGINT,
  _task_id UUID,
  _title TEXT,
  _reward_amount NUMERIC,
  _reward_type TEXT,
  _task_type TEXT,
  _link TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task_id_out UUID;
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF _task_id IS NULL THEN
    INSERT INTO public.tasks (title, reward_amount, reward_type, task_type, link, is_active)
    VALUES (
      COALESCE(_title, 'Untitled Task'),
      COALESCE(_reward_amount, 0),
      LOWER(COALESCE(_reward_type, 'siri')),
      LOWER(COALESCE(_task_type, 'social')),
      NULLIF(_link, ''),
      true
    )
    RETURNING id INTO _task_id_out;
  ELSE
    UPDATE public.tasks
    SET title = COALESCE(_title, title),
        reward_amount = COALESCE(_reward_amount, reward_amount),
        reward_type = LOWER(COALESCE(_reward_type, reward_type)),
        task_type = LOWER(COALESCE(_task_type, task_type)),
        link = NULLIF(_link, ''),
        updated_at = now()
    WHERE id = _task_id
    RETURNING id INTO _task_id_out;
  END IF;

  RETURN jsonb_build_object('success', true, 'taskId', _task_id_out);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_task_for_telegram(
  _telegram_id BIGINT,
  _task_id UUID,
  _is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  UPDATE public.tasks
  SET is_active = _is_active,
      updated_at = now()
  WHERE id = _task_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_character_for_telegram(
  _telegram_id BIGINT,
  _name TEXT,
  _image_url TEXT,
  _max_hp INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _character_id UUID;
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  INSERT INTO public.characters (name, image_url, max_hp, current_hp, is_active)
  VALUES (
    COALESCE(_name, 'Unnamed Boss'),
    COALESCE(_image_url, 'monster-1'),
    GREATEST(COALESCE(_max_hp, 100), 1),
    GREATEST(COALESCE(_max_hp, 100), 1),
    false
  )
  RETURNING id INTO _character_id;

  RETURN jsonb_build_object('success', true, 'characterId', _character_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_activate_character_for_telegram(
  _telegram_id BIGINT,
  _character_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  UPDATE public.characters
  SET is_active = false,
      updated_at = now();

  UPDATE public.characters
  SET is_active = true,
      current_hp = max_hp,
      defeated_by = NULL,
      ton_pool = 0,
      updated_at = now()
  WHERE id = _character_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_server_for_telegram(
  _telegram_id BIGINT,
  _name TEXT,
  _image_url TEXT,
  _price_ton NUMERIC,
  _rarity TEXT,
  _mining_boost INTEGER,
  _attack_boost INTEGER,
  _ton_mining_rate NUMERIC,
  _usdt_mining_rate NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _server_id UUID;
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  INSERT INTO public.servers (
    name,
    image_url,
    price_ton,
    rarity,
    mining_boost,
    attack_boost,
    ton_mining_rate,
    usdt_mining_rate,
    is_active
  ) VALUES (
    COALESCE(_name, 'Unnamed Server'),
    COALESCE(_image_url, 'server-1'),
    GREATEST(COALESCE(_price_ton, 0.15), 0.15),
    LOWER(COALESCE(_rarity, 'common')),
    COALESCE(_mining_boost, 0),
    COALESCE(_attack_boost, 0),
    COALESCE(_ton_mining_rate, 0),
    GREATEST(COALESCE(_usdt_mining_rate, 0.3), 0.3),
    true
  )
  RETURNING id INTO _server_id;

  RETURN jsonb_build_object('success', true, 'serverId', _server_id);
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'attacks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.attacks';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'characters'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.characters';
  END IF;
END $$;