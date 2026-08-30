-- =============================================================================
-- Public storage bucket for optional hi-res globe textures.
--
-- Hosts the NASA Blue Marble Next Generation monthly world images at full
-- 5400x2700 resolution (~2.5 MB each, public domain). The app's bundled
-- textures stay web-size (2048x1024 in public/textures/months/); users who
-- opt in via Settings → Appearance fetch the current month's hi-res file
-- from this bucket on demand. Public bucket: objects are served via
-- /storage/v1/object/public/textures/... with permissive CORS, no policy
-- rows needed for reads; writes go through service_role only.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'textures',
  'textures',
  true,
  10485760,  -- 10MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
