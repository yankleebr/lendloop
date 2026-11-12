import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { parseIsoDate, utcToday } from "./dates";
import { forbidden, invalidArgument, notFound } from "./errors";
import { closeLoansForRemovedTool } from "./loans";
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
 * Single path for removing a listing (soft delete); the admin spec reuses it.
 * Blocked (CONFLICT) while the tool has an approved loan; otherwise its
 * pending requests are auto-rejected (`tool_removed`) in the same transaction.
 */
export async function deactivateTool(ctx: MutationCtx, tool: Doc<"tools">): Promise<void> {
  await closeLoansForRemovedTool(ctx, tool._id);
  await ctx.db.patch(tool._id, { isActive: false });
}

/**
 * Derived from loans at read time: `on_loan` when an approved loan has
 * started (`startDate <= today`) — overdue loans included, since the tool is
 * still with the borrower. Future approved loans and pending requests don't count.
 */
export async function getAvailability(
  ctx: QueryCtx,
  tool: Doc<"tools">,
  today: string,
): Promise<Availability> {
  const started = await ctx.db
    .query("loans")
    .withIndex("by_tool_status_start", (q) =>
      q.eq("toolId", tool._id).eq("status", "approved").lte("startDate", today),
    )
    .first();
  return started === null ? "available" : "on_loan";
}

/**
 * The caller's "today" for availability. Clients pass their local day; the
 * fallback (server UTC) only keeps older clients working, so `Date.now()` is
 * read only when the argument is missing.
 */
export function resolveToday(today: string | undefined): string {
  return today === undefined ? utcToday(Date.now()) : parseIsoDate(today, "Today");
}
