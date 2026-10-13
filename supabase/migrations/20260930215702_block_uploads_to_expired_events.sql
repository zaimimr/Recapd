alter policy "Participants can upload event photos" on storage.objects
with check (
	(bucket_id = 'event-photos'::text)
	and ((storage.foldername(name))[2] = (public.current_user_profile_id())::text)
	and (exists (
		select 1
		from public.event_participants ep
		where (((ep.event_id)::text = (storage.foldername(objects.name))[1]) and (ep.user_id = public.current_user_profile_id()))
	))
	and (exists (
		select 1
		from public.events e
		where (((e.id)::text = (storage.foldername(objects.name))[1]) and (e.expires_at > now()))
	))
);

alter policy "Participants can upload thumbnails" on storage.objects
with check (
	(bucket_id = 'thumbnails'::text)
	and ((storage.foldername(name))[2] = (public.current_user_profile_id())::text)
	and (exists (
		select 1
		from public.event_participants ep
		where (((ep.event_id)::text = (storage.foldername(objects.name))[1]) and (ep.user_id = public.current_user_profile_id()))
	))
	and (exists (
		select 1
		from public.events e
		where (((e.id)::text = (storage.foldername(objects.name))[1]) and (e.expires_at > now()))
	))
);
