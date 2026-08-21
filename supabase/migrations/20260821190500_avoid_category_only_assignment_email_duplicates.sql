-- Category changes are metadata-only and must not create a second assignment email.
-- All assignment emails that are already sent by the established workflow still
-- receive assignment_category through trg_email_enrich_assignment_payload.

drop trigger if exists professional_email_assignment_category_changed on public.assignments;
drop function if exists private.trg_email_assignment_category_changed();
