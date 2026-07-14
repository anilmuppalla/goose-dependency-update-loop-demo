import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/goose-update-shepherd.yml", import.meta.url),
  "utf8",
);

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
});
