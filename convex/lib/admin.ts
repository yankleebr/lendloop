import type { NamedTableInfo, OrderedQuery, PaginationOptions } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { ADMIN_PAGE_MAX, ADMIN_PAGE_SIZE } from "./adminRules";
import { roleValidator, type AdminLoanFilter } from "./validators";

type LoansQuery = OrderedQuery<NamedTableInfo<DataModel, "loans">>;

/**
 * Ordered loans query for an admin filter — always an index range, never `.filter`:
 * - `all`: newest request first (`by_creation_time`)
 * - a status: newest request first within that status (`by_status`)
 * - `overdue`: approved with `endDate < today`, most overdue first (`by_status_end`,
 *   same range as `listOverdue`)
 */
export function adminLoansQuery(
  ctx: QueryCtx,
  filter: AdminLoanFilter,
  today: string,
): LoansQuery {
  const loans = ctx.db.query("loans");
  if (filter === "all") return loans.order("desc");
  if (filter === "overdue") {
    return loans
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", today))
      .order("asc");
  }
  return loans.withIndex("by_status", (q) => q.eq("status", filter)).order("desc");
}

/**
 * Clamps the client-controlled page size to 1..ADMIN_PAGE_MAX (NaN → default).
 * `cursor` / `endCursor` are kept: usePaginatedQuery needs them to pin page bounds.
 */
export function clampPage(opts: PaginationOptions): PaginationOptions {
  const requested = Number.isFinite(opts.numItems) ? Math.floor(opts.numItems) : ADMIN_PAGE_SIZE;
  return { ...opts, numItems: Math.max(1, Math.min(requested, ADMIN_PAGE_MAX)) };
}

/** Admin view of a user — never email, never tokenIdentifier. */
export const adminUserItemValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  name: v.string(),
  role: roleValidator,
  isTrustedLender: v.boolean(),
  isMe: v.boolean(),
});

export function toAdminUserItem(user: Doc<"users">, me: Doc<"users">) {
  return {
    _id: user._id,
    _creationTime: user._creationTime,
    name: user.name,
    role: user.role,
    isTrustedLender: user.isTrustedLender,
    isMe: user._id === me._id,
  };
}
