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
  devDependencies: {
    "@types/node": "22.15.3",
    msw: "1.3.2",
    typescript: "5.2.2",
    vitest: "3.2.7",
  },
};

function withMswVersion(packageJson, version) {
  return {
    ...packageJson,
    devDependencies: {
      ...packageJson.devDependencies,
      msw: version,
    },
  };
}

describe("validateUpgrade", () => {
  test("accepts only the MSW 1.3.2 to 2.0.0 upgrade", () => {
    const currentPackage = withMswVersion(basePackage, "2.0.0");

    expect(validateUpgrade(basePackage, currentPackage)).toBe(true);
  });

  test.each([
    [
      "wrong base",
      withMswVersion(basePackage, "1.3.1"),
      withMswVersion(basePackage, "2.0.0"),
    ],
    ["wrong target", basePackage, withMswVersion(basePackage, "2.0.1")],
  ])("rejects a %s version", (_label, base, current) => {
    expect(() => validateUpgrade(base, current)).toThrow(
      /MSW upgrade must be exactly 1\.3\.2 -> 2\.0\.0/,
    );
  });

  test.each([
    [
      "package",
      {
        ...withMswVersion(basePackage, "2.0.0"),
        devDependencies: {
          ...basePackage.devDependencies,
          msw: "2.0.0",
          yaml: "2.8.0",
        },
      },
    ],
    [
      "script",
      {
        ...withMswVersion(basePackage, "2.0.0"),
        scripts: { ...basePackage.scripts, lint: "eslint ." },
      },
    ],
  ])("rejects an unrelated %s change", (_label, currentPackage) => {
    expect(() => validateUpgrade(basePackage, currentPackage)).toThrow(
      /Only devDependencies\.msw may change/,
    );
  });
});
