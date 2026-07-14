import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/goose-update-shepherd.yml", import.meta.url),
  "utf8",
);
const recipe = readFileSync(
  new URL("../.goose/dependency-update.yaml", import.meta.url),
  "utf8",
);
const agentInstructions = readFileSync(
  new URL("../AGENTS.md", import.meta.url),
  "utf8",
);

const repairJobStart = workflow.indexOf("\n  repair:");
const repairStepsStart = workflow.indexOf("\n    steps:", repairJobStart);
const repairJobHeader = workflow.slice(repairJobStart, repairStepsStart);
const finalStepStart = workflow.indexOf(
  "      - name: Verify repair scope and final result",
  repairStepsStart,
);
const uploadStepStart = workflow.indexOf(
  "      - name: Upload repair evidence",
  finalStepStart,
);
const finalVerificationStep = workflow.slice(finalStepStart, uploadStepStart);

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

describe("Goose shepherd immutable upgrade contract", () => {
  test("proves the baseline is an ancestor in both trust checks", () => {
    const ancestryChecks =
      workflow.match(
        /git merge-base --is-ancestor "\$BASELINE_SHA" "\$TARGET_SHA"/g,
      ) ?? [];

    expect(ancestryChecks).toHaveLength(2);
  });

  test("uses direct endpoint diffs and rejects three-dot diff semantics", () => {
    const directDiffs =
      workflow.match(
        /git diff --name-only "\$BASELINE_SHA" "\$TARGET_SHA"/g,
      ) ?? [];

    expect(directDiffs).toHaveLength(2);
    expect(workflow).not.toContain("$BASELINE_SHA...$TARGET_SHA");
  });

  test("exposes the immutable target SHA to the repair agent", () => {
    expect(repairJobHeader).toContain(
      "    env:\n      TARGET_SHA: ${{ inputs.target_sha }}\n",
    );
  });

  test("reasserts HEAD equals the target before final repair-scope checks", () => {
    const headAssertion =
      'test "$(git rev-parse HEAD)" = "$normalized_target"';
    const targetScopeCheck = 'git diff --name-only "$TARGET_SHA"';

    expect(finalVerificationStep).toContain(
      'normalized_target="$(printf \'%s\' "$TARGET_SHA" | tr \'A-F\' \'a-f\')"',
    );
    expect(finalVerificationStep).toContain(headAssertion);
    expect(finalVerificationStep.indexOf(headAssertion)).toBeLessThan(
      finalVerificationStep.indexOf(targetScopeCheck),
    );
  });

  test("anchors every post-agent scope check and patch to the target", () => {
    const targetScopeCheck = 'git diff --name-only "$TARGET_SHA"';

    expect(countOccurrences(finalVerificationStep, targetScopeCheck)).toBe(1);
    expect(finalVerificationStep).toContain(
      'git diff --binary "$TARGET_SHA" -- test/handlers.ts',
    );
    expect(countOccurrences(recipe, targetScopeCheck)).toBe(1);
    expect(countOccurrences(agentInstructions, targetScopeCheck)).toBe(2);

    for (const contract of [workflow, recipe, agentInstructions]) {
      expect(contract).not.toContain("git diff --name-only HEAD");
    }
    expect(workflow).not.toContain("git diff --binary HEAD");
  });
});
