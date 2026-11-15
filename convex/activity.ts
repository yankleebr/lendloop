import { v } from "convex/values";
import { query } from "./_generated/server";
import { activityItemValidator, loadLoanActivity, toActivityItem } from "./lib/activity";
import { requireUser } from "./lib/auth";
import { forbidden, notFound } from "./lib/errors";

/**
 * Automation activity of one loan, newest first, for its borrower or lender only
 * (admins use admin.loanActivity). One subscription per card, so a log write
 * re-runs only the card it belongs to.
 */
export const forLoan = query({
  args: { loanId: v.id("loans") },
  returns: v.array(activityItemValidator),
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) notFound("Loan not found.");
    const viewer =
      loan.borrowerId === me._id ? "borrower" : loan.lenderId === me._id ? "lender" : null;
    if (viewer === null) forbidden("You can't see this loan's activity.");
    const logs = await loadLoanActivity(ctx, loanId);
    return logs.map((log) => toActivityItem(log, loan, viewer));
  },
});
