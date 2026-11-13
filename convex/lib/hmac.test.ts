import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacSha256Hex, signWebhook, verifyWebhookSignature } from "./hmac";

const SECRET = "a".repeat(64);
const NOW = 1_800_000_000;
const BODY = JSON.stringify({ version: 1, recipient: { name: "João" } });

function nodeSignature(secret: string, ts: number, body: string): string {
  return "v1=" + createHmac("sha256", secret).update(`${ts}.${body}`, "utf8").digest("hex");
}

async function verify(overrides: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {}) {
  return verifyWebhookSignature({
    secret: SECRET,
    rawBody: BODY,
    timestampHeader: String(NOW),
    signatureHeader: await signWebhook(SECRET, NOW, BODY),
    nowSec: NOW,
    ...overrides,
  });
}

describe("hmacSha256Hex", () => {
  it("matches RFC 4231 test case 2", async () => {
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });
});

describe("signWebhook", () => {
  it("returns v1= followed by 64 lowercase hex chars", async () => {
    expect(await signWebhook(SECRET, NOW, BODY)).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  it("matches node:crypto (what n8n computes), including non-ASCII bodies", async () => {
    expect(await signWebhook(SECRET, NOW, BODY)).toBe(nodeSignature(SECRET, NOW, BODY));
  });
});

describe("verifyWebhookSignature", () => {
  it("accepts a valid signature", async () => {
    expect(await verify()).toBe(true);
  });

  it("accepts a signature made with node:crypto", async () => {
    expect(await verify({ signatureHeader: nodeSignature(SECRET, NOW, BODY) })).toBe(true);
  });

  it("rejects a tampered body", async () => {
    expect(await verify({ rawBody: BODY.replace("João", "Joao") })).toBe(false);
  });

  it("rejects a different secret", async () => {
    expect(await verify({ secret: "b".repeat(64) })).toBe(false);
  });

  it("enforces the 300 s window in both directions", async () => {
    expect(await verify({ nowSec: NOW + 300 })).toBe(true);
    expect(await verify({ nowSec: NOW - 300 })).toBe(true);
    expect(await verify({ nowSec: NOW + 301 })).toBe(false);
    expect(await verify({ nowSec: NOW - 301 })).toBe(false);
  });

  it("rejects a timestamp that differs from the signed one", async () => {
    expect(await verify({ timestampHeader: String(NOW + 1) })).toBe(false);
  });

  it("returns false (no throw) on missing or malformed headers", async () => {
    const valid = await signWebhook(SECRET, NOW, BODY);
    const hex = valid.slice(3);
    expect(await verify({ timestampHeader: null })).toBe(false);
    expect(await verify({ signatureHeader: null })).toBe(false);
    expect(await verify({ timestampHeader: "" })).toBe(false);
    expect(await verify({ timestampHeader: "12.5" })).toBe(false);
    expect(await verify({ timestampHeader: "abc" })).toBe(false);
    expect(await verify({ signatureHeader: `v2=${hex}` })).toBe(false);
    expect(await verify({ signatureHeader: hex })).toBe(false);
    expect(await verify({ signatureHeader: `v1=${"z".repeat(64)}` })).toBe(false);
    expect(await verify({ signatureHeader: `v1=${hex.slice(2)}` })).toBe(false);
    expect(await verify({ signatureHeader: `v1=${hex}00` })).toBe(false);
  });

  it("accepts when one of several space-separated signatures is valid", async () => {
    const valid = await signWebhook(SECRET, NOW, BODY);
    expect(await verify({ signatureHeader: `v1=${"0".repeat(64)} ${valid}` })).toBe(true);
    expect(await verify({ signatureHeader: `v1=${"0".repeat(64)} v1=${"1".repeat(64)}` })).toBe(
      false,
    );
  });

  it("checks at most 5 candidate signatures", async () => {
    const valid = await signWebhook(SECRET, NOW, BODY);
    const bogus = (n: number) => Array(n).fill(`v1=${"0".repeat(64)}`).join(" ");
    expect(await verify({ signatureHeader: `${bogus(4)} ${valid}` })).toBe(true);
    expect(await verify({ signatureHeader: `${bogus(5)} ${valid}` })).toBe(false);
  });
});
