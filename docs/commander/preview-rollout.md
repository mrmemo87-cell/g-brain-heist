# Brains Heist Commander Preview

PR #1425 adds a practice entry alongside Launch Attack in the student's Game tab.
It is a combat prototype, not the full seasonal Commander economy. Its starter
units, shields and cooldowns are preview rules; the complete catalog, energy,
progression, looting, matchmaking and seasons are still future work.

## Isolation and access

- The existing Attack handlers, routing and economic RPCs stay unchanged.
- The Game-tab card is visible; starting or advancing a battle requires server
  authentication and an explicit tester allowlist. Card visibility is not access control.
- The Edge handler accesses Supabase Auth only. No tables, RPCs, wallet, XP, AP,
  inventory, purchases, rankings or academic history are written.
- HMAC transcripts bind battle state to the authenticated user's ID and expire
  15 minutes after starting; turns do not extend the deadline.
- Stateless practice allows replay/branching of a valid transcript. Never reuse
  this persistence-free protocol for ranked rewards or any economic settlement.
- Closing discards the local practice session. Requests can be canceled; the UI
  times out after 20 seconds and does not trap the user while waiting.
- The native modal keeps keyboard focus inside and restores focus when closed.
  Preview chunk/render errors are contained within the Game tab.

## Configuration for a test deployment

The frontend and Supabase Edge Function are separate deployment units. A Vercel
build alone does not deploy `commander_practice`.

1. Use an approved test Supabase project and matching frontend environment.
2. Set `COMMANDER_PREVIEW_SIGNING_SECRET` to a strong random secret (32+ characters).
3. Set `COMMANDER_PREVIEW_TESTER_IDS` and/or `COMMANDER_PREVIEW_TESTER_EMAILS` to
   comma-separated testers. Email-based access additionally requires a confirmed
   email. Prefer explicit user IDs. Empty lists deny everyone.
4. Deploy only `commander_practice`, retaining `verify_jwt = true` in config.toml.
   Verify the project's actual auth key/JWT configuration through the deployed
   gateway; local tests do not simulate the hosted gateway.
5. Obtain an actual READY frontend preview. A canceled deployment or a green
   GitHub integration status is not proof that Vercel built the preview.
6. Smoke test allowed, denied and signed-out accounts; start, target, Focus,
   Guard, Death Bolt cooldown, finished battle, restart and expired transcript.
   Check desktop, mobile, Arabic RTL, Russian, keyboard and slow-network close.
7. Verify that the same account's real game fields stay unchanged and that
   legacy Attack still works through its existing path.

Disable access by clearing both allowlists and ensuring the running function
loads that configuration. Removing/rolling back the frontend entry is a separate
visibility rollback. No instant database-backed kill switch or school entitlement
integration is included in this practice checkpoint.

## Validation and limits

The repository tests execute the real Edge request handler with stubbed platform
imports/Auth, real WebCrypto signatures and the real deterministic engine. They
cover denied access, absent configuration, confirmed email, transcript tampering,
expiry, player binding, invalid moves/targets and finished battles. The test auth
client rejects access to anything except Auth, and raw network calls fail.

The repository verification command also checks the protected School Admin
Portal, question packages, TypeScript, migration security, production build and
full regression suite. Three pre-existing failures on the PR base were corrected:
login tests now inspect the composed login components; the branding document uses
the correct Brains Heist name. Login product behavior was not changed.

No production database reset, migration, Edge deployment, secret change, public
rollout or merge is part of this checkpoint. Hosted authenticated smoke testing
remains required before calling the preview live-ready. Premium purchases and
all seasonal economy changes remain outside the practice preview.
