# Lessons 10 and 14 v0.3.0 with new recordings: teacher release to every school

**Release date:** 2026-10-27 (Asia/Bishkek). Supersedes the v0.2.0 releases of 2026-10-18.

## Authority

Content: owner approval on 2026-10-27 at 17:50 Asia/Bishkek ("Approve") after the v0.3.0 review copy with answer keys,
an external content and level review, and the revisions in PR #1732. Recordings: the owner listened to the v2
recordings and wrote at 18:09: "Audio approved". No in-platform review decision was entered on the owner's behalf.

## Recordings

| Recording | Version | Bytes | Duration | SHA-256 |
|---|---|---:|---:|---|
| IELTS-10-L1 | v2 (new) | 8017495 | 334.0 s | `02b8031fc265cce24760adb645830d198308254a81695c56039e98a876132c9e` |
| IELTS-10-C1 | v1 (unchanged) | 4114667 | | `07957cc6da4fe2a22c3f5be4540545e3745edef16ef907e0e5b70dd238ac2737` |
| IELTS-14-L1 | v2 (new) | 7366615 | 306.9 s | `15e9186ed8f4080904ad034b4554734b07a4705fb7ffdea8eca70a696492719a` |
| IELTS-14-C1 | v1 (unchanged) | 3380849 | | `5b73b884545864b293eb07b22f1b025d6851a9e3c51dabb65fee0de9b25a1b2b` |

The v2 recordings use the v1 voices and assembly method (Runway eleven_v4 passages; Tom for instructions; segments at
-18 LUFS; exact 30 s reading and 15 s response silences; true peak about -1.5 dBFS). Production details and the
transcript hashes are in each lesson's `AUDIO_PRODUCTION_v1.json`. The unchanged C1 recordings were taken from the
released v0.2.0 templates and matched their recorded SHA-256.

## Templates

| Code | Version | Template bytes | Template SHA-256 |
|---|---|---:|---|
| IELTS-10 | 0.3.0 | 17796016 | `3e51cab3f73e322deaaaba0c1616972f1b3d5a744e58e65a1955b7d6b3571517` |
| IELTS-14 | 0.3.0 | 15817791 | `048911a020c6c52d9b20641e671ff37e4af50a314f3030dcff50b25119b21ff2` |

Built with `--template --audio-dir`; `validate-lesson-pack.py` zero errors; branded with the production code (no
placeholders). Uploaded through a one-time endpoint limited to these exact paths, sizes and SHA-256 values; re-downloaded
and verified; the endpoint is back to a JWT-required HTTP 410 and the capability was destroyed and never committed. Rows
updated in place by migration `20261027121135`.

## Not verified

Word-for-word speech-recognition check of the v2 recordings (none available; the owner listened). Microsoft PowerPoint
playback, printing, projector and classroom audio (LB-08).
