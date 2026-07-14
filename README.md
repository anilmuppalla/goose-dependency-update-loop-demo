# Bounded Dependency Update Repair with Goose

This repository is a small, auditable example of **loop engineering with
Goose**. The point is not that an agent can edit a handler. The point is that a
maintenance loop can constrain the trigger, context, action, evaluation,
retry budget, evidence, and final decision.

## The loop engineering framework

1. **Trigger:** a maintainer manually dispatches a workflow for one immutable
   40-character commit SHA.
2. **Context:** Goose reads the repository rules, the captured TypeScript
   failure, a frozen migration note, and the one repairable source file.
3. **Goose action:** Goose may repair only `test/handlers.ts` using its built-in
   developer extension.
4. **Deterministic evaluator:** TypeScript, Vitest, tracked-diff, untracked-file,
   and evidence checks decide whether an attempt passed.
5. **Bounded retry:** the recipe allows two retries—at most three attempts in
   total—with a five-minute timeout and a 20-turn cap.
6. **Durable evidence:** the runner preserves the baseline failure,
   secret-scanned Goose log, final check, binary patch, summary, and run
   metadata.
7. **Human decision:** the workflow uploads a patch. It never commits, pushes,
   opens a pull request, merges, or deploys.

## Worked example: MSW 1.x to 2.x

`main` pins Mock Service Worker (MSW) `1.3.2` and stays green. The
`demo/msw-v2-upgrade` branch is intentionally red: it changes only
`package.json` and `package-lock.json` to MSW `2.0.0`, while
`test/handlers.ts` still uses the MSW 1.x `rest`/`res`/`ctx` API. The manual
repair workflow must preserve that dependency update and make the smallest
documented handler migration.

Normal CI and remediation are deliberately separate:

- `.github/workflows/ci.yml` runs on pull requests and pushes to `main`.
- `.github/workflows/goose-update-shepherd.yml` runs only when a maintainer
  manually supplies the exact upgrade commit SHA.

The manual workflow first runs a secret-free preflight. It validates the
baseline and target SHAs, proves that the immutable commit range changes only
the two package files, validates the exact `1.3.2` to `2.0.0` semantic change,
and captures the expected missing-`rest` compiler error. The environment-gated
repair job repeats those checks before receiving any model credential.

## Google Gemini setup

The repair uses Google Gemini through an API key created in
[Google AI Studio](https://aistudio.google.com/app/apikey).

Configure the repository before dispatching the manual workflow:

1. Create the protected GitHub Actions environment `goose-repair` and
   configure at least one required reviewer.
2. Add `GOOGLE_API_KEY` as an environment secret in `goose-repair`.
3. Add `GOOSE_MODEL` as an environment or repository variable containing the
   approved Gemini model name.
4. Add `BASELINE_SHA` as a repository variable containing the 40-character
   green baseline commit SHA.

Before approving the `goose-repair` environment deployment, the required
reviewer must:

1. Verify the deployment request is for the exact submitted 40-character
   `target_sha`. Open the linked workflow run and compare the full value; reject
   an abbreviated or mismatched SHA.
2. Inspect `package-lock.json` from that exact target commit. Use the commit's
   file view or a trusted local checkout. Reject the approval if the lockfile
   has unexpected source URLs, integrity hashes, or packages, or if you have
   not reviewed that target commit.

The workflow fixes `GOOSE_PROVIDER=google` and exposes `GOOGLE_API_KEY` only to
the bounded Goose execution step. Repository permissions remain
`contents: read`.

> **Security warning:** do not dispatch the repair workflow for untrusted pull
> request code or an unreviewed commit. The target runs on a credential-bearing
> runner. The SHA and two-file diff checks reduce drift; they do not turn
> hostile code into trusted code.

## Local commands

Install and verify the green baseline:

```bash
npm ci --ignore-scripts
npm run check
```

Run the semantic package validator against two package snapshots:

```bash
git show "${BASELINE_SHA}:package.json" > /tmp/base-package.json
node scripts/validate-upgrade.mjs /tmp/base-package.json package.json
```

Validate the recipe with Goose `1.36.0` before any model call:

```bash
GOOSE_DISABLE_KEYRING=1 goose recipe validate .goose/dependency-update.yaml
```

The recipe expects `artifacts/baseline.log` to contain the failing type-check
from the intentionally red upgrade. The authoritative repair boundary is in
`AGENTS.md`; the migration context is frozen in
`docs/msw-1-to-2-migration-notes.md`.

## Output boundary

A successful run produces review artifacts only. A human must inspect the
binary patch and evidence before applying anything. No workflow in this repo
has permission or instructions to push or merge the repair.
