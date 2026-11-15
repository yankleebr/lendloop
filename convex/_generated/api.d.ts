/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as admin from "../admin.js";
import type * as http from "../http.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_admin from "../lib/admin.js";
import type * as lib_adminRules from "../lib/adminRules.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_automationRules from "../lib/automationRules.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_hmac from "../lib/hmac.js";
import type * as lib_inbound from "../lib/inbound.js";
import type * as lib_loanRules from "../lib/loanRules.js";
import type * as lib_loans from "../lib/loans.js";
import type * as lib_notifications from "../lib/notifications.js";
import type * as lib_reminders from "../lib/reminders.js";
import type * as lib_toolRules from "../lib/toolRules.js";
import type * as lib_tools from "../lib/tools.js";
import type * as lib_users from "../lib/users.js";
import type * as lib_validators from "../lib/validators.js";
import type * as loans from "../loans.js";
import type * as notifications from "../notifications.js";
import type * as reminders from "../reminders.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  admin: typeof admin;
  http: typeof http;
  "lib/activity": typeof lib_activity;
  "lib/admin": typeof lib_admin;
  "lib/adminRules": typeof lib_adminRules;
  "lib/auth": typeof lib_auth;
  "lib/automationRules": typeof lib_automationRules;
  "lib/dates": typeof lib_dates;
  "lib/errors": typeof lib_errors;
  "lib/hmac": typeof lib_hmac;
  "lib/inbound": typeof lib_inbound;
  "lib/loanRules": typeof lib_loanRules;
  "lib/loans": typeof lib_loans;
  "lib/notifications": typeof lib_notifications;
  "lib/reminders": typeof lib_reminders;
  "lib/toolRules": typeof lib_toolRules;
  "lib/tools": typeof lib_tools;
  "lib/users": typeof lib_users;
  "lib/validators": typeof lib_validators;
  loans: typeof loans;
  notifications: typeof notifications;
  reminders: typeof reminders;
  tools: typeof tools;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
