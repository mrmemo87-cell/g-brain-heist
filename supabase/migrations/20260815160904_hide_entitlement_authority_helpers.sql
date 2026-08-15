-- Keep the PostgREST hook and its privileged implementation outside the
-- exposed API schema. The public policy predicate is an invoker-only wrapper.

alter function public.enforce_request_entitlement() set schema private;
alter function public.can_use_feature(text, boolean) security invoker;

grant usage on schema private to anon, authenticated;
grant execute on function private.enforce_request_entitlement() to anon, authenticated;
grant execute on function private.actor_has_feature_entitlement(text, boolean) to authenticated;

alter role authenticator set pgrst.db_pre_request = 'private.enforce_request_entitlement';
notify pgrst, 'reload config';
