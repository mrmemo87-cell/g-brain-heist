# Economics answer balance and rewards

The stored original diagnostic has A/B/C/D counts 18/18/3/1. Its verified content
is immutable. The 200-item expansion has 50/50/50/50, but a predictable cycle.

A deterministic display-only permutation now produces:

| Set | A | B | C | D |
| --- | ---: | ---: | ---: | ---: |
| Original diagnostic | 10 | 10 | 10 | 10 |
| New practice | 30 | 30 | 30 | 30 |
| New reassessment | 20 | 20 | 20 | 20 |
| Full Economics bank | 60 | 60 | 60 | 60 |

Each six-item content subskill has counts 2/2/1/1 in varying positions. Ordering
is stable across reloads, teacher previews, assignment delivery, public practice,
mission start/resume, and printable assignment papers. Arbitrary smaller selections
are not guaranteed equal counts. Answer text, option content, academic marks,
verified hashes, stored questions and historical snapshots are unchanged. The
client manifest contains only permutations and source-order fingerprints, not
question text or answer keys; unexpected revisions are left untouched.

For verified one-mark questions, game rewards now use the pre-existing difficulty
fallback: easy 15 XP/22 coins, medium 20 XP/30 coins, hard 30 XP/45 coins, before
shared caps. Quest nodes, direct MCQ practice and the question-attempt API agree
for these items. Other items retain their existing reward rates. The latter two
APIs now consume the same daily/weekly caps as quest nodes. All three share the
existing 24-hour correct-answer deduplication lock/history. Retry or cross-mode
repetition cannot earn another correct-answer payout during that window. Attempts
record actual capped XP and the UI uses actual returned coins.

Formal teacher assignments retain their existing marks-only behavior. This change
does not introduce assignment payouts, alter Commander XP bridging, change shared
wallet ownership, award retroactive rewards, or change the economy's cap values.

Validation includes deterministic distribution and print parity tests and live
rollback checks of payouts, cross-mode duplicates, caps and unchanged assessment
marks. Stored answer-position counts intentionally remain unchanged: the balance
is a presentation policy, not a mutation of governed assessment content.
