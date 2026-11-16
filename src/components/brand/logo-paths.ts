/**
 * LendLoop mark (Option A, loop arrows): two arrows chasing each other around a circle.
 * Single source for LendLoopLogo, src/app/icon.svg and src/app/apple-icon.tsx.
 */

export const LOGO_VIEWBOX = "0 0 32 32";

/** Each half of the loop: an arc (stroked) and its arrowhead (filled). */
export const LOGO_PARTS = [
  { arc: "M6.6 12.6A10 10 0 0 1 25.4 12.6", head: "M28.2 11.6 26.4 15.4 22.6 13.6Z" },
  { arc: "M25.4 19.4A10 10 0 0 1 6.6 19.4", head: "M3.8 20.4 5.6 16.6 9.4 18.4Z" },
] as const;

/** Stroke width of the arcs on the plain mark. */
export const LOGO_STROKE = 3.5;

/** Thicker stroke for the app-icon tile, where the mark is scaled down (src/app/icon.svg mirrors it). */
export const TILE_STROKE = 4.5;

/**
 * Brand colors for standalone icons (the in-app logo uses currentColor): one look in every
 * browser/OS theme — periwinkle tile, indigo mark (src/app/icon.svg mirrors these).
 */
export const BRAND_INDIGO = "#3423A6";
export const BRAND_PERIWINKLE = "#B5C5FF";
