-- Image metadata table for delta sync between IndexedDB and Supabase Storage
CREATE TABLE IF NOT EXISTS user_images (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: users can only access their own images
ALTER TABLE user_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own images"
  ON user_images FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_user_images_user_id ON user_images(user_id);

-- Storage bucket for equipment and profile images (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'equipment-images',
  'equipment-images',
  false,
  5242880,  -- 5MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users manage their own folder ({uid}/*)
CREATE POLICY "Users upload own images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'equipment-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users read own images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'equipment-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update own images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'equipment-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'equipment-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
