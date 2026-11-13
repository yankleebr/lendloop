// Client-safe constants for the admin views (no server imports).

/** Page size requested by the admin views (`initialNumItems` / `loadMore`). */
export const ADMIN_PAGE_SIZE = 20;

/** Server-side clamp for `paginationOpts.numItems` (client-controlled). */
export const ADMIN_PAGE_MAX = 50;
