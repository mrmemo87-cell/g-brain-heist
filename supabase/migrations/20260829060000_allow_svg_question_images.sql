-- Geometry Builder question assets are exported SVG-first with a PNG fallback.
-- The existing question-images bucket is already public and scoped by existing
-- storage policies; extend only its MIME allow-list so generated SVG assets can
-- be stored alongside the existing raster image formats.
update storage.buckets
set allowed_mime_types = case
  when allowed_mime_types is null then array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ]::text[]
  when not ('image/svg+xml' = any(allowed_mime_types)) then array_append(allowed_mime_types, 'image/svg+xml')
  else allowed_mime_types
end
where id = 'question-images';
