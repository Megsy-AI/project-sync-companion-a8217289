ALTER TABLE public.prize_broadcast_log
  ADD COLUMN IF NOT EXISTS delivered boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.next_prize_broadcast_targets(_limit integer)
RETURNS TABLE (id uuid, telegram_id bigint, first_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.telegram_id, p.first_name
  FROM public.profiles p
  LEFT JOIN public.prize_broadcast_log l ON l.profile_id = p.id
  WHERE l.profile_id IS NULL
    AND p.telegram_id IS NOT NULL
  LIMIT greatest(1, least(_limit, 2000));
$$;