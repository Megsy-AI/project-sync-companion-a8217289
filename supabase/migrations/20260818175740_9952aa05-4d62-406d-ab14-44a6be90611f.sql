CREATE TABLE IF NOT EXISTS public.game_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  game_slug text NOT NULL,
  stake numeric NOT NULL CHECK (stake > 0),
  payout numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

GRANT SELECT ON public.game_bets TO anon;
GRANT SELECT ON public.game_bets TO authenticated;
GRANT ALL ON public.game_bets TO service_role;

ALTER TABLE public.game_bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_bets_readonly" ON public.game_bets FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_game_bets_telegram ON public.game_bets (telegram_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.game_place_bet_for_telegram(_telegram_id bigint, _game_slug text, _stake numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bal numeric;
  _bet_id uuid;
BEGIN
  IF _stake IS NULL OR _stake <= 0 OR _stake > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_stake');
  END IF;

  SELECT ton_balance INTO _bal FROM profiles WHERE telegram_id = _telegram_id FOR UPDATE;
  IF _bal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_profile');
  END IF;
  IF _bal < _stake THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_funds');
  END IF;

  UPDATE profiles SET ton_balance = ton_balance - _stake WHERE telegram_id = _telegram_id;

  INSERT INTO game_bets (telegram_id, game_slug, stake)
  VALUES (_telegram_id, _game_slug, _stake)
  RETURNING id INTO _bet_id;

  RETURN jsonb_build_object('success', true, 'bet_id', _bet_id, 'balance', _bal - _stake);
END;
$$;

CREATE OR REPLACE FUNCTION public.game_settle_bet_for_telegram(_telegram_id bigint, _bet_id uuid, _won boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bet game_bets%ROWTYPE;
  _payout numeric := 0;
  _bal numeric;
BEGIN
  SELECT * INTO _bet FROM game_bets
  WHERE id = _bet_id AND telegram_id = _telegram_id AND status = 'open'
  FOR UPDATE;

  IF _bet.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'bet_not_found');
  END IF;

  IF _won THEN
    _payout := round(_bet.stake * 1.8, 6);
    UPDATE profiles SET ton_balance = ton_balance + _payout WHERE telegram_id = _telegram_id;
  END IF;

  UPDATE game_bets
  SET status = CASE WHEN _won THEN 'won' ELSE 'lost' END,
      payout = _payout,
      settled_at = now()
  WHERE id = _bet.id;

  SELECT ton_balance INTO _bal FROM profiles WHERE telegram_id = _telegram_id;

  RETURN jsonb_build_object('success', true, 'payout', _payout, 'balance', _bal);
END;
$$;

GRANT EXECUTE ON FUNCTION public.game_place_bet_for_telegram(bigint, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.game_settle_bet_for_telegram(bigint, uuid, boolean) TO anon, authenticated;