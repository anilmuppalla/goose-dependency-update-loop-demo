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
  dependencies: {
    example: "1.0.0",
  },
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

  test("accepts changes in optional and peer dependencies", () => {
    const current = structuredClone(basePackage);
    current.optionalDependencies = { optional: "1.0.0" };
    current.peerDependencies = { peer: "^2.0.0" };

    expect(validateUpgrade(basePackage, current).changes).toEqual([
      "optionalDependencies.optional: <missing> -> 1.0.0",
      "peerDependencies.peer: <missing> -> ^2.0.0",
    ]);
  });

  test("rejects a package with no dependency changes", () => {
    expect(() =>
      validateUpgrade(basePackage, structuredClone(basePackage)),
    ).toThrow(/At least one dependency entry must change/);
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

  test.each(["dependencies", "devDependencies"])(
    "rejects a non-object %s map",
    (key) => {
      const current = structuredClone(basePackage);
      current.devDependencies.msw = "2.0.0";
      current[key] = [];

      expect(() => validateUpgrade(basePackage, current)).toThrow(
        new RegExp(`${key} must be an object when present`),
      );
    },
  );
});
