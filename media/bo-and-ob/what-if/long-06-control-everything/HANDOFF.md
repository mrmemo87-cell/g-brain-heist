# Handoff: "What If You Could Control Everything?" (long-form What-If #6)

Status when handed off (2026-11-25): script + 3 character voices done, scene library written, narration partly recorded. Nothing rendered or scheduled yet.

## Concept
You wake up with a remote control that works on everything: REWIND, PAUSE, MUTE, SKIP. Day in your life:
trip in the office -> rewind; pause the alarm and sleep in; mute a loud speakerphone man on the train (almost mute a crying woman, don't);
rewind every awkward moment at work; skip Greg's 40-minute presentation; then you start skipping your sister, your friend, and your partner's
"we need to talk". Everyone has remotes (kids mute parents, footballer retakes a penalty 300 times, politician mutes journalists, motorway paused
for a sandwich). The only thing remotes don't work on is THE CAT (stays in full colour while the world is paused). Home is silent and empty;
partner texted 3 hours ago. You rewind to "we need to talk" and this time stay in the awkward bit. Ending: remote goes in a drawer; the cat walks
on it and turns the volume up; you don't mind the noise. Outro: "Which button would you press first? Who would you mute? ...then unmute them."

## Files here
- narr.txt: 56 narrator lines (format exaggeration|pause|text) -> ids n01..n56.
- voice/s.mp3 (speakerphone man, Kirk), voice/q.mp3 (Greg, Martin, monotone slides), voice/p.mp3 (partner, Ella; 2 lines split by a long pause: p1 "Hey... we need to talk." p2 "I've been feeling really far away from you lately.")
  Planned placement: s1 after n10, q1 after n17, p1 after n40, p2 after n41. Do NOT use prefix g/c/u for voices (g = gap token, c = cue).
- tail_ctl.js: scene library for this video (REMOTE, ICON, REWFX, FFFX, PAUSEFX, MUTEICON, SHADES, BLUSH, OFFC, TRAINC, BEDC, KITC, MEETC, FAMC, FOOTY, POLIT, MOTOR, CATWALK, MUTEHOME, DRAWER, VOLCAT).
  Needs a grayscale filter <filter id="gray"><feColorMatrix type="saturate" values="0.1"/></filter> added to the per-frame defs (used for PAUSE).
- narr_raw_partial/: the narrator WAVs that finished before handoff (000.wav...). Regenerate any missing ones with the same settings.
- lib/: the shared pipeline copied from the previous video ("Who Uses You"):
  cine.js, cat.js (CAT, PEEK kitties), thought.js, lib_main.js, lib_text.js (TEXT2), tail_use.js (HANDP, STR thin strings, BEDRM, OFFU, SOFAU, SPLIT2, YOUL, CAFEU...),
  example_shots_who-uses-you.js (the SHOTS list + camT/renderAt with snap/whip/shake camera moves: copy its structure), episode.mjs, cutshorts.mjs, go.sh,
  render.mjs, gen.mjs (expects ../ep10/scene.html; ep10_scene.html is a copy of it), fake.mjs (placeholder timings for storyboard stills).

## How to finish
1. Narration: Chatterbox (pip/uv: chatterbox-tts 0.1.7, CPU), default voice, cfg_weight 0.25, temperature 0.8, seed 23, via media/bo-and-ob/voice/narrator.py narr.txt narr_raw.
   (~1 line/minute on CPU.) tools/build.mjs applies the ffmpeg chain (asetrate=24000*0.91, aresample=44100, atempo=0.99, bass=g=3:f=120, trim).
2. Write episode.mjs (narr: 56, batches s/q/p, seq with the placements above, sfx), tail_shots.js (SHOTS + renderAt), assemble tail.js =
   lib_main + cat + thought + lib_text + tail_use + tail_ctl + tail_shots; build -> gen -> storyboard stills -> fix -> render frames -> encode.
3. Cut 5 Shorts (cutshorts.mjs pattern; DLG for s1/q1/p1/p2), thumbnail (tools/thumb.mjs + thumb.js), copy to media/bo-and-ob/video/whatif-long-06-*.mp4, commit + push.
4. Schedule in Metricool brand 8192843 (Asia/Bishkek): long video YouTube + Facebook at 22:09 Bishkek; Shorts YouTube 01:09 and FB+IG Reels 03:09 Bishkek,
   one per day starting after the last queued Short (Dec 13 Bishkek). Media via raw.githubusercontent.com URLs of this branch.

## Style rules the user cares about
- Social-experiment What-If from your own embarrassing point of view, revealing hidden human traits. Not scientific.
- Kitties in most scenes. Strings/effects thin, not chunky. Use the user's exact title: "What If You Could Control Everything?"
- No ambiguous hand gestures (a raised single digit read as a rude finger once; use emoji-style icons instead).
- Always check still frames; say plainly that the audio/motion can't be heard/watched by the assistant.
