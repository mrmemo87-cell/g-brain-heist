# Reading Screener A public release

Contract: IELTS Diagnostic Bible v1.2.0. Scope: the 12-item Academic Reading
screener BH-RS-A-1, not a full baseline or calibrated IELTS band estimate.

Brains Heist LLC approved the editorial content, keys, taxonomy, difficulty,
20-minute timing and originality on 2026-10-06. On 2026-10-07 the product owner
requested publication for every eligible IELTS user and confirmed that Reading,
after the UI fixes, passed start, refresh/resume, connection loss/recovery and
submission on both phone and MacBook. This is owner-reported device evidence;
it is separate from automated database verification.

The reviewed content hash is
`5e872053f221cc650f7671d596a45454d821075896c4330d87f84db1c53ed614`.
The frozen pilot envelope hash is
`d1d54e2a0193de10c062b7249c9b39cafe89967113c83ef00dda24a95ff16db5`.

## Publication transition

The migration supplies a service-only atomic publication operation. It does not
automatically activate any assessment. The operation requires exact pilot hash,
the original reviewer, and a complete Reading-specific delivery record. Missing
checks, mismatched hashes and future-dated evidence fail closed.

An unchanged frozen Reading pilot may advance once from `in_review` to
`published`. Only publication and delivery acceptance metadata may change.
Payloads, items, keys, provenance, academic review, taxonomy and identity must
match the frozen snapshot exactly. Published versions remain immutable; content
corrections still require a new version.

Publication changes the envelope hash because review metadata is hashed. Both
hashes are recorded in the delivery acceptance and release audit. The event,
form and version identities remain stable. Existing attempt snapshots, saved
responses and scoring runs retain their original envelope hash and result.

The public release uses the existing canonical IELTS programme-access decision.
Eligible school and independent learners can discover and start Reading.
Ineligible, banned and unauthenticated users remain excluded. Students retain
self-only access to completed results, including after eligibility changes.
Listening release gates and eligibility remain unchanged.

## Verification

The executable database test checks every required delivery flag, wrong owner,
wrong hash, future evidence, unchanged content, immutable published versions,
preserved pilot results, canonical eligible/ineligible access, private keys and
service-only publication permissions. It uses synthetic content and synthetic
acceptance records only.

Production publication must also verify the release row, public catalogue,
saved pilot result, new eligible-user delivery and unchanged Listening release.
Temporary verification attempts must roll back rather than enter learner history.

Scoring stays `ielts-objective-screener-v1`: one mark per item, low confidence,
no calibrated band, no overall four-skill result and no persistent weakness
claim. Repeating these questions is practice and cannot establish improvement.
