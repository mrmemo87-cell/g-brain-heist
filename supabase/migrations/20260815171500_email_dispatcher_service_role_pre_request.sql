-- Allow trusted service-role API requests to pass the configured PostgREST
-- pre-request entitlement hook. The hook remains inaccessible to PUBLIC and
-- the private schema is still excluded from exposed API schemas.

grant usage on schema private to service_role;
grant execute on function private.enforce_request_entitlement() to service_role;

notify pgrst, 'reload config';
