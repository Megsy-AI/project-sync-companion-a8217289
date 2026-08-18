
-- Create auto_activate_next_character function
CREATE OR REPLACE FUNCTION public.auto_activate_next_character()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _next_id UUID;
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false AND NEW.current_hp <= 0 THEN
    SELECT id INTO _next_id
    FROM public.characters
    WHERE id != NEW.id AND is_active = false
    ORDER BY random()
    LIMIT 1;

    IF _next_id IS NOT NULL THEN
      UPDATE public.characters
      SET is_active = true,
          current_hp = max_hp,
          defeated_by = NULL,
          ton_pool = 0,
          updated_at = now()
      WHERE id = _next_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_activate_next_character ON public.characters;
CREATE TRIGGER trg_auto_activate_next_character
  AFTER UPDATE ON public.characters
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_activate_next_character();

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified';
