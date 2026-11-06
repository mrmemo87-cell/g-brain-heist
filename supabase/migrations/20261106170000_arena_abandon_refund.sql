-- Proving Grounds arena: quitting a match in its first minute returns the ticket.
-- A match that never got going (a black screen, a mis-tap, a lost connection) should not cost
-- a ticket. After 60 seconds the match counts as played and the ticket stays spent.

create or replace function public.rpc_arena_abandon_match(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); m public.arena_matches%rowtype; v_refund boolean := false; v_tickets integer;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext('arena'));
  select * into m from public.arena_matches where id = p_match_id and user_id = v_uid for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if m.finished_at is not null then
    return jsonb_build_object('refunded', false, 'repeated', true, 'tickets', private.arena_sync_tickets(v_uid));
  end if;
  update public.arena_matches set finished_at = now(), result = 'abandoned' where id = p_match_id;
  if extract(epoch from (now() - m.started_at)) < 60 then
    v_refund := private.arena_grant_tickets(v_uid, 1, 'refund:' || p_match_id::text) > 0;
  end if;
  v_tickets := private.arena_sync_tickets(v_uid);
  return jsonb_build_object('refunded', v_refund, 'tickets', v_tickets);
end $$;
revoke all on function public.rpc_arena_abandon_match(uuid) from public, anon;
grant execute on function public.rpc_arena_abandon_match(uuid) to authenticated;
