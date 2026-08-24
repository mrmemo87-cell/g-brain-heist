-- Cover the assessment-item foreign key used by review joins and parent-row
-- integrity checks. This also keeps deletes or retirements on governed
-- assessment items from scanning the full moderation queue.

create index if not exists question_taxonomy_review_queue_assessment_item_idx
  on public.question_taxonomy_review_queue (assessment_item_id);
