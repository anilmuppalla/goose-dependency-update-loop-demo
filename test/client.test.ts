import { describe, expect, it } from "vitest";

import { fetchUser } from "../src/client.js";
import "./server.js";

describe("fetchUser", () => {
  it("fetches a user by id", async () => {
    await expect(fetchUser("42")).resolves.toEqual({ id: "42", name: "Ada" });
  });

  it("throws when the API response is not OK", async () => {
    await expect(fetchUser("missing")).rejects.toThrow(
      "Failed to fetch user: 404 Not Found",
    );
  });
});
