import { v, type Infer } from "convex/values";

export const roleValidator = v.union(v.literal("user"), v.literal("admin"));

export type Role = Infer<typeof roleValidator>;

// Stored as snake_case keys; human labels live in src/lib/tools.ts.
// Adding a value is non-breaking; removing/renaming one needs a data migration.
export const TOOL_CATEGORIES = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "ladders",
  "other",
] as const;

export const TOOL_CONDITIONS = ["like_new", "good", "fair", "worn"] as const;

export const toolCategoryValidator = v.union(...TOOL_CATEGORIES.map((c) => v.literal(c)));
export const toolConditionValidator = v.union(...TOOL_CONDITIONS.map((c) => v.literal(c)));
export const availabilityValidator = v.union(v.literal("available"), v.literal("on_loan"));

export type ToolCategory = Infer<typeof toolCategoryValidator>;
export type ToolCondition = Infer<typeof toolConditionValidator>;
export type Availability = Infer<typeof availabilityValidator>;
