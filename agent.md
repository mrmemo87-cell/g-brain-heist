# Agent CI Guardrails

To avoid repeating CI failures on Writing Hub and TypeScript checks:

1. Before every commit that touches `src/pages/writing/*` or writing integration code, run:
   - `npm run typecheck`
   - `npm test`
2. If any production snapshot/contract test fails, restore required stable markers/labels (or add hidden compatibility markers) before committing.
3. Do not merge UI refactors that remove existing test contract strings without updating tests in the same change.
4. Re-run `npm run typecheck && npm test` after each patch iteration until both pass.
5. For React ref collections (e.g., map/dictionary refs), explicitly type callback ref params (`HTMLButtonElement | null`, `HTMLDivElement | null`) and null-guard `.current` before indexed access to satisfy strict TypeScript in CI.
6. In `WritingHub.tsx`, avoid `as any` style casts for inline styles. Prefer standard CSS properties (`animationDelay`, `animationDuration`, `backgroundSize`, etc.) over CSS custom-properties in inline objects unless they are strongly typed.
7. Before finalizing, run `npm run -s typecheck` exactly (CI uses `tsconfig.ci.json`) and confirm zero TypeScript errors in modified files.
8. This repo's React typings may not expose named utility types like `CSSProperties`/`ComponentProps`; avoid relying on those imports for style typing in hot paths. Prefer class-driven styling plus plain inline style objects with standard CSS keys.
9. **GSAP plugin imports**: Use lowercase import paths (e.g., `'gsap/observer'` not `'gsap/Observer'`). The GSAP type files are lowercase (`observer.d.ts`) but the ambient modules use PascalCase (`"gsap/Observer"`); `forceConsistentCasingInFileNames` in `tsconfig.json` catches the casing mismatch on Linux CI. A local shim at `src/gsap-observer.d.ts` bridges this — if adding new GSAP plugins, create a similar shim.
10. **React namespace types**: The custom `declare namespace React` in `global.d.ts` only exposes a subset of React's types. If you need additional React types (event types, utility types), add them to `global.d.ts` — both in the `declare namespace React` block and in the `declare module 'react'` block. Do NOT use `React.SomeType` in code unless it's declared in `global.d.ts`.
11. **Always run typecheck locally before pushing**: `npm run typecheck` uses `tsconfig.ci.json` with `forceConsistentCasingInFileNames: true` and `strict: true`. Errors that don't appear in VS Code (which may use a relaxed config) can still break CI.
