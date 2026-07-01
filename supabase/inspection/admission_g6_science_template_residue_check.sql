-- Staging verification for Grade 6 Science admission-bank template residue.
-- Expected result after re-importing supabase/seed/admission-official-bank: 0 rows.
select
  external_id,
  left(stem, 180) as stem_preview
from public.adm_questions
where content_version = 'adm-bank-v1-g6-science'
  and (
    stem ilike '%In investigation %'
    or stem ilike '%Grade 6 science question%'
    or stem ilike '%question on%'
  )
order by external_id;
