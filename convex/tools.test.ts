import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { AppErrorData } from "./lib/errors";
import { MAX_OWN_TOOLS } from "./lib/toolRules";
import type { ToolCategory, ToolCondition } from "./lib/validators";
import schema from "./schema";
import * as toolsModule from "./tools";

const modules = import.meta.glob("./**/*.ts");

const ALICE = { subject: "user_alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "user_bob", name: "Bob", email: "bob@example.com" };
const CAROL = { subject: "user_carol", name: "Carol", email: "carol@example.com" };

interface ToolArgs {
  name: string;
  category: ToolCategory;
  condition: ToolCondition;
  description: string;
}

const DRILL: ToolArgs = {
  name: "Drill",
  category: "power_tools",
  condition: "good",
  description: "Cordless, two batteries.",
};
const RAKE: ToolArgs = { name: "Rake", category: "garden", condition: "fair", description: "" };

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<AppErrorData>).data.code;
  }
  throw new Error("Expected promise to reject");
}

/** Fresh backend with Alice and Bob stored; Carol is stored and promoted to admin. */
async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity(ALICE);
  const bob = t.withIdentity(BOB);
  const carol = t.withIdentity(CAROL);
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  const carolId = await carol.mutation(api.users.store, {});
  await t.mutation(internal.users.setRole, { userId: carolId, role: "admin" });
  return { t, alice, bob, admin: carol, aliceId, bobId };
}

function getTool(t: ReturnType<typeof convexTest>, toolId: Id<"tools">) {
  return t.run((ctx) => ctx.db.get(toolId));
}

describe("tools.listPublic", () => {
  it("works signed out and returns only _id, name and category", async () => {
    const { t, alice } = await setup();
    await alice.mutation(api.tools.create, DRILL);
    const items = await t.query(api.tools.listPublic, {});
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]).sort()).toEqual(["_id", "category", "name"]);
    expect(items[0]).toMatchObject({ name: "Drill", category: "power_tools" });
  });

  it("excludes removed tools and sorts by name", async () => {
    const { t, alice, bob } = await setup();
    await alice.mutation(api.tools.create, { ...RAKE, name: "saw" });
    await bob.mutation(api.tools.create, RAKE);
    const drillId = await alice.mutation(api.tools.create, DRILL);
    await bob.mutation(api.tools.create, { ...DRILL, name: "Axe" });
    await alice.mutation(api.tools.remove, { toolId: drillId });
    const items = await t.query(api.tools.listPublic, {});
    expect(items.map((i) => i.name)).toEqual(["Axe", "Rake", "saw"]);
  });
});

describe("tools.list", () => {
  it("rejects signed-out callers and identities without a users row", async () => {
    const t = convexTest(schema, modules);
    expect(await errorCode(t.query(api.tools.list, {}))).toBe("UNAUTHENTICATED");
    expect(await errorCode(t.withIdentity(ALICE).query(api.tools.list, {}))).toBe(
      "UNAUTHENTICATED",
    );
  });

  it("returns all owners' tools with a public owner projection", async () => {
    const { alice, bob, aliceId, bobId } = await setup();
    await alice.mutation(api.tools.create, DRILL);
    await bob.mutation(api.tools.create, RAKE);
    const items = await bob.query(api.tools.list, {});
    expect(items.map((i) => i.name)).toEqual(["Drill", "Rake"]);
    for (const item of items) {
      expect(Object.keys(item.owner).sort()).toEqual(["_id", "isTrustedLender", "name"]);
      expect(item.owner.isTrustedLender).toBe(false);
      expect(item.availability).toBe("available");
    }
    expect(items[0]).toMatchObject({
      owner: { _id: aliceId, name: "Alice" },
      isMine: false,
      condition: "good",
      description: "Cordless, two batteries.",
    });
    expect(items[1]).toMatchObject({ owner: { _id: bobId, name: "Bob" }, isMine: true });
  });

  it("filters by category", async () => {
    const { alice, bob } = await setup();
    await alice.mutation(api.tools.create, DRILL);
    await bob.mutation(api.tools.create, RAKE);
    const garden = await alice.query(api.tools.list, { category: "garden" });
    expect(garden.map((i) => i.name)).toEqual(["Rake"]);
    expect(await alice.query(api.tools.list, { category: "kitchen" })).toEqual([]);
  });

  it("rejects an invalid category", async () => {
    const { alice } = await setup();
    await expect(
      alice.query(api.tools.list, { category: "furniture" as ToolCategory }),
    ).rejects.toThrow();
  });

  it("excludes removed tools", async () => {
    const { alice } = await setup();
    const toolId = await alice.mutation(api.tools.create, DRILL);
    await alice.mutation(api.tools.remove, { toolId });
    expect(await alice.query(api.tools.list, {})).toEqual([]);
  });
});

describe("tools.listMine", () => {
  it("rejects signed-out callers", async () => {
    const t = convexTest(schema, modules);
    expect(await errorCode(t.query(api.tools.listMine, {}))).toBe("UNAUTHENTICATED");
  });

  it("returns only the caller's active tools", async () => {
    const { alice, bob } = await setup();
    await alice.mutation(api.tools.create, DRILL);
    const removed = await alice.mutation(api.tools.create, { ...RAKE, name: "Old rake" });
    await alice.mutation(api.tools.remove, { toolId: removed });
    await bob.mutation(api.tools.create, RAKE);

    const mine = await alice.query(api.tools.listMine, {});
    expect(mine.map((i) => i.name)).toEqual(["Drill"]);
    expect(mine[0]).toMatchObject({ availability: "available", condition: "good" });
    expect(mine[0]).not.toHaveProperty("ownerId");

    const bobs = await bob.query(api.tools.listMine, {});
    expect(bobs.map((i) => i.name)).toEqual(["Rake"]);
  });
});

describe("tools.create", () => {
  it("rejects signed-out callers and inserts nothing", async () => {
    const { t } = await setup();
    expect(await errorCode(t.mutation(api.tools.create, DRILL))).toBe("UNAUTHENTICATED");
    expect(await t.run((ctx) => ctx.db.query("tools").collect())).toHaveLength(0);
  });

  it("sets the owner from the caller and trims text", async () => {
    const { t, alice, aliceId } = await setup();
    const toolId = await alice.mutation(api.tools.create, {
      ...DRILL,
      name: "  Drill  ",
      description: "  Cordless  ",
    });
    expect(await getTool(t, toolId)).toMatchObject({
      ownerId: aliceId,
      name: "Drill",
      description: "Cordless",
      category: "power_tools",
      condition: "good",
      isActive: true,
    });
  });

  it("rejects an ownerId argument", async () => {
    const { t, alice, bobId } = await setup();
    await expect(
      alice.mutation(api.tools.create, { ...DRILL, ownerId: bobId } as unknown as ToolArgs),
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("tools").collect())).toHaveLength(0);
  });

  it("enforces name and description lengths", async () => {
    const { alice } = await setup();
    for (const name of ["", " a ", "x".repeat(61)]) {
      expect(await errorCode(alice.mutation(api.tools.create, { ...DRILL, name }))).toBe(
        "INVALID_ARGUMENT",
      );
    }
    await alice.mutation(api.tools.create, { ...DRILL, name: "ab" });
    await alice.mutation(api.tools.create, { ...DRILL, name: "x".repeat(60) });
    expect(
      await errorCode(
        alice.mutation(api.tools.create, { ...DRILL, description: "d".repeat(501) }),
      ),
    ).toBe("INVALID_ARGUMENT");
    await alice.mutation(api.tools.create, { ...DRILL, description: "" });
  });

  it("rejects an invalid category or condition", async () => {
    const { t, alice } = await setup();
    await expect(
      alice.mutation(api.tools.create, { ...DRILL, category: "furniture" as ToolCategory }),
    ).rejects.toThrow();
    await expect(
      alice.mutation(api.tools.create, { ...DRILL, condition: "new" as ToolCondition }),
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("tools").collect())).toHaveLength(0);
  });
});

describe("tools.update", () => {
  const CHANGES: ToolArgs = {
    name: " Hammer drill ",
    category: "hand_tools",
    condition: "worn",
    description: "Updated",
  };

  it("lets the owner replace the fields without touching owner or isActive", async () => {
    const { t, alice, aliceId } = await setup();
    const toolId = await alice.mutation(api.tools.create, DRILL);
    await alice.mutation(api.tools.update, { toolId, ...CHANGES });
    expect(await getTool(t, toolId)).toMatchObject({
      ownerId: aliceId,
      isActive: true,
      name: "Hammer drill",
      category: "hand_tools",
      condition: "worn",
      description: "Updated",
    });
  });

  it("rejects non-owners, including admins", async () => {
    const { t, alice, bob, admin } = await setup();
    const toolId = await alice.mutation(api.tools.create, DRILL);
    expect(await errorCode(bob.mutation(api.tools.update, { toolId, ...CHANGES }))).toBe(
      "FORBIDDEN",
    );
    expect(await errorCode(admin.mutation(api.tools.update, { toolId, ...CHANGES }))).toBe(
      "FORBIDDEN",
    );
    expect(await getTool(t, toolId)).toMatchObject({ name: "Drill", category: "power_tools" });
  });

  it("rejects signed-out callers and removed tools", async () => {
    const { t, alice } = await setup();
    const toolId = await alice.mutation(api.tools.create, DRILL);
    expect(await errorCode(t.mutation(api.tools.update, { toolId, ...CHANGES }))).toBe(
      "UNAUTHENTICATED",
    );
    await alice.mutation(api.tools.remove, { toolId });
    expect(await errorCode(alice.mutation(api.tools.update, { toolId, ...CHANGES }))).toBe(
      "NOT_FOUND",
    );
  });

  it("applies the same validation as create", async () => {
    const { t, alice } = await setup();
    const toolId = await alice.mutation(api.tools.create, DRILL);
    expect(
      await errorCode(alice.mutation(api.tools.update, { toolId, ...CHANGES, name: "a" })),
    ).toBe("INVALID_ARGUMENT");
    expect(
      await errorCode(
        alice.mutation(api.tools.update, { toolId, ...CHANGES, description: "d".repeat(501) }),
      ),
    ).toBe("INVALID_ARGUMENT");
    expect((await getTool(t, toolId))?.name).toBe("Drill");
  });
});

describe("tools.remove", () => {
  it("soft-deletes the owner's tool; a second remove is NOT_FOUND", async () => {
    const { t, alice, aliceId } = await setup();
    const toolId = await alice.mutation(api.tools.create, DRILL);
    expect(await getTool(t, toolId)).not.toHaveProperty("removedBy");
    await alice.mutation(api.tools.remove, { toolId });
    const removed = await getTool(t, toolId);
    expect(removed).toMatchObject({ isActive: false, name: "Drill", removedBy: aliceId });
    expect(typeof removed?.removedAt).toBe("number");
    expect(await errorCode(alice.mutation(api.tools.remove, { toolId }))).toBe("NOT_FOUND");
  });

  it("rejects non-owners (including admins) and signed-out callers", async () => {
    const { t, alice, bob, admin } = await setup();
    const toolId = await alice.mutation(api.tools.create, DRILL);
    expect(await errorCode(bob.mutation(api.tools.remove, { toolId }))).toBe("FORBIDDEN");
    expect(await errorCode(admin.mutation(api.tools.remove, { toolId }))).toBe("FORBIDDEN");
    expect(await errorCode(t.mutation(api.tools.remove, { toolId }))).toBe("UNAUTHENTICATED");
    expect((await getTool(t, toolId))?.isActive).toBe(true);
  });

  it("returns NOT_FOUND for an unknown tool", async () => {
    const { t, alice } = await setup();
    const toolId = await alice.mutation(api.tools.create, DRILL);
    await t.run((ctx) => ctx.db.delete(toolId));
    expect(await errorCode(alice.mutation(api.tools.remove, { toolId }))).toBe("NOT_FOUND");
  });
});

describe("authorization edge cases", () => {
  const BAD_INPUT: ToolArgs = { ...DRILL, name: "a" };

  it("checks auth and ownership before validating input", async () => {
    const { t, alice, bob } = await setup();
    const toolId = await alice.mutation(api.tools.create, DRILL);
    expect(await errorCode(t.mutation(api.tools.update, { toolId, ...BAD_INPUT }))).toBe(
      "UNAUTHENTICATED",
    );
    expect(await errorCode(bob.mutation(api.tools.update, { toolId, ...BAD_INPUT }))).toBe(
      "FORBIDDEN",
    );
  });

  it("returns NOT_FOUND (not FORBIDDEN) to non-owners for a removed tool", async () => {
    const { alice, bob, admin } = await setup();
    const toolId = await alice.mutation(api.tools.create, DRILL);
    await alice.mutation(api.tools.remove, { toolId });
    for (const caller of [bob, admin]) {
      expect(await errorCode(caller.mutation(api.tools.remove, { toolId }))).toBe("NOT_FOUND");
      expect(await errorCode(caller.mutation(api.tools.update, { toolId, ...DRILL }))).toBe(
        "NOT_FOUND",
      );
    }
  });

  it("returns NOT_FOUND on update of an unknown tool", async () => {
    const { t, alice } = await setup();
    const toolId = await alice.mutation(api.tools.create, DRILL);
    await t.run((ctx) => ctx.db.delete(toolId));
    expect(await errorCode(alice.mutation(api.tools.update, { toolId, ...DRILL }))).toBe(
      "NOT_FOUND",
    );
  });

  it("rejects identities without a users row on every guarded function", async () => {
    const { alice } = await setup();
    const toolId = await alice.mutation(api.tools.create, DRILL);
    const ghost = convexTest(schema, modules).withIdentity({ subject: "user_ghost" });
    expect(await errorCode(ghost.query(api.tools.listMine, {}))).toBe("UNAUTHENTICATED");
    expect(await errorCode(ghost.mutation(api.tools.create, DRILL))).toBe("UNAUTHENTICATED");
    // separate backend: the tool id is unknown there, but auth fails first
    expect(await errorCode(ghost.mutation(api.tools.update, { toolId, ...DRILL }))).toBe(
      "UNAUTHENTICATED",
    );
    expect(await errorCode(ghost.mutation(api.tools.remove, { toolId }))).toBe(
      "UNAUTHENTICATED",
    );
  });

  it("rejects ownerId / isActive args and invalid enums on update", async () => {
    const { t, alice, aliceId, bobId } = await setup();
    const toolId = await alice.mutation(api.tools.create, DRILL);
    type UpdateArgs = ToolArgs & { toolId: Id<"tools"> };
    await expect(
      alice.mutation(api.tools.update, {
        toolId,
        ...DRILL,
        ownerId: bobId,
      } as unknown as UpdateArgs),
    ).rejects.toThrow();
    await expect(
      alice.mutation(api.tools.update, {
        toolId,
        ...DRILL,
        isActive: false,
      } as unknown as UpdateArgs),
    ).rejects.toThrow();
    await expect(
      alice.mutation(api.tools.update, {
        toolId,
        ...DRILL,
        category: "furniture" as ToolCategory,
      }),
    ).rejects.toThrow();
    await expect(
      alice.mutation(api.tools.update, { toolId, ...DRILL, condition: "new" as ToolCondition }),
    ).rejects.toThrow();
    expect(await getTool(t, toolId)).toMatchObject({
      ownerId: aliceId,
      isActive: true,
      category: "power_tools",
    });
  });

  it("caps active listings per owner; removing one frees a slot", async () => {
    const { t, alice, aliceId } = await setup();
    const ids = await t.run(async (ctx) => {
      const out: Id<"tools">[] = [];
      for (let i = 0; i < MAX_OWN_TOOLS; i++) {
        out.push(
          await ctx.db.insert("tools", {
            ownerId: aliceId,
            name: `Tool ${i}`,
            category: "other",
            condition: "good",
            description: "",
            isActive: true,
          }),
        );
      }
      return out;
    });
    expect(await errorCode(alice.mutation(api.tools.create, DRILL))).toBe("INVALID_ARGUMENT");
    await alice.mutation(api.tools.remove, { toolId: ids[0] });
    await alice.mutation(api.tools.create, DRILL);
  });
});

describe("API surface", () => {
  it("exposes exactly the six tool functions", () => {
    // `api` is a runtime Proxy, so the check uses the module's exports.
    expect(Object.keys(toolsModule).sort()).toEqual(
      ["create", "list", "listMine", "listPublic", "remove", "update"].sort(),
    );
  });
});
