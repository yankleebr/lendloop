// HMAC-SHA256 webhook signatures (Web Crypto; default Convex runtime, no "use node").
// Scheme: `v1=` + lowercase hex of HMAC-SHA256(secret, `${timestampSec}.${rawBody}`).
// The secret is used as its UTF-8 bytes (never hex/base64-decoded), matching the
// n8n Crypto credential's "Hmac Secret" string.

import { SIGNATURE_TOLERANCE_SEC } from "./automationRules";

const SIGNATURE_VERSION = "v1=";
const SHA256_HEX_LENGTH = 64;
/** Bounds the verify work a single (possibly hostile) header can trigger. */
const MAX_SIGNATURE_CANDIDATES = 5;
const HEX_PATTERN = /^[0-9a-fA-F]+$/;
const INTEGER_PATTERN = /^\d+$/;

const encoder = new TextEncoder();

function importKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Decodes a 64-char hex SHA-256 digest; null when the length or alphabet is wrong. */
function fromSha256Hex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length !== SHA256_HEX_LENGTH || !HEX_PATTERN.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await importKey(secret, "sign");
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** Returns the signature header value: `v1=<hex>`. */
export async function signWebhook(
  secret: string,
  timestampSec: number,
  rawBody: string,
): Promise<string> {
  return SIGNATURE_VERSION + (await hmacSha256Hex(secret, `${timestampSec}.${rawBody}`));
}

/**
 * Constant-time verification (crypto.subtle.verify). False — never a throw —
 * on missing/malformed headers, wrong signature, or |now − ts| > tolerance.
 * The signature header may list several space-separated values (key rotation).
 */
export async function verifyWebhookSignature(args: {
  secret: string;
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  nowSec: number;
  toleranceSec?: number;
}): Promise<boolean> {
  const { secret, rawBody, timestampHeader, signatureHeader, nowSec } = args;
  const tolerance = args.toleranceSec ?? SIGNATURE_TOLERANCE_SEC;
  if (!timestampHeader || !signatureHeader || !INTEGER_PATTERN.test(timestampHeader)) {
    return false;
  }
  const timestampSec = Number(timestampHeader);
  if (Math.abs(nowSec - timestampSec) > tolerance) return false;

  const candidates = signatureHeader
    .split(" ")
    .filter((part) => part.startsWith(SIGNATURE_VERSION))
    .slice(0, MAX_SIGNATURE_CANDIDATES)
    .map((part) => fromSha256Hex(part.slice(SIGNATURE_VERSION.length)))
    .filter((bytes) => bytes !== null);
  if (candidates.length === 0) return false;

  const key = await importKey(secret, "verify");
  const data = encoder.encode(`${timestampHeader}.${rawBody}`);
  for (const signature of candidates) {
    if (await crypto.subtle.verify("HMAC", key, signature, data)) return true;
  }
  return false;
}
