# Legacy IELTS material cleanup — 15 October 2026

Implementation contract: Diagnostic Bible **1.10.0**, especially §§4, 5–7, 15D–15F; Visual & UX Bible **1.1.0** and Themely Evidence Blue. Existing release requirements apply unchanged; no Bible amendment is needed.

This inventory contains 25 **legacy** sources, separate from the 10 already released targeted-practice tasks. `originals.json` preserves the exact retrieved source records (excluding author IDs). `revisions.json` provides complete corrected candidates, private answer keys/evidence, model responses, chart data, normalized metadata, remaining blockers and seven explicit retirement decisions. These files are content-admin authoring sources, never student bundle imports or public assets.

**Review references, not reassigned material codes:** R-003 etc. identify the legacy source being remediated. A substantially rewritten candidate must receive a new material identity and new stable code when eventually installed through the existing governed material system. Preserve the old code, mark exposure/variant relationships accurately and complete the originality inventory comparison. Do not pretend the rewritten library passage is a correction to an already submitted AI passage. The revision identifier and SHA bind this private review candidate; neither is a publication approval.

## Exact disposition matrix

| Source | Decision | Corrected candidate / reason |
| --- | --- | --- |
| R-003 | Revise | Fictional café trial; 6 evidence-bound questions, varied MCQ keys. Removes uncertain coffee-history/production claims. |
| R-004 | Revise | Re-authored coral stress/recovery passage; 6 supported questions. Removes the unqualified 2050 projection. NOAA factual source links retained. |
| R-005 | Revise | Fictional hybrid-work trial; 6 questions with limited generalisation and explicit NG logic. |
| R-006 | Revise | Full reconstruction as a fictional reserve case study; 8 questions, labelled A–E, no invented animals/statistics; Q4 NG. |
| R-007 | Revise | Full reconstruction as a fictional library automation trial; 6 contiguous questions, Q3 NG, no unsupported rankings/47% statistic or stale forecasts. |
| L-005 | Revise | Original workshop script, 6 question/key/evidence pairs. Replacement recording required. |
| L-006 | Revise | Original museum script, 6 question/key/evidence pairs. Old Eurostar recording is not reused or approved. |
| L-007 | Retire | Placeholder; malformed recording reference; no questions. |
| L-008 | Retire | Placeholder; malformed recording reference; no questions. |
| L-009 | Retire | Placeholder title, question and recording reference. |
| L-010 | Revise | Original cycling-trip script, 6 question/key/evidence pairs. Unverified original recording is not reused or approved. |
| W-003 | Consolidate/retire | Retain fuller W-009 as the population-data review candidate. |
| W-004 | Revise | Complete original example response, 288 words by the recorded method. |
| W-005 | Revise | Complete original example response, 295 words by the recorded method. |
| W-006 | Revise | Actual grouped chart, exact table, fictional-data label and complete example response. |
| W-007 | Revise | Preserve complete response for review; normalize Academic Task 2 metadata and model scope. |
| W-008 | Revise | Explicit General Training letter classification; preserve complete response for review. |
| W-009 | Revise | Actual grouped chart, exact table, fictional-data label and complete example response. |
| S-003 | Consolidate/retire | Overlapping hometown questions → S-006 candidate. |
| S-004 | Consolidate/retire | Overlapping journey cue card → S-007 candidate. |
| S-005 | Consolidate/retire | Overlapping tourism questions → S-008 candidate. |
| S-006 | Revise | Hometown practice; explicit seconds, task limits, criteria and audio-based review. |
| S-007 | Revise | Journey practice; explicit seconds, task limits, criteria and audio-based review. |
| S-008 | Revise | Tourism discussion; explicit seconds, task limits, criteria and audio-based review. |
| S-009 | Revise | Technology long turn; explicit seconds, task limits, criteria and audio-based review. |

## Implementation and review

Open **Content administration → Review corrected materials & retirements**. Metadata loads first; select a source to read the corrected candidate, key/evidence, chart/table, model and blockers. The copyable JSON includes the untouched original snapshot. Access is limited to existing content-admin roles, with banned/temporarily banned actors denied. Ordinary teachers/students cannot use these RPCs or read the table directly. No approve/publish action is manufactured by this read-only panel.

The migration records immutable review revisions and updates hold reasons only. All 25 sources remain unavailable for new allocation. Retired sources retain history, including existing access; no public source is deactivated, deleted, rewritten or rescored. Frozen-source triggers reject subsequent edits/deletions and question movement into/out of these preserved sources. Content administration disables editing/publication review for frozen sources and shows the hold reason. The author inventory no longer labels held records ready to assign merely because `is_active` is true.

## Remaining release work

All revised candidates require human editorial/answer-key, source/rights, originality/exposure and delivery review. Three Listening candidates now have complete scripts/questions/keys but **no produced replacement recordings**: production must use the existing IELTS audio policy, measured pauses, separate instruction/dialogue voices, exact script/audio hashes and real audio/device/resume checks. Do not reuse a legacy file simply because its topic is similar. No regenerated audio or live attempt is claimed by this cleanup.

The review is deliberately modest about difficulty: foundation/extended exercises are not full IELTS papers, calibrated alternate forms or evidence of a band. General Training letter practice stays visibly distinct. Model responses are examples, not band guarantees. Word counts use word tokens with internal apostrophes/hyphens; these are editorial counts, not a new scoring policy.

## Factual and format references checked 15 October 2026

- NOAA coral bleaching: https://oceanservice.noaa.gov/facts/coral_bleach.html
- NOAA coral stress/recovery diagram: https://coralreef.noaa.gov/digital-corals/visual-media/infographics/water-temp-coral-bleaching-diagram
- IELTS Academic Writing format: https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing
- IELTS Academic Speaking format: https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking

Sources inform factual/format checks only. They do not approve these drafts, rights or calibration. All fictional cases/data are explicitly labelled, and the revision text is AI-assisted original authoring rather than copied source prose.

## Verification

`tests/ieltsLegacyCleanup.test.mjs` checks all dispositions, complete models/word counts, normalized timings, numeric chart data, contiguous questions and response structures, specified NG repairs, script/evidence alignment, actual migration execution, role/ban/direct-table denial, immutable revisions, source preservation and held author-list readiness. These are mechanical checks, not a substitute for human judgments about ambiguity or distractor quality.

`tests/ieltsLegacyCleanupDom.test.mjs` checks metadata-first fetches, protected detail loading, stale response suppression, keys/chart/table rendering and unauthorized failure states. Actual browser checks cover 320/375/768/1440px and retained screeners/batch regression tests run separately. Functional checks establish neither physical-device audio acceptance nor 500-user capacity. Results are recorded in the PR.
