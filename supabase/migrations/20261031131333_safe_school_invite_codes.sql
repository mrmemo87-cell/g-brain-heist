-- School invite codes were built as upper(substring(base64(8 random bytes) minus '+' and '/', 1..10)).
-- base64 of 8 bytes ends in '=', so when two or more '+'/'/' are removed the 10-character
-- code includes '='. join_school_by_code normalises input to [A-Z0-9] before matching, so
-- such a code can never be used to join (about 1 in 20 generated codes).
-- Generate codes from an unambiguous A-Z/2-9 alphabet instead, in all three generators.

create or replace function private.new_school_invite_code()
returns text
language plpgsql
volatile
set search_path to ''
as $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_code text := '';
  i integer;
begin
  for i in 0..9 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$function$;

revoke all on function private.new_school_invite_code() from public, anon, authenticated;

do $$
declare
  v_fn text;
  v_def text;
  v_new text;
begin
  foreach v_fn in array array[
    'public.generate_school_invite_code(uuid)',
    'public.rotate_school_invite_code(uuid)',
    'public.admin_review_school_request(uuid,text,text,uuid)'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    v_new := regexp_replace(
      v_def,
      'upper\(\s*substring\(\s*replace\(\s*replace\(\s*encode\(\s*(extensions\.)?gen_random_bytes\(\s*8\s*\)\s*,\s*''base64''\s*\)\s*,\s*''\+''\s*,\s*''''\s*\)\s*,\s*''/''\s*,\s*''''\s*\)\s*from\s+1\s+for\s+10\s*\)\s*\)',
      'private.new_school_invite_code()',
      'gi'
    );
    if v_new = v_def then
      raise exception 'invite code expression not found in %; function unchanged', v_fn;
    end if;
    execute v_new;
  end loop;
end $$;
