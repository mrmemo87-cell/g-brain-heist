-- Pilot finding 2026-10-19: public.rpc_ielts_check_practice_access exists as (text, integer) and (text, text).
-- The Data API resolves functions by argument names, so every client call failed with PGRST203 and every practice
-- route (assigned or extra practice, all four skills) showed "This IELTS task is not available". This adds one
-- unambiguous entry point with the same result and authority (it delegates to the text version, unchanged).
-- The ambiguous pair is left in place for a separately approved cleanup.

create or replace function public.rpc_ielts_practice_access(p_skill text, p_task_id text)
returns table(allowed boolean, reason text, required_tier text)
language sql stable security invoker set search_path to '' as $$
  select * from public.rpc_ielts_check_practice_access(p_skill, p_task_id::text);
$$;

revoke all on function public.rpc_ielts_practice_access(text, text) from public, anon;
grant execute on function public.rpc_ielts_practice_access(text, text) to authenticated;
