// Plain constants shared by Convex functions and the client form (safe to import anywhere).

export const TOOL_NAME_MIN = 2;
export const TOOL_NAME_MAX = 60;
export const TOOL_DESCRIPTION_MAX = 500;

/** Cap for board queries (tools.listPublic / tools.list). */
export const MAX_BOARD_TOOLS = 200;
/** Max active listings per owner (enforced in tools.create) and cap for tools.listMine. */
export const MAX_OWN_TOOLS = 100;
