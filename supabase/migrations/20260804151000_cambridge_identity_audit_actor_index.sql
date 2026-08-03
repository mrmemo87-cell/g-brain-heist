-- Cover the actor foreign key used for administrator audit lookups and user
-- lifecycle checks. The partial predicate keeps the index compact after an
-- actor account is removed and the immutable audit row is retained.
create index if not exists cambridge_quiz_identity_audit_actor_created_idx
  on public.cambridge_quiz_identity_audit (actor_user_id, created_at desc)
  where actor_user_id is not null;
