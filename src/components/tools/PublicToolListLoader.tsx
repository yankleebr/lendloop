import { connection } from "next/server";
import { preloadQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import { utcToday } from "../../../convex/lib/dates";
import { PublicToolList } from "./PublicToolList";

/** Visitors have no local "today" on the server; UTC is close enough for a read-only filter. */
function serverToday(): string {
  return utcToday(Date.now());
}

/**
 * Server-renders the public board (data in the first HTML) and hands it to a
 * client component that stays reactive. The only preloadQuery on the page.
 * `preloadQuery` is uncached (and uses Math.random internally), so it runs at
 * request time (`connection()`) inside the page's <Suspense>.
 */
export async function PublicToolListLoader() {
  await connection();
  const preloaded = await preloadQuery(api.tools.listPublic, { today: serverToday() });
  return <PublicToolList preloaded={preloaded} />;
}
