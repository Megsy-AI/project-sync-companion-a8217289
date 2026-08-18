
-- ============ PROFILES (game fields) ============
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS telegram_id bigint,
  ADD COLUMN IF NOT EXISTS first_name text DEFAULT 'Player',
  ADD COLUMN IF NOT EXISTS last_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS username text DEFAULT '',
  ADD COLUMN IF NOT EXISTS photo_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid,
  ADD COLUMN IF NOT EXISTS siri_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ton_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usdt_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wallet_address text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_telegram_id_key ON public.profiles(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key ON public.profiles(referral_code) WHERE referral_code IS NOT NULL;

GRANT SELECT, INSERT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

DROP POLICY IF EXISTS "Game players can read profiles" ON public.profiles;
CREATE POLICY "Game players can read profiles" ON public.profiles FOR SELECT TO anon, authenticated USING (telegram_id IS NOT NULL);
DROP POLICY IF EXISTS "Game players can create profile" ON public.profiles;
CREATE POLICY "Game players can create profile" ON public.profiles FOR INSERT TO anon, authenticated WITH CHECK (telegram_id IS NOT NULL);

-- ============ TELEGRAM ADMINS ============
CREATE TABLE IF NOT EXISTS public.telegram_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL UNIQUE,
  label text,
  welcome_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.telegram_admins TO anon, authenticated;
GRANT ALL ON public.telegram_admins TO service_role;
ALTER TABLE public.telegram_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins readable" ON public.telegram_admins;
CREATE POLICY "admins readable" ON public.telegram_admins FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admins updatable" ON public.telegram_admins;
CREATE POLICY "admins updatable" ON public.telegram_admins FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ============ MINING ============
CREATE TABLE IF NOT EXISTS public.mining_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  siri_reward numeric NOT NULL DEFAULT 0,
  ton_reward numeric NOT NULL DEFAULT 0,
  usdt_reward numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mining_sessions_user_idx ON public.mining_sessions(user_id, claimed);
GRANT SELECT ON public.mining_sessions TO anon, authenticated;
GRANT ALL ON public.mining_sessions TO service_role;
ALTER TABLE public.mining_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mining readable" ON public.mining_sessions;
CREATE POLICY "mining readable" ON public.mining_sessions FOR SELECT TO anon, authenticated USING (true);

-- ============ TASKS ============
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  reward_amount numeric NOT NULL DEFAULT 0,
  reward_type text NOT NULL DEFAULT 'siri',
  task_type text NOT NULL DEFAULT 'social',
  link text DEFAULT '',
  verification_type text NOT NULL DEFAULT 'auto',
  is_pinned boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tasks TO anon, authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks readable" ON public.tasks;
CREATE POLICY "tasks readable" ON public.tasks FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.user_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  reward_amount numeric NOT NULL DEFAULT 0,
  reward_type text NOT NULL DEFAULT 'siri',
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_id)
);
GRANT SELECT ON public.user_tasks TO anon, authenticated;
GRANT ALL ON public.user_tasks TO service_role;
ALTER TABLE public.user_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_tasks readable" ON public.user_tasks;
CREATE POLICY "user_tasks readable" ON public.user_tasks FOR SELECT TO anon, authenticated USING (true);

-- ============ CHARACTERS / ATTACKS ============
CREATE TABLE IF NOT EXISTS public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_url text DEFAULT 'monster-1',
  max_hp bigint NOT NULL DEFAULT 100000,
  current_hp bigint NOT NULL DEFAULT 100000,
  ton_pool numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.characters TO anon, authenticated;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "characters readable" ON public.characters;
CREATE POLICY "characters readable" ON public.characters FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.attacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  character_id uuid REFERENCES public.characters(id) ON DELETE CASCADE,
  damage bigint NOT NULL DEFAULT 0,
  attack_type text NOT NULL DEFAULT 'free',
  package_key text,
  ton_reward numeric NOT NULL DEFAULT 0,
  is_killing_blow boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attacks_user_idx ON public.attacks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attacks_character_idx ON public.attacks(character_id, created_at DESC);
GRANT SELECT ON public.attacks TO anon, authenticated;
GRANT ALL ON public.attacks TO service_role;
ALTER TABLE public.attacks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attacks readable" ON public.attacks;
CREATE POLICY "attacks readable" ON public.attacks FOR SELECT TO anon, authenticated USING (true);

-- ============ SERVERS ============
CREATE TABLE IF NOT EXISTS public.servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_url text DEFAULT '',
  price_ton numeric NOT NULL DEFAULT 0,
  rarity text NOT NULL DEFAULT 'common',
  mining_boost numeric NOT NULL DEFAULT 1,
  attack_boost numeric NOT NULL DEFAULT 1,
  ton_mining_rate numeric NOT NULL DEFAULT 0,
  usdt_mining_rate numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.servers TO anon, authenticated;
GRANT ALL ON public.servers TO service_role;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "servers readable" ON public.servers;
CREATE POLICY "servers readable" ON public.servers FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.user_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  ton_paid numeric NOT NULL DEFAULT 0,
  purchased_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_servers_user_idx ON public.user_servers(user_id);
GRANT SELECT ON public.user_servers TO anon, authenticated;
GRANT ALL ON public.user_servers TO service_role;
ALTER TABLE public.user_servers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_servers readable" ON public.user_servers;
CREATE POLICY "user_servers readable" ON public.user_servers FOR SELECT TO anon, authenticated USING (true);

-- ============ BATTLE INVENTORY ============
CREATE TABLE IF NOT EXISTS public.battle_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL,
  package_key text NOT NULL,
  package_name text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 0,
  total_purchased integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, package_key)
);
GRANT SELECT ON public.battle_inventory TO anon, authenticated;
GRANT ALL ON public.battle_inventory TO service_role;
ALTER TABLE public.battle_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory readable" ON public.battle_inventory;
CREATE POLICY "inventory readable" ON public.battle_inventory FOR SELECT TO anon, authenticated USING (true);

-- ============ TRANSACTIONS ============
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ton',
  status text NOT NULL DEFAULT 'pending',
  wallet_address text,
  tx_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_user_idx ON public.transactions(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.transactions TO anon, authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transactions readable" ON public.transactions;
CREATE POLICY "transactions readable" ON public.transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "transactions insertable" ON public.transactions;
CREATE POLICY "transactions insertable" ON public.transactions FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ============ NOTIFICATIONS (game) ============
CREATE TABLE IF NOT EXISTS public.game_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.game_notifications TO anon, authenticated;
GRANT ALL ON public.game_notifications TO service_role;
ALTER TABLE public.game_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "game notifications readable" ON public.game_notifications;
CREATE POLICY "game notifications readable" ON public.game_notifications FOR SELECT TO anon, authenticated USING (true);

-- ============ REFERRAL REWARDS ============
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  source_type text NOT NULL DEFAULT 'purchase',
  ton_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_rewards_referrer_idx ON public.referral_rewards(referrer_id);
GRANT SELECT ON public.referral_rewards TO anon, authenticated;
GRANT ALL ON public.referral_rewards TO service_role;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "referral rewards readable" ON public.referral_rewards;
CREATE POLICY "referral rewards readable" ON public.referral_rewards FOR SELECT TO anon, authenticated USING (true);

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.game_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_tasks_updated ON public.tasks;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.game_touch_updated_at();
DROP TRIGGER IF EXISTS trg_servers_updated ON public.servers;
CREATE TRIGGER trg_servers_updated BEFORE UPDATE ON public.servers FOR EACH ROW EXECUTE FUNCTION public.game_touch_updated_at();
DROP TRIGGER IF EXISTS trg_characters_updated ON public.characters;
CREATE TRIGGER trg_characters_updated BEFORE UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION public.game_touch_updated_at();
DROP TRIGGER IF EXISTS trg_inventory_updated ON public.battle_inventory;
CREATE TRIGGER trg_inventory_updated BEFORE UPDATE ON public.battle_inventory FOR EACH ROW EXECUTE FUNCTION public.game_touch_updated_at();
DROP TRIGGER IF EXISTS trg_mining_updated ON public.mining_sessions;
CREATE TRIGGER trg_mining_updated BEFORE UPDATE ON public.mining_sessions FOR EACH ROW EXECUTE FUNCTION public.game_touch_updated_at();

CREATE OR REPLACE FUNCTION public.game_profile_id(_telegram_id bigint)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE telegram_id = _telegram_id AND is_banned = false LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_telegram_admin(_telegram_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.telegram_admins WHERE telegram_id = _telegram_id);
$$;

CREATE OR REPLACE FUNCTION public.game_credit_referral(_user_id uuid, _ton_paid numeric, _source text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ref uuid; v_reward numeric := 0;
BEGIN
  SELECT referred_by INTO v_ref FROM public.profiles WHERE id = _user_id;
  IF v_ref IS NULL OR _ton_paid <= 0 THEN RETURN 0; END IF;
  v_reward := round(_ton_paid * 0.5, 6);
  UPDATE public.profiles SET ton_balance = ton_balance + v_reward WHERE id = v_ref;
  INSERT INTO public.referral_rewards (referrer_id, referred_user_id, source_type, ton_amount)
  VALUES (v_ref, _user_id, _source, v_reward);
  RETURN v_reward;
END; $$;

-- ============ MINING FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.sync_mining_for_telegram(_telegram_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_s public.mining_sessions%ROWTYPE; v_p public.profiles%ROWTYPE;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'isMining', false); END IF;

  SELECT * INTO v_s FROM public.mining_sessions
   WHERE user_id = v_uid AND claimed = false ORDER BY started_at DESC LIMIT 1;

  IF FOUND AND v_s.ends_at <= now() THEN
    UPDATE public.mining_sessions SET claimed = true WHERE id = v_s.id;
    UPDATE public.profiles
       SET siri_balance = siri_balance + v_s.siri_reward,
           ton_balance = ton_balance + v_s.ton_reward,
           usdt_balance = usdt_balance + v_s.usdt_reward
     WHERE id = v_uid RETURNING * INTO v_p;
    RETURN jsonb_build_object('success', true, 'isMining', false, 'claimed', true,
      'siriReward', v_s.siri_reward, 'tonReward', v_s.ton_reward, 'usdtReward', v_s.usdt_reward,
      'balances', jsonb_build_object('siri', v_p.siri_balance, 'ton', v_p.ton_balance, 'usdt', v_p.usdt_balance));
  END IF;

  SELECT * INTO v_p FROM public.profiles WHERE id = v_uid;
  IF v_s.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'isMining', true, 'endsAt', v_s.ends_at, 'sessionId', v_s.id,
      'balances', jsonb_build_object('siri', v_p.siri_balance, 'ton', v_p.ton_balance, 'usdt', v_p.usdt_balance));
  END IF;

  RETURN jsonb_build_object('success', true, 'isMining', false,
    'balances', jsonb_build_object('siri', v_p.siri_balance, 'ton', v_p.ton_balance, 'usdt', v_p.usdt_balance));
END; $$;

CREATE OR REPLACE FUNCTION public.start_mining_for_telegram(_telegram_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_exists uuid; v_boost numeric := 1; v_ton numeric := 0; v_usdt numeric := 0; v_ends timestamptz; v_id uuid;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'isMining', false); END IF;

  SELECT id INTO v_exists FROM public.mining_sessions
   WHERE user_id = v_uid AND claimed = false AND ends_at > now() LIMIT 1;
  IF v_exists IS NOT NULL THEN
    RETURN public.sync_mining_for_telegram(_telegram_id);
  END IF;

  SELECT COALESCE(1 + SUM(s.mining_boost - 1), 1), COALESCE(SUM(s.ton_mining_rate), 0), COALESCE(SUM(s.usdt_mining_rate), 0)
    INTO v_boost, v_ton, v_usdt
    FROM public.user_servers us JOIN public.servers s ON s.id = us.server_id
   WHERE us.user_id = v_uid;

  v_ends := now() + interval '8 hours';
  INSERT INTO public.mining_sessions (user_id, ends_at, siri_reward, ton_reward, usdt_reward)
  VALUES (v_uid, v_ends, round(500 * COALESCE(v_boost,1), 4), round(COALESCE(v_ton,0), 6), round(COALESCE(v_usdt,0), 6))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'isMining', true, 'endsAt', v_ends, 'sessionId', v_id);
END; $$;

-- ============ TASKS ============
CREATE OR REPLACE FUNCTION public.complete_task_for_telegram(_telegram_id bigint, _task_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_t public.tasks%ROWTYPE; v_p public.profiles%ROWTYPE; v_new boolean := true;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false); END IF;
  SELECT * INTO v_t FROM public.tasks WHERE id = _task_id AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false); END IF;

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

-- ============ REFERRALS ============
CREATE OR REPLACE FUNCTION public.get_referral_summary_for_telegram(_telegram_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('count', 0, 'ton_earned', 0, 'users', '[]'::jsonb, 'rewards', '[]'::jsonb); END IF;
  RETURN jsonb_build_object(
    'count', (SELECT count(*) FROM public.profiles WHERE referred_by = v_uid),
    'ton_earned', COALESCE((SELECT sum(ton_amount) FROM public.referral_rewards WHERE referrer_id = v_uid), 0),
    'users', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name, 'username', p.username, 'photo_url', p.photo_url, 'joined_at', p.created_at) ORDER BY p.created_at DESC)
                       FROM public.profiles p WHERE p.referred_by = v_uid), '[]'::jsonb),
    'rewards', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'source_type', r.source_type, 'ton_amount', r.ton_amount, 'created_at', r.created_at, 'referred_user_id', r.referred_user_id) ORDER BY r.created_at DESC)
                       FROM public.referral_rewards r WHERE r.referrer_id = v_uid), '[]'::jsonb));
END; $$;

-- ============ BATTLE ============
CREATE OR REPLACE FUNCTION public.get_battle_inventory_for_telegram(_telegram_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'category', b.category, 'package_key', b.package_key,
    'package_name', b.package_name, 'quantity', b.quantity, 'total_purchased', b.total_purchased, 'updated_at', b.updated_at))
    FROM public.battle_inventory b WHERE b.user_id = v_uid AND b.quantity > 0), '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.perform_attack_for_telegram(_telegram_id bigint, _attack_type text DEFAULT 'free', _package_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid; v_c public.characters%ROWTYPE; v_free int; v_dmg bigint; v_boost numeric := 1;
  v_ton numeric := 0; v_kill boolean := false; v_qty int;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'no_profile'); END IF;

  SELECT * INTO v_c FROM public.characters WHERE is_active = true ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'no_boss'); END IF;

  SELECT COALESCE(1 + SUM(s.attack_boost - 1), 1) INTO v_boost
    FROM public.user_servers us JOIN public.servers s ON s.id = us.server_id WHERE us.user_id = v_uid;

  SELECT count(*) INTO v_free FROM public.attacks
   WHERE user_id = v_uid AND attack_type = 'free' AND created_at >= date_trunc('day', now());

  IF _attack_type = 'free' OR _package_key IS NULL THEN
    IF v_free >= 3 THEN RETURN jsonb_build_object('success', false, 'error', 'no_free_attacks'); END IF;
    v_dmg := GREATEST(1, floor(100 * COALESCE(v_boost, 1)))::bigint;
  ELSE
    SELECT quantity INTO v_qty FROM public.battle_inventory WHERE user_id = v_uid AND package_key = _package_key FOR UPDATE;
    IF COALESCE(v_qty, 0) <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'no_items'); END IF;
    UPDATE public.battle_inventory SET quantity = quantity - 1 WHERE user_id = v_uid AND package_key = _package_key;
    v_dmg := GREATEST(1, floor(1000 * COALESCE(v_boost, 1)))::bigint;
  END IF;

  IF v_dmg >= v_c.current_hp THEN
    v_dmg := v_c.current_hp; v_kill := true;
    v_ton := round(v_c.ton_pool * 0.3, 6);
  ELSE
    v_ton := round(v_c.ton_pool * (v_dmg::numeric / GREATEST(v_c.max_hp, 1)) * 0.5, 6);
  END IF;

  UPDATE public.characters
     SET current_hp = GREATEST(0, current_hp - v_dmg),
         ton_pool = GREATEST(0, ton_pool - v_ton),
         is_active = CASE WHEN current_hp - v_dmg <= 0 THEN false ELSE is_active END
   WHERE id = v_c.id RETURNING * INTO v_c;

  INSERT INTO public.attacks (user_id, character_id, damage, attack_type, package_key, ton_reward, is_killing_blow)
  VALUES (v_uid, v_c.id, v_dmg, CASE WHEN _package_key IS NULL THEN 'free' ELSE _attack_type END, _package_key, v_ton, v_kill);

  IF v_ton > 0 THEN
    UPDATE public.profiles SET ton_balance = ton_balance + v_ton WHERE id = v_uid;
  END IF;

  SELECT count(*) INTO v_free FROM public.attacks
   WHERE user_id = v_uid AND attack_type = 'free' AND created_at >= date_trunc('day', now());

  RETURN jsonb_build_object('success', true, 'damage', v_dmg,
    'character', jsonb_build_object('id', v_c.id, 'name', v_c.name, 'current_hp', v_c.current_hp,
      'max_hp', v_c.max_hp, 'ton_pool', v_c.ton_pool, 'is_active', v_c.is_active),
    'inventory', public.get_battle_inventory_for_telegram(_telegram_id),
    'freeAttacksRemaining', GREATEST(0, 3 - v_free));
END; $$;

-- ============ PURCHASES ============
CREATE OR REPLACE FUNCTION public.purchase_server_for_telegram(_telegram_id bigint, _server_id uuid, _ton_paid numeric, _wallet_address text DEFAULT NULL, _tx_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_tx uuid; v_ref numeric := 0;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false); END IF;

  INSERT INTO public.user_servers (user_id, server_id, ton_paid) VALUES (v_uid, _server_id, _ton_paid);
  INSERT INTO public.transactions (user_id, type, amount, currency, status, wallet_address, tx_hash, metadata)
  VALUES (v_uid, 'server_purchase', _ton_paid, 'ton', 'completed', _wallet_address, _tx_hash, jsonb_build_object('server_id', _server_id))
  RETURNING id INTO v_tx;

  UPDATE public.characters SET ton_pool = ton_pool + round(_ton_paid * 0.25, 6) WHERE is_active = true;
  v_ref := public.game_credit_referral(v_uid, _ton_paid, 'server_purchase');
  RETURN jsonb_build_object('success', true, 'transactionId', v_tx, 'referralReward', v_ref);
END; $$;

CREATE OR REPLACE FUNCTION public.purchase_battle_item_for_telegram(_telegram_id bigint, _category text, _package_key text, _package_name text, _quantity integer, _ton_paid numeric, _wallet_address text DEFAULT NULL, _tx_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_tx uuid; v_ref numeric := 0;
BEGIN
  v_uid := public.game_profile_id(_telegram_id);
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false); END IF;

  INSERT INTO public.battle_inventory (user_id, category, package_key, package_name, quantity, total_purchased)
  VALUES (v_uid, _category, _package_key, _package_name, _quantity, _quantity)
  ON CONFLICT (user_id, package_key) DO UPDATE
    SET quantity = public.battle_inventory.quantity + EXCLUDED.quantity,
        total_purchased = public.battle_inventory.total_purchased + EXCLUDED.quantity,
        package_name = EXCLUDED.package_name,
        category = EXCLUDED.category;

  INSERT INTO public.transactions (user_id, type, amount, currency, status, wallet_address, tx_hash, metadata)
  VALUES (v_uid, 'battle_purchase', _ton_paid, 'ton', 'completed', _wallet_address, _tx_hash,
          jsonb_build_object('package_key', _package_key, 'quantity', _quantity))
  RETURNING id INTO v_tx;

  UPDATE public.characters SET ton_pool = ton_pool + round(_ton_paid * 0.25, 6) WHERE is_active = true;
  v_ref := public.game_credit_referral(v_uid, _ton_paid, 'battle_purchase');

  RETURN jsonb_build_object('success', true, 'transactionId', v_tx, 'referralReward', v_ref,
    'inventory', public.get_battle_inventory_for_telegram(_telegram_id));
END; $$;

-- ============ ADMIN ============
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_for_telegram(_telegram_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  RETURN jsonb_build_object('success', true,
    'users', COALESCE((SELECT jsonb_agg(to_jsonb(u)) FROM (SELECT id, telegram_id, first_name, username, photo_url, siri_balance, ton_balance, usdt_balance, is_banned, created_at FROM public.profiles WHERE telegram_id IS NOT NULL ORDER BY created_at DESC LIMIT 200) u), '[]'::jsonb),
    'tasks', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.tasks ORDER BY is_pinned DESC, created_at DESC) t), '[]'::jsonb),
    'characters', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM (SELECT * FROM public.characters ORDER BY created_at DESC) c), '[]'::jsonb),
    'servers', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM public.servers ORDER BY price_ton) s), '[]'::jsonb),
    'transactions', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.transactions ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'notifications', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM (SELECT * FROM public.game_notifications ORDER BY created_at DESC LIMIT 50) n), '[]'::jsonb),
    'stats', jsonb_build_object(
      'total_users', (SELECT count(*) FROM public.profiles WHERE telegram_id IS NOT NULL),
      'total_transactions', (SELECT count(*) FROM public.transactions),
      'total_ton_volume', COALESCE((SELECT sum(amount) FROM public.transactions WHERE currency = 'ton' AND status = 'completed'), 0),
      'active_miners', (SELECT count(*) FROM public.mining_sessions WHERE claimed = false AND ends_at > now()),
      'total_attacks', (SELECT count(*) FROM public.attacks)));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_upsert_task_for_telegram(_telegram_id bigint, _task_id uuid, _title text, _reward_amount numeric, _reward_type text, _task_type text, _link text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN RETURN jsonb_build_object('success', false); END IF;
  IF _task_id IS NULL THEN
    INSERT INTO public.tasks (title, reward_amount, reward_type, task_type, link)
    VALUES (_title, _reward_amount, _reward_type, _task_type, _link) RETURNING id INTO v_id;
  ELSE
    UPDATE public.tasks SET title = _title, reward_amount = _reward_amount, reward_type = _reward_type,
      task_type = _task_type, link = _link WHERE id = _task_id RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'taskId', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_toggle_task_for_telegram(_telegram_id bigint, _task_id uuid, _is_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN RETURN jsonb_build_object('success', false); END IF;
  UPDATE public.tasks SET is_active = _is_active WHERE id = _task_id;
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_pin_task_for_telegram(_telegram_id bigint, _task_id uuid, _is_pinned boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN RETURN jsonb_build_object('success', false); END IF;
  UPDATE public.tasks SET is_pinned = _is_pinned WHERE id = _task_id;
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_task_for_telegram(_telegram_id bigint, _task_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN RETURN jsonb_build_object('success', false); END IF;
  DELETE FROM public.tasks WHERE id = _task_id;
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_create_character_for_telegram(_telegram_id bigint, _name text, _image_url text, _max_hp bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN RETURN jsonb_build_object('success', false); END IF;
  INSERT INTO public.characters (name, image_url, max_hp, current_hp) VALUES (_name, _image_url, _max_hp, _max_hp) RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'characterId', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_activate_character_for_telegram(_telegram_id bigint, _character_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN RETURN jsonb_build_object('success', false); END IF;
  UPDATE public.characters SET is_active = false WHERE is_active = true;
  UPDATE public.characters SET is_active = true WHERE id = _character_id;
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_create_server_for_telegram(_telegram_id bigint, _name text, _image_url text, _price_ton numeric, _rarity text, _mining_boost numeric, _attack_boost numeric, _ton_mining_rate numeric, _usdt_mining_rate numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN RETURN jsonb_build_object('success', false); END IF;
  INSERT INTO public.servers (name, image_url, price_ton, rarity, mining_boost, attack_boost, ton_mining_rate, usdt_mining_rate)
  VALUES (_name, _image_url, _price_ton, _rarity, _mining_boost, _attack_boost, _ton_mining_rate, _usdt_mining_rate)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'serverId', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_toggle_ban_for_telegram(_telegram_id bigint, _profile_id uuid, _is_banned boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN RETURN jsonb_build_object('success', false); END IF;
  UPDATE public.profiles SET is_banned = _is_banned WHERE id = _profile_id;
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification_for_telegram(_telegram_id bigint, _title text, _message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN RETURN jsonb_build_object('success', false); END IF;
  INSERT INTO public.game_notifications (user_id, title, message)
  SELECT id, _title, _message FROM public.profiles WHERE telegram_id IS NOT NULL AND is_banned = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'queued', v_count);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_activate_reward_for_telegram(_telegram_id bigint, _reward_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN RETURN jsonb_build_object('success', false, 'error', 'forbidden'); END IF;
  UPDATE public.profiles
     SET reward_balance = _reward_amount, reward_expires_at = now() + interval '48 hours'
   WHERE telegram_id IS NOT NULL AND is_banned = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'updated', v_count);
END; $$;

-- ============ EXECUTE GRANTS ============
GRANT EXECUTE ON FUNCTION public.sync_mining_for_telegram(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_mining_for_telegram(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_task_for_telegram(bigint, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_summary_for_telegram(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_battle_inventory_for_telegram(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.perform_attack_for_telegram(bigint, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_server_for_telegram(bigint, uuid, numeric, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_battle_item_for_telegram(bigint, text, text, text, integer, numeric, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_telegram_admin(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_for_telegram(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_task_for_telegram(bigint, uuid, text, numeric, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_task_for_telegram(bigint, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pin_task_for_telegram(bigint, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_task_for_telegram(bigint, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_character_for_telegram(bigint, text, text, bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_activate_character_for_telegram(bigint, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_server_for_telegram(bigint, text, text, numeric, text, numeric, numeric, numeric, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_ban_for_telegram(bigint, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification_for_telegram(bigint, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_activate_reward_for_telegram(bigint, numeric) TO anon, authenticated;
