import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

describe("whoami.get", () => {
  it("returns null when unauthenticated", async () => {
    const t = convexTest(undefined, modules);
    expect(await t.query(api.whoami.get, {})).toBeNull();
  });

  it("returns only the projected identity fields", async () => {
    const t = convexTest(undefined, modules);
    const alice = t.withIdentity({
      subject: "user_alice",
      name: "Alice",
      email: "alice@example.com",
    });
    expect(await alice.query(api.whoami.get, {})).toEqual({
      subject: "user_alice",
      name: "Alice",
      email: "alice@example.com",
    });
  });

  it("returns null for missing optional fields", async () => {
    const t = convexTest(undefined, modules);
    const bob = t.withIdentity({ subject: "user_bob" });
    expect(await bob.query(api.whoami.get, {})).toEqual({
      subject: "user_bob",
      name: null,
      email: null,
    });
  });
});
