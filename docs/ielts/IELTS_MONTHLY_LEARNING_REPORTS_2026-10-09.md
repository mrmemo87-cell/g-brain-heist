# IELTS learning plans and monthly reports

Contract: Bible **1.7.0**, particularly 8A, 13, 15B and new 15C. Owner requested the learning-plan/report foundation and Bible governance. No official IELTS format, score, rating criterion, content release or calibration changes.

## Where it lives

Teacher/school IELTS Programme → Student progress → Learning plan & monthly reports. Students open confirmed plans and shared student-audience reports in My IELTS Journey. No report/evidence request on the student panel until opened. The teacher loads only the selected student's bounded evidence. Existing school administration shell is unchanged.

The IELTS module uses the existing `academic_report_snapshots`, `academic_report_source_snapshots`, `academic_report_events` and correction tables, including existing append-only/immutable triggers, hashes, report versions and supersession. It has an IELTS-specific payload/renderer and authorisation RPCs. It does not feed general academic percentages or legacy focus states into IELTS claims. Existing academic report retrieval/finalisation APIs reject IELTS payloads so they cannot bypass module gates.

## Current release capabilities

- Append-only, optimistic/idempotent teacher plans: study goal, four skill-specific preparation pathways and reasons, exact source references, one to three actionable goals with success/check criteria, next action and review date.
- Pathways are teacher preparation decisions, not validated language classifications. Insufficient evidence can explicitly remain “More evidence needed”.
- One AI button drafts all plan fields using saved source observations, strict shape/reference validation, durable claim/provenance, bounded admission (eight active claims, six new drafts per reviewer/hour), cached exact sources and 45-second provider deadline. Teachers edit and explicitly confirm/share. Existing fields survive provider failure. No AI on dashboard navigation or report export.
- Server-verified objective runs, safe item observations and frozen versions; original Writing submission and exact response-matched review; submitted Speaking and confirmed review; targeted and school practice participation. No keys, full essays, audio URLs or private AI drafts in reports/provider context.
- One latest trusted run/review per source instance as known at the cutoff. Rescoring does not inflate source count. Known reused objective versions retain practice exposure; outside exposure remains unconfirmed.
- Monthly/course period up to 35 days within the selected academic year, in Asia/Bishkek dates. Work is bounded by the period end; evidence/reviews/plans are captured by an explicit cutoff. Current reports use the current cutoff so after-month reviews can be dated honestly. Future-ended periods are explicitly interim. Earlier work is a separate starting reference, not in-period participation.
- Snapshot generation remains Draft; explicit teacher confirmation makes Final and visible to the student. Draft finalisation checks supersession, plan changes and source changes. Unsupported or changed plan references require teacher review.
- Final versions remain exact historical snapshots. Corrections request governed review; teacher updates a plan and generates a linked report replacement. Neither step edits the original assessment or report.
- Shared reports support branded PDF/print, visible limitations, teacher attribution, source navigation, focus/keyboard dialog controls and expanded evidence in printing.

## Limits intentionally retained

This is an evidence/teacher-planning/report module, not a finished longitudinal inference engine. Advanced strengths, persistence, sustained improvement and resolution remain unavailable until approved versioned construct policies, reviewed crosswalks, comparable independent reassessment and validation pass Bible 8A. No policy thresholds were invented. Reports state “Improvement not yet established”; no band is generated.

Legacy school practice has no guaranteed frozen material version or shared-feedback projection; this is disclosed. When mutable work changed after a historical cutoff, the earlier work state is unavailable rather than reconstructed from its present status. Guided practice cannot qualify as independent improvement. Known delivery flags remain review observations, not automatic inability/exclusion.

Evidence capture currently caps at **200 retained records per student**, failing before a truncated report can be shared. Large histories require a subsequent paginated/windowed projection; no historical data is deleted. Report lists return the latest 20 versions. Private ledger sources and plan versions remain retained. AI eligibility/rate checks and synchronous API deadline are bounded, but sustained multi-school AI workload still needs operational measurement.

## Verification and release record

Local typecheck, build, portal/security guards; focused rendered teacher/student/AI failure/share/print checks; PostgreSQL integration checks for cutoff, deduplication, references, append-only plans, immutable snapshots, draft/final student access, bans and cross-school denial. Wider existing IELTS DOM/SQL regressions are also run. CI and live deployment details are recorded in the PR.

No fictitious plan/review has been created for Gulzada. Live role checks use rollback-only operations and existing saved work. Provider-generation and phone/laptop visual acceptance remain for the authorised teacher/student pilot. No 500-user claim: affected reporting/AI scenarios need Bible 13 staged capacity measurements before such a claim.

Rollback: revert UI entry wiring/Edge function availability to hide new generation while preserving private plan and report history. Do not drop shared reporting tables or erase evidence. Existing assessment and practice paths remain intact.
