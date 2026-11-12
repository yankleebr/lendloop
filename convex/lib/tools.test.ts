import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { AppErrorData } from "./errors";
import { normalizeToolInput } from "./tools";
import { TOOL_DESCRIPTION_MAX, TOOL_NAME_MAX, TOOL_NAME_MIN } from "./toolRules";
import type { ToolCategory, ToolCondition } from "./validators";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<AppErrorData>).data.code;
  }
  throw new Error("Expected function to throw");
}

describe("normalizeToolInput", () => {
  it("trims name and description and keeps other fields", () => {
    expect(
      normalizeToolInput({ name: "  Drill ", description: "  Cordless  ", category: "garden" }),
    ).toEqual({ name: "Drill", description: "Cordless", category: "garden" });
  });

  it("accepts names at the min and max length", () => {
    expect(normalizeToolInput({ name: "ab", description: "" }).name).toBe("ab");
    const max = "x".repeat(TOOL_NAME_MAX);
    expect(normalizeToolInput({ name: max, description: "" }).name).toBe(max);
  });

  it("rejects names that are too short after trimming", () => {
    expect(TOOL_NAME_MIN).toBe(2);
    expect(codeOf(() => normalizeToolInput({ name: "", description: "" }))).toBe(
      "INVALID_ARGUMENT",
    );
    expect(codeOf(() => normalizeToolInput({ name: " a ", description: "" }))).toBe(
      "INVALID_ARGUMENT",
    );
    expect(codeOf(() => normalizeToolInput({ name: "     ", description: "" }))).toBe(
      "INVALID_ARGUMENT",
    );
  });

  it("rejects names longer than the max", () => {
    const name = "x".repeat(TOOL_NAME_MAX + 1);
    expect(codeOf(() => normalizeToolInput({ name, description: "" }))).toBe("INVALID_ARGUMENT");
  });

  it("checks the name length after trimming", () => {
    const name = `  ${"x".repeat(TOOL_NAME_MAX)}  `;
    expect(normalizeToolInput({ name, description: "" }).name).toHaveLength(TOOL_NAME_MAX);
  });

  it("accepts an empty description and one at the max length", () => {
    expect(normalizeToolInput({ name: "Saw", description: "   " }).description).toBe("");
    const max = "d".repeat(TOOL_DESCRIPTION_MAX);
    expect(normalizeToolInput({ name: "Saw", description: max }).description).toBe(max);
  });

  it("rejects a description longer than the max", () => {
    const description = "d".repeat(TOOL_DESCRIPTION_MAX + 1);
    expect(codeOf(() => normalizeToolInput({ name: "Saw", description }))).toBe(
      "INVALID_ARGUMENT",
    );
  });

  it("counts emoji as JS string length (UTF-16 code units)", () => {
    // "🔧" is 2 code units, so a single emoji satisfies the 2-char minimum.
    expect(normalizeToolInput({ name: "🔧", description: "" }).name).toBe("🔧");
    const name = "🔧".repeat(TOOL_NAME_MAX / 2 + 1); // 62 code units
    expect(codeOf(() => normalizeToolInput({ name, description: "" }))).toBe("INVALID_ARGUMENT");
  });
});

describe("enum types", () => {
  it("infer literal unions from the shared arrays (compile-time check)", () => {
    const category: ToolCategory = "power_tools";
    const condition: ToolCondition = "like_new";
    // @ts-expect-error not a category
    const badCategory: ToolCategory = "furniture";
    // @ts-expect-error not a condition
    const badCondition: ToolCondition = "new";
    expect([category, condition, badCategory, badCondition]).toHaveLength(4);
  });
});
