import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { AppErrorData } from "./lib/errors";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ALICE = { subject: "user_alice", name: "Alice", email: "alice@example.com" };

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<AppErrorData>).data.code;
  }
  throw new Error("Expected promise to reject");
}

describe("users.store", () => {
  it("rejects unauthenticated callers and inserts nothing", async () => {
    const t = convexTest(schema, modules);
    expect(await errorCode(t.mutation(api.users.store, {}))).toBe("UNAUTHENTICATED");
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(0);
  });

  it("creates one row with default role and trust on first call", async () => {
    const t = convexTest(schema, modules);
    const id = await t.withIdentity(ALICE).mutation(api.users.store, {});
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({
      tokenIdentifier: "https://convex.test|user_alice",
      name: "Alice",
      email: "alice@example.com",
      role: "user",
      isTrustedLender: false,
    });
  });

  // convex-test serializes mutations (no OCC conflicts), so this covers repeated calls only.
  // Concurrent safety in production relies on Convex OCC (the by_token read conflicts with
  // a concurrent insert, forcing a retry) and was verified manually with two tabs in DEV.
  it("is idempotent across repeated calls", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity(ALICE);
    const first = await alice.mutation(api.users.store, {});
    const second = await alice.mutation(api.users.store, {});
    const [third, fourth] = await Promise.all([
      alice.mutation(api.users.store, {}),
      alice.mutation(api.users.store, {}),
    ]);
    expect(new Set([first, second, third, fourth])).toEqual(new Set([first]));
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
  });

  it("syncs name/email but preserves role and isTrustedLender", async () => {
    const t = convexTest(schema, modules);
    const id = await t.withIdentity(ALICE).mutation(api.users.store, {});
    await t.run((ctx) => ctx.db.patch(id, { role: "admin", isTrustedLender: true }));

    await t
      .withIdentity({ ...ALICE, name: "Alice B.", email: "alice.b@example.com" })
      .mutation(api.users.store, {});

    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({
      name: "Alice B.",
      email: "alice.b@example.com",
      role: "admin",
      isTrustedLender: true,
    });
  });

  it("falls back to a default name and omits a missing email", async () => {
    const t = convexTest(schema, modules);
    const id = await t.withIdentity({ subject: "user_bob" }).mutation(api.users.store, {});
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.name).toBe("Neighbor");
    expect(row).not.toHaveProperty("email");
  });

  it("rejects extra args such as a role", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity(ALICE);
    const id = await alice.mutation(api.users.store, {});
    await expect(
      alice.mutation(api.users.store, { role: "admin" } as unknown as Record<string, never>),
    ).rejects.toThrow();
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.role).toBe("user");
  });

  it("binds rows to the issuer, not only the subject", async () => {
    const t = convexTest(schema, modules);
    const devAlice = await t.withIdentity(ALICE).mutation(api.users.store, {});
    const otherIssuerAlice = t.withIdentity({ ...ALICE, issuer: "https://other.test" });
    expect(await otherIssuerAlice.query(api.users.current, {})).toBeNull();
    const otherId = await otherIssuerAlice.mutation(api.users.store, {});
    expect(otherId).not.toBe(devAlice);
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows.map((r) => r.tokenIdentifier).sort()).toEqual([
      "https://convex.test|user_alice",
      "https://other.test|user_alice",
    ]);
  });

  it("creates separate rows for different subjects", async () => {
    const t = convexTest(schema, modules);
    const a = await t.withIdentity(ALICE).mutation(api.users.store, {});
    const b = await t.withIdentity({ subject: "user_bob" }).mutation(api.users.store, {});
    expect(a).not.toBe(b);
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(2);
  });
});

describe("users.current", () => {
  it("returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.users.current, {})).toBeNull();
  });

  it("returns null before the row is stored", async () => {
    const t = convexTest(schema, modules);
    expect(await t.withIdentity(ALICE).query(api.users.current, {})).toBeNull();
  });

  it("returns the projection without tokenIdentifier after store", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity(ALICE);
    const id = await alice.mutation(api.users.store, {});
    expect(await alice.query(api.users.current, {})).toEqual({
      _id: id,
      name: "Alice",
      email: "alice@example.com",
      role: "user",
      isTrustedLender: false,
    });
  });

  it("returns only the caller's own row", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(ALICE).mutation(api.users.store, {});
    const bob = t.withIdentity({ subject: "user_bob", name: "Bob" });
    const bobId = await bob.mutation(api.users.store, {});
    expect((await bob.query(api.users.current, {}))?._id).toBe(bobId);
  });
});

describe("users.setRole (internal)", () => {
  it("promotes and demotes a user", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity(ALICE);
    const userId = await alice.mutation(api.users.store, {});

    await t.mutation(internal.users.setRole, { userId, role: "admin" });
    expect((await alice.query(api.users.current, {}))?.role).toBe("admin");

    await t.mutation(internal.users.setRole, { userId, role: "user" });
    expect((await alice.query(api.users.current, {}))?.role).toBe("user");
  });

  it("throws NOT_FOUND for a deleted user", async () => {
    const t = convexTest(schema, modules);
    const userId: Id<"users"> = await t.withIdentity(ALICE).mutation(api.users.store, {});
    await t.run((ctx) => ctx.db.delete(userId));
    expect(
      await errorCode(t.mutation(internal.users.setRole, { userId, role: "admin" })),
    ).toBe("NOT_FOUND");
  });

  it("is not exposed on the public api (compile-time check)", () => {
    // `api` is a runtime Proxy, so this is enforced by TypeScript (`npm run build` / tsc):
    // if setRole ever became public, this directive would be unused and fail type-checking.
    // @ts-expect-error setRole is only available on `internal.users`
    expect(api.users.setRole).toBeDefined();
    expect(internal.users.setRole).toBeDefined();
  });
});
