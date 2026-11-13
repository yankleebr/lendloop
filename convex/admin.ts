import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { adminLoansQuery, adminUserItemValidator, clampPage, toAdminUserItem } from "./lib/admin";
import { requireAdmin } from "./lib/auth";
import { parseIsoDate } from "./lib/dates";
import { notFound } from "./lib/errors";
import { loadLoanRefs, loanItemFields, toLoanItem } from "./lib/loans";
import { deactivateTool } from "./lib/tools";
import { publicUserValidator } from "./lib/users";
import { adminLoanFilterValidator } from "./lib/validators";

// Every handler starts with requireAdmin (UNAUTHENTICATED / FORBIDDEN before any read).

/**
 * Removes any active listing. Same loan rules as the owner's `tools.remove`
 * (CONFLICT while an approved loan exists; pending requests auto-rejected).
 */
export const removeTool = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, { toolId }) => {
    const admin = await requireAdmin(ctx);
    const tool = await ctx.db.get(toolId);
    if (tool === null || !tool.isActive) notFound("Tool not found.");
    await deactivateTool(ctx, tool, admin._id);
    console.log(`admin.removeTool: ${toolId} by ${admin._id}`);
    return null;
  },
});

/** All loans, paginated, filtered by status or overdue; both parties as publicUser. */
export const listLoans = query({
  args: {
    filter: adminLoanFilterValidator,
    today: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({ ...loanItemFields, borrower: publicUserValidator, lender: publicUserValidator }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const today = parseIsoDate(args.today, "Today");
    const result = await adminLoansQuery(ctx, args.filter, today).paginate(
      clampPage(args.paginationOpts),
    );
    const { tools, users } = await loadLoanRefs(ctx, result.page);
    return {
      ...result,
      page: result.page.map((loan) => ({
        ...toLoanItem(loan, tools.get(loan.toolId)!, today),
        borrower: users.get(loan.borrowerId)!,
        lender: users.get(loan.lenderId)!,
      })),
    };
  },
});

/** All stored users, newest first, paginated. No email, no tokenIdentifier. */
export const listUsers = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(adminUserItemValidator),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const result = await ctx.db
      .query("users")
      .order("desc")
      .paginate(clampPage(args.paginationOpts));
    return { ...result, page: result.page.map((user) => toAdminUserItem(user, admin)) };
  },
});

/** Sets (not toggles) the Trusted Lender flag — idempotent. Never touches `role`. */
export const setTrustedLender = mutation({
  args: { userId: v.id("users"), isTrusted: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, isTrusted }) => {
    const admin = await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (user === null) notFound("User not found.");
    if (user.isTrustedLender !== isTrusted) {
      await ctx.db.patch(userId, { isTrustedLender: isTrusted });
      console.log(`admin.setTrustedLender: ${userId} -> ${isTrusted} by ${admin._id}`);
    }
    return null;
  },
});
