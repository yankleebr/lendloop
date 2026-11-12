import { ConvexError } from "convex/values";

export type AppErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND";

/**
 * Payload of every expected application error. `message` is shown to the user.
 * A type alias (not an interface) so it satisfies Convex's `Value` constraint.
 */
export type AppErrorData = {
  code: AppErrorCode;
  message: string;
};

function appError(code: AppErrorCode, message: string): never {
  throw new ConvexError<AppErrorData>({ code, message });
}

export function unauthenticated(message = "Please sign in to continue."): never {
  return appError("UNAUTHENTICATED", message);
}

export function forbidden(message = "You are not allowed to do this."): never {
  return appError("FORBIDDEN", message);
}

export function notFound(message = "Not found."): never {
  return appError("NOT_FOUND", message);
}
