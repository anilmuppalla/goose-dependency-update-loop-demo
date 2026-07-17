# Generic Repair Agent Instructions

## Goal

Diagnose the observed dependency-update failure and make the smallest repair
that restores every existing repository check. The failure and required code
changes are not known in advance.

## Required context

Read `artifacts/baseline.log` before changing anything. Inspect the repository,
installed dependency APIs, types, and existing tests to determine the cause.
Do not assume a particular dependency, error, API migration, or repair file.

## Allowed repair scope

You may modify any tracked repository file needed for a correct repair except
the immutable control-plane files listed below. Multi-file repairs are allowed.

Never change:

- anything under `.github/`
- anything under `.goose/`
- `AGENTS.md`
- `package.json`
- `package-lock.json`
- `scripts/validate-upgrade.mjs`
- `scripts/check-repair-boundary.sh`
- `test/validate-upgrade.test.js`
- `test/workflow-contract.test.js`
- `test/repair-boundary.test.js`
- `tsconfig.json`

Do not add dependencies or alter the dependency update. Do not delete, skip,
weaken, replace, or rewrite validation merely to make it pass. Do not commit,
push, open or update a pull request, merge, publish, or deploy.

If a correct repair requires a protected file, write `NEEDS_HUMAN` and the
reason to `artifacts/goose-summary.md`, then stop.

## Required validation

Run:

- `npm run check`
- `bash scripts/check-repair-boundary.sh`

Both commands must pass. The boundary script verifies that the immutable target
commit did not move, at least one allowed tracked file changed, no protected
file changed, and no unexpected untracked files were created.

Write `artifacts/goose-summary.md` with:

- the diagnosis
- every changed file
- commands run and their results
- the final validation result
- any remaining risk

If a completion condition fails, record `NEEDS_HUMAN` instead of claiming
success.
