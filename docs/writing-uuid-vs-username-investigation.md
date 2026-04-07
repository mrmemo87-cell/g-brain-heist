# Investigation: Why Teacher Portal Writing sections show UUIDs instead of usernames

## Scope investigated
- Writing Hub (`WritingHub.tsx`) input path for initial writing submissions.
- Writing integration service (`writingIntegrationService.ts`) data model and monitor/analytics aggregation.
- Teacher-facing writing screens (`WritingMonitoringView.tsx`, `WritingAnalyticsDashboard.tsx`).
- Writing persistence schema (`20260401120000_bh_writing_persistence.sql`) and repository behavior (`writingRepository.ts`).

## Findings

### 1) The writing domain is keyed by `student_id` (UUID) at every storage and aggregation boundary
- The persistence schema defines `student_id uuid` as the primary key / reference for writing profile and state tables.
- Event-like tables rely on `payload->>'student_id'` for row-level access and filtering.

**Effect:** UUID is the canonical identity in writing data, while username is not a first-class relational column in these tables.

### 2) `student_name` is optional in the write path and is not populated by Writing Hub
- `submitInitialWritingAssessment` accepts `student_name?: string`.
- The actual Writing Hub submission calls provide `student_id`, grade, genre, prompt, response — but **do not pass `student_name`**.
- The profile assignment stores `student_name` as `input.student_name?.trim() || existingProfileName`, so when no name is supplied and there is no prior name, it stays undefined.

**Effect:** No friendly display name is written for many students, leaving only UUID-backed identity in data.

### 3) Monitor/analytics fallback strings explicitly include `studentId` when name is missing
- In monitoring aggregation, row labels are built as:
  - `profile?.student_name || \`Student ${studentId} (${laneGenre})\``
- Other outputs also fallback to `Student ${studentId}` patterns.

**Effect:** Once `student_name` is missing, the generated label itself embeds UUID.

### 4) Teacher UI intentionally suppresses UUID-looking labels, but can still degrade to generic labels
- `WritingMonitoringView` / `WritingAnalyticsDashboard` use `toDisplayLabel(...)` with UUID regex checks.
- If both `student_name` and `student_id` look like internal UUIDs, the UI returns `'Student'`.

**Effect:** Depending on where label is rendered, teachers either see raw UUID-based labels (from generated strings) or anonymized generic `Student` entries, not real usernames.

### 5) No enrichment join to `users.username` exists in writing monitor/analytics pipeline
- `loadWritingStoreSnapshot()` reads only writing tables; it does not join or map to `users` for username/full name.
- `getWritingMonitoringOverview()` and `getWritingAnalyticsDashboard()` only consume in-memory writing profiles/states/attempts.

**Effect:** There is no server-side or client-side normalization step to replace UUID IDs with current usernames in teacher views.

## Root cause summary
This is a **data-model + ingestion gap**, not just a rendering bug:
1. Writing system uses `student_id` UUID as canonical identity.
2. Writing Hub does not persist `student_name` during initial submission.
3. Monitoring/analytics rely on writing profile name (often missing) and fallback to UUID-derived labels.
4. Teacher screens do not enrich identities from `users.username` before rendering.

