# Brain Heist Agent Instructions

## Canonical project identity

- Canonical GitHub repository: `mrmemo87-cell/g-brain-heist`.
- Treat this repository as the source of truth for Brain Heist code.
- The application is Vite/React. Do not assume Next.js unless the repository itself changes.

## Workspace bootstrap

- Do not treat an empty or temporary scratch workspace as a blocker.
- If the current workspace does not contain the Brain Heist repository, resolve the canonical repository immediately.
- Prefer the connected GitHub plugin for repository discovery and GitHub operations.
- If local filesystem access is required for editing, testing, or builds, clone or check out the canonical repository automatically when the environment permits it.
- Do not ask the user to locate or reconnect the repository unless the canonical repository is genuinely inaccessible.
- Treat scratch workspaces as disposable. Never infer that the project is missing just because the local folder is empty.

## GitHub workflow

- Prefer the connected GitHub plugin with write access for branch, file, commit, pull request, review, and merge operations.
- Do not block on a missing GitHub CLI (`gh`) when the connected GitHub plugin can perform the required operation.
- Use local `git` or `gh` only for gaps the connector genuinely cannot cover, such as specific local checkout operations or GitHub Actions log inspection.
- Never tell the user to install/authenticate `gh` merely to push, create a PR, or merge when the plugin can do so.

## Supabase handling

- Brain Heist uses the existing connected Supabase project; resolve it through the connected Supabase integration before database work.
- Never create a new Supabase project merely because the local workspace is empty or freshly provisioned.
- Verify project identity before applying migrations, schema changes, RLS changes, RPC changes, or production data mutations.
- Preserve fail-closed authorization and existing RLS boundaries unless the task explicitly requires a reviewed change.

## Implementation discipline

- Inspect the live repository before modifying architecture or making framework assumptions.
- Prefer additive, minimal-diff changes and preserve existing working behavior unless the task explicitly calls for replacement.
- Do not claim implementation is complete until the relevant repository changes are present and the available validation steps have been run or explicitly reported as unavailable.
- When local execution is unavailable, use repository-level inspection and connector-backed verification rather than pretending tests were run.

### Protected shared portal: `components/SchoolAdminPortal.tsx`

`SchoolAdminPortal.tsx` is a high-churn integration shell. Never replace it from an older branch, cached copy, generated snapshot, or previously fetched version.

When a task touches this file:

1. Start from the current target-branch version (normally `main`).
2. Apply the smallest possible patch. Do not rewrite the whole file for a local feature.
3. Preserve unrelated current behavior, imports, navigation, admin polish, access guards, and tab integrations.
4. Before finishing, inspect the complete diff for `components/SchoolAdminPortal.tsx`. Any unrelated deletion or reversion must be restored.
5. Run `npm run guard:school-admin-portal` before typecheck/build/tests.
6. If a protected portal contract is intentionally replaced, update `scripts/check-school-admin-portal-integrity.mjs` in the same change and document the replacement rather than simply deleting the guard.

Multiple CI failures involving school-admin UI should be treated first as a possible stale-file overwrite, not as independent failures to patch one by one.

## Recovery behavior

When starting from a fresh environment, use this order:

1. Resolve `mrmemo87-cell/g-brain-heist` through the connected GitHub plugin.
2. Inspect the relevant files and current branch/default branch state.
3. If local execution is necessary and supported, obtain a local checkout automatically.
4. Resolve the existing Brain Heist Supabase project through the Supabase integration only when database context is required.
5. Continue the requested task without asking the user to repeat known repository or project identity information.

A missing scratch checkout is an environment condition, not a project blocker.
