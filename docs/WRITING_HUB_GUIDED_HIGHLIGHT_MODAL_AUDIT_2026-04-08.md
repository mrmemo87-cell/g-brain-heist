# Writing Hub guided highlight modal audit (2026-04-08)

## Scope
- Audited guided highlight rendering, active correction state, repair/correction panel content, and modal layout behavior in `src/pages/writing/WritingHub.tsx`.
- No runtime behavior changes made in this audit-only pass.

## Key findings
1. **Highlight rendering is intentionally staged by range index, not physically swept across text flow.**
   - `visibleSubmittedHighlightRanges` only includes `reviewScanPlan.slice(0, reviewScanCount)`.
   - `reviewScanCount` increments via per-range `setTimeout` calls.
   - Result: ranges appear one-by-one in schedule order, instead of one continuous marker drag.

2. **Each highlighted span runs its own local pseudo-element animation when mounted.**
   - `.review-highlight::before` and `::after` animate independently using `markerSwipe` / `markerNib`.
   - Since spans are mounted incrementally, each local swipe starts separately and reads as sequential reveal.

3. **Review order is transformed before display.**
   - `buildBalancedReviewSequence` alternates strong/weak first, then sorts by document position.
   - Combined with staged reveal, this can visually feel detached from a single drag gesture.

4. **Task context modal container uses content-driven height and centered placement.**
   - Overlay centers dialog using `display: grid; placeItems: center`.
   - Inner dialog has `maxHeight` but no fixed/min height budget for changing step content.
   - Right column’s Step 3 list and dynamic status/correction text change total dialog height between selections.
   - Perceived result: modal “jumps” vertically as centered box recenters to new height.

5. **No AnimatePresence / framer-motion remount animation is involved in this path.**
   - Movement is layout recalculation from dynamic content size, not motion library transitions.

## Minimal fix direction
- Keep existing structure but:
  - Anchor dialog position to top (`align-items: start`) with fixed top padding; keep internal scroll.
  - Reserve vertical space for dynamic Step 3 panel/details (min-height on variable sections).
  - For highlight behavior, stop staging mount-by-index and instead render all ranges immediately, then animate only active range indicator.

## Safer long-term fix direction
- Move highlight animation to an overlay layer driven by measured text range rectangles (`Range.getClientRects`), then animate a single marker stroke path/transform across rects for the active correction.
- Decouple modal frame sizing from per-step content:
  - fixed dialog height shell,
  - scrollable left/right panel bodies,
  - fixed footer and status rows.
