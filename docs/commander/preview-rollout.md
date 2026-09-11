# Brains Heist Commander Preview

PR #1425 adds a practice entry alongside Launch Attack in the student's Game tab.
It is a combat prototype, not the full seasonal Commander economy. Its starter
units, shields and cooldowns are preview rules; the complete catalog, energy,
progression, looting, matchmaking and seasons are still future work.

## Isolation and access

- The existing Attack handlers, routing and economic RPCs stay unchanged.
- The Game-tab card is visible; starting or advancing a battle requires a valid
  Supabase user JWT and a server-side student-role check.
- Access is granted only when `public.users.role = 'student'` for the authenticated
  user ID. Teachers, admins, school admins and anonymous callers are not eligible.
- The Edge handler uses Supabase Auth plus one read-only lookup of `public.users.role`.
  It does not write tables or call RPCs. No Coins, XP, AP, inventory, purchases,
  rankings, rewards or academic history are changed.
- HMAC transcripts bind battle state to the authenticated user's ID and expire
  15 minutes after starting; turns do not extend the deadline.
- Stateless practice allows replay/branching of a valid transcript. Never reuse
  this persistence-free protocol for ranked rewards or any economic settlement.
- Closing discards the local practice session. Requests can be canceled; the UI
  times out after 20 seconds and does not trap the user while waiting.
- The native modal keeps keyboard focus inside and restores focus when closed.
  Preview chunk/render errors are contained within the Game tab.

## Configuration for deployment

The frontend and Supabase Edge Function are separate deployment units. A Vercel
build alone does not deploy `commander_practice`.

1. Set `COMMANDER_PREVIEW_SIGNING_SECRET` to a fresh strong random secret of at
   least 32 characters. Never commit it to the repository or paste it into chat.
2. Deploy only `commander_practice`, retaining `verify_jwt = true` in config.toml.
3. Verify the project's actual Auth/JWT configuration through the hosted gateway;
   local tests do not simulate the hosted gateway.
4. Smoke test a student account, a non-student authenticated account and a signed-out
   browser; then test start, target, Focus, Guard, Death Bolt cooldown, finished
   battle, restart and expired transcript.
5. Check desktop, mobile, Arabic RTL, Russian, keyboard and slow-network close.
6. Verify that the same student's real game fields stay unchanged and that legacy
   Attack still works through its existing path.

The signing secret is also the operational fail-closed gate: if it is absent or
shorter than 32 characters, the function returns `preview_signing_secret_not_configured`
and practice cannot start. Rolling back/removing the frontend entry is a separate
visibility action. No database-backed Commander entitlement or seasonal economy
is included in this practice checkpoint.

## Validation and limits

Repository tests cover deterministic combat, forged targets, Death Bolt cooldown,
JWT authentication, student-role gating, HMAC signing, the single allowed read of
the users role table, and the absence of insert/update/upsert/delete/RPC/network
calls from the practice handler.

The repository verification command also checks the protected School Admin Portal,
question packages, TypeScript, migration security, production build and full
regression suite. Hosted authenticated smoke testing remains required before
calling the preview live-ready. Premium purchases and all seasonal economy changes
remain outside the practice preview.
