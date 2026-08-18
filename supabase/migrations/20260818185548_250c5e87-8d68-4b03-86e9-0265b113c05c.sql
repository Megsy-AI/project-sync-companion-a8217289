ALTER TABLE public.game_bets
  ADD COLUMN IF NOT EXISTS multiplier numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.game_play_round(
  _telegram_id bigint,
  _game_slug text,
  _stake numeric,
  _params jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bal numeric;
  _mult numeric := 0;
  _payout numeric := 0;
  _outcome jsonb := '{}'::jsonb;
  _r double precision;
  _r2 double precision;
  _target numeric;
  _roll numeric;
  _pick text;
  _pocket int;
  _color text;
  _syms int[];
  _mtab numeric[] := ARRAY[3,4,5,8,12,20,40,100];
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

  IF _game_slug = 'coinflip' THEN
    _pick := COALESCE(_params->>'side', 'heads');
    _r := random();
    _outcome := jsonb_build_object('side', CASE WHEN _r < 0.5 THEN 'heads' ELSE 'tails' END);
    IF (_outcome->>'side') = _pick THEN _mult := 1.96; END IF;

  ELSIF _game_slug = 'dice' THEN
    _target := COALESCE((_params->>'target')::numeric, 50);
    IF _target < 2 OR _target > 95 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_target');
    END IF;
    _roll := round((random() * 100)::numeric, 2);
    _outcome := jsonb_build_object('roll', _roll, 'target', _target);
    IF _roll < _target THEN _mult := round(96 / _target, 4); END IF;

  ELSIF _game_slug = 'roulette' THEN
    _pick := COALESCE(_params->>'color', 'red');
    _pocket := floor(random() * 37)::int;
    _color := CASE WHEN _pocket = 0 THEN 'green'
                   WHEN _pocket % 2 = 1 THEN 'red' ELSE 'black' END;
    _outcome := jsonb_build_object('pocket', _pocket, 'color', _color);
    IF _pick = _color THEN
      _mult := CASE WHEN _color = 'green' THEN 14 ELSE 1.94 END;
    END IF;

  ELSIF _game_slug = 'slots' THEN
    _syms := ARRAY[
      floor(random() * 8)::int,
      floor(random() * 8)::int,
      floor(random() * 8)::int
    ];
    _outcome := jsonb_build_object('reels', to_jsonb(_syms));
    IF _syms[1] = _syms[2] AND _syms[2] = _syms[3] THEN
      _mult := _mtab[_syms[1] + 1];
    ELSIF _syms[1] = _syms[2] OR _syms[2] = _syms[3] OR _syms[1] = _syms[3] THEN
      _mult := 1.8;
    END IF;

  ELSIF _game_slug = 'wheel' THEN
    _r := random();
    _mult := CASE
      WHEN _r < 0.40 THEN 0
      WHEN _r < 0.70 THEN 1.2
      WHEN _r < 0.88 THEN 1.8
      WHEN _r < 0.97 THEN 3
      WHEN _r < 0.995 THEN 8
      ELSE 25 END;
    _outcome := jsonb_build_object('segment', _mult);

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'unknown_game');
  END IF;

  _payout := round(_stake * _mult, 6);

  UPDATE profiles
    SET ton_balance = ton_balance - _stake + _payout
  WHERE telegram_id = _telegram_id;

  INSERT INTO game_bets (telegram_id, game_slug, stake, payout, multiplier, meta, status, settled_at)
  VALUES (_telegram_id, _game_slug, _stake, _payout, _mult, _outcome,
          CASE WHEN _payout > 0 THEN 'won' ELSE 'lost' END, now())
  RETURNING id INTO _bet_id;

  SELECT ton_balance INTO _bal FROM profiles WHERE telegram_id = _telegram_id;

  RETURN jsonb_build_object(
    'success', true,
    'bet_id', _bet_id,
    'multiplier', _mult,
    'payout', _payout,
    'outcome', _outcome,
    'balance', _bal
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.game_crash_start(_telegram_id bigint, _stake numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bal numeric;
  _bet_id uuid;
  _u double precision;
  _crash numeric;
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

  _u := random();
  IF _u < 0.03 THEN
    _crash := 1.00;
  ELSE
    _crash := round(LEAST(1000, GREATEST(1.01, (0.96 / GREATEST(_u, 0.0001))::numeric)), 2);
  END IF;

  UPDATE profiles SET ton_balance = ton_balance - _stake WHERE telegram_id = _telegram_id;

  INSERT INTO game_bets (telegram_id, game_slug, stake, meta, status)
  VALUES (_telegram_id, 'crash', _stake, jsonb_build_object('crash', _crash), 'open')
  RETURNING id INTO _bet_id;

  SELECT ton_balance INTO _bal FROM profiles WHERE telegram_id = _telegram_id;

  RETURN jsonb_build_object('success', true, 'bet_id', _bet_id, 'balance', _bal);
END;
$$;

CREATE OR REPLACE FUNCTION public.game_crash_cashout(_telegram_id bigint, _bet_id uuid, _at numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bet game_bets%ROWTYPE;
  _crash numeric;
  _elapsed double precision;
  _allowed numeric;
  _mult numeric := 0;
  _payout numeric := 0;
  _bal numeric;
BEGIN
  SELECT * INTO _bet FROM game_bets
  WHERE id = _bet_id AND telegram_id = _telegram_id AND status = 'open' AND game_slug = 'crash'
  FOR UPDATE;

  IF _bet.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'bet_not_found');
  END IF;

  _crash := (_bet.meta->>'crash')::numeric;
  _elapsed := EXTRACT(EPOCH FROM (now() - _bet.created_at));
  _allowed := round((power(1.07::numeric, LEAST(_elapsed, 120)::numeric) * 1.02), 4);

  _mult := LEAST(COALESCE(_at, 0), _allowed);

  IF _mult >= 1.01 AND _mult < _crash THEN
    _payout := round(_bet.stake * _mult, 6);
    UPDATE profiles SET ton_balance = ton_balance + _payout WHERE telegram_id = _telegram_id;
  ELSE
    _mult := 0;
  END IF;

  UPDATE game_bets
    SET status = CASE WHEN _payout > 0 THEN 'won' ELSE 'lost' END,
        payout = _payout,
        multiplier = _mult,
        settled_at = now()
  WHERE id = _bet.id;

  SELECT ton_balance INTO _bal FROM profiles WHERE telegram_id = _telegram_id;

  RETURN jsonb_build_object('success', true, 'multiplier', _mult, 'payout', _payout, 'crash', _crash, 'balance', _bal);
END;
$$;

GRANT EXECUTE ON FUNCTION public.game_play_round(bigint, text, numeric, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.game_crash_start(bigint, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.game_crash_cashout(bigint, uuid, numeric) TO anon, authenticated;