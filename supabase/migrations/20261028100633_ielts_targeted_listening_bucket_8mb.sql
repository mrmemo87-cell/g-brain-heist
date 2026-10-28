-- Targeted Listening 06: the owner approved (2026-10-28 16:06 Asia/Bishkek) two whole-talk recordings of 6.7 MB and 6.0 MB
-- (BH-TL06-L10F_v1.mp3, BH-TL06-L14F_v1.mp3). Raise the private bucket's per-file limit from 5 MB to 8 MB so the exact
-- approved files are stored unchanged rather than re-encoded. The bucket stays private and audio/mpeg only.
update storage.buckets set file_size_limit = 8000000 where id = 'ielts-targeted-listening' and file_size_limit = 5000000;
