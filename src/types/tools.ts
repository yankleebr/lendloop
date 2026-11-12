import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type PublicToolItem = FunctionReturnType<typeof api.tools.listPublic>[number];
export type ToolListItem = FunctionReturnType<typeof api.tools.list>[number];
export type MyToolItem = FunctionReturnType<typeof api.tools.listMine>[number];
