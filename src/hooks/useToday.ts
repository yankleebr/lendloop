"use client";

import { useEffect, useState } from "react";
import { addDays, format, startOfDay } from "date-fns";

function localToday(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/**
 * The user's local calendar day as "YYYY-MM-DD". Passed to Convex queries as
 * `today` (queries must not read the clock); re-renders at local midnight.
 */
export function useToday(): string {
  const [today, setToday] = useState(localToday);

  useEffect(() => {
    const nextMidnight = startOfDay(addDays(new Date(), 1)).getTime();
    // +1s so the timer never fires just before midnight.
    const timer = setTimeout(() => setToday(localToday()), nextMidnight - Date.now() + 1000);
    return () => clearTimeout(timer);
  }, [today]);

  return today;
}
