-- Run in the intended Supabase project's SQL editor BEFORE enabling backend uploads.
-- Idempotent. Refuse incompatible existing buckets; do not alter other buckets.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'contestant-images' AND
    (public IS DISTINCT FROM true OR file_size_limit IS DISTINCT FROM 5000000 OR
     allowed_mime_types IS DISTINCT FROM ARRAY['image/webp']::text[])) THEN
    RAISE EXCEPTION 'Existing contestant-images settings require manual review';
  END IF;
END $$;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contestant-images', 'contestant-images', true, 5000000, ARRAY['image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Restrictive policies also block writes granted by pre-existing permissive policies.
-- The backend secret role bypasses RLS; browser clients never receive it.
DROP POLICY IF EXISTS contestant_images_deny_insert ON storage.objects;
CREATE POLICY contestant_images_deny_insert ON storage.objects AS RESTRICTIVE
FOR INSERT TO anon, authenticated WITH CHECK (bucket_id <> 'contestant-images');
DROP POLICY IF EXISTS contestant_images_deny_update ON storage.objects;
CREATE POLICY contestant_images_deny_update ON storage.objects AS RESTRICTIVE
FOR UPDATE TO anon, authenticated USING (bucket_id <> 'contestant-images') WITH CHECK (bucket_id <> 'contestant-images');
DROP POLICY IF EXISTS contestant_images_deny_delete ON storage.objects;
CREATE POLICY contestant_images_deny_delete ON storage.objects AS RESTRICTIVE
FOR DELETE TO anon, authenticated USING (bucket_id <> 'contestant-images');
