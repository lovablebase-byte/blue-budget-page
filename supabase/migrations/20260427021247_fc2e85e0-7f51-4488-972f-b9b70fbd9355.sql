ALTER TABLE public.instances REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instances;