import { v, type Infer } from "convex/values";

export const roleValidator = v.union(v.literal("user"), v.literal("admin"));

export type Role = Infer<typeof roleValidator>;
