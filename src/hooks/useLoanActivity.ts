"use client";

import { useMemo } from "react";
import { useQueries } from "convex/react";
import { getFunctionName, makeFunctionReference, type FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type ActivityQuery = typeof api.activity.forLoan | typeof api.admin.loanActivity;

/**
 * One loan's activity. Errors come back as an `Error` value instead of being
 * thrown (useQueries), so a failing widget never replaces the whole page.
 */
export function useLoanActivity<Q extends ActivityQuery>(
  query: Q,
  loanId: Id<"loans">,
): FunctionReturnType<Q> | undefined | Error {
  // `api.x.y` is a Proxy that returns a new object on every access, so memoize on
  // the function name: useQueries re-subscribes (setState in render) whenever the
  // queries object changes identity, which would loop on every render.
  const name = getFunctionName(query);
  const queries = useMemo(
    () => ({ activity: { query: makeFunctionReference<"query">(name), args: { loanId } } }),
    [name, loanId],
  );
  return useQueries(queries).activity as FunctionReturnType<Q> | undefined | Error;
}
