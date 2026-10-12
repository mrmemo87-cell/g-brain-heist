# Print & Scan: classroom contract

## Delivered first version

Inside the paper workspace, Print & Scan provides personalised A4 sheets, camera/photo selection, on-device QR decoding and mark recognition, cropped-row visual review, and governed result confirmation. Supports registered assignment students and 2–4 text choices (multiple choice/true-false), up to 200 questions: 40 rows per sheet and numbered additional pages.

School name, student name, BH assignment code, frozen form identity, assessment date and page number are printed. QR codes carry only an opaque sheet UUID with a format prefix. They identify records; they never authorize access or encode answer keys. Question papers and answer sheets must be used together with their matching form and option order.

The A4 SVG has fixed physical dimensions and four square markers. Print on A4 at 100%/Actual size with browser headers/footers disabled. The scanner finds markers and normalizes the photo; missing markers and unreadable QR codes fail closed. All sheet layout changes need a new version and scanner support. Do not change bubble positions in CSS.

## Identity and option order

An authenticated, entitled, active assignment-owning teacher issues a session with an assessment timestamp and selected roster. The server validates every supplied displayed-option sequence as an exact permutation of the frozen snapshot's distinct values. It stores that sequence with each sheet, avoiding letter-to-answer mismatches when historic display balancing applies. Scanning resolves the exact issued page. Frozen snapshots changed after issue invalidate the sheet.

Printing retries reuse a client session UUID and return the same sheet tokens for identical payloads. Different assessment times, rosters or sequences cannot overwrite an existing session. The printed date describes assessment, while issuing, scanning, reviewing and confirmation timestamps remain separate.

## Recognition and review

QR decoding and page estimation run in a lazily loaded Web Worker. QR decoding retries the original photo, a reduced-resolution copy and contrast normalization, including inverted QR codes. Projective and affine QR estimates locate corner squares directly in the original photograph. A single final warp avoids clipping the coarse page or resampling it twice. Corner detection uses local contrast and scale-aware shape checks for grey, rotated or perspective-distorted squares. It rejects hollow text/round bubbles, requires a convex four-corner page, cross-checks the decoded QR location, and verifies the final corner positions. Before interior measurement, each row is registered to the printed circle grid within an eight-pixel local offset. At least two circle outlines must support the common offset, so registration cannot chase an isolated pencil mark or reorder choices. The same offset is used for cropped review previews. Bubble interiors are measured against surrounding paper brightness, excluding printed outlines. The thresholds are conservative engineering heuristics, not calibrated probabilities or an accuracy guarantee.

One substantial isolated mark suggests an answer, including uneven shading and medium-grey pencil. Local paper brightness uses a percentile so stray graphite outside a bubble does not darken the reference. A clear suggestion requires at least 40% interior coverage, no more than 12% in any competing bubble and a lead of at least 30 percentage points. A second mark covering 22% or more always requires review. Faint, competing and multiple marks require an explicit answer or Blank choice. No-mark rows are prefilled as Blank and counted in the page summary. The default list shows only uncertain/multiple marks; Show all answers exposes every row for inspection and correction. The final page review checkbox remains mandatory. Every page needs the teacher's review checkbox and Save reviewed page action. No mark recognition consults the correct answer. Server scoring happens only after Confirm student result, through the existing snapshot-based paper confirmation function.

## Persistence and authorization

`assignment_scan_sessions`, `assignment_scan_sheets`, and `assignment_scan_attempts` have RLS enabled and no direct client grants. Teacher-authorized RPCs enforce school membership, entitlement, assignment ownership, roster, frozen version and payload validity. Sheet tokens grant no public access.

Scan attempts store the image SHA-256, scanner version and detections; review stores the actual option values, actor and time. A reviewed page is immutable: rescan to correct it before completion. New scans invalidate older page reviews; replaying an old save cannot select it over the latest scan. Student-assignment locking precedes sheet/attempt locking consistently. Confirmation requires all pages, accepts identical retries, and preserves existing partial-answer replacement and completed-result protections.

Photos and row crops remain in browser memory and are not uploaded or retained by Brains Heist. The original photo must be reselected to resume an unfinished visual review; its matching digest restores locally saved corrections. Corrections are account/scan scoped. If local storage fails, leaving is blocked until the reviewed page is saved. Reviewed pages can be resumed from the latest print session without a photo. Original photographs remain the teacher's responsibility in this version; cloud image retention is not implemented.

Paper marks remain paper-source evidence with unavailable timing, through the established assignment reporting and governed registry pipeline. No historical results or verified-item eligibility are changed by adding scanning.

## Rollout

Apply the paper workflow migration first, then `20261011055654_classroom_print_scan.sql`, then deploy the frontend. No production migration or deployment is implicit in a PR. Test authorization and normal online completion in staging before deploying. The first pilot should compare every machine suggestion against manual reading on physical printed sheets.

## Acceptance and limitations

Database tests cover issuance replay, frozen option permutations, missing pages, mandatory review, deterministic grading, confirmation replay, stale scans, role denial and snapshot changes. Raster tests cover homography, both answer columns, clear/blank/faint/double marks, marker detection and invalid QR contents. Browser acceptance uses real QR generation, SVG rasterization, the real worker and mark reader with mocked RPC transport, including cropped-page rejection, review, partial online replacement and desktop/tablet/phone layouts. It does not certify physical print/phone recognition accuracy.

Next acceptance gate: printed/photocopied sheets, pencil/pen, erasures, glare, shadows, rotated/tilted images, older phones, slow connections and interruptions. Record false-ready rate, actual recognition errors, retake rate and teacher review time. Do not claim calibrated accuracy or broad classroom readiness before this pilot.

Live video capture/auto-shutter, batch upload, handwriting recognition, cloud photo retention and corrections after completion remain outside this version. Mobile Take photo uses the browser file capture hint; camera/gallery behavior depends on the device. Choose photo is always available. Unsupported question types still use the existing printable/manual flow.


## Unified print and guest workflow

Print has four visual choices: Questions only, Questions + bubbles, Bubble sheets only, and Unnamed bubble sheets. Unnamed booklets can include questions. Each complete pack prints questions immediately before its matching QR pages. Frozen option order, option images, school logo and the BRAINS HEIST heading are preserved. Each unnamed booklet receives unique sheet tokens; photocopying one booklet for multiple students is not supported. Use the count control to issue unique copies.

After reviewing every page, the teacher records the written name and optional school reference and chooses Save for later linking. Holding seals the answers without generating accounts, grades or profile evidence. Awaiting link lists issued, held and linked booklets across print sessions. After signup and authorised school/roster membership, a teacher selects the registered account and explicitly confirms identity. No name matching or automatic signup link occurs. Partial online work requires explicit replacement and is archived; completed results are protected. Linking uses normal paper grading and evidence with the original assessment time, not the signup date. Identical retries are safe.

Guest records and server-only question snapshots persist with the assignment. Assignment edits keep the saved record but block linking against a different form version. Photos are not retained. Held identities and answers are sealed in this release; corrections after holding/completion require a future governed correction workflow.

Deploy migration `20261011122528_classroom_unified_print_guests.sql` after the existing paper/scan migrations and before this frontend. Applied to production on 2026-10-11 under migration version `20261011122528`. Validate staging and physical print/phone acceptance before broad classroom use.


Validation on 2026-10-11: full `npm run verify` passed (1,842 unit tests, 67 programme DOM checks, 11 language DOM checks, 115 database checks and 4 assignment-card checks). Eight guest database checks subsequently passed, including multi-page separation and named-scan regression. Final typecheck, build, migration guard and diff checks passed. Chromium checks used mocked RPC transport with real QR generation, SVG rasterisation, worker recognition, four print modes, deliberate guest holding/linking and desktop/tablet/phone overflow checks. Two student packs produced four A4 PDF pages; bubbles alone produced two. Physical print/phone calibration remains pending; the production migration was applied on 2026-10-11.


Recognition refinement (2026-10-12): eight focused OMR tests pass, including synthetic medium-grey graphite, partial/offset shading, mild shadows, stray pencil, printed outlines, true/false, threshold boundaries and double marks. These are engineering regression fixtures, not physical-camera calibration. Re-uploading the original photo recomputes suggestions for an unfinished review while retaining valid teacher corrections; confirmed results are unchanged. Stored original detections remain part of the scan audit. Physical-sheet acceptance and full application CI must be reported separately.

Review alignment: preview crops start half an option spacing before the first bubble and contain one equal-width cell per issued choice. A–D labels, photographed bubbles and answer buttons share those columns; Blank has a separate full-width row. The same geometry supports two/three/four choices, both sheet columns and narrow screens. Question numbering remains in the card heading.


Regression correction (2026-10-12): the supplied review screenshot reproduced false "uncertain" on a blank row and false "multiple" on a clearly filled C row when sampled at fixed centres. The photographed circles were approximately 5–6 canonical pixels below the sample centres. Local registration reads those cropped bands as Blank and C, without lowering answer classification thresholds again. The fixture contains only bubble bands, with no names or sheet/student identifiers.

Fifteen focused tests pass: existing OMR checks plus the actual SVG print renderer/real QR decoder pipeline on a complete 40-row sheet, shifted circles, perspective JPEG images, grey photocopies, a 25-degree phone rotation, inverted QR, missing page corners and the reported screenshot bands. This is stronger engineering evidence than ideal-disk tests; it still does not certify every physical phone or original camera photo. Previously reviewed/confirmed results and teacher corrections remain untouched. Original photographs remain local.
