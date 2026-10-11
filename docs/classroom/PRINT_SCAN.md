# Print & Scan: classroom contract

## Delivered first version

Inside the paper workspace, Print & Scan provides personalised A4 sheets, camera/photo selection, on-device QR decoding and mark recognition, cropped-row visual review, and governed result confirmation. Supports registered assignment students and 2–4 text choices (multiple choice/true-false), up to 200 questions: 40 rows per sheet and numbered additional pages.

School name, student name, BH assignment code, frozen form identity, assessment date and page number are printed. QR codes carry only an opaque sheet UUID with a format prefix. They identify records; they never authorize access or encode answer keys. Question papers and answer sheets must be used together with their matching form and option order.

The A4 SVG has fixed physical dimensions and four square markers. Print on A4 at 100%/Actual size with browser headers/footers disabled. The scanner finds markers and normalizes the photo; missing markers and unreadable QR codes fail closed. All sheet layout changes need a new version and scanner support. Do not change bubble positions in CSS.

## Identity and option order

An authenticated, entitled, active assignment-owning teacher issues a session with an assessment timestamp and selected roster. The server validates every supplied displayed-option sequence as an exact permutation of the frozen snapshot's distinct values. It stores that sequence with each sheet, avoiding letter-to-answer mismatches when historic display balancing applies. Scanning resolves the exact issued page. Frozen snapshots changed after issue invalidate the sheet.

Printing retries reuse a client session UUID and return the same sheet tokens for identical payloads. Different assessment times, rosters or sequences cannot overwrite an existing session. The printed date describes assessment, while issuing, scanning, reviewing and confirmation timestamps remain separate.

## Recognition and review

QR decoding and coarse page estimation run in a lazily loaded Web Worker. QR corner noise is handled with a coarse affine estimate; solid corner components then establish the final projective correction. Bubble interiors are measured against surrounding paper brightness, excluding printed outlines. The thresholds are conservative engineering heuristics, not calibrated probabilities or an accuracy guarantee.

One strong isolated mark suggests an answer. Blank, faint/erased and multiple marks require an explicit answer or Blank choice. All rows can be inspected. Every page needs the teacher's review checkbox and Save reviewed page action. No mark recognition consults the correct answer. Server scoring happens only after Confirm student result, through the existing snapshot-based paper confirmation function.

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

Live video capture/auto-shutter, batch upload, students without accounts, handwriting recognition, cloud photo retention and corrections after completion remain outside this version. Mobile Take photo uses the browser file capture hint; camera/gallery behavior depends on the device. Choose photo is always available. Unsupported question types still use the existing printable/manual flow.
