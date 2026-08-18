DELETE FROM public.user_tasks;
DELETE FROM public.tasks;
INSERT INTO public.tasks (title, link, reward_amount, reward_type, task_type, verification_type, is_active)
VALUES ('Join our Community', 'https://t.me/noveall', 0.05, 'ton', 'link', 'auto', true);