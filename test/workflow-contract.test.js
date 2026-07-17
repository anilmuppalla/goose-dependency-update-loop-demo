import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ciWorkflow = read(".github/workflows/ci.yml");
const workflow = read(".github/workflows/goose-update-shepherd.yml");
const recipe = read(".goose/dependency-update.yaml");
const agentInstructions = read("AGENTS.md");
const readme = read("README.md");

const CHECKOUT_SHA = "9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0";
const SETUP_NODE_SHA = "820762786026740c76f36085b0efc47a31fe5020";
const UPLOAD_ARTIFACT_SHA =
  "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a";

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

describe("automatic Goose trigger", () => {
  test("listens for completed failed CI pull-request runs", () => {
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain('workflows: ["CI"]');
    expect(workflow).toContain("types: [completed]");
    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).toContain(
      "github.event.workflow_run.conclusion == 'failure'",
    );
    expect(workflow).toContain(
      "github.event.workflow_run.event == 'pull_request'",
    );
  });

  test("derives and cross-checks trusted PR context", () => {
    expect(workflow).toContain("github.event.workflow_run.head_sha");
    expect(workflow).toContain("github.workflow_sha");
    expect(workflow).toContain("git merge-base");
    expect(workflow).toContain("pulls/$PR_NUMBER/files");
    expect(workflow).toContain("pulls/$PR_NUMBER");
    expect(workflow).toContain("head.repo.full_name");
    expect(workflow).toContain("base.ref");
    expect(workflow).not.toContain("BASELINE_SHA");
    expect(workflow).not.toContain("inputs.target_sha");
  });

  test("reports a repair candidate status without write access to contents", () => {
    expect(workflow).toContain("statuses: write");
    expect(workflow).toContain("pull-requests: read");
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("Goose repair candidate");
    expect(workflow).not.toContain("contents: write");
  });
});

describe("maintained action runtimes", () => {
  test("pins approved Node 24-based action releases", () => {
    expect(ciWorkflow).toContain(`actions/checkout@${CHECKOUT_SHA}`);
    expect(ciWorkflow).toContain(`actions/setup-node@${SETUP_NODE_SHA}`);
    expect(workflow).toContain(`actions/checkout@${CHECKOUT_SHA}`);
    expect(workflow).toContain(`actions/setup-node@${SETUP_NODE_SHA}`);
    expect(workflow).toContain(
      `actions/upload-artifact@${UPLOAD_ARTIFACT_SHA}`,
    );

    for (const source of [ciWorkflow, workflow]) {
      expect(source).not.toContain(
        "34e114876b0b11c390a56381ad16ebd13914f8d5",
      );
      expect(source).not.toContain(
        "49933ea5288caeca8642d1e84afbd3f7d6820020",
      );
      expect(source).not.toContain('node-version: "20"');
      expect(source).toContain('node-version: "24"');
    }
  });
});

describe("generic repair action", () => {
  test("does not predict the dependency, error, API, or repair file", () => {
    const forbidden = [
      "MSW",
      "1.3.2",
      "2.0.0",
      "test/handlers.ts",
      "TS2305",
      "msw-1-to-2-migration-notes",
    ];

    for (const source of [workflow, recipe, agentInstructions]) {
      for (const value of forbidden) expect(source).not.toContain(value);
    }
  });

  test("captures the observed repository check instead of matching an error", () => {
    expect(workflow).toContain(
      "npm run check > artifacts/baseline.log 2>&1",
    );
    expect(workflow).not.toContain("grep -Fqx");
    expect(recipe).toContain("artifacts/baseline.log");
  });

  test("keeps a bounded feedback loop", () => {
    expect(recipe).toContain("max_retries: 2");
    expect(recipe).toContain("timeout_seconds: 300");
    expect(recipe).toContain("max_turns: 20");
    expect(recipe).toContain("npm run check");
    expect(recipe).toContain("scripts/check-repair-boundary.sh");
  });
});

describe("immutable repair control plane", () => {
  const protectedFragments = [
    "\\.github/",
    "\\.goose/",
    "AGENTS\\.md",
    "package\\.json",
    "package-lock\\.json",
    "scripts/validate-upgrade\\.mjs",
    "scripts/check-repair-boundary\\.sh",
    "test/validate-upgrade\\.test\\.js",
    "test/workflow-contract\\.test\\.js",
    "tsconfig\\.json",
  ];

  test("checks every protected path", () => {
    for (const fragment of protectedFragments) {
      expect(agentInstructions).toContain(fragment.replaceAll("\\", ""));
    }
    expect(workflow).toContain("scripts/check-repair-boundary.sh");
    expect(workflow).toContain("git diff --quiet");
  });

  test("anchors repair checks and the all-file patch to the target SHA", () => {
    expect(recipe).toContain("scripts/check-repair-boundary.sh");
    expect(agentInstructions).toContain("scripts/check-repair-boundary.sh");
    expect(workflow).toContain('git diff --binary "$TARGET_SHA"');
    expect(workflow).not.toContain("-- test/handlers.ts");
  });
});

describe("credential and approval boundary", () => {
  test("exposes the Gemini key only to Goose execution", () => {
    expect(countOccurrences(workflow, "secrets.GOOGLE_API_KEY")).toBe(1);
    expect(workflow).toContain("environment: goose-repair");
  });

  test("documents exact target and lockfile review", () => {
    const prose = readme.replace(/\s+/g, " ");
    expect(prose).toContain("required reviewer");
    expect(prose).toContain("target");
    expect(prose).toContain("package-lock.json");
  });
});
