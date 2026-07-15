# Automatic Generic Goose Repair Design

## Goal

Turn the demo from a manually dispatched, pre-scripted MSW migration into a
bounded repair loop that starts automatically after CI fails on a dependency
update pull request. Goose must diagnose the observed failure itself and may
repair any repository file outside an immutable control plane.

The workflow produces a reviewed repair candidate. It does not commit, push,
merge, publish, or deploy.

## Approaches considered

### 1. Trusted `workflow_run` trigger — selected

Listen for completion of the `CI` workflow from the default branch and proceed
only when that run failed for an open, same-repository pull request. This keeps
the credential-bearing remediation workflow definition on trusted `main`, while
still starting automatically from a CI failure.

### 2. Goose job inside pull-request CI — rejected

This would make the job naturally visible beside CI, but a same-repository pull
request could also alter the workflow that later receives a model credential.
The security boundary would be harder to audit.

### 3. Manual dispatch — rejected as the primary trigger

The current `workflow_dispatch` design is explicit and safe, but it leaves the
outer loop disconnected: CI observes the failure and a person must separately
start remediation.

## Architecture

The system has two workflows with distinct responsibilities:

1. `CI` checks a pull request without model credentials.
2. `Goose dependency update shepherd` listens for a completed `CI` run. On an
   eligible failure it validates the immutable PR target, captures the actual
   failure, pauses at the `goose-repair` environment, and runs a bounded generic
   Goose recipe.

The remediation workflow publishes a commit status named `Goose repair
candidate` against the failed PR head SHA. The status is pending while the
environment is awaiting approval, succeeds when a validated patch is available,
and fails when preflight or the bounded repair fails.

No repair commit is pushed automatically. A human reviews and applies the patch;
that new commit causes ordinary CI to run again. Green CI ends the outer loop.
Another failure starts a new, separately approved repair run for the new SHA.

## Trigger and eligibility

The remediation workflow uses:

- `workflow_run`
- workflow name `CI`
- activity type `completed`

It continues only when all of the following are true:

- the CI conclusion is `failure`;
- the originating event is `pull_request`;
- the event identifies exactly one open pull request;
- the pull request targets `main`;
- the head repository matches the current repository;
- the failed workflow SHA still equals the pull request's current head SHA;
- target, current `main`, and computed merge-base SHAs are full 40-character
  commit IDs;
- the GitHub pull-request file list exactly matches the merge-base-to-target Git
  diff;
- that verified pull-request change is a dependency-only update.

For this npm demo, dependency-only means that the incoming PR changes exactly
`package.json` and `package-lock.json`. A generic manifest validator permits
changes only inside npm dependency maps and requires at least one dependency
entry to change. All package metadata, scripts, and validation commands must
match the merge-base version. `npm ci --ignore-scripts` must accept the
lockfile.

The workflow derives target SHA and PR number from the event and confirms them
against the GitHub API. It fetches current `main`, computes the PR merge base,
and cross-checks the API file list against the corresponding Git diff. This
allows `main` to advance without forcing the demo branch to rebase while still
preventing hidden target changes. The workflow has no caller-supplied SHA and no
fixed `BASELINE_SHA` variable.

## Generic Goose context and action

The recipe and prompt must not contain:

- MSW or a dependency name/version;
- a predicted error message;
- a migration guide;
- a predetermined repair file;
- a suggested API replacement.

Goose receives only:

- the repository at the immutable target SHA;
- generic repository repair instructions;
- the complete failing `npm run check` output captured by preflight;
- the goal of restoring all repository checks while preserving the dependency
  update;
- the protected-file rules, retry budget, and evidence contract.

Goose inspects the repository, diagnoses the failure, chooses which files to
change, and runs the existing deterministic checks. It may change any tracked
file that is not part of the immutable control plane.

## Immutable control plane

Goose may not alter files that define the trigger, trust boundary, dependency
update, or success criteria:

- `.github/**`
- `.goose/**`
- `AGENTS.md`
- `package.json`
- `package-lock.json`
- `scripts/validate-upgrade.mjs`
- `test/validate-upgrade.test.js`
- `test/workflow-contract.test.js`
- `tsconfig.json`

Source files, test fixtures, tests outside the harness contract tests,
documentation, and other repository files are repairable. This deliberately
allows Goose to discover a multi-file migration. Human patch review remains the
backstop against a semantically weak but mechanically green repair.

## Inner repair loop

Each attempt follows the same feedback cycle:

1. Goose inspects current repository state and the observed failure.
2. Goose makes a repair without committing.
3. The recipe runs `npm run check`.
4. It verifies that `HEAD` still equals the immutable target SHA.
5. It verifies that no protected file changed.
6. It verifies that at least one allowed tracked file changed.
7. It rejects unexpected nonignored untracked files.
8. It requires a repair summary.

Failed checks and their output feed the next attempt. The recipe permits two
retries, for at most three attempts, and retains the existing timeout and turn
limits. Passing all checks exits the inner loop. Exhaustion produces a failed
status and evidence for human diagnosis.

## Security and credentials

The preflight job has no model secret. The repair job uses the protected
`goose-repair` environment and cannot begin until a required reviewer verifies
the exact target SHA and its lockfile.

`GOOGLE_API_KEY` is exposed only to the Goose execution step. Checkout
credentials remain disabled. The workflow receives read access to repository,
pull-request, and Actions metadata plus the minimum status-write permission
needed to report `Goose repair candidate`. It receives no content-write
permission.

The required reviewer is the trust boundary for executing dependency code on a
credential-bearing runner. The workflow's same-repository and immutable-diff
checks reduce accidental scope; they do not make hostile code trustworthy.

## Evidence and human handoff

Every eligible run preserves:

- the complete baseline failure log;
- the secret-scanned Goose log;
- the final check log;
- a binary patch containing every allowed repair file;
- Goose's repair summary;
- target SHA, current base SHA, merge-base SHA, PR number, Goose version,
  provider, model, runner, and run URL;
- a security hold marker instead of logs if credential-like content is found.

The artifact and commit status link the candidate back to the exact failed PR
SHA. A human applies the patch to the PR branch only after reviewing the diff.

## Failure handling and stopping conditions

- Green CI does not start Goose.
- Push and scheduled CI runs do not start Goose.
- Forked, missing, ambiguous, closed, or non-`main` pull requests are rejected.
- A non-dependency-only PR is rejected before environment approval.
- A failed workflow SHA that no longer matches the PR head is rejected.
- A GitHub pull-request file list that differs from the merge-base Git diff is
  rejected.
- Missing model configuration fails before the model call.
- A denied or unapproved environment never receives the secret.
- A security scan match withholds normal evidence and fails the run.
- Three unsuccessful Goose attempts fail the candidate status and stop.
- Because Goose cannot push, it cannot create an uncontrolled CI/remediation
  cycle. Only a reviewed human commit can start the next outer iteration.

Concurrency is keyed by target SHA so duplicate events for the same commit do
not race or cancel an approved run.

## Verification strategy

Contract tests will assert that:

- the workflow uses `workflow_run` for completed `CI` runs and no longer uses
  `workflow_dispatch`;
- event-derived target and PR identity are validated before checkout and
  confirmed against the GitHub API;
- current `main`, merge-base, API file list, and Git diff agree before model
  access;
- the workflow rejects green, non-PR, forked, ambiguous, and non-dependency
  events;
- the recipe, workflow, and repair instructions contain no MSW-specific error,
  migration, API, or repair-file guidance;
- every protected file is checked after Goose runs;
- the patch is generated from the immutable target and includes all allowed
  changes;
- the secret appears only in the Goose execution step;
- actions and the Goose archive remain immutable and checksum-pinned;
- the PR status is written against the exact failed head SHA.

The implementation must also pass:

- validator unit tests for generic dependency-map changes and rejected package
  metadata/script changes;
- `npm run check` on green `main`;
- Goose recipe validation with the pinned Goose release;
- Actionlint and shell syntax checks;
- an end-to-end GitHub demonstration in which the red dependency PR triggers
  remediation automatically, waits for environment approval, produces a generic
  repair patch, and turns green only after a human applies that patch.

## Publication sequence

The trusted workflow must land on `main` before it can receive `workflow_run`
events. Publish the implementation through a separately reviewed, green pull
request, then remove the obsolete `BASELINE_SHA` repository variable.

After publication, rerun CI for the existing red dependency PR without changing
or rebasing its branch. The resulting failed CI run should start Goose
automatically and expose the `Goose repair candidate` status. The real model run
remains blocked until `GOOGLE_API_KEY` is configured and the environment request
is approved.
