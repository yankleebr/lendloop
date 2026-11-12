import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { forbidden, invalidArgument, notFound } from "./errors";
import { TOOL_DESCRIPTION_MAX, TOOL_NAME_MAX, TOOL_NAME_MIN } from "./toolRules";
import type { Availability } from "./validators";

export interface ToolTextInput {
  name: string;
  description: string;
}

/**
 * Trims name/description and enforces length rules. Lengths are JS string
 * lengths (UTF-16 code units), so an emoji may count as 2.
 */
export function normalizeToolInput<T extends ToolTextInput>(input: T): T {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < TOOL_NAME_MIN || name.length > TOOL_NAME_MAX) {
    invalidArgument(
      `Tool name must be between ${TOOL_NAME_MIN} and ${TOOL_NAME_MAX} characters.`,
    );
  }
  if (description.length > TOOL_DESCRIPTION_MAX) {
    invalidArgument(`Description must be at most ${TOOL_DESCRIPTION_MAX} characters.`);
  }
  return { ...input, name, description };
}

/** Loads an active tool owned by `me`; NOT_FOUND if missing/removed, FORBIDDEN if not the owner. */
export async function requireOwnedActiveTool(
  ctx: QueryCtx,
  me: Doc<"users">,
  toolId: Id<"tools">,
): Promise<Doc<"tools">> {
  const tool = await ctx.db.get(toolId);
  if (tool === null || !tool.isActive) notFound("Tool not found.");
  if (tool.ownerId !== me._id) forbidden("You can only change your own listings.");
  return tool;
}

/**
 * Single path for removing a listing (soft delete). The loans spec adds its
 * rules here (e.g. block during an approved loan); the admin spec reuses it.
 */
export async function deactivateTool(ctx: MutationCtx, tool: Doc<"tools">): Promise<void> {
  await ctx.db.patch(tool._id, { isActive: false });
}

/**
 * Availability is derived from loans at read time. Loans don't exist yet,
 * so every active tool is available; the loans spec changes only this helper.
 */
export async function getAvailability(
  ctx: QueryCtx,
  tool: Doc<"tools">,
): Promise<Availability> {
  void ctx;
  void tool;
  return "available";
}
