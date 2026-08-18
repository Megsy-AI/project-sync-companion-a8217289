CREATE TABLE public.telegram_task_drafts (
  telegram_id BIGINT PRIMARY KEY,
  draft JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_task_drafts TO service_role;
ALTER TABLE public.telegram_task_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.telegram_task_drafts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_telegram_task_drafts_updated_at BEFORE UPDATE ON public.telegram_task_drafts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();