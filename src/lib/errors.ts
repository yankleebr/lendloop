import { ConvexError } from "convex/values";
import type { AppErrorData } from "../../convex/lib/errors";

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** User-facing message for an error thrown by a Convex function. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as Partial<AppErrorData> | undefined;
    if (typeof data?.message === "string") return data.message;
  }
  return GENERIC_ERROR_MESSAGE;
}
