CREATE TABLE public.pvp_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  title text NOT NULL DEFAULT '',
  rarity text NOT NULL DEFAULT 'common',
  price_ton numeric NOT NULL DEFAULT 0,
  speed_mod numeric NOT NULL DEFAULT 1,
  hp_mod numeric NOT NULL DEFAULT 1,
  color text NOT NULL DEFAULT '#ffffff',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pvp_characters TO anon, authenticated;
GRANT ALL ON public.pvp_characters TO service_role;
ALTER TABLE public.pvp_characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Characters are public" ON public.pvp_characters FOR SELECT USING (true);

CREATE TABLE public.pvp_character_owned (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  character_key text NOT NULL REFERENCES public.pvp_characters(key) ON DELETE CASCADE,
  equipped boolean NOT NULL DEFAULT false,
  ton_paid numeric NOT NULL DEFAULT 0,
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, character_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pvp_character_owned TO authenticated;
GRANT SELECT ON public.pvp_character_owned TO anon;
GRANT ALL ON public.pvp_character_owned TO service_role;
ALTER TABLE public.pvp_character_owned ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owned characters readable" ON public.pvp_character_owned FOR SELECT USING (true);

CREATE TRIGGER update_pvp_characters_updated_at BEFORE UPDATE ON public.pvp_characters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pvp_character_owned_updated_at BEFORE UPDATE ON public.pvp_character_owned
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pvp_match_players ADD COLUMN IF NOT EXISTS character_key text NOT NULL DEFAULT 'striker';

INSERT INTO public.pvp_characters (key, name, title, rarity, price_ton, speed_mod, hp_mod, color, sort_order) VALUES
  ('striker','Striker','Assault Veteran','common',0,1.00,1.00,'#ef4444',1),
  ('ghost','Ghost','Silent Blade','rare',1.5,1.12,0.92,'#a855f7',2),
  ('valkyrie','Valkyrie','Cyber Ace','epic',3.0,1.06,1.05,'#22d3ee',3),
  ('sandstorm','Sandstorm','Iron Bulwark','legendary',5.0,0.90,1.35,'#f59e0b',4)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pvp_get_characters(_telegram_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pid uuid;
  _res jsonb;
BEGIN
  SELECT id INTO _pid FROM public.profiles WHERE telegram_id = _telegram_id;
  SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_order) INTO _res
  FROM (
    SELECT c.key, c.name, c.title, c.rarity, c.price_ton, c.speed_mod, c.hp_mod, c.color, c.sort_order,
           (c.price_ton = 0 OR o.id IS NOT NULL) AS owned,
           COALESCE(o.equipped, false) AS equipped
    FROM public.pvp_characters c
    LEFT JOIN public.pvp_character_owned o ON o.character_key = c.key AND o.profile_id = _pid
  ) t;
  RETURN COALESCE(_res, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.pvp_buy_character(_telegram_id bigint, _character_key text, _ton_paid numeric, _tx_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pid uuid;
  _price numeric;
BEGIN
  SELECT id INTO _pid FROM public.profiles WHERE telegram_id = _telegram_id;
  IF _pid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;
  SELECT price_ton INTO _price FROM public.pvp_characters WHERE key = _character_key;
  IF _price IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'character_not_found'); END IF;
  IF _ton_paid < _price THEN RETURN jsonb_build_object('success', false, 'error', 'insufficient_payment'); END IF;

  INSERT INTO public.pvp_character_owned (profile_id, character_key, ton_paid, tx_hash)
  VALUES (_pid, _character_key, _ton_paid, _tx_hash)
  ON CONFLICT (profile_id, character_key) DO NOTHING;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.pvp_equip_character(_telegram_id bigint, _character_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pid uuid;
  _price numeric;
BEGIN
  SELECT id INTO _pid FROM public.profiles WHERE telegram_id = _telegram_id;
  IF _pid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;
  SELECT price_ton INTO _price FROM public.pvp_characters WHERE key = _character_key;
  IF _price IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'character_not_found'); END IF;

  IF _price > 0 AND NOT EXISTS (
    SELECT 1 FROM public.pvp_character_owned WHERE profile_id = _pid AND character_key = _character_key
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_owned');
  END IF;

  UPDATE public.pvp_character_owned SET equipped = false WHERE profile_id = _pid;
  INSERT INTO public.pvp_character_owned (profile_id, character_key, equipped)
  VALUES (_pid, _character_key, true)
  ON CONFLICT (profile_id, character_key) DO UPDATE SET equipped = true;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.pvp_set_match_character(_telegram_id bigint, _match_id uuid, _character_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pid uuid;
BEGIN
  SELECT id INTO _pid FROM public.profiles WHERE telegram_id = _telegram_id;
  IF _pid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;
  UPDATE public.pvp_match_players SET character_key = _character_key
  WHERE match_id = _match_id AND profile_id = _pid;
  RETURN jsonb_build_object('success', true);
END;
$$;