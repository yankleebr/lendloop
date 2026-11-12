import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { invalidArgument } from "./lib/errors";
import {
  deactivateTool,
  getAvailability,
  normalizeToolInput,
  requireOwnedActiveTool,
} from "./lib/tools";
import { MAX_BOARD_TOOLS, MAX_OWN_TOOLS } from "./lib/toolRules";
import { publicUser, publicUserValidator, type PublicUser } from "./lib/users";
import {
  availabilityValidator,
  toolCategoryValidator,
  toolConditionValidator,
  type ToolCategory,
} from "./lib/validators";

const MISSING_OWNER_NAME = "Neighbor";

const toolFieldsArgs = {
  name: v.string(),
  category: toolCategoryValidator,
  condition: toolConditionValidator,
  description: v.string(),
};

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** Active tools on the board, optionally narrowed to one category (index range, no .filter). */
async function activeBoardTools(
  ctx: QueryCtx,
  category?: ToolCategory,
): Promise<Doc<"tools">[]> {
  return await ctx.db
    .query("tools")
    .withIndex("by_active_category", (q) =>
      category === undefined
        ? q.eq("isActive", true)
        : q.eq("isActive", true).eq("category", category),
    )
    .take(MAX_BOARD_TOOLS);
}

/** Public board for visitors: only `_id`, name and category of active, available tools. */
export const listPublic = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("tools"),
      name: v.string(),
      category: toolCategoryValidator,
    }),
  ),
  handler: async (ctx) => {
    const tools = await activeBoardTools(ctx);
    const availability = await Promise.all(tools.map((tool) => getAvailability(ctx, tool)));
    return tools
      .filter((_, i) => availability[i] === "available")
      .map((tool) => ({ _id: tool._id, name: tool.name, category: tool.category }))
      .sort(byName);
  },
});

/** All active tools for signed-in users, with owner projection and availability. */
export const list = query({
  args: { category: v.optional(toolCategoryValidator) },
  returns: v.array(
    v.object({
      _id: v.id("tools"),
      name: v.string(),
      category: toolCategoryValidator,
      condition: toolConditionValidator,
      description: v.string(),
      owner: publicUserValidator,
      isMine: v.boolean(),
      availability: availabilityValidator,
    }),
  ),
  handler: async (ctx, { category }) => {
    const me = await requireUser(ctx);
    const tools = await activeBoardTools(ctx, category);

    const ownerIds = [...new Set(tools.map((tool) => tool.ownerId))];
    const owners = new Map<Id<"users">, PublicUser>();
    await Promise.all(
      ownerIds.map(async (id) => {
        const owner = await ctx.db.get(id);
        owners.set(id, owner ? publicUser(owner) : { _id: id, name: MISSING_OWNER_NAME });
      }),
    );

    const items = await Promise.all(
      tools.map(async (tool) => ({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        owner: owners.get(tool.ownerId)!,
        isMine: tool.ownerId === me._id,
        availability: await getAvailability(ctx, tool),
      })),
    );
    return items.sort(byName);
  },
});

/** The caller's own active listings. */
export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("tools"),
      _creationTime: v.number(),
      name: v.string(),
      category: toolCategoryValidator,
      condition: toolConditionValidator,
      description: v.string(),
      availability: availabilityValidator,
    }),
  ),
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner_active", (q) => q.eq("ownerId", me._id).eq("isActive", true))
      .take(MAX_OWN_TOOLS);

    const items = await Promise.all(
      tools.map(async (tool) => ({
        _id: tool._id,
        _creationTime: tool._creationTime,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        availability: await getAvailability(ctx, tool),
      })),
    );
    return items.sort(byName);
  },
});

/** Creates a listing owned by the caller. The owner is never an argument. */
export const create = mutation({
  args: toolFieldsArgs,
  returns: v.id("tools"),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const fields = normalizeToolInput(args);
    // Write-side cap: keeps listMine complete and stops one account from flooding the board.
    const active = await ctx.db
      .query("tools")
      .withIndex("by_owner_active", (q) => q.eq("ownerId", me._id).eq("isActive", true))
      .take(MAX_OWN_TOOLS);
    if (active.length >= MAX_OWN_TOOLS) {
      invalidArgument(`You can have at most ${MAX_OWN_TOOLS} active listings.`);
    }
    return await ctx.db.insert("tools", {
      ownerId: me._id,
      name: fields.name,
      category: fields.category,
      condition: fields.condition,
      description: fields.description,
      isActive: true,
    });
  },
});

/** Replaces the editable fields of one of the caller's active listings. */
export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFieldsArgs },
  returns: v.null(),
  handler: async (ctx, { toolId, ...args }) => {
    const me = await requireUser(ctx);
    await requireOwnedActiveTool(ctx, me, toolId);
    const fields = normalizeToolInput(args);
    await ctx.db.patch(toolId, {
      name: fields.name,
      category: fields.category,
      condition: fields.condition,
      description: fields.description,
    });
    return null;
  },
});

/** Removes (soft-deletes) one of the caller's active listings. */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, { toolId }) => {
    const me = await requireUser(ctx);
    const tool = await requireOwnedActiveTool(ctx, me, toolId);
    await deactivateTool(ctx, tool);
    return null;
  },
});
