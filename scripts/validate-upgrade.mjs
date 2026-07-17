#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const DEPENDENCY_MAPS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

function assertPackageJson(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} package.json must be an object`);
  }
}

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
  assertPackageJson(base, "Base");
  assertPackageJson(current, "Current");

  if (
    !isDeepStrictEqual(
      withoutDependencyMaps(base),
      withoutDependencyMaps(current),
    )
  ) {
    throw new Error("Only npm dependency maps may change");
  }

  const changes = [];
  for (const key of DEPENDENCY_MAPS) {
    const before = assertDependencyMap(base[key], key);
    const after = assertDependencyMap(current[key], key);
    const names = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].sort();

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

  const result = validateUpgrade(
    await readJson(basePath),
    await readJson(currentPath),
  );
  console.log(
    `Validated dependency-only package.json change: ${result.changes.length} entries changed`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Upgrade validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
