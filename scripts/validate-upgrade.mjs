#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const EXPECTED_BASE = "1.3.2";
const EXPECTED_TARGET = "2.0.0";

export function validateUpgrade(base, current) {
  if (
    base?.devDependencies?.msw !== EXPECTED_BASE ||
    current?.devDependencies?.msw !== EXPECTED_TARGET
  ) {
    throw new Error(
      `MSW upgrade must be exactly ${EXPECTED_BASE} -> ${EXPECTED_TARGET}`,
    );
  }

  const normalizedCurrent = structuredClone(current);
  normalizedCurrent.devDependencies.msw = EXPECTED_BASE;

  if (!isDeepStrictEqual(base, normalizedCurrent)) {
    throw new Error("Only devDependencies.msw may change");
  }

  return true;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const [basePath, currentPath, ...extraPaths] = process.argv.slice(2);

  if (!basePath || !currentPath || extraPaths.length > 0) {
    throw new Error(
      "Usage: node scripts/validate-upgrade.mjs <base-package.json> <current-package.json>",
    );
  }

  validateUpgrade(await readJson(basePath), await readJson(currentPath));
  console.log("Validated package.json change: msw 1.3.2 -> 2.0.0 only");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Upgrade validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
