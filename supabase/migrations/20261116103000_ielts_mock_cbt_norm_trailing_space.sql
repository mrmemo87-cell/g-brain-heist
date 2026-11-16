-- Text answers: ignore a final full stop (or similar) even when spaces follow it, e.g. "22. " matches "22".
create or replace function private.ielts_mock_cbt_norm(p text) returns text
language sql immutable set search_path to '' as $$
  select nullif(regexp_replace(btrim(regexp_replace(lower(translate(coalesce(p, ''), '’‘“”£$€', '''''""')),
    '[[:space:]]+', ' ', 'g')), '[.,;:!?[:space:]]+$', ''), '');
$$;
revoke all on function private.ielts_mock_cbt_norm(text) from public, anon, authenticated;
