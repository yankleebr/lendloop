import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { getCurrentUser, requireAdmin, requireUser } from "./auth";
import type { AppErrorData } from "./errors";

const modules = import.meta.glob("../**/*.ts");

const ALICE = { subject: "user_alice", name: "Alice", email: "alice@example.com" };

async function appError(promise: Promise<unknown>): Promise<AppErrorData> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<AppErrorData>).data;
  }
  throw new Error("Expected promise to reject");
}

describe("getCurrentUser", () => {
  it("returns null without identity", async () => {
    const t = convexTest(schema, modules);
    expect(await t.run((ctx) => getCurrentUser(ctx))).toBeNull();
  });

  it("returns null when the identity has no row", async () => {
    const t = convexTest(schema, modules);
    expect(await t.withIdentity(ALICE).run((ctx) => getCurrentUser(ctx))).toBeNull();
  });

  it("returns the stored doc", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity(ALICE);
    const id = await alice.mutation(api.users.store, {});
    expect((await alice.run((ctx) => getCurrentUser(ctx)))?._id).toBe(id);
  });
});

describe("requireUser", () => {
  it("throws UNAUTHENTICATED without identity", async () => {
    const t = convexTest(schema, modules);
    const data = await appError(t.run((ctx) => requireUser(ctx)));
    expect(data.code).toBe("UNAUTHENTICATED");
    expect(data.message).toMatch(/sign in/i);
  });

  it("throws UNAUTHENTICATED when the row is not stored yet", async () => {
    const t = convexTest(schema, modules);
    const data = await appError(t.withIdentity(ALICE).run((ctx) => requireUser(ctx)));
    expect(data.code).toBe("UNAUTHENTICATED");
    expect(data.message).toMatch(/still being set up/i);
  });

  it("returns the stored doc", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity(ALICE);
    const id = await alice.mutation(api.users.store, {});
    expect((await alice.run((ctx) => requireUser(ctx)))._id).toBe(id);
  });
});

describe("requireAdmin", () => {
  it("throws UNAUTHENTICATED without identity", async () => {
    const t = convexTest(schema, modules);
    expect((await appError(t.run((ctx) => requireAdmin(ctx)))).code).toBe("UNAUTHENTICATED");
  });

  it("throws FORBIDDEN for a regular user", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity(ALICE);
    await alice.mutation(api.users.store, {});
    expect((await appError(alice.run((ctx) => requireAdmin(ctx)))).code).toBe("FORBIDDEN");
  });

  it("returns the doc for an admin", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity(ALICE);
    const id = await alice.mutation(api.users.store, {});
    await t.run((ctx) => ctx.db.patch(id, { role: "admin" }));
    expect((await alice.run((ctx) => requireAdmin(ctx)))._id).toBe(id);
  });

  it("rejects an admin immediately after demotion", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity(ALICE);
    const userId = await alice.mutation(api.users.store, {});
    await t.mutation(internal.users.setRole, { userId, role: "admin" });
    expect((await alice.run((ctx) => requireAdmin(ctx)))._id).toBe(userId);

    await t.mutation(internal.users.setRole, { userId, role: "user" });
    expect((await appError(alice.run((ctx) => requireAdmin(ctx)))).code).toBe("FORBIDDEN");
  });
});
