# Echo premium mobile polish

Responds to the iPhone pilot screenshot: duplicate large/floating character, oversized permanent controls, tall card, stitched-looking strands and hardcoded Echo labels.

Changes:
- Floating mode unmounts the card avatar, halo and particles. The card becomes a compact summary; tucked mode keeps a restore chip rather than duplicating the large character.
- Mobile floating avatar is 96 px (112 px container); desktop avatar is 112 px. Name, greeting and 44 px action targets appear only when tapped. Escape or an outside pointer action dismisses the popover. Drag handle, keyboard movement, tuck and off controls remain.
- Bounds use VisualViewport width/height and offsets, with resize and scroll listeners. The body reserves 100 px above bottom navigation; opening the popover reserves top space. Narrow/short visual viewports temporarily show the dock chip, so the keyboard does not conceal the companion. Returning to normal space restores floating mode and closes old controls. Pointer state is cleared when hidden or tucked.
- Card uses a small side-by-side avatar when floating is off, a single Companion options menu and the saved chosen name for dock/float/expression controls.
- Existing six raster pose assets are unchanged. Pose-specific SVG light trails are thinner, have translucent soft edges and fading gradient ends, and use the saved aura. No dashed stitch treatment or expensive blur/filter is added. Gradient IDs are scoped with React useId.
- Three short rotating greetings, a finite curious tilt and keepsake cradle add personality without another image, backend write, idle audio, notification or dependency. Hidden/offscreen/reduced-motion behaviour is retained.

Pilot: Gulzada/Jess eligibility and the existing named-user configuration were rechecked and left unchanged. Teacher appreciation, class cheers and encouragement keepsakes, official scoring and all assessment flows are preserved. Hide trial / owner Pause trial remain cancellation controls; floating can also be tucked or turned off independently.

Validation: focused TypeScript; 23 DOM checks (existing normal actions, save retry, hiding, teacher display, new one-character rendering, contextual controls, keyboard/drag, tuck/restore, practice, VisualViewport offsets/keyboard shrink and outside/Escape dismissal), plus 3 local geometry/preference checks. Full canonical-repository CI must pass at the exact head before release, including the unchanged pose-file size checks and database/audio regression coverage. Actual signed-in Safari touch and phone visual acceptance remain pilot checks. Local screenshot rendering was unavailable; do not claim pixel-perfect or device acceptance from DOM fixtures.

Next creative directions (proposals, not implemented): a small optional personality choice; distinctive accessories earned through meaningful learning (paper work included); illustrated milestone/teacher-note keepsakes; an asynchronous shared crew celebration. These should preserve voluntary participation and use existing completion evidence rather than clicks or repeated tapping.
