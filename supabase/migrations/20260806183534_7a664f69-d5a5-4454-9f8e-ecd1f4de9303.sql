INSERT INTO public.telegram_admins (telegram_id, label)
VALUES (6657246146, 'Owner'), (5016893238, 'Owner')
ON CONFLICT (telegram_id) DO NOTHING;