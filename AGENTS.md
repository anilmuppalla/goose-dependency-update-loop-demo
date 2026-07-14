# Repair Agent Instructions

## Exact commands

- Install dependencies: `npm ci --ignore-scripts`
- Type-check: `npm run typecheck`
- Test: `npm test`
- Run every project check: `npm run check`
- Inspect tracked changes: `git diff --name-only HEAD`
- Inspect unexpected untracked files:
  `git ls-files --others --exclude-standard`

## Required context

Read these files before changing anything, in this order:

1. `AGENTS.md`
2. `artifacts/baseline.log`
3. `docs/msw-1-to-2-migration-notes.md`
4. `test/handlers.ts`

The checked-in migration note is the frozen source context for this run. Do
not fetch migration guidance from the network.

## Repair boundary

The only tracked file the repair may change is `test/handlers.ts`.

Never change:

- `package.json` or `package-lock.json`
- any test other than the allowed handler file
- `tsconfig.json` or other configuration
- anything under `.github/workflows/`
- `README.md`, `AGENTS.md`, or other instructions
- `.goose/dependency-update.yaml`
- the frozen migration note

Do not delete, skip, weaken, replace, or rewrite validation. Do not add
dependencies. Do not commit, push, open or update a pull request, merge,
publish, or deploy.

If a correct repair requires any tracked file outside `test/handlers.ts`, write
`NEEDS_HUMAN` and the reason to `artifacts/goose-summary.md`, then stop.

## Completion contract

Run `npm run check`. Confirm that `git diff --name-only HEAD` prints exactly
`test/handlers.ts` and that `git ls-files --others --exclude-standard` prints
nothing.

Write `artifacts/goose-summary.md` with:

- the diagnosis
- the changed file
- commands run and their results
- the final validation result
- any remaining risk

If any completion condition fails or falls outside the repair boundary, record
`NEEDS_HUMAN` instead of claiming success.
