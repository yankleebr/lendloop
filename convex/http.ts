// HTTP endpoints for n8n (Workflow 2). Machine-to-machine only: no CORS, no
// Clerk identity. Every request is HMAC-verified with N8N_INBOUND_SECRET before
// its body is parsed. See context/features/overdue-reminders.md.

import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { utcToday } from "./lib/dates";
import {
  badRequest,
  conflict,
  internalError,
  jsonResponse,
  methodNotAllowed,
  notFound,
  readSignedJson,
} from "./lib/inbound";
import { parseOverdueListRequest, parseReminderReport } from "./lib/reminders";

const OVERDUE_LOANS_PATH = "/n8n/v1/overdue-loans";
const REMINDERS_PATH = "/n8n/v1/reminders";
const NOT_ALLOWED_METHODS = ["GET", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

type Handler = (ctx: ActionCtx, body: unknown, nowMs: number) => Promise<Response>;

/** Verified-JSON pipeline + catch-all 500 that never logs the error, body or headers. */
function inbound(route: string, handler: Handler) {
  return httpAction(async (ctx, request) => {
    try {
      const nowMs = Date.now();
      const input = await readSignedJson(request, Math.floor(nowMs / 1000));
      if (!input.ok) return input.response;
      return await handler(ctx, input.body, nowMs);
    } catch {
      console.error(`inbound: ${route} internal`);
      return internalError();
    }
  });
}

const overdueLoans = inbound("overdue-loans", async (ctx, body, nowMs) => {
  if (!parseOverdueListRequest(body)) return badRequest();
  const today = utcToday(nowMs);
  const { truncated, loans } = await ctx.runQuery(internal.reminders.listOverdueForReminders, {
    today,
  });
  return jsonResponse(200, { version: 1, today, truncated, loans });
});

const reminderReport = inbound("reminders", async (ctx, body, nowMs) => {
  const report = parseReminderReport(body);
  if (report === null) return badRequest();
  const outcome = await ctx.runMutation(internal.reminders.recordReminder, {
    ...report,
    today: utcToday(nowMs),
  });
  switch (outcome.result) {
    case "recorded":
      return jsonResponse(200, { ok: true, status: outcome.status, duplicate: outcome.duplicate });
    case "not_found":
      return notFound();
    case "not_overdue":
      return conflict();
    case "invalid_date":
      return badRequest();
  }
});

const notAllowed = httpAction(async () => methodNotAllowed());

const http = httpRouter();
http.route({ path: OVERDUE_LOANS_PATH, method: "POST", handler: overdueLoans });
http.route({ path: REMINDERS_PATH, method: "POST", handler: reminderReport });
for (const path of [OVERDUE_LOANS_PATH, REMINDERS_PATH]) {
  for (const method of NOT_ALLOWED_METHODS) {
    http.route({ path, method, handler: notAllowed });
  }
}

export default http;
