-- Complete the secure-by-default template for future public-schema objects.
-- This changes default privileges only; no existing table, function, sequence,
-- or current application permission is modified.

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all privileges on functions from public, anon, authenticated, service_role;
