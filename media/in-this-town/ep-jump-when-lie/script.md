# In This Town, People Jump When They Lie

Vertical Reel/Short, 1080x1920, ~60 s. Owner-approved script (used verbatim).

**Hook / title card (frame 0 already shows the title and someone mid-jump):**
In this town, people jump when they lie. And EVERYONE jumps.

| # | Narration | On screen |
|---|-----------|-----------|
| 1 | "I'm fine." | Woman at home with tea, smiles, then jumps |
| 2 | "Five minutes away." | Guy still in pyjamas and nightcap, phone by his ear, jumps |
| 3 | "I read the terms and conditions." | Laptop showing TERMS / I AGREE; huge jump right off the top of the screen |
| 4 | The whole street bounces all day. | Whole street hopping; the kitties don't |
| 5 | Ceilings are twice as high, and doctors only fix sprained ankles. | House cross-section with a "2x" ceiling; "Doctor: sprained ankles only" queue (kitty with a tiny bandage) |
| 6 | My best friend Leo said, "I love your haircut." He went straight into the lamp. | Me with a terrible bowl cut; Leo hits the lamp and lands wearing the shade |
| 7 | My teacher said, "This test is easy." She hit the ceiling. | Impossible integral on the board; she squashes against the ceiling |
| 8 | The mayor said, "I will never lie to you." We lost him for two days. | Mayor launches off the podium; MISSING poster: "Last seen: going UP" |
| 9 | One morning, total silence. Nobody was jumping. We had all agreed to stop talking. | Everyone stands still with zipped mouths |
| 10 | It lasted 14 minutes. | Stopwatch counts to 14:00 |
| 11 | Then my dad said, "I like your cooking"... and the bouncing started again. | Burnt pancake, dad jumps; then the whole street bounces again |

**Ending:** on-screen "What lie would make YOU jump the highest? 👇"; narrator: "Follow for more of this town."

## Production
- Narrator: Chatterbox default voice (cfg 0.25, temp 0.8, seed 23), `narr.txt` via `media/bo-and-ob/voice/narrator.py`; chain asetrate=24000*0.91, aresample=44100, atempo=0.99, bass g=3 f=120, silence trim.
- Music: official theme `../music/in-this-town-theme.mp3` from 0:00, ~20 dB under the voice, 1.5 s fade out. Final mix two-pass loudnorm I=-17.
- SFX: synthesized boing (take-off), dust thud (landing), bonk (lamp, ceiling), plus whoosh/tick from `media/bo-and-ob/sfx`.
- Build: `node build.mjs` (voice, timeline, mix) -> `node sb.mjs` (storyboard sheets) -> `node render.mjs frames 4` -> ffmpeg encode. Scene code: `scene.js` (+ `cat.js` kitties from the shared pipeline, thinner lines), jump/SFX timing in `timing.js`.
