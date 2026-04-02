# Brains Heist Writing System — Internal Ops Handoff

## 1) System overview
- **Student flow:** initial assessment → weekly targets + daily tasks → daily practice submissions → weekly/monthly review outputs.
- **Admin/teacher flow:** monitor cohort health (stalled/improving/monthly-ready), inspect calibration details, manage prompt bank quality/rotation, export reports, and leave internal review signals.
- **Guardrails:** pilot thresholds drive warnings for stalled learners, overused prompts, and low-improvement tags.

## 2) Student workflow (operational)
1. Run **initial writing assessment** for each student profile.
2. Confirm weekly targets and generated daily tasks appear in Writing Hub.
3. Capture daily practice submissions and check adaptation trend behavior.
4. Generate monthly report once enough attempt history exists.

## 3) Teacher/Admin workflow (operational)
1. Start in **Analytics Dashboard** for cohort-level risks and drill-down links.
2. Use **Monitoring View** filters for stalled/improving/weakness-focused triage.
3. Use **Calibration Review** when outputs look questionable or low-improvement tags persist.
4. Use **Prompt Bank Manager** for rotation hygiene and prompt quality flags.
5. Use **Export Center** for printable student/teacher/admin outputs.

## 4) Review status meanings
- **approved:** output is acceptable; no immediate intervention.
- **questionable:** output quality is uncertain; verify with calibration sampling.
- **needs calibration review:** likely model/system issue or policy mismatch; escalate for calibration follow-up.

## 5) Pilot-risk warning meanings
- **stalled:** repeated low progress or failure trend.
- **improving:** positive trajectory based on trend/adaptation.
- **monthly-ready:** enough attempt data to support monthly comparison.
- **overused prompt:** prompt usage above rollout threshold; rotate prompt set.
- **low-improvement tag:** repeated weakness persists despite targeting.

## 6) When to use calibration follow-up
Use calibration follow-up when:
- review status is `needs calibration review`, or
- the same weakness tag remains high after multiple cycles, or
- teacher judgement strongly disagrees with AI banding/priority outputs.

## 7) When to flag prompt quality issues
Flag prompt quality when prompts are:
- ambiguous, off-level, or mismatched to genre/grade expectations,
- repeatedly producing poor coverage despite otherwise strong students,
- overused in recent rotation windows.

## 8) Recommended pilot checklist (quick run)
1. Run seeded pilot data helper.
2. Run pilot verification checklist helper and confirm all core checks return.
3. Confirm analytics warnings + drill-down links are populated.
4. Confirm monitoring filters return expected slices.
5. Confirm prompt-bank overuse and quality flags are visible.
6. Confirm calibration follow-up flags appear on flagged students.
7. Confirm exports generate HTML + PDF-ready structures.

## 9) Common troubleshooting
- **No analytics/monitoring rows:** verify seed/demo data exists and filters are not overly strict.
- **No monthly-ready students:** increase attempt cadence or confirm monthly threshold assumptions.
- **Prompt-bank empty after filters:** clear/adjust filter query params (grade/genre/status/prompt_id).
- **Calibration page lacks context:** ensure student has attempts and assessment state persisted.
- **Warnings never clear:** rotate prompts, re-run targeted tasks, and review low-improvement tags in calibration.

---
Scope: internal operations only. No student-facing API behavior changed.
