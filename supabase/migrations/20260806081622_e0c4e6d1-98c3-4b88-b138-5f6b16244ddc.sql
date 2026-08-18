-- ============ PVP ARENA ============
CREATE TABLE public.pvp_weapons (
  key text PRIMARY KEY,
  name text NOT NULL,
  rarity text NOT NULL DEFAULT 'common',
  damage integer NOT NULL DEFAULT 10,
  fire_rate_ms integer NOT NULL DEFAULT 300,
  bullet_speed integer NOT NULL DEFAULT 420,
  spread numeric NOT NULL DEFAULT 0,
  pellets integer NOT NULL DEFAULT 1,
  range_px integer NOT NULL DEFAULT 600,
  price_ton numeric NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  color text NOT NULL DEFAULT '#7dd3fc',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pvp_weapons TO anon, authenticated;
GRANT ALL ON public.pvp_weapons TO service_role;
ALTER TABLE public.pvp_weapons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weapons are public" ON public.pvp_weapons FOR SELECT USING (true);

CREATE TABLE public.pvp_weapon_owned (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  weapon_key text NOT NULL REFERENCES public.pvp_weapons(key) ON DELETE CASCADE,
  ton_paid numeric NOT NULL DEFAULT 0,
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, weapon_key)
);
GRANT SELECT ON public.pvp_weapon_owned TO anon, authenticated;
GRANT ALL ON public.pvp_weapon_owned TO service_role;
ALTER TABLE public.pvp_weapon_owned ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owned weapons readable" ON public.pvp_weapon_owned FOR SELECT USING (true);

CREATE TABLE public.pvp_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'duo',
  max_players integer NOT NULL DEFAULT 4,
  status text NOT NULL DEFAULT 'waiting',
  arena_seed integer NOT NULL DEFAULT floor(random() * 100000),
  prize_ton numeric NOT NULL DEFAULT 0.02,
  started_at timestamptz,
  ends_at timestamptz,
  winner_profile_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pvp_matches TO anon, authenticated;
GRANT ALL ON public.pvp_matches TO service_role;
ALTER TABLE public.pvp_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches readable" ON public.pvp_matches FOR SELECT USING (true);
CREATE INDEX pvp_matches_status_idx ON public.pvp_matches (status, created_at DESC);

CREATE TABLE public.pvp_match_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.pvp_matches(id) ON DELETE CASCADE,
  profile_id uuid,
  telegram_id bigint,
  username text NOT NULL DEFAULT 'Player',
  photo_url text,
  slot integer NOT NULL DEFAULT 0,
  is_bot boolean NOT NULL DEFAULT false,
  weapon_key text NOT NULL DEFAULT 'pistol',
  kills integer NOT NULL DEFAULT 0,
  deaths integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  alive boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, slot)
);
GRANT SELECT ON public.pvp_match_players TO anon, authenticated;
GRANT ALL ON public.pvp_match_players TO service_role;
ALTER TABLE public.pvp_match_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "match players readable" ON public.pvp_match_players FOR SELECT USING (true);
CREATE INDEX pvp_match_players_match_idx ON public.pvp_match_players (match_id);

CREATE TABLE public.pvp_stats (
  profile_id uuid PRIMARY KEY,
  matches integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  kills integer NOT NULL DEFAULT 0,
  deaths integer NOT NULL DEFAULT 0,
  rating integer NOT NULL DEFAULT 1000,
  ton_earned numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pvp_stats TO anon, authenticated;
GRANT ALL ON public.pvp_stats TO service_role;
ALTER TABLE public.pvp_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pvp stats readable" ON public.pvp_stats FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_match_players;
ALTER TABLE public.pvp_matches REPLICA IDENTITY FULL;
ALTER TABLE public.pvp_match_players REPLICA IDENTITY FULL;

-- ============ SEED WEAPONS ============
INSERT INTO public.pvp_weapons (key, name, rarity, damage, fire_rate_ms, bullet_speed, spread, pellets, range_px, price_ton, is_default, color, sort_order) VALUES
('pistol',   'Recruit Pistol', 'common',    14, 320, 460, 0.02, 1, 560, 0,    true,  '#93c5fd', 1),
('smg',      'Nano SMG',       'common',     9, 130, 500, 0.09, 1, 480, 0,    true,  '#a7f3d0', 2),
('shotgun',  'Void Shotgun',   'rare',       8, 620, 420, 0.26, 6, 300, 0.35, false, '#fbbf24', 3),
('rifle',    'Pulse Rifle',    'rare',      17, 180, 620, 0.05, 1, 700, 0.5,  false, '#f472b6', 4),
('sniper',   'Orbit Sniper',   'epic',      62, 1100, 980, 0.0, 1, 1200, 0.9, false, '#22d3ee', 5),
('minigun',  'Titan Minigun',  'epic',       7, 60,  540, 0.13, 1, 520, 1.2,  false, '#fb7185', 6),
('plasma',   'Plasma Lance',   'legendary', 30, 240, 760, 0.02, 2, 820, 2.0,  false, '#c084fc', 7),
('railgun',  'TON Railgun',    'legendary', 85, 900, 1400, 0.0, 1, 1400, 3.5, false, '#facc15', 8);

-- ============ FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.pvp_find_or_create_match(_telegram_id bigint, _mode text DEFAULT 'squad', _weapon_key text DEFAULT 'pistol')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile uuid;
  v_match public.pvp_matches;
  v_max int;
  v_slot int;
  v_count int;
  v_username text;
  v_photo text;
  v_owned boolean;
BEGIN
  v_profile := public.game_profile_id(_telegram_id);
  IF v_profile IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;

  SELECT COALESCE(username, first_name, 'Player'), photo_url INTO v_username, v_photo
  FROM public.profiles WHERE id = v_profile;

  SELECT (is_default OR EXISTS (SELECT 1 FROM public.pvp_weapon_owned o WHERE o.profile_id = v_profile AND o.weapon_key = w.key))
  INTO v_owned FROM public.pvp_weapons w WHERE w.key = _weapon_key;
  IF v_owned IS NOT TRUE THEN _weapon_key := 'pistol'; END IF;

  v_max := CASE WHEN _mode = 'duel' THEN 2 ELSE 4 END;

  -- leave any stale match
  DELETE FROM public.pvp_match_players p
  USING public.pvp_matches m
  WHERE p.match_id = m.id AND p.profile_id = v_profile AND m.status <> 'finished';

  SELECT m.* INTO v_match FROM public.pvp_matches m
  WHERE m.status = 'waiting' AND m.mode = _mode
    AND m.created_at > now() - interval '2 minutes'
    AND (SELECT count(*) FROM public.pvp_match_players p WHERE p.match_id = m.id) < m.max_players
  ORDER BY m.created_at ASC LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_match.id IS NULL THEN
    INSERT INTO public.pvp_matches (mode, max_players, prize_ton)
    VALUES (_mode, v_max, CASE WHEN _mode = 'duel' THEN 0.015 ELSE 0.03 END)
    RETURNING * INTO v_match;
  END IF;

  SELECT COALESCE(max(slot) + 1, 0), count(*) INTO v_slot, v_count
  FROM public.pvp_match_players WHERE match_id = v_match.id;

  INSERT INTO public.pvp_match_players (match_id, profile_id, telegram_id, username, photo_url, slot, weapon_key)
  VALUES (v_match.id, v_profile, _telegram_id, v_username, v_photo, v_slot, _weapon_key);

  RETURN jsonb_build_object(
    'success', true,
    'match_id', v_match.id,
    'mode', v_match.mode,
    'max_players', v_match.max_players,
    'arena_seed', v_match.arena_seed,
    'prize_ton', v_match.prize_ton,
    'slot', v_slot,
    'profile_id', v_profile,
    'weapon_key', _weapon_key
  );
END; $$;

CREATE OR REPLACE FUNCTION public.pvp_add_bots(_match_id uuid, _count int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_slot int; i int; v_names text[] := ARRAY['Wraith','Vortex','Nomad','Sentinel','Havoc','Cipher'];
BEGIN
  SELECT COALESCE(max(slot) + 1, 0) INTO v_slot FROM public.pvp_match_players WHERE match_id = _match_id;
  FOR i IN 0.._count - 1 LOOP
    INSERT INTO public.pvp_match_players (match_id, username, slot, is_bot, weapon_key)
    VALUES (_match_id, v_names[1 + ((v_slot + i) % array_length(v_names,1))] , v_slot + i, true,
            (ARRAY['pistol','smg','shotgun','rifle'])[1 + floor(random()*4)::int])
    ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE public.pvp_matches SET status = 'live', started_at = now(), ends_at = now() + interval '90 seconds', updated_at = now()
  WHERE id = _match_id AND status = 'waiting';
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.pvp_start_match(_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.pvp_matches
  SET status = 'live', started_at = now(), ends_at = now() + interval '90 seconds', updated_at = now()
  WHERE id = _match_id AND status = 'waiting';
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.pvp_report_frag(_telegram_id bigint, _match_id uuid, _kills int, _deaths int, _score int, _alive boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid;
BEGIN
  v_profile := public.game_profile_id(_telegram_id);
  IF v_profile IS NULL THEN RETURN jsonb_build_object('success', false); END IF;
  UPDATE public.pvp_match_players
  SET kills = GREATEST(kills, _kills), deaths = GREATEST(deaths, _deaths),
      score = GREATEST(score, _score), alive = _alive
  WHERE match_id = _match_id AND profile_id = v_profile;
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.pvp_finish_match(_telegram_id bigint, _match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile uuid; v_match public.pvp_matches; v_winner public.pvp_match_players;
  v_me public.pvp_match_players; v_reward numeric := 0;
BEGIN
  v_profile := public.game_profile_id(_telegram_id);
  IF v_profile IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;

  SELECT * INTO v_match FROM public.pvp_matches WHERE id = _match_id FOR UPDATE;
  IF v_match.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'match_not_found'); END IF;

  SELECT * INTO v_me FROM public.pvp_match_players WHERE match_id = _match_id AND profile_id = v_profile;
  IF v_me.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_in_match'); END IF;

  IF v_match.status <> 'finished' THEN
    SELECT * INTO v_winner FROM public.pvp_match_players
    WHERE match_id = _match_id ORDER BY score DESC, kills DESC, deaths ASC LIMIT 1;

    UPDATE public.pvp_matches
    SET status = 'finished', winner_profile_id = v_winner.profile_id, updated_at = now()
    WHERE id = _match_id;
  ELSE
    SELECT * INTO v_winner FROM public.pvp_match_players
    WHERE match_id = _match_id ORDER BY score DESC, kills DESC, deaths ASC LIMIT 1;
  END IF;

  -- rewards: winner takes prize pool, everyone gets siri per kill
  IF v_winner.profile_id = v_profile THEN v_reward := v_match.prize_ton; END IF;

  INSERT INTO public.pvp_stats (profile_id, matches, wins, kills, deaths, rating, ton_earned, updated_at)
  VALUES (v_profile, 1, CASE WHEN v_reward > 0 THEN 1 ELSE 0 END, v_me.kills, v_me.deaths,
          1000 + CASE WHEN v_reward > 0 THEN 25 ELSE -10 END, v_reward, now())
  ON CONFLICT (profile_id) DO UPDATE SET
    matches = public.pvp_stats.matches + 1,
    wins = public.pvp_stats.wins + CASE WHEN v_reward > 0 THEN 1 ELSE 0 END,
    kills = public.pvp_stats.kills + v_me.kills,
    deaths = public.pvp_stats.deaths + v_me.deaths,
    rating = GREATEST(0, public.pvp_stats.rating + CASE WHEN v_reward > 0 THEN 25 ELSE -10 END),
    ton_earned = public.pvp_stats.ton_earned + v_reward,
    updated_at = now();

  UPDATE public.profiles
  SET ton_balance = COALESCE(ton_balance, 0) + v_reward,
      siri_balance = COALESCE(siri_balance, 0) + (v_me.kills * 250)
  WHERE id = v_profile;

  RETURN jsonb_build_object(
    'success', true,
    'won', (v_winner.profile_id = v_profile),
    'ton_reward', v_reward,
    'siri_reward', v_me.kills * 250,
    'winner', v_winner.username,
    'kills', v_me.kills,
    'deaths', v_me.deaths,
    'score', v_me.score
  );
END; $$;

CREATE OR REPLACE FUNCTION public.pvp_buy_weapon(_telegram_id bigint, _weapon_key text, _ton_paid numeric, _tx_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_price numeric;
BEGIN
  v_profile := public.game_profile_id(_telegram_id);
  IF v_profile IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;
  SELECT price_ton INTO v_price FROM public.pvp_weapons WHERE key = _weapon_key;
  IF v_price IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'weapon_not_found'); END IF;
  IF _ton_paid + 0.0000001 < v_price THEN RETURN jsonb_build_object('success', false, 'error', 'underpaid'); END IF;

  INSERT INTO public.pvp_weapon_owned (profile_id, weapon_key, ton_paid, tx_hash)
  VALUES (v_profile, _weapon_key, _ton_paid, _tx_hash)
  ON CONFLICT (profile_id, weapon_key) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'weapon_key', _weapon_key);
END; $$;

CREATE OR REPLACE FUNCTION public.pvp_get_loadout(_telegram_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_res jsonb;
BEGIN
  v_profile := public.game_profile_id(_telegram_id);
  SELECT jsonb_agg(jsonb_build_object(
    'key', w.key, 'name', w.name, 'rarity', w.rarity, 'damage', w.damage,
    'fire_rate_ms', w.fire_rate_ms, 'bullet_speed', w.bullet_speed, 'spread', w.spread,
    'pellets', w.pellets, 'range_px', w.range_px, 'price_ton', w.price_ton,
    'color', w.color, 'sort_order', w.sort_order,
    'owned', (w.is_default OR EXISTS (SELECT 1 FROM public.pvp_weapon_owned o WHERE o.profile_id = v_profile AND o.weapon_key = w.key))
  ) ORDER BY w.sort_order) INTO v_res FROM public.pvp_weapons w;
  RETURN COALESCE(v_res, '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.pvp_leaderboard(_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
    SELECT COALESCE(p.username, p.first_name, 'Player') AS username, p.photo_url,
           s.wins, s.kills, s.rating, s.ton_earned
    FROM public.pvp_stats s JOIN public.profiles p ON p.id = s.profile_id
    ORDER BY s.rating DESC, s.wins DESC LIMIT _limit
  ) x;
$$;