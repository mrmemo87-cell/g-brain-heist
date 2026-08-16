-- Close the actionable advisor findings around the live billing and named-seat
-- tables. SECURITY DEFINER billing RPCs remain intentionally callable only by
-- authenticated users and enforce School Head / platform administrator checks
-- internally before reading or mutating protected records.

alter function public.billing_subscriptions_updated_at() set search_path = '';

create index if not exists school_programme_seat_assignments_student_user_idx
  on public.school_programme_seat_assignments(student_user_id);

create index if not exists school_programme_seat_assignments_assigned_by_idx
  on public.school_programme_seat_assignments(assigned_by);

create index if not exists school_programme_seat_assignments_released_by_idx
  on public.school_programme_seat_assignments(released_by)
  where released_by is not null;
