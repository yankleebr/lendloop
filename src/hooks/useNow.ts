"use client";

import { useSyncExternalStore } from "react";

// One shared clock for every relative time on the page: a single interval while
// at least one component is subscribed, plus a tick when the tab becomes visible.

const TICK_MS = 60_000;

let now = Date.now();
let interval: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick() {
  now = Date.now();
  for (const listener of listeners) listener();
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") tick();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (interval === null) {
    now = Date.now();
    interval = setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && interval !== null) {
      clearInterval(interval);
      interval = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

const getSnapshot = () => now;
const getServerSnapshot = () => null;

/** Current time in epoch ms, refreshed every minute; null during server rendering. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
