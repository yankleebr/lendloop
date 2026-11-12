import { z } from "zod";
import {
  TOOL_DESCRIPTION_MAX,
  TOOL_NAME_MAX,
  TOOL_NAME_MIN,
} from "../../convex/lib/toolRules";
import {
  TOOL_CATEGORIES,
  TOOL_CONDITIONS,
  type Availability,
  type ToolCategory,
  type ToolCondition,
} from "../../convex/lib/validators";

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  ladders: "Ladders",
  other: "Other",
};

export const CONDITION_LABELS: Record<ToolCondition, string> = {
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
};

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: "Available",
  on_loan: "On loan",
};

/** Select `items` (base-ui) built from the shared enum arrays. */
export const CATEGORY_ITEMS = TOOL_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

export const CONDITION_ITEMS = TOOL_CONDITIONS.map((value) => ({
  value,
  label: CONDITION_LABELS[value],
}));

/** Client-side mirror of the Convex rules (Convex stays the source of truth). */
export const toolFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(TOOL_NAME_MIN, `Name must be at least ${TOOL_NAME_MIN} characters.`)
    .max(TOOL_NAME_MAX, `Name must be at most ${TOOL_NAME_MAX} characters.`),
  category: z.enum(TOOL_CATEGORIES, { error: "Choose a category." }),
  condition: z.enum(TOOL_CONDITIONS, { error: "Choose a condition." }),
  description: z
    .string()
    .trim()
    .max(TOOL_DESCRIPTION_MAX, `Description must be at most ${TOOL_DESCRIPTION_MAX} characters.`),
});

export type ToolFormValues = z.infer<typeof toolFormSchema>;
