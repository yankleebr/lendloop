// Shared request pipeline for n8n → Convex HTTP actions (convex/http.ts).
// Order: config → content type → size → read once → verify HMAC → parse.
// Nothing is parsed and no query/mutation runs before the signature is valid.
// See context/features/overdue-reminders.md → Endpoint Contracts.

import { MAX_INBOUND_BODY_BYTES, MIN_SECRET_LENGTH } from "./automationRules";
import { verifyWebhookSignature } from "./hmac";

export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const SIGNATURE_HEADER = "X-LendLoop-Signature";

const encoder = new TextEncoder();

/** Fixed JSON response; bodies never echo the request. */
export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export const badRequest = () => jsonResponse(400, { error: "bad request" });
export const notFound = () => jsonResponse(404, { error: "not found" });
export const conflict = () => jsonResponse(409, { error: "not overdue" });
export const internalError = () => jsonResponse(500, { error: "internal" });
const unauthorized = () => jsonResponse(401, { error: "invalid signature" });
const payloadTooLarge = () => jsonResponse(413, { error: "payload too large" });
const unsupportedMediaType = () => jsonResponse(415, { error: "unsupported media type" });
const unavailable = () => jsonResponse(503, { error: "unavailable" });

export function methodNotAllowed(): Response {
  return jsonResponse(405, { error: "method not allowed" }, { Allow: "POST" });
}

export interface InboundConfig {
  secret: string;
}

/** N8N_INBOUND_SECRET (separate from the outbound N8N_WEBHOOK_SECRET); never logged. */
export function readInboundConfig(): InboundConfig | null {
  const secret = process.env.N8N_INBOUND_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  return { secret };
}

function isJsonContentType(header: string | null): boolean {
  return header !== null && header.trim().toLowerCase().startsWith("application/json");
}

function declaredLengthTooLarge(header: string | null): boolean {
  if (header === null) return false;
  const length = Number(header);
  return !Number.isFinite(length) || length > MAX_INBOUND_BODY_BYTES;
}

export type SignedJson = { ok: true; body: unknown } | { ok: false; response: Response };

/** Steps 1–6 of the common processing order. */
export async function readSignedJson(request: Request, nowSec: number): Promise<SignedJson> {
  const config = readInboundConfig();
  if (config === null) {
    console.warn("inbound: not_configured");
    return { ok: false, response: unavailable() };
  }
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return { ok: false, response: unsupportedMediaType() };
  }
  if (declaredLengthTooLarge(request.headers.get("content-length"))) {
    return { ok: false, response: payloadTooLarge() };
  }
  const rawBody = await request.text();
  if (encoder.encode(rawBody).byteLength > MAX_INBOUND_BODY_BYTES) {
    return { ok: false, response: payloadTooLarge() };
  }
  const valid = await verifyWebhookSignature({
    secret: config.secret,
    rawBody,
    timestampHeader: request.headers.get(TIMESTAMP_HEADER),
    signatureHeader: request.headers.get(SIGNATURE_HEADER),
    nowSec,
  });
  if (!valid) return { ok: false, response: unauthorized() };
  try {
    return { ok: true, body: JSON.parse(rawBody) as unknown };
  } catch {
    return { ok: false, response: badRequest() };
  }
}
