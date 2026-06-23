-- Profile bootstrap / join-school conflict inspection helpers.
-- Edit the values in this params CTE, then run the individual query you need.
WITH params AS (
  SELECT
    NULL::uuid AS user_id,        -- e.g. '00000000-0000-0000-0000-000000000000'::uuid
    NULL::text AS email           -- e.g. 'student@example.com'::text
)
SELECT 'Set params.user_id and/or params.email, then run one of the queries below.' AS instructions;

-- 1) public.users rows whose id no longer exists in auth.users.
SELECT u.id, u.email, u.username, u.school_id, u.role, u.created_at, u.updated_at
FROM public.users u
LEFT JOIN auth.users au ON au.id = u.id
WHERE au.id IS NULL
ORDER BY u.updated_at DESC NULLS LAST;

-- 2) FK dependency count SQL for a specific public.users.id.
-- Set params.user_id above, then run this query. It emits one count query per FK
-- referencing public.users(id), so support can copy/run the generated rows or
-- inspect which tables can block an unsafe public.users.id rewrite.
WITH params AS (
  SELECT NULL::uuid AS user_id -- e.g. '00000000-0000-0000-0000-000000000000'::uuid
), user_fk AS (
  SELECT
    c.conname,
    c.conrelid::regclass AS child_table,
    (SELECT string_agg(format('%I', a.attname), ', ' ORDER BY ord.n)
     FROM unnest(c.conkey) WITH ORDINALITY AS ord(attnum, n)
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ord.attnum) AS child_columns
  FROM pg_constraint c
  WHERE c.contype = 'f'
    AND c.confrelid = 'public.users'::regclass
    AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.users'::regclass AND attname = 'id')]
)
SELECT format(
  'SELECT %L AS constraint_name, %L AS child_table, %L AS child_columns, count(*) AS row_count FROM %s WHERE (%s) = %L::uuid;',
  conname,
  child_table::text,
  child_columns,
  child_table,
  child_columns,
  params.user_id::text
) AS dependency_count_sql
FROM user_fk
CROSS JOIN params
WHERE params.user_id IS NOT NULL
ORDER BY child_table::text, conname;

-- 3) Same-email profile conflicts for a supplied email.
-- Set params.email above, then run this query.
WITH params AS (
  SELECT NULL::text AS email -- e.g. 'student@example.com'::text
)
SELECT
  lower(u.email) AS normalized_email,
  u.id AS public_user_id,
  au.id IS NOT NULL AS has_matching_auth_user,
  u.username,
  u.school_id,
  u.role,
  u.created_at,
  u.updated_at
FROM public.users u
CROSS JOIN params
LEFT JOIN auth.users au ON au.id = u.id
WHERE params.email IS NOT NULL
  AND lower(u.email) = lower(params.email)
ORDER BY u.updated_at DESC NULLS LAST;
