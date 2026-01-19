-- Storage Buckets Setup
-- Run this in Supabase SQL Editor after creating the schema

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('event-photos', 'event-photos', true),
  ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for event-photos bucket
CREATE POLICY "Anyone can view event photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-photos');

CREATE POLICY "Authenticated users can upload event photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'event-photos');

CREATE POLICY "Users can delete their own photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'event-photos');

-- Storage policies for thumbnails bucket
CREATE POLICY "Anyone can view thumbnails"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails');

CREATE POLICY "Authenticated users can upload thumbnails"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'thumbnails');
