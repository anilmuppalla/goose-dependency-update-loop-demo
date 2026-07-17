# Automatic Generic Goose Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically start a generic, human-gated Goose repair loop after CI fails on a trusted dependency-update pull request, while removing deprecated Node 20 action runtimes.

**Architecture:** The trusted `main` workflow listens to completed `CI` runs through `workflow_run`, validates the exact same-repository PR head and its dependency-only diff, then captures the real failure without predicting it. A protected repair job runs a generic Goose recipe with an immutable control plane, validates any allowed multi-file patch, and publishes evidence plus a commit status without pushing code.

**Tech Stack:** GitHub Actions, Bash, GitHub CLI/API, Node.js 24, npm, Vitest, TypeScript, Goose recipes, Google Gemini.

---

## File map

- Modify `.github/workflows/ci.yml`: use Node 24-based immutable action commits and test the repository with Node.js 24.
- Replace `.github/workflows/goose-update-shepherd.yml`: automatic trusted trigger, PR identity validation, generic failure capture, environment gate, generic patch validation, statuses, and evidence.
- Modify `scripts/validate-upgrade.mjs`: validate arbitrary npm dependency-map changes instead of one MSW version pair.
- Modify `test/validate-upgrade.test.js`: cover generic dependency additions, removals, and upgrades plus metadata/script rejection.
- Modify `test/workflow-contract.test.js`: encode trigger, runtime, secret, genericity, control-plane, status, and target-SHA contracts.
- Modify `.goose/dependency-update.yaml`: generic observed-failure repair recipe with bounded retries.
- Modify `AGENTS.md`: generic repair rules and protected-file contract.
- Delete `docs/msw-1-to-2-migration-notes.md`: remove the pre-supplied solution from Goose's repository context.
- Modify `README.md`: document the automatic outer loop, generic inner loop, approval, statuses, evidence, and publication behavior.
- Modify the approved design spec to require target control-plane parity and the Update branch publication step.

### Task 1: Lock the new contract with failing tests

**Files:**
- Modify: `test/workflow-contract.test.js`
- Modify: `test/validate-upgrade.test.js`

- [ ] **Step 1: Replace the MSW-specific validator tests**

Use a base package with multiple dependency maps and assert the generic behavior:

```js
import { describe, expect, test } from "vitest";

import { validateUpgrade } from "../scripts/validate-upgrade.mjs";

const basePackage = {
  name: "goose-dependency-update-loop-demo",
  version: "0.0.0",
  private: true,
  type: "module",
  scripts: {
    typecheck: "tsc --noEmit",
    test: "vitest run",
    check: "npm run typecheck && npm test",
  },
  dependencies: { example: "1.0.0" },
  devDependencies: {
    "@types/node": "22.15.3",
    msw: "1.3.2",
    typescript: "5.2.2",
    vitest: "3.2.7",
  },
};

describe("validateUpgrade", () => {
  test("accepts arbitrary dependency-map changes", () => {
    const current = structuredClone(basePackage);
    current.dependencies.example = "2.0.0";
    current.devDependencies.added = "3.0.0";
    delete current.devDependencies.msw;

    expect(validateUpgrade(basePackage, current)).toEqual({
      changes: [
        "dependencies.example: 1.0.0 -> 2.0.0",
        "devDependencies.added: <missing> -> 3.0.0",
        "devDependencies.msw: 1.3.2 -> <missing>",
      ],
    });
  });

  test("rejects a package with no dependency changes", () => {
    expect(() => validateUpgrade(basePackage, structuredClone(basePackage)))
      .toThrow(/At least one dependency entry must change/);
  });

  test.each([
    ["script", { scripts: { ...basePackage.scripts, check: "true" } }],
    ["metadata", { private: false }],
    ["name", { name: "different-package" }],
  ])("rejects an unrelated %s change", (_label, override) => {
    const current = structuredClone(basePackage);
    current.devDependencies.msw = "2.0.0";
    Object.assign(current, override);
    expect(() => validateUpgrade(basePackage, current)).toThrow(
      /Only npm dependency maps may change/,
    );
  });
});
```

- [ ] **Step 2: Replace workflow contract tests with automatic/generic assertions**

Read the CI workflow, remediation workflow, recipe, instructions, and README. Assert at minimum:

```js
expect(workflow).toContain("workflow_run:");
expect(workflow).toContain('workflows: ["CI"]');
expect(workflow).toContain("types: [completed]");
expect(workflow).not.toContain("workflow_dispatch:");
expect(workflow).toContain("github.event.workflow_run.conclusion == 'failure'");
expect(workflow).toContain("github.event.workflow_run.event == 'pull_request'");

const checkoutSha = "9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0";
const setupNodeSha = "820762786026740c76f36085b0efc47a31fe5020";
const uploadSha = "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a";
for (const source of [ciWorkflow, workflow]) {
  expect(source).not.toContain("34e114876b0b11c390a56381ad16ebd13914f8d5");
  expect(source).not.toContain("49933ea5288caeca8642d1e84afbd3f7d6820020");
  expect(source).not.toContain('node-version: "20"');
}
expect(ciWorkflow).toContain(`actions/checkout@${checkoutSha}`);
expect(ciWorkflow).toContain(`actions/setup-node@${setupNodeSha}`);
expect(ciWorkflow).toContain('node-version: "24"');
expect(workflow).toContain(`actions/upload-artifact@${uploadSha}`);

for (const forbidden of [
  "MSW",
  "1.3.2",
  "2.0.0",
  "test/handlers.ts",
  "TS2305",
  "msw-1-to-2-migration-notes",
]) {
  expect(recipe).not.toContain(forbidden);
  expect(agentInstructions).not.toContain(forbidden);
  expect(workflow).not.toContain(forbidden);
}

expect(workflow).toContain("statuses: write");
expect(workflow).toContain("Goose repair candidate");
expect(workflow).toContain("github.workflow_sha");
expect(workflow).toContain("git merge-base");
expect(workflow).toContain("pulls/$PR_NUMBER/files");
expect(workflow).toContain('git diff --binary "$TARGET_SHA"');
expect(workflow).not.toContain("BASELINE_SHA");
expect((workflow.match(/secrets\.GOOGLE_API_KEY/g) ?? [])).toHaveLength(1);
```

Also assert that the protected path matcher covers `.github/`, `.goose/`, `AGENTS.md`, both package manifests, `scripts/validate-upgrade.mjs`, the two harness tests, and `tsconfig.json`.

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```bash
npm test -- test/validate-upgrade.test.js test/workflow-contract.test.js
```

Expected: failures showing the validator is still MSW-specific, the workflow still uses `workflow_dispatch`, the old action SHAs and Node 20 remain, and the recipe still names the predetermined repair.

- [ ] **Step 4: Commit the failing contract tests**

```bash
git add test/validate-upgrade.test.js test/workflow-contract.test.js
git commit -m "test: specify automatic generic Goose repair"
```

### Task 2: Generalize dependency-update validation

**Files:**
- Modify: `scripts/validate-upgrade.mjs`
- Test: `test/validate-upgrade.test.js`

- [ ] **Step 1: Replace exact MSW constants with dependency-map comparison**

Implement these exported semantics:

```js
const DEPENDENCY_MAPS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

function withoutDependencyMaps(packageJson) {
  const copy = structuredClone(packageJson);
  for (const key of DEPENDENCY_MAPS) delete copy[key];
  return copy;
}

function assertDependencyMap(value, key) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} must be an object when present`);
  }
  return value;
}

export function validateUpgrade(base, current) {
  if (!isDeepStrictEqual(withoutDependencyMaps(base), withoutDependencyMaps(current))) {
    throw new Error("Only npm dependency maps may change");
  }

  const changes = [];
  for (const key of DEPENDENCY_MAPS) {
    const before = assertDependencyMap(base[key], key);
    const after = assertDependencyMap(current[key], key);
    const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const name of names) {
      if (before[name] !== after[name]) {
        changes.push(
          `${key}.${name}: ${before[name] ?? "<missing>"} -> ${after[name] ?? "<missing>"}`,
        );
      }
    }
  }

  if (changes.length === 0) {
    throw new Error("At least one dependency entry must change");
  }
  return { changes };
}
```

Update CLI success output to report the number of changed dependency entries without printing a dependency name or version:

```js
const result = validateUpgrade(await readJson(basePath), await readJson(currentPath));
console.log(`Validated dependency-only package.json change: ${result.changes.length} entries changed`);
```

- [ ] **Step 2: Run validator tests and confirm GREEN**

Run:

```bash
npm test -- test/validate-upgrade.test.js
```

Expected: all generic validator tests pass.

- [ ] **Step 3: Commit the validator**

```bash
git add scripts/validate-upgrade.mjs test/validate-upgrade.test.js
git commit -m "feat: validate generic dependency updates"
```

### Task 3: Make the Goose action genuinely generic

**Files:**
- Modify: `.goose/dependency-update.yaml`
- Modify: `AGENTS.md`
- Delete: `docs/msw-1-to-2-migration-notes.md`
- Test: `test/workflow-contract.test.js`

- [ ] **Step 1: Replace the recipe prompt and checks**

Use a generic recipe with no dependency, error, API, or file prediction:

```yaml
version: "1.0.0"
title: "Bounded dependency update repair"
description: >-
  Diagnose an observed dependency-update failure and produce the smallest
  validated repository repair. Two retries permit three attempts total.
prompt: |
  A dependency-only pull request fails the repository's existing checks.

  Read these local files first:
  1. AGENTS.md
  2. artifacts/baseline.log

  Inspect the repository and the complete observed failure. Diagnose the cause
  yourself. Make the smallest repair that preserves the dependency update and
  restores every existing check. Do not assume which files or APIs must change.

  Write artifacts/goose-summary.md with the diagnosis, changed files, commands
  run, validation result, and remaining risk. If a correct repair requires a
  protected file, write NEEDS_HUMAN and stop.
instructions: |
  Follow AGENTS.md exactly. Never redefine the trigger, dependency update,
  validation, or success criteria. Never commit, push, open or update a pull
  request, merge, publish, or deploy.
extensions:
  - type: builtin
    name: developer
retry:
  max_retries: 2
  timeout_seconds: 300
  checks:
    - type: shell
      command: "npm run check"
    - type: shell
      command: "bash scripts/check-repair-boundary.sh"
    - type: shell
      command: "test -s artifacts/goose-summary.md"
  on_failure: >-
    mkdir -p artifacts; printf '\n[%s] validation failed\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> artifacts/validation.log; npm run check >> artifacts/validation.log 2>&1 || true
settings:
  max_turns: 20
```

The boundary command must be trusted. Create `scripts/check-repair-boundary.sh` in Task 4 before changing the recipe check to call it; until then the focused recipe validation is expected to fail.

- [ ] **Step 2: Rewrite `AGENTS.md` as generic runtime instructions**

State the exact protected files, require reading `artifacts/baseline.log`, permit all other tracked files, prohibit validation weakening and Git/network side effects, and require `npm run check`, the boundary script, and `artifacts/goose-summary.md` before success.

- [ ] **Step 3: Delete the frozen migration solution**

```bash
git rm docs/msw-1-to-2-migration-notes.md
```

- [ ] **Step 4: Run genericity contract tests**

Run:

```bash
npm test -- test/workflow-contract.test.js
```

Expected: MSW/file/error genericity assertions pass; automatic workflow assertions remain red until Task 4.

- [ ] **Step 5: Commit generic agent context**

```bash
git add .goose/dependency-update.yaml AGENTS.md test/workflow-contract.test.js
git commit -m "feat: make Goose repair diagnosis generic"
```

### Task 4: Implement the trusted automatic workflow

**Files:**
- Replace: `.github/workflows/goose-update-shepherd.yml`
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/check-repair-boundary.sh`
- Test: `test/workflow-contract.test.js`

- [ ] **Step 1: Add a deterministic repair-boundary script**

The script must require `TARGET_SHA`, reject moved `HEAD`, require at least one tracked change, reject protected paths, and reject nonignored untracked files:

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${TARGET_SHA:?TARGET_SHA is required}"
normalized_target="$(printf '%s' "$TARGET_SHA" | tr 'A-F' 'a-f')"
test "$(git rev-parse HEAD)" = "$normalized_target"

changed="$(git diff --name-only "$TARGET_SHA")"
test -n "$changed"

protected='^(\.github/|\.goose/|AGENTS\.md$|package\.json$|package-lock\.json$|scripts/validate-upgrade\.mjs$|scripts/check-repair-boundary\.sh$|test/validate-upgrade\.test\.js$|test/workflow-contract\.test\.js$|tsconfig\.json$)'
if printf '%s\n' "$changed" | grep -Eq "$protected"; then
  printf '%s\n' "Protected repair file changed:" >&2
  printf '%s\n' "$changed" | grep -E "$protected" >&2
  exit 1
fi

untracked="$(git ls-files --others --exclude-standard)"
if [ -n "$untracked" ]; then
  printf '%s\n' "Unexpected nonignored untracked files:" "$untracked" >&2
  exit 1
fi
```

Make it executable and add contract tests for each protected path.

- [ ] **Step 2: Upgrade CI actions and project runtime**

In `.github/workflows/ci.yml`, use:

```yaml
- name: Check out repository
  uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0
  with:
    persist-credentials: false

- name: Set up Node.js
  uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
  with:
    node-version: "24"
    cache: npm
```

- [ ] **Step 3: Replace manual trigger and permissions**

Start the remediation workflow with:

```yaml
name: Goose dependency update shepherd

on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]

permissions:
  actions: read
  contents: read
  pull-requests: read
  statuses: write

concurrency:
  group: goose-update-shepherd-${{ github.event.workflow_run.head_sha }}
  cancel-in-progress: false
```

The preflight job condition must reject green and non-PR runs:

```yaml
if: >-
  github.event.workflow_run.conclusion == 'failure' &&
  github.event.workflow_run.event == 'pull_request'
```

- [ ] **Step 4: Resolve and validate immutable PR context**

Use `$GITHUB_EVENT_PATH` and `gh api` to require exactly one PR, `main` base,
same head repository, open state, and matching head SHA. Fetch current base and
compute `MERGE_BASE`. Compare sorted GitHub API filenames from
`pulls/$PR_NUMBER/files` with `git diff --name-only "$MERGE_BASE" "$TARGET_SHA"`,
then require exactly `package-lock.json` and `package.json`.

Export job outputs `target_sha`, `base_sha`, `merge_base`, and `pr_number`. Use
`git diff --quiet "$CONTROL_SHA" "$TARGET_SHA" --` with every protected path to
require control-plane parity with `${{ github.workflow_sha }}`.

Run the generic validator against `git show "$MERGE_BASE:package.json"`, install
with `npm ci --ignore-scripts`, and capture the complete nonzero output of
`npm run check` in `artifacts/baseline.log` without matching an error string.

- [ ] **Step 5: Publish pending/failure status from preflight**

Use the statuses API against the exact target SHA:

```bash
gh api --method POST "repos/$GITHUB_REPOSITORY/statuses/$TARGET_SHA" \
  -f state=pending \
  -f context="Goose repair candidate" \
  -f description="Validated failure; waiting for protected repair" \
  -f target_url="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
```

An `if: failure()` step must publish `state=failure` with the same context and
run URL.

- [ ] **Step 6: Implement the protected repair job**

Use `needs.preflight.outputs.*`, `environment: goose-repair`, Node.js 24, and the
approved action SHAs. Requery the PR after approval and fail if its head moved.
Repeat control-plane, dependency-only, lockfile, and observed-failure checks
before the secret-bearing step.

Keep the existing checksum-pinned Goose 1.36.0 install and model hardening. The
only secret reference remains:

```yaml
- name: Run bounded Goose recipe
  env:
    GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
```

- [ ] **Step 7: Generalize final verification and evidence**

Run `scripts/check-repair-boundary.sh`, then `npm run check`. Generate all-file
evidence from the immutable target:

```bash
git diff --binary "$TARGET_SHA" > artifacts/goose-fix.patch
test -s artifacts/goose-fix.patch
test -s artifacts/goose-summary.md
```

Metadata must include target, current base, merge base, PR number, Goose version,
provider, model, runner, and run URL. Upload evidence with:

```yaml
uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
```

Publish `Goose repair candidate=success` only after every final check passes;
publish failure from an `if: failure()` step. Never grant `contents: write`.

- [ ] **Step 8: Run focused checks and confirm GREEN**

Run:

```bash
npm test -- test/workflow-contract.test.js test/validate-upgrade.test.js
HOME=/tmp/goose-v1.36-redteam/home GOOSE_DISABLE_KEYRING=1 \
  /tmp/goose-v1.36-redteam/bin/goose recipe validate .goose/dependency-update.yaml
/tmp/actionlint-1.7.12/actionlint -color .github/workflows/*.yml
```

Expected: all contract tests pass, the recipe is valid, and Actionlint produces
no output.

- [ ] **Step 9: Commit the automatic workflow**

```bash
git add .github/workflows/ci.yml .github/workflows/goose-update-shepherd.yml \
  scripts/check-repair-boundary.sh test/workflow-contract.test.js
git commit -m "feat: trigger generic Goose repair after CI failure"
```

### Task 5: Update operator documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-13-automatic-generic-goose-repair-design.md`

- [ ] **Step 1: Rewrite README flow and setup**

Document this exact sequence:

```text
dependency-only PR -> CI failure -> automatic preflight -> environment approval
-> Goose repair/check/retry -> patch artifact -> human applies patch -> CI reruns
```

Remove manual `target_sha`, `BASELINE_SHA`, exact missing-`rest` matching,
predetermined handler scope, and frozen migration-note instructions. Retain the
MSW branch as the worked example, but explain that the harness does not know its
solution.

Document that **Update branch** merges the trusted harness from `main` into the
demo branch without rebasing and that the environment reviewer still verifies
the exact target SHA and lockfile before approval.

- [ ] **Step 2: Run documentation contract checks**

Run:

```bash
npm test -- test/workflow-contract.test.js
rg -n 'workflow_dispatch|BASELINE_SHA|TS2305|Only test/handlers.ts may change' \
  README.md AGENTS.md .goose .github
```

Expected: tests pass and `rg` returns no matches.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md docs/superpowers/specs/2026-07-13-automatic-generic-goose-repair-design.md
git commit -m "docs: explain the automatic Goose loop"
```

### Task 6: Verify and publish the implementation branch

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run fresh local verification**

```bash
npm ci --ignore-scripts
npm run check
HOME=/tmp/goose-v1.36-redteam/home GOOSE_DISABLE_KEYRING=1 \
  /tmp/goose-v1.36-redteam/bin/goose recipe validate .goose/dependency-update.yaml
/tmp/actionlint-1.7.12/actionlint -color .github/workflows/*.yml
git diff --check main...HEAD
git status --short --branch
```

Expected: 0 failures, valid recipe, no Actionlint output, no whitespace errors,
and a clean feature branch.

- [ ] **Step 2: Review the complete branch diff**

Confirm no OpenAI credential references, only one Gemini secret reference, no
Node 20 action SHA/runtime remains, no MSW guidance remains in the repair control
plane, and no workflow has content-write permission.

- [ ] **Step 3: Push and open an implementation PR**

```bash
git push -u origin codex/automatic-goose-trigger
gh pr create --base main --head codex/automatic-goose-trigger \
  --title "Trigger generic Goose repair after CI failure" \
  --body-file /tmp/goose-auto-trigger-pr.md
```

- [ ] **Step 4: Wait for green implementation CI and review before merge**

Run `gh pr checks --watch`. The implementation PR must be green because it uses
the baseline dependency set. Review workflow permissions, action SHAs, shell
quoting, event validation, and secret scope before merging.

### Task 7: Activate and demonstrate the outer loop

**Files:**
- GitHub repository settings and existing demo PR.

- [ ] **Step 1: Merge the reviewed implementation PR**

Merge only after green CI and independent review. Verify the automatic workflow
exists on `main`; a `workflow_run` listener on a feature branch is inactive.

- [ ] **Step 2: Remove obsolete repository state**

```bash
gh variable delete BASELINE_SHA --repo anilmuppalla/goose-dependency-update-loop-demo
```

Retain `GOOSE_MODEL=gemini-3.5-flash` and the protected `goose-repair`
environment. Do not add or expose `GOOGLE_API_KEY` unless the user supplies it.

- [ ] **Step 3: Update the red demo branch from `main`**

Use GitHub's Update branch operation or merge `origin/main` into
`demo/msw-v2-upgrade` and push normally. Do not rebase or force-push. This makes
the target's protected control plane equal trusted `main` while keeping the PR
file list dependency-only.

- [ ] **Step 4: Observe automatic triggering**

Wait for CI to fail on the dependency break. Verify a new `workflow_run`-event
Goose run appears automatically and that the PR shows `Goose repair candidate`.
The preflight must capture the real failure without any exact error assertion.

- [ ] **Step 5: Stop honestly at the credential boundary**

If `GOOGLE_API_KEY` is absent, report that the automatic trigger and preflight
are proven but the model loop is waiting for the environment secret. Do not claim
that Goose repaired the PR until a real approved run produces artifacts.
