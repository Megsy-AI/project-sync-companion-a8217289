
-- Add is_pinned to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- Add welcome_image_url to telegram_admins
ALTER TABLE public.telegram_admins ADD COLUMN IF NOT EXISTS welcome_image_url text DEFAULT NULL;

-- Add reward_expires_at to profiles for 48h timer
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reward_expires_at timestamptz DEFAULT NULL;

-- Pin/unpin task RPC
CREATE OR REPLACE FUNCTION public.admin_pin_task_for_telegram(_telegram_id bigint, _task_id uuid, _is_pinned boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  UPDATE public.tasks
  SET is_pinned = _is_pinned, updated_at = now()
  WHERE id = _task_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Activate $1500 reward for all users with 48h expiry
CREATE OR REPLACE FUNCTION public.admin_activate_reward_for_telegram(_telegram_id bigint, _reward_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _updated integer := 0;
  _expires_at timestamptz := now() + interval '48 hours';
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  UPDATE public.profiles
  SET reward_balance = COALESCE(_reward_amount, 1500),
      reward_expires_at = _expires_at
  WHERE COALESCE(is_banned, false) = false;

  GET DIAGNOSTICS _updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated', _updated, 'expires_at', _expires_at);
END;
$$;

-- Cleanup expired rewards
CREATE OR REPLACE FUNCTION public.admin_cleanup_expired_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cleaned integer := 0;
BEGIN
  UPDATE public.profiles
  SET reward_balance = 0, reward_expires_at = NULL
  WHERE reward_expires_at IS NOT NULL AND reward_expires_at <= now() AND reward_balance > 0;

  GET DIAGNOSTICS _cleaned = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'cleaned', _cleaned);
END;
$$;

-- Update admin_get_dashboard to include is_pinned in tasks
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_for_telegram(_telegram_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT public.is_telegram_admin(_telegram_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'users', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id, 'telegram_id', p.telegram_id,
          'first_name', p.first_name, 'last_name', p.last_name,
          'username', p.username, 'photo_url', p.photo_url,
          'siri_balance', COALESCE(p.siri_balance, 0),
          'ton_balance', COALESCE(p.ton_balance, 0),
          'usdt_balance', COALESCE(p.usdt_balance, 0),
          'reward_balance', COALESCE(p.reward_balance, 0),
          'is_banned', COALESCE(p.is_banned, false),
          'created_at', p.created_at
        ) ORDER BY p.created_at DESC
      ) FROM public.profiles p
    ), '[]'::jsonb),
    'tasks', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.id, 'title', t.title, 'description', t.description,
          'reward_amount', t.reward_amount, 'reward_type', t.reward_type,
          'task_type', t.task_type, 'link', t.link,
          'is_active', COALESCE(t.is_active, true),
          'is_pinned', COALESCE(t.is_pinned, false),
          'created_at', t.created_at, 'updated_at', t.updated_at
        ) ORDER BY COALESCE(t.is_pinned, false) DESC, t.created_at DESC
      ) FROM public.tasks t
    ), '[]'::jsonb),
    'characters', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id, 'name', c.name, 'image_url', c.image_url,
          'max_hp', c.max_hp, 'current_hp', c.current_hp,
          'ton_pool', COALESCE(c.ton_pool, 0),
          'is_active', COALESCE(c.is_active, false),
          'created_at', c.created_at, 'updated_at', c.updated_at
        ) ORDER BY COALESCE(c.is_active, false) DESC, c.updated_at DESC
      ) FROM public.characters c
    ), '[]'::jsonb),
    'servers', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id, 'name', s.name, 'image_url', s.image_url,
          'price_ton', s.price_ton, 'rarity', s.rarity,
          'mining_boost', COALESCE(s.mining_boost, 0),
          'attack_boost', COALESCE(s.attack_boost, 0),
          'ton_mining_rate', COALESCE(s.ton_mining_rate, 0),
          'usdt_mining_rate', COALESCE(s.usdt_mining_rate, 0),
          'is_active', COALESCE(s.is_active, true),
          'created_at', s.created_at, 'updated_at', s.updated_at
        ) ORDER BY s.price_ton ASC, s.created_at DESC
      ) FROM public.servers s
    ), '[]'::jsonb),
    'transactions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', tx.id, 'user_id', tx.user_id, 'amount', tx.amount,
          'currency', tx.currency, 'type', tx.type, 'status', tx.status,
          'tx_hash', tx.tx_hash, 'wallet_address', tx.wallet_address,
          'metadata', tx.metadata, 'created_at', tx.created_at, 'updated_at', tx.updated_at
        ) ORDER BY tx.created_at DESC
      ) FROM (SELECT * FROM public.transactions ORDER BY created_at DESC LIMIT 100) tx
    ), '[]'::jsonb),
    'notifications', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', n.id, 'profile_id', n.profile_id, 'notification_type', n.notification_type,
          'title', n.title, 'message', n.message, 'status', n.status,
          'error_message', n.error_message, 'scheduled_for', n.scheduled_for,
          'sent_at', n.sent_at, 'created_at', n.created_at, 'updated_at', n.updated_at
        ) ORDER BY n.created_at DESC
      ) FROM (SELECT * FROM public.telegram_notifications ORDER BY created_at DESC LIMIT 100) n
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'total_users', (SELECT COUNT(*) FROM public.profiles),
      'total_transactions', (SELECT COUNT(*) FROM public.transactions),
      'total_ton_volume', COALESCE((SELECT ROUND(SUM(amount), 4) FROM public.transactions WHERE LOWER(currency) = 'ton' AND LOWER(status) = 'completed'), 0),
      'active_miners', (SELECT COUNT(*) FROM public.mining_sessions WHERE claimed = false AND ends_at > now()),
      'total_attacks', (SELECT COUNT(*) FROM public.attacks)
    )
  ) INTO _result;

  RETURN _result;
END;
$$;
