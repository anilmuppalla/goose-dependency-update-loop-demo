import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const boundaryScript = fileURLToPath(
  new URL("../scripts/check-repair-boundary.sh", import.meta.url),
);

let repo;
let targetSha;

function git(...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function runBoundary() {
  return spawnSync("bash", [boundaryScript], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, TARGET_SHA: targetSha },
  });
}

beforeEach(() => {
  repo = mkdtempSync(`${tmpdir()}/goose-boundary-`);
  git("init", "-q");
  git("config", "user.name", "Boundary Test");
  git("config", "user.email", "boundary@example.com");
  mkdirSync(`${repo}/src`, { recursive: true });
  writeFileSync(`${repo}/src/client.ts`, "export const value = 1;\n");
  writeFileSync(`${repo}/package.json`, '{"private":true}\n');
  writeFileSync(`${repo}/.gitignore`, "artifacts/\n");
  git("add", ".");
  git("commit", "-qm", "baseline");
  targetSha = git("rev-parse", "HEAD");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("repair boundary", () => {
  test("accepts an allowed tracked repair", () => {
    writeFileSync(`${repo}/src/client.ts`, "export const value = 2;\n");

    expect(runBoundary().status).toBe(0);
  });

  test("rejects a protected tracked repair", () => {
    writeFileSync(`${repo}/package.json`, '{"private":false}\n');

    const result = runBoundary();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Protected repair file changed");
  });

  test("rejects an empty repair", () => {
    expect(runBoundary().status).toBe(1);
  });

  test("rejects unexpected untracked files", () => {
    writeFileSync(`${repo}/src/client.ts`, "export const value = 2;\n");
    writeFileSync(`${repo}/unexpected.txt`, "unexpected\n");

    const result = runBoundary();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unexpected nonignored untracked files");
  });
});
