# Classroom delivery contract

## Teacher flow

Choose Online, Paper, or Mixed in the assignment details step. These choices are separate from batch/custom audience selection. Existing assignments default to Online.

From the assignment card, use Print paper or Record paper answers. The paper workspace shows one student and question at a time, with class navigation, search, draft state, and large answer choices. A–D shortcuts and arrow-key radio navigation are supported. Blank is an explicit recorded answer, distinct from a question not entered yet. Review all recorded answers before confirming. Completed work is locked; no silent correction or resubmission.

## Print identity and options

A stable BH assignment code and form hash identify the exact frozen snapshots and question order. The question paper and separate answer sheet carry the same identity. The teacher key is a separate output and never appears in the student paper. Assignment-owned option order takes priority over historical display balancing. Import actual option values, not letters, and mark from the immutable snapshot.

## Database authority

- Online RPCs remain authoritative; legacy writes delegate to v2.
- Client roles cannot directly insert/update/delete authoritative answers or results.
- Teacher paper RPCs require the owning teacher, active membership in the assignment school, and assignment entitlement.
- Student membership is checked against the assignment roster. Paper-only delivery blocks student online answer insertion.
- Drafts use a revision and form hash. Lost acknowledgements can be retried; stale tabs cannot overwrite newer answers.
- Confirmation locks the same student-assignment row as online finalization. It is atomic, grades from snapshots, and allows duplicate confirmation only for the identical payload.
- Existing unfinished online answers require explicit replacement. Their complete prior rows are archived in `assignment_paper_submissions`. Completed results cannot be replaced.
- Paper assessment time is stored on answers and completion; recording/confirmation time and actor are stored separately. Unknown timing remains unavailable, not a measured zero-second attempt.
- The existing verified registry/diagnostic triggers process completion. Paper delivery never promotes teacher-pool items to verified evidence.

## Student recovery

Local drafts are account/assignment/question scoped and retained until acknowledged, including long school breaks. Recognised temporary failures recover on connection return or a bounded periodic retry. Failed/unsent answers do not unlock progress or show a fabricated grade. Submission intent is persisted and reconciled on reopening. Local storage failure is shown explicitly; keep the screen open until server acknowledgement.

## Performance

The teacher portal now imports the 3.3 MB Cambridge question-data module only when answer reflection is opened. Before/after build measurements reduced the compressed teacher portal chunk from approximately 2.23 MB to 88 KB. This is transfer-size evidence, not a classroom latency guarantee.

Use staging fixtures and `npm run load:classroom` for concurrency acceptance. Production is intentionally blocked by the existing load runner. Profile completion evidence and facet queries before claiming percentile improvements.

## Validation and current bounds

PGlite tests execute the paper/online transactions and access grants, including grading, deliberate blanks, stale revisions, duplicate acknowledgements, form mismatch, unauthorized students/teachers, explicit partial replacement, and legacy/paper-only guards. Browser validation uses mocked RPC responses to test the real component at desktop, tablet, and phone sizes; it is separate from production data validation.

Initial paper entry covers multiple choice and true/false with distinct nonempty text options. Other question types can still be printed but cannot be confirmed through this entry screen. Photo scanning, students without accounts, and governed post-completion corrections require separate implementation; they are not silently approximated.

## Rollout order

Apply `20261011051755_classroom_paper_workflow.sql` before deploying this frontend. The new creation, printing, delivery context and paper entry RPCs are required by the frontend. Existing assignments receive Online mode and a unique BH code. The migration does not regrade old results or infer the source of historical paper imports. Verify authenticated teacher workspace/print access and a staging online assignment after migration, then deploy the frontend. Run the staging classroom load suite before expanding the pilot.
