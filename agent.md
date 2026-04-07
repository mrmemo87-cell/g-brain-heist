# Agent CI Guardrails

To avoid repeating CI failures on Writing Hub and TypeScript checks:

1. Before every commit that touches `src/pages/writing/*` or writing integration code, run:
   - `npm run typecheck`
   - `npm test`
2. If any production snapshot/contract test fails, restore required stable markers/labels (or add hidden compatibility markers) before committing.
3. Do not merge UI refactors that remove existing test contract strings without updating tests in the same change.
4. Re-run `npm run typecheck && npm test` after each patch iteration until both pass.
