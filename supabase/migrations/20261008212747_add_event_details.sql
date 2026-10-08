ALTER TABLE public.events
	ADD COLUMN IF NOT EXISTS location text,
	ADD COLUMN IF NOT EXISTS dress_code text,
	ADD COLUMN IF NOT EXISTS details text,
	ADD COLUMN IF NOT EXISTS schedule jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.events
	ADD CONSTRAINT events_location_length CHECK (location IS NULL OR char_length(location) <= 200),
	ADD CONSTRAINT events_dress_code_length CHECK (dress_code IS NULL OR char_length(dress_code) <= 120),
	ADD CONSTRAINT events_details_length CHECK (details IS NULL OR char_length(details) <= 1000),
	ADD CONSTRAINT events_schedule_shape CHECK (jsonb_typeof(schedule) = 'array' AND jsonb_array_length(schedule) <= 20);
