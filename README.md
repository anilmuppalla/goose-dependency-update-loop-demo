# Dependency Repair Loop with Goose

This repository demonstrates one idea:

```text
CI fails -> Goose diagnoses and repairs -> Goose pushes -> CI runs again
```

Green CI stops the loop. Another failure starts another repair attempt.

## The two workflows

### 1. CI

`.github/workflows/ci.yml` installs dependencies and runs the repository checks
for pull requests, pushes to `main`, and explicit redispatches from Goose.

### 2. Goose repair loop

`.github/workflows/goose-update-shepherd.yml` listens for failed `CI` runs. For
an open pull request from this repository, it:

1. Checks out the failed PR branch.
2. Downloads the actual failed CI log.
3. Runs the generic recipe in `.goose/dependency-update.yaml`.
4. Lets Goose inspect the failure and choose which code files to change.
5. Runs `npm run check` after every attempt, with at most two retries.
6. Commits and pushes a successful repair to the same PR branch.
7. Explicitly dispatches CI again.

The workflow stops after three Goose-authored commits to prevent a runaway
outer loop.

## Why the CI redispatch is explicit

GitHub does not start another workflow from a push authenticated with the
workflow's default `GITHUB_TOKEN`. After Goose pushes, it therefore calls
`gh workflow run ci.yml --ref <branch>`. This keeps the demo to two workflows
and avoids requiring a separate personal access token.

## Worked example

[`demo/msw-v2-upgrade`](https://github.com/anilmuppalla/goose-dependency-update-loop-demo/pull/1)
upgrades Mock Service Worker from `1.3.2` to `2.0.0` without updating the code
that uses it. CI fails, but neither the Goose workflow nor recipe contains the
expected error, migration instructions, or repair filename. Goose must diagnose
the observed failure itself.

## Configuration

Add these GitHub repository settings:

- Secret: `GOOGLE_API_KEY`, created in
  [Google AI Studio](https://aistudio.google.com/app/apikey)
- Variable: `GOOSE_MODEL`, for example `gemini-3.5-flash`

The workflows use immutable Node 24-based releases of GitHub's checkout and
setup-node actions. Goose itself is downloaded at version `1.36.0` and verified
with a pinned SHA-256 checksum.

## Local baseline

```bash
npm ci --ignore-scripts
npm run check
```

`main` is green. The demo pull request is intentionally red until Goose pushes
the repair.

## Scope

This is a teaching demo, not a production-grade autonomous maintenance system.
It intentionally omits policy engines, custom status reporting, patch archives,
semantic dependency validators, and a large security harness so the loop is
easy to see.
