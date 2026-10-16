# Allocated IELTS teacher: direct programme entry

Bible version: 1.4.0. Assessment/scoring impact: none. Published forms, student attempts, reviews and allocation history are unchanged.

## Problem and change

Jess was correctly allocated as Silk Road's programme lead, and the existing programme workspace authorized her school management tools. The teacher portal had no direct IELTS navigation or dashboard shortcut.

The teacher portal now includes IELTS Programme in its desktop navigation and mobile All tools menu, plus an Open IELTS Programme dashboard card. The entry goes directly to the allocated school's existing `/ielts/programme?school=…` workspace. Assignment setup keeps its existing discard confirmation before navigation.

Visibility comes from a new self-only, read-only allocation endpoint. It checks the existing canonical lead predicate: active lead, teacher role, active teacher membership, non-banned account and current school IELTS access. A class-review allocation alone does not activate the programme-lead shortcut. The workspace continues to authorize every subsequent operation. No school-admin, global admin or content-publication permission is added.

One lightweight request runs on teacher-portal mount, with rechecks on browser focus/visibility return and explicit retry after failure. Overlapping rechecks are suppressed; late replies from an old account are ignored. No polling, localStorage authorization cache, full student scans, work/recording downloads or AI calls are added to navigation discovery. The existing partial teacher/active-lead index supports the query. This does not establish 500-user capacity; the Bible's staged capacity gates remain required for capacity claims.

## Validation

- Full `npm run verify`: school-admin portal guard, question/taxonomy checks, typecheck, migration security guard, production build and tests passed.
- 1,829 unit tests passed; two existing environment-dependent skips.
- 12 DOM/integration checks passed, including five new entry checks: scope/link, allocation changes and failed-check retry, stale account response, student exclusion and portal desktop/mobile wiring.
- 34 database checks passed, including three new actual SQL/role checks using the canonical lead predicate: self-only allocation, student/anonymous denial, and ban/membership/role/revocation/module gates.
- Production read-only check under Jess's authenticated role returned Silk Road's entry and confirmed programme workspace access (`can_manage=true`, `can_allocate=false`, active Jess lead).
- Gulzada's standing pilot identity was revalidated as an active, eligible student; her authenticated entry response is empty. No student work was changed or reset.
- Production migration history generated version `20261008043154` for `ielts_teacher_programme_entry`; the committed filename matches it. The connected migration operation was used because the local Supabase CLI is unavailable. Security advisors retain the existing issue categories; the new endpoint intentionally joins the authenticated definer inventory. Anonymous execution remains revoked and search_path is fixed.

Authenticated Jess device/browser visual acceptance has not been performed by the agent. DOM tests and live authenticated-role database checks are separate evidence; they are not a claim of a signed-in phone/MacBook check or production load test.
