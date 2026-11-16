# Theme Colors — Palette, Theme Polish and Project Logo (DEV)

## Overview

LendLoop still looks like a fresh shadcn install: the neutral (grey) base-nova palette, the Next.js default favicon, and a plain-text "LendLoop" in the header. This feature gives the app its own identity:

- a **brand palette** built from the user's reference image, defined as OKLCH tokens in `src/app/globals.css` (the only place colors live);
- **semantic status tokens** (`success`, `warning`, `info`, `destructive`) and **one status → badge-variant map** for every status in the app;
- **dark mode** that follows the operating system;
- a **project logo** (mark + "LendLoop" wordmark), favicon / app icons and metadata, replacing the Next.js / Vercel defaults;
- Clerk and Sonner matched to the palette, and a logo heading with an indigo tagline on the public page `/`.

UI only. No Convex, n8n, schema or function change. No new npm package. Targets **DEV**; PROD changes only through the normal `main` deploy.

### Reference image

A rounded lavender/periwinkle card with a large, deep indigo, **bold serif** headline (partially visible: "…als"), a soft lighter-lavender circle, and a pale lavender strip below. Colors sampled from the image (Python/Pillow, most frequent pixels):

| Role in the image | Sampled hex | OKLCH (computed) | Share of pixels |
|---|---|---|---|
| Card background (periwinkle) | `#B5C5FF` | `oklch(0.832 0.084 272.5)` | 74 % |
| Lower strip / circle (light lavender) | `#D6DFFF` | `oklch(0.907 0.045 273.0)` | 20 % |
| Circle highlight (lightest lavender) | `#E0E8FF` | `oklch(0.932 0.032 270.5)` | 2 % |
| Headline (deep indigo) | `#3423A6` | `oklch(0.381 0.195 277.6)` | 1.3 % |

All brand colors share a hue of ~272–278°. The palette below keeps that hue for neutrals (a faint lavender tint instead of pure grey), uses `#3423A6` as primary, and the lavenders for secondary / accent surfaces.

## Prerequisites

### Already done (see `context/current-feature.md` → *History*)

All features A–F are implemented and in PROD. Current visual state, from the code (read 2026-11-15):

- **Tokens:** `src/app/globals.css` has the stock shadcn base-nova **neutral** palette (`--primary: oklch(0.205 0 0)` etc.) in `:root` and `.dark`, mapped by `@theme inline`; `@custom-variant dark (&:is(.dark *))`. Chart and sidebar tokens exist but no component uses them. No `success` / `warning` / `info` tokens; no `--destructive-foreground`.
- **Dark mode:** not wired. `next-themes` 0.4.6 is installed but there is **no `ThemeProvider`** and nothing sets `.dark`; the only consumer is `src/components/ui/sonner.tsx` (`useTheme()` → falls back to `"system"`). So the app is always light while **toasts follow the OS theme**, an existing inconsistency this feature removes.
- **Fonts:** Geist / Geist Mono via `next/font/google` in `src/app/layout.tsx`. `--font-heading` = `--font-sans`, used by `CardTitle`, `DialogTitle`, `AlertDialogTitle`.
- **Metadata:** `title: "LendLoop"`, `description: "Borrow what you need. Lend what you don't."` (already custom, no template). No `viewport` / `themeColor`.
- **Icons:** `src/app/favicon.ico` is the create-next-app default (15,086 bytes, dated 2026-11-10). No `icon.*` / `apple-icon.*`. `public/` holds the five create-next-app SVGs (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`); **none is referenced** anywhere in `src/`.
- **Badges:** `Badge` (`src/components/ui/badge.tsx`, cva variants `default` / `secondary` / `destructive` / `outline` / `ghost` / `link`). Status variants are spread over three files: `LOAN_STATUS_VARIANTS` in `src/lib/loans.ts`, the availability ternary in `ToolCard.tsx` (`on_loan` → `destructive`, which reads as an error), and `Overdue` → `destructive` in `LoanStatusBadge.tsx`. `TrustedLenderBadge` = `secondary` + `ShieldCheckIcon`. Admin role badge = `default`.
- **Activity:** `ActivityEntry.tsx` colors `failed` with `text-destructive`, everything else `text-muted-foreground`; icons `MailCheckIcon` / `ClockIcon` / `MailWarningIcon`. The absolute date uses `text-muted-foreground/80` (fails AA, see *Contrast*).
- **Header / nav:** `AppHeader` (text logo `text-lg font-semibold`, links active = `bg-muted`), `AdminNav` (same active style). Mobile (375px): logo + Admin link + `UserButton` on row 1, the four main links on row 2 (hidden scrollbar).
- **Public page `/`:** centered `h1` "LendLoop", tagline in `text-muted-foreground`, `AuthStatus` CTA (Clerk `SignInButton` modal → `Button size="lg"`), "Available tools" grid of small cards.
- **Toasts:** `<Toaster position="top-center" />`, centered text, icons from lucide, colors from `--popover` tokens via shadcn's inline `style` mapping; `richColors` off.
- **Clerk:** `ClerkProvider` without `appearance`. `@clerk/nextjs` 7.9.25 (`@clerk/ui` is **not** installed).
- Installed versions: `next` 16.4.6 (`cacheComponents`, React Compiler), `tailwindcss` 4.3.3, `shadcn` 4.23.0 (style `base-nova`, `baseColor: neutral`), `sonner` 2.0.8, `next-themes` 0.4.6, `lucide-react` 1.71, `class-variance-authority` 0.7.1. `sharp` is present in `node_modules` as a Next.js dependency (not in `package.json`).
- Tests: 382 (Convex functions and utilities only). This feature adds or changes **no** tests.

### User prerequisites

Make the four choices in *Decisions for the User* before `/feature start`.

## Requirements

- Every color comes from a token in `src/app/globals.css`; no Tailwind palette class (`bg-black/10`, `text-green-600`, …) and no hex/rgb outside `globals.css` and the logo/icon files.
- Semantic tokens `--success`, `--warning`, `--info`, `--destructive`, each with `-foreground`, exposed via `@theme inline`; `info` clearly different from the indigo primary.
- One status → variant map for loan status, availability, overdue, Trusted Lender and activity status. Color is never the only signal (text label and/or icon).
- WCAG 2.2 AA in light and dark: text ≥ 4.5:1, UI components and focus indicators ≥ 3:1.
- Logo in the header and on `/`; LendLoop favicon / app icons; no Next.js / Vercel branding visible.
- Clerk and Sonner follow the palette and the theme. Fits 375px.
- `npm run lint`, `npm run test:run` (382, unchanged), `npm run build` pass.

## Decisions

| # | Topic | Options considered | Decision and why |
|---|---|---|---|
| 1 | **Palette variation** | (a) **Neutral + indigo** ("Theme 1 · Clean" in the preview): near-white surfaces (`#FBFCFF`), white cards, indigo primary, lavender accents, no colored panel; (b) **Lavender page**: whole page background `#E0E8FF`, white cards; (c) **Lavender hero**: (a) plus a periwinkle `#B5C5FF` panel on `/` only. Also compared in the preview: three alternative brand palettes (Sage, Peach, Sunflower) | **Chosen by the user: (a) with the Indigo palette.** The calmest canvas for pages dense with cards, badges and status colors (foreground 17:1, muted text 5.88:1); indigo appears on buttons, links, the logo and the active nav link, lavender on secondary badges. (c) was the earlier recommendation (closest to the reference card) and (b) lowers secondary-text contrast; both were rejected by the user after the side-by-side preview. The alternative palettes were rejected too (Sage's primary clashes with the success green, Peach's sits between destructive red and warning amber). Dark mode: deep indigo surfaces. |
| 2 | **Serif display font** | (a) No new font: wordmark and titles in Geist semibold; (b) **Fraunces 700** via `next/font/google` for the wordmark and `h1` titles, as a new `--font-display` token; (c) DM Serif Display (single 400 weight) | **Chosen by the user: (a).** No new font file and no new token; the wordmark is Geist `font-semibold tracking-tight`, like the current text logo. (b) would cost one more font file preloaded on every route (the wordmark is on every page) and needed a separate token because `--font-heading` feeds `CardTitle` / `DialogTitle`. (c) has no bold weight. |
| 3 | **Dark mode / toggle** | (a) Light only; (b) follow the OS, no toggle (pure CSS `prefers-color-scheme`); (c) `next-themes` `ThemeProvider` (`attribute`, `defaultTheme="system"`, `enableSystem`) + a toggle; (d) **toggle with the Next.js "Preventing flash before hydration" pattern**: an inline `<head>` script sets `data-theme` on `<html>` from `localStorage` before the first paint, a small client store + `ThemeToggle` button | **Chosen by the user: a toggle → (d).** Three modes, cycled by one icon button: **System** (default, follows the OS and reacts live to OS changes) → **Light** → **Dark**. (d) is the pattern from the official Next.js guide (Themes section): no flash, no hydration error (`suppressHydrationWarning` on `<html>`), and the page stays statically prerendered under `cacheComponents` because nothing reads `cookies()` on the server (the guide warns that reading a theme cookie in the root layout "forces blocking every segment under the layout"); hence `localStorage`, not a cookie. A `data-theme` attribute is used instead of the `.dark` class because React owns `<html className>` (font variables) and the guide notes that Strict Mode's dev remount resets attributes React manages; the toggle re-applies the attribute in `useLayoutEffect` as the guide shows. ~60 lines of our own code, no package. (c) would also work, but next-themes 0.4.6 renders its script inside a client component and logs "Encountered a script tag while rendering React component" on Next.js 16 / React 19 (issues #385, #387, no upstream fix). (b) was the earlier recommendation; the user wants an explicit control. (a) ignores dark-mode users. |
| 4 | **Status token set** | (a) Only `destructive` + brand tokens (map everything else to `default` / `secondary` / `outline`); (b) **`success` / `warning` / `info` / `destructive`**, each with `-foreground`; (c) one token per status (`--status-pending`, …) | **(b).** Four semantic roles cover every status (see *Status Map*), follow the shadcn convention (shadcn's theming page uses exactly `--warning` / `--warning-foreground` as its custom-color example) and stay reusable (toast icons, Clerk `colorSuccess` / `colorWarning`). Hues are spread away from the brand hue (~277°): success 152° (green), warning 60° (amber), info **215° (teal-cyan)**, destructive 22–25° (red). `info` is ≥ 60° away from the indigo/periwinkle primary and much lower in chroma, so it can't be read as "primary". (a) can't express "pending" vs "approved" vs "on loan" without misusing `destructive` (today's `on_loan` problem). (c) multiplies tokens for a handful of badges. |
| 5 | **Badge extension** | (a) Add cva variants to the shadcn `Badge`; (b) a wrapper `StatusBadge` with className overrides (`<Badge className="bg-success/12 …">`); (c) a forked copy of `badge.tsx` | **(a).** shadcn components are "open code": the generated files are meant to be edited, and the variant list is the extension point (`badgeVariants` is a plain `cva`). Four new variants in the same style as the existing soft `destructive` variant (`bg-x/10..20 text-x`): `success`, `warning`, `info`, and `brand` (soft indigo, for Trusted Lender). The existing variants are untouched, so every current call site keeps working. Re-running `npx shadcn add badge` would overwrite them: the spec lists the edit in *Files* so it is easy to re-apply. (b) spreads color decisions into className strings (the thing this feature removes) and fights `cn` merging. (c) duplicates the primitive. |
| 6 | **Clerk theming** | (a) Official **shadcn theme** (`import { shadcn } from "@clerk/ui/themes"` + `@import "@clerk/ui/themes/shadcn.css"`); (b) **`appearance.variables`** on `ClerkProvider`, each value a `var(--token)`; (c) global `--clerk-color-*` CSS variables in `globals.css` | **(b).** No new package (the shadcn theme now lives in `@clerk/ui`, which is not installed; the older `@clerk/themes` package path is outdated). The Clerk variables doc shows `colorPrimary: 'var(--brand-primary)'`, so passing our tokens is supported, and because our tokens change under `[data-theme="dark"]`, Clerk's modal and `UserButton` popover switch theme with no extra code. The object is typed (`Appearance["variables"]`), so a wrong key fails `tsc`. Clerk recommends "direct color values" for maximum browser compatibility; we accept `var()` because Clerk itself relies on `color-mix()` and the app already requires modern browsers through Tailwind v4 (Safari 16.4+, Chrome 111+, Firefox 128+). Fallback if a value doesn't apply: paste the hex values from the token table. (c) is documented in a changelog only for `--clerk-color-primary`; the other names are inferred, so (b) is safer. (a) adds a dependency for what nine variables do. |
| 7 | **Sonner** | (a) `richColors`; (b) **keep token colors** (`--normal-bg: var(--popover)`, already in `sonner.tsx`) and tint only the **icon** per type with our tokens; (c) a full custom toast (`toast.custom`) | **(b).** `richColors` uses Sonner's own hard-coded `hsl()` greens/reds/blues (`--success-bg: hsl(143, 85%, 96%)`, … in `sonner/dist/styles.css`), off-palette in both themes. Keeping the popover surface and coloring the icon (`toastOptions.classNames.success: "[&_[data-icon]]:text-success"`, same for `error` → `text-destructive`, `warning`, `info`) gives a clear, on-palette signal; the message text stays the main signal (icon + text, never color alone). `sonner.tsx` swaps `useTheme` from `next-themes` for our `useResolvedTheme()` (Decision 3), so toasts follow the toggle, not only the OS. (c) re-implements toasts. |
| 8 | **Favicon formats** | (a) `icon.svg` only; (b) **`icon.svg` + a regenerated `favicon.ico` + `apple-icon.tsx`**; (c) PNG set (`icon.png` 32, `apple-icon.png` 180) committed as binaries | **(b).** SVG favicons work in Chrome 80+, Firefox 41+ and **Safari only from 26** (caniuse, 92.55 % global); Safari ≤ 18 and crawlers still ask for `/favicon.ico`, so the default `.ico` must be **replaced** (not just left behind, or old Safari keeps showing the Next.js logo). `apple-icon` does **not** accept SVG (Next.js: `.jpg`/`.jpeg`/`.png` or code), so it is generated with `ImageResponse` from `next/og` in `src/app/apple-icon.tsx` (180×180, statically generated at build like any route handler without request-time APIs, so `cacheComponents` doesn't affect it), reusing the same path data as the logo component. The `.ico` (16 + 32 px, PNG-in-ICO) is produced once from `icon.svg` with the already-installed `sharp`, by a throwaway script in the session scratchpad (not committed, no `package.json` change). `icon.svg` can carry a `prefers-color-scheme` style so the tab icon flips on dark browser chrome. (a) breaks old Safari. (c) means binary files with no source of truth. |
| 9 | **Overlay color** | (a) Leave `bg-black/10` in `dialog.tsx` / `alert-dialog.tsx`; (b) **`--overlay` token** (`bg-overlay`) | **(b).** These are the only two Tailwind palette classes in `src/`. A token lets the backdrop be indigo-tinted in light and darker in dark mode, and also feeds Clerk's `colorModalBackdrop`. Two one-word edits in shadcn primitives. |
| 10 | **Focus ring** | (a) Keep `--ring` = primary; (b) **slightly darker indigo `oklch(0.30 0.15 278)` in light** | **(b).** shadcn draws focus as a solid `border-ring` plus a 3px `ring-ring/50` halo, and plain elements (header links) get `outline-ring/50` from the base layer. A 50 %-alpha `#3423A6` over the page background is 2.83:1 (fails 1.4.11); `#231776` at 50 % is 3.14:1 (passes) while still reading as indigo. Dark mode: `#B5C5FF` at 50 % = 3.59:1. |
| 11 | **Logo** | Three options below | **Chosen by the user: Option A (loop arrows).** See *Logo Options*. |
| 12 | **Open Graph image** | (a) Out of scope; (b) `src/app/opengraph-image.tsx` with `ImageResponse` (tile mark + "LendLoop" + tagline, default font) | **Optional, off by default.** It is ~30 lines with the same path data, but a serif wordmark there would need a font file fetched at build time. Offered as a yes/no in *Decisions for the User*. |

## Logo Options

> **Chosen: Option A.** B and C stay below for the record only; implement A.

Shared rules: 32×32 grid, strokes ≥ 3.5 units (≥ 1.75 px at 16 px), round caps and joins, no text inside the mark. Colors: indigo `#3423A6` (primary), lavender `#E0E8FF` (on the indigo tile), two-color variant = the second part at **60 % opacity** of the same color (`#857BCA` on white, 3.70:1; in dark mode `#B5C5FF` at 60 % = 4.67:1), so no extra token is needed. In the app the mark uses `currentColor` (`text-primary`) and the wordmark is real HTML text, so both follow the theme. The previews below use Fraunces → Georgia for the wordmark; with the chosen Decision 2 (a) the wordmark is Geist semibold.

**How to preview:** open this file in VS Code's Markdown preview (`Ctrl+Shift+V`); the inline SVGs render there (GitHub strips inline SVG). Or copy one `<svg>…</svg>` into a `.svg` file and open it in the browser. Each option shows: lockup (two-color) · mark single-color at 64 px · mark at 16 px · app-icon tile at 64 px and 16 px.

### Option A — Loop arrows (chosen)

Two arrows chasing each other around a circle: things go out and come back. Instantly says "loop / exchange"; the risk is that it resembles a generic "refresh" icon. At 16 px the arrowheads become small wedges but the circle stays clear.

<p>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 168 32" width="252" height="48" fill="none"><path d="M6.6 12.6A10 10 0 0 1 25.4 12.6" stroke="#3423A6" stroke-width="3.5" stroke-linecap="round"/><path d="M28.2 11.6 26.4 15.4 22.6 13.6Z" fill="#3423A6"/><g opacity=".6"><path d="M25.4 19.4A10 10 0 0 1 6.6 19.4" stroke="#3423A6" stroke-width="3.5" stroke-linecap="round"/><path d="M3.8 20.4 5.6 16.6 9.4 18.4Z" fill="#3423A6"/></g><text x="38" y="24" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="22" fill="#3423A6">LendLoop</text></svg>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64" fill="none"><path d="M6.6 12.6A10 10 0 0 1 25.4 12.6" stroke="#3423A6" stroke-width="3.5" stroke-linecap="round"/><path d="M28.2 11.6 26.4 15.4 22.6 13.6Z" fill="#3423A6"/><path d="M25.4 19.4A10 10 0 0 1 6.6 19.4" stroke="#3423A6" stroke-width="3.5" stroke-linecap="round"/><path d="M3.8 20.4 5.6 16.6 9.4 18.4Z" fill="#3423A6"/></svg>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16" fill="none"><path d="M6.6 12.6A10 10 0 0 1 25.4 12.6" stroke="#3423A6" stroke-width="3.5" stroke-linecap="round"/><path d="M28.2 11.6 26.4 15.4 22.6 13.6Z" fill="#3423A6"/><path d="M25.4 19.4A10 10 0 0 1 6.6 19.4" stroke="#3423A6" stroke-width="3.5" stroke-linecap="round"/><path d="M3.8 20.4 5.6 16.6 9.4 18.4Z" fill="#3423A6"/></svg>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64" fill="none"><rect width="32" height="32" rx="7" fill="#3423A6"/><g transform="translate(4 4) scale(.75)"><path d="M6.6 12.6A10 10 0 0 1 25.4 12.6" stroke="#E0E8FF" stroke-width="4.5" stroke-linecap="round"/><path d="M28.2 11.6 26.4 15.4 22.6 13.6Z" fill="#E0E8FF"/><path d="M25.4 19.4A10 10 0 0 1 6.6 19.4" stroke="#E0E8FF" stroke-width="4.5" stroke-linecap="round"/><path d="M3.8 20.4 5.6 16.6 9.4 18.4Z" fill="#E0E8FF"/></g></svg>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16" fill="none"><rect width="32" height="32" rx="7" fill="#3423A6"/><g transform="translate(4 4) scale(.75)"><path d="M6.6 12.6A10 10 0 0 1 25.4 12.6" stroke="#E0E8FF" stroke-width="4.5" stroke-linecap="round"/><path d="M28.2 11.6 26.4 15.4 22.6 13.6Z" fill="#E0E8FF"/><path d="M25.4 19.4A10 10 0 0 1 6.6 19.4" stroke="#E0E8FF" stroke-width="4.5" stroke-linecap="round"/><path d="M3.8 20.4 5.6 16.6 9.4 18.4Z" fill="#E0E8FF"/></g></svg>
</p>

### Option B — Hammer in a loop

A ring (the neighborhood loop) holding a simple hammer: says "tools" and "circle of neighbors" at once. Most literal of the three. At 16 px the hammer head stays readable as a "T", but the ring and the hammer get close (1–2 px gaps).

<p>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 168 32" width="252" height="48" fill="none"><circle cx="16" cy="16" r="12" stroke="#3423A6" stroke-width="3" opacity=".6"/><path d="M11 21 18.5 13.5" stroke="#3423A6" stroke-width="3.5" stroke-linecap="round"/><path d="M15.5 10.5 21.5 16.5" stroke="#3423A6" stroke-width="4.5" stroke-linecap="round"/><text x="38" y="24" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="22" fill="#3423A6">LendLoop</text></svg>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64" fill="none"><circle cx="16" cy="16" r="12" stroke="#3423A6" stroke-width="3"/><path d="M11 21 18.5 13.5" stroke="#3423A6" stroke-width="3.5" stroke-linecap="round"/><path d="M15.5 10.5 21.5 16.5" stroke="#3423A6" stroke-width="4.5" stroke-linecap="round"/></svg>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16" fill="none"><circle cx="16" cy="16" r="12" stroke="#3423A6" stroke-width="3"/><path d="M11 21 18.5 13.5" stroke="#3423A6" stroke-width="3.5" stroke-linecap="round"/><path d="M15.5 10.5 21.5 16.5" stroke="#3423A6" stroke-width="4.5" stroke-linecap="round"/></svg>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64" fill="none"><rect width="32" height="32" rx="7" fill="#3423A6"/><g transform="translate(4 4) scale(.75)"><circle cx="16" cy="16" r="12" stroke="#E0E8FF" stroke-width="3.5"/><path d="M11 21 18.5 13.5" stroke="#E0E8FF" stroke-width="4" stroke-linecap="round"/><path d="M15.5 10.5 21.5 16.5" stroke="#E0E8FF" stroke-width="5" stroke-linecap="round"/></g></svg>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16" fill="none"><rect width="32" height="32" rx="7" fill="#3423A6"/><g transform="translate(4 4) scale(.75)"><circle cx="16" cy="16" r="12" stroke="#E0E8FF" stroke-width="3.5"/><path d="M11 21 18.5 13.5" stroke="#E0E8FF" stroke-width="4" stroke-linecap="round"/><path d="M15.5 10.5 21.5 16.5" stroke="#E0E8FF" stroke-width="5" stroke-linecap="round"/></g></svg>
</p>

### Option C — Two Ls, one loop

Two "L"s (**L**end, **L**oop), one rotated 180°, that together close a square loop, with a small gap at two corners like two hands passing something along. Abstract, geometric, ownable (not a stock icon), and the two-color version shows "two neighbors". Only straight strokes, so it stays crisp at 16 px (2 px strokes, ~1.5 px gaps).

<p>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 168 32" width="252" height="48" fill="none"><path d="M8 9V24H17" stroke="#3423A6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 23V8H15" stroke="#3423A6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/><text x="38" y="24" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="22" fill="#3423A6">LendLoop</text></svg>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64" fill="none"><path d="M8 9V24H17M24 23V8H15" stroke="#3423A6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16" fill="none"><path d="M8 9V24H17M24 23V8H15" stroke="#3423A6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64" fill="none"><rect width="32" height="32" rx="7" fill="#3423A6"/><path d="M10 11V22.5H17M22 21V9.5H15" stroke="#E0E8FF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16" fill="none"><rect width="32" height="32" rx="7" fill="#3423A6"/><path d="M10 11V22.5H17M22 21V9.5H15" stroke="#E0E8FF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
</p>

### Logo deliverables (Option A)

| Deliverable | Path | Notes |
|---|---|---|
| Path data | `src/components/brand/logo-paths.ts` | `LOGO_VIEWBOX`, the mark's path strings and stroke widths (single source for the component, `icon.svg` content and `apple-icon.tsx`) |
| Logo component | `src/components/brand/LendLoopLogo.tsx` | Server-safe (no hooks). Props `{ size?: "sm" \| "lg"; showWordmark?: boolean; className?: string }`. `<svg aria-hidden>` with `stroke="currentColor"` (`text-primary`; the second part `opacity-60` in the two-color variant) + `<span translate="no" className="font-semibold tracking-tight">LendLoop</span>` (real text: accessible name, and Chrome auto-translate leaves it alone). Used by `AppHeader` (`sm`, link to `/`) and the `/` heading (`lg`, inside the `h1`) |
| Favicon (modern) | `src/app/icon.svg` | Tile version, 32×32 viewBox. Inline `<style>@media (prefers-color-scheme: dark){…}</style>` flips to a `#B5C5FF` tile with an indigo mark, because the indigo tile is only 1.48:1 against a dark tab strip (`#202124`). Next.js emits `<link rel="icon" type="image/svg+xml" sizes="any">` |
| Favicon (legacy) | `src/app/favicon.ico` (**replace** the default) | 16 + 32 px PNG-in-ICO generated from `icon.svg` with `sharp` by a throwaway scratchpad script. For Safari < 26 and `/favicon.ico` requests |
| Apple touch icon | `src/app/apple-icon.tsx` | `ImageResponse` 180×180, full-bleed indigo (iOS rounds the corners), lavender mark; `export const size = { width: 180, height: 180 }`, `contentType = "image/png"` |
| Metadata | `src/app/layout.tsx` | See *Metadata* |
| OG image (optional, Decision 12) | `src/app/opengraph-image.tsx` | Only if the user says yes |

## Tokens

All values OKLCH (hex in parentheses = sRGB equivalent, for checking and for Clerk fallbacks). Light = the chosen variation (a). Rows marked *not added* belong to the rejected variations and are kept only for reference.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--background` | `oklch(0.99 0.006 275)` (#FBFCFF) | `oklch(0.17 0.045 280)` (#0C0C22) | Page |
| `--foreground` | `oklch(0.22 0.06 278)` (#151636) | `oklch(0.95 0.02 275)` (#EAEEFC) | Body text |
| `--card` / `--popover` | `oklch(1 0 0)` (#FFFFFF) | `oklch(0.215 0.055 280)` (#151532) | Cards, dialogs, menus, toasts, Clerk modal |
| `--card-foreground` / `--popover-foreground` | = foreground | = foreground | |
| `--primary` | `oklch(0.381 0.195 277.6)` (#3423A6) | `oklch(0.832 0.084 272.5)` (#B5C5FF) | Buttons, links, logo, Admin badge |
| `--primary-foreground` | `oklch(0.985 0.01 275)` (#F9FAFF) | `oklch(0.25 0.12 278)` (#191259) | Text on primary |
| `--secondary` | `oklch(0.932 0.032 270.5)` (#E0E8FF) | `oklch(0.29 0.07 279)` (#24264D) | Category badge, active nav link |
| `--secondary-foreground` | = primary (#3423A6) | `oklch(0.93 0.03 272)` (#E1E7FD) | |
| `--muted` | `oklch(0.965 0.014 275)` (#F0F3FD) | `oklch(0.26 0.05 280)` (#1F213C) | Hover, skeletons, card/dialog footers |
| `--muted-foreground` | `oklch(0.5 0.05 278)` (#5C6180) | `oklch(0.76 0.04 275)` (#A9B0CB) | Secondary text |
| `--accent` | `oklch(0.907 0.045 273)` (#D6DFFE) | `oklch(0.33 0.09 278)` (#2C2E62) | Select item focus |
| `--accent-foreground` | = primary | `oklch(0.95 0.02 275)` | |
| `--destructive` | `oklch(0.5 0.2 25)` (#BB061E) | `oklch(0.76 0.15 22)` (#FF8987) | Rejected, overdue, failed, remove buttons, errors |
| `--destructive-foreground` | `oklch(0.985 0.01 25)` | `oklch(0.2 0.06 22)` | Text on solid destructive (pair for completeness) |
| `--success` *(new)* | `oklch(0.5 0.12 152)` (#1A763F) | `oklch(0.77 0.14 152)` (#67CD87) | Approved, available, sent |
| `--success-foreground` *(new)* | `oklch(0.985 0.02 152)` | `oklch(0.2 0.05 152)` | |
| `--warning` *(new)* | `oklch(0.52 0.12 60)` (#9A5505) | `oklch(0.82 0.13 78)` (#F2B95A) | Pending, retrying |
| `--warning-foreground` *(new)* | `oklch(0.985 0.02 80)` | `oklch(0.22 0.05 60)` | |
| `--info` *(new)* | `oklch(0.5 0.09 215)` (#016F82) | `oklch(0.78 0.1 215)` (#62C8DF) | On loan, info toasts |
| `--info-foreground` *(new)* | `oklch(0.985 0.01 215)` | `oklch(0.2 0.04 215)` | |
| `--border` | `oklch(0.9 0.028 275)` (#D8DDF1) | `oklch(0.31 0.05 279)` (#2B2D49) | Dividers, card borders (decorative) |
| `--input` | `oklch(0.64 0.05 277)` (#848AAB) | `oklch(0.54 0.06 278)` (#666B92) | Input / select / outline-button borders (≥ 3:1) |
| `--ring` | `oklch(0.3 0.15 278)` (#231776) | `oklch(0.832 0.084 272.5)` (#B5C5FF) | Focus (Decision 10) |
| `--hero` (*not added*) | `oklch(0.832 0.084 272.5)` (#B5C5FF) | `oklch(0.26 0.1 279)` (#1C1A52) | Only for the rejected variation (c) |
| `--hero-foreground` (*not added*) | = primary (#3423A6) | `oklch(0.832 0.084 272.5)` (#B5C5FF) | Only for the rejected variation (c) |
| `--overlay` *(new)* | `oklch(0.22 0.06 278 / 25%)` | `oklch(0 0 0 / 55%)` | Dialog backdrops, Clerk modal backdrop |
| `--chart-1…5` | `oklch(0.87 0.06 273)`, `(0.7 0.12 275)`, `(0.55 0.17 277)`, `(0.45 0.19 277)`, `(0.381 0.195 277.6)` | same | Unused today; retinted so nothing grey remains |
| `--sidebar*` | mirror `background` / `foreground` / `primary` / `primary-foreground` / `accent` / `accent-foreground` / `border` / `ring` | mirror dark | Unused today; kept in sync |
| `--radius` | `0.625rem` (unchanged) | | |

New `@theme inline` entries: `--color-success`, `--color-success-foreground`, `--color-warning`, `--color-warning-foreground`, `--color-info`, `--color-info-foreground`, `--color-destructive-foreground`, `--color-overlay`. No `--hero*` and no `--font-display` (rejected options).

**Mechanics** (`src/app/globals.css`):

```css
@custom-variant dark (&:is([data-theme="dark"] *));

:root {
  color-scheme: light;
  --background: oklch(0.99 0.006 275);
  /* … light tokens … */
}

[data-theme="dark"] {
  color-scheme: dark;
  --background: oklch(0.17 0.045 280);
  /* … dark tokens … */
}
```

The `.dark { … }` block becomes `[data-theme="dark"] { … }` (nothing sets `.dark` today). The variant keeps shadcn's descendant form (`&:is(… *)`), so every `dark:` class in the primitives keeps working. Without JavaScript (script blocked) the site renders light.

## Theme Toggle

Pattern: Next.js guide *Preventing flash before hydration* → *Themes* and *Re-applying attributes in development*.

| Piece | Path | Responsibility |
|---|---|---|
| Theme constants + store | `src/lib/theme.ts` | `THEME_STORAGE_KEY = "lendloop-theme"`, `type ThemePreference = "system" \| "light" \| "dark"`, `readPreference()` (try/catch around `localStorage`, invalid → `"system"`), `resolveTheme(pref)` (`matchMedia("(prefers-color-scheme: dark)")` for `"system"`), `applyTheme(pref)` (sets `document.documentElement.dataset.theme` to the resolved value), `setPreference(pref)` (writes storage, applies, notifies), `subscribe(cb)` (listens to its own change event, the `storage` event for other tabs, and the `matchMedia` `change` event so **System** follows live OS changes). Also exports the inline script source, built from the same constants |
| Inline script | `src/app/layout.tsx` `<head>` | `<script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />`: reads the preference, resolves `system` with `matchMedia`, sets `data-theme` before the first paint, all inside `try/catch`. `<html … suppressHydrationWarning>`. Root layout is a Server Component, so no client render produces the script; if React still logs the dev "script tag" warning, use the guide's `InlineScript` helper (`type="text/plain"` on the client) |
| Hooks | `src/hooks/useTheme.ts` | `useThemePreference()` and `useResolvedTheme()` via `useSyncExternalStore(subscribe, getSnapshot, () => "system" / "light")`: the server snapshot keeps hydration consistent, then the client value takes over (only the toggle's icon can change after hydration; colors are already right thanks to the script) |
| Button | `src/components/theme/ThemeToggle.tsx` | Client. Ghost icon button (`Button variant="ghost" size="icon"`), cycles **System → Light → Dark → System**. Icons `MonitorIcon` / `SunIcon` / `MoonIcon` (lucide). `aria-label` names the current mode and the next one ("Theme: System. Switch to Light"), same text in `title`. `useLayoutEffect` re-applies `data-theme` (dev Strict Mode remount, no-op in production) |
| Placement | `AppHeader` (next to `UserButton`, both rows' right side) and `/` (top-right of the page, above the heading) | Fits 375px: row 1 = logo, (Admin on mobile), toggle (32px), avatar |
| Sonner | `src/components/ui/sonner.tsx` | `theme={useResolvedTheme()}` instead of `next-themes` `useTheme` |

What follows the toggle: every token-based color (app, dialogs, Clerk modal and `UserButton` menu via `var()` values, toasts), native controls (`color-scheme`). What follows the **OS/browser** instead, by design: the favicon's dark variant (`icon.svg` media query) and `viewport.themeColor` (mobile browser bar), since those are read by the browser outside the page's DOM.

`next-themes` becomes unused (its only import was `sonner.tsx`). Removing it from `package.json` (`npm uninstall next-themes`) is a dependency change: **ask the user** during implementation; leaving it installed is harmless.

## Status Map

One file, `src/lib/status-styles.ts`, is the only place that maps a status to a look. It replaces `LOAN_STATUS_VARIANTS` in `src/lib/loans.ts` and the inline choices in `ToolCard`, `LoanStatusBadge`, `TrustedLenderBadge` and `ActivityEntry`. Labels stay where they are (`LOAN_STATUS_LABELS`, `AVAILABILITY_LABELS`, `src/lib/activity.ts`).

```ts
// src/lib/status-styles.ts (shape)
import type { LucideIcon } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;
interface BadgeStyle { variant: BadgeVariant; icon?: LucideIcon }

export const LOAN_STATUS_STYLES: Record<LoanStatus, BadgeStyle> = { … };
export const AVAILABILITY_STYLES: Record<Availability, BadgeStyle> = { … };
export const OVERDUE_STYLE: BadgeStyle = { … };
export const TRUSTED_LENDER_STYLE: BadgeStyle = { … };
export const ACTIVITY_STATUS_STYLES: Record<ActivityStatus, { icon: LucideIcon; iconClass: string; textClass: string }> = { … };
```

| Domain | Status | Label (unchanged) | Variant / classes | Icon | Notes |
|---|---|---|---|---|---|
| Loan | `pending` | Pending | `warning` | `ClockIcon` | was `secondary` |
| Loan | `approved` | Approved | `success` | `CheckIcon` | was `default` (solid indigo) |
| Loan | `rejected` | Rejected | `destructive` | `XIcon` | unchanged variant |
| Loan | `cancelled` | Cancelled | `outline` | — | neutral history |
| Loan | `returned` | Returned | `secondary` | — | closed, neutral-positive; was `outline` |
| Loan | overdue flag | Overdue | `destructive` | `TriangleAlertIcon` | icon tells it apart from Rejected |
| Tool | `available` | Available | `success` | — | was `default` |
| Tool | `on_loan` | On loan | `info` | — | was `destructive` (read as an error) |
| User | Trusted Lender | Trusted Lender | `brand` | `ShieldCheckIcon` (kept) | was `secondary`, same as categories |
| User | Admin role | Admin | `default` | — | unchanged |
| Tool | category | (category label) | `secondary` | — | unchanged |
| Tool | condition / "Yours" | (label) | `outline` | — | unchanged |
| Activity | `sent` | (sentence) | icon `text-success`, text `text-muted-foreground` | `MailCheckIcon` | |
| Activity | `sending` | (sentence) | icon + text `text-muted-foreground` | `ClockIcon` | |
| Activity | `retrying` | (sentence) | icon `text-warning`, text `text-muted-foreground` | `ClockIcon` | |
| Activity | `failed` | (sentence) | icon + text `text-destructive` | `MailWarningIcon` | |
| Toast | success / error / warning / info | (message) | icon `text-success` / `text-destructive` / `text-warning` / `text-info` | existing lucide icons | Decision 7 |

Every status already has a text label; icons are added only where a variant is shared (`destructive` for Rejected vs Overdue) or where they reinforce meaning on loan badges. Color is never the only signal (WCAG 1.4.1).

**New Badge variants** (`src/components/ui/badge.tsx`, same pattern as `destructive`):

```ts
success: "bg-success/12 text-success dark:bg-success/20 [a]:hover:bg-success/20",
warning: "bg-warning/12 text-warning dark:bg-warning/20 [a]:hover:bg-warning/20",
info:    "bg-info/12 text-info dark:bg-info/20 [a]:hover:bg-info/20",
brand:   "bg-primary/10 text-primary dark:bg-primary/20 [a]:hover:bg-primary/20",
```

## Contrast

Computed from the OKLCH values with the CSS Color 4 OKLab → linear sRGB matrices, sRGB gamma, then WCAG 2.x relative luminance; alpha colors composited over the surface they sit on. AA targets: text 4.5:1 (1.4.3), UI components / focus indicators 3:1 (1.4.11). Logos are exempt (1.4.3 "logotypes") but were checked anyway.

| Pair | Light | Dark | Target |
|---|---|---|---|
| foreground on background | 16.98 | 16.58 | 4.5 |
| foreground on card | 17.48 | 15.24 | 4.5 |
| muted-foreground on background | 5.88 | 8.91 | 4.5 |
| muted-foreground on card | 6.05 | 8.19 | 4.5 |
| muted-foreground on muted (footers, hover) | 5.46 | 7.27 | 4.5 |
| **primary-foreground on primary** (buttons) | **10.39** | **9.78** | 4.5 |
| primary on card (links, logo) | 10.85 | 10.44 | 4.5 |
| secondary-foreground on secondary (category badge, active nav) | 8.87 | 11.64 | 4.5 |
| accent-foreground on accent | 8.20 | 10.78 | 4.5 |
| primary on background (logo, tagline and headline on `/`) | 10.54 | 11.36 | 4.5 |
| destructive on destructive/10–12 tint (badge, button) | 5.56 / 5.35 | 5.43 (/20) | 4.5 |
| destructive button hover (light /20, dark /25) | 4.59 | 4.86 | 4.5 |
| success on success tint (badge) | 4.79 | 6.04 | 4.5 |
| warning on warning tint | 4.83 | 6.53 | 4.5 |
| info on info tint | 4.88 | 6.03 | 4.5 |
| success / warning / info tint inside a card footer (`bg-muted/50`) | 4.57 / 4.60 / 4.65 | ≥ 6 | 4.5 |
| brand badge (primary on primary/10, dark /20) | 9.05 | 6.60 | 4.5 |
| destructive / success / warning / info as text on card (activity, icons) | 6.67 / 5.67 / 5.72 / 5.80 | 7.74 / 9.01 / 9.98 / 9.11 | 4.5 |
| x-foreground on solid x (destructive / success / warning / info) | 6.37 / 5.46 / 5.47 / 5.57 | 8.05 / 9.12 / 9.87 / 9.27 | 4.5 |
| input border vs card / background | 3.39 / 3.29 | 3.45 / 3.75 | 3 |
| focus `ring/50` halo vs background / card | 3.14 / 3.17 | 3.59 / 3.54 | 3 |
| solid `border-ring` (button focus) vs background | 13.98 | 11.36 | 3 |
| two-color logo part (60 %) vs background | 3.70 | 4.67 | — (exempt) |
| lavender mark on indigo tile (favicon) | 8.87 | — | — (exempt) |

Known limits, accepted:

- `--border` (1.35:1) is decorative (card edges, dividers); shadcn cards also draw `ring-foreground/10`. Inputs use `--input`, which passes.
- Rejected before: `muted-foreground/80` (activity absolute date) = 3.86:1 → replaced by plain `text-muted-foreground`; `ring` = primary at 50 % = 2.83:1 → darker ring (Decision 10); dark destructive `oklch(0.71 …)` hover = 3.89:1 → lighter destructive + `/25` hover.

**Verification tool (user):** Chrome DevTools color picker on the element (shows the contrast ratio and AA/AAA checkmarks, accepts `oklch()`), plus the [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) with the hex values in *Tokens*. To convert other OKLCH values, [oklch.com](https://oklch.com). Claude re-runs the same computation (a scratchpad script, not committed) if any token changes during implementation.

## Hard-Coded Color Inventory

Grep of `src/` (2026-11-15): Tailwind palette classes (`(text|bg|border|ring|fill|stroke|…)-(red|…|black|white)`) and `#hex` / `rgb()` / `hsl()` / `oklch()` outside `globals.css`.

**Hard-coded palette classes: 2. Hex/rgb/hsl/oklch outside `globals.css`: 0.** Plus token misuse and contrast fixes:

| File | Current | Replacement | Kind |
|---|---|---|---|
| `src/components/ui/dialog.tsx:34` | `bg-black/10` (overlay) | `bg-overlay` | hard-coded |
| `src/components/ui/alert-dialog.tsx:33` | `bg-black/10` (overlay) | `bg-overlay` | hard-coded |
| `src/components/tools/ToolCard.tsx:57` | `availability === "available" ? "default" : "destructive"` | `AVAILABILITY_STYLES[availability]` | token misuse |
| `src/lib/loans.ts:7,17-23` | `BadgeVariant` type + `LOAN_STATUS_VARIANTS` | removed; `LOAN_STATUS_STYLES` in `src/lib/status-styles.ts` | move to the single map |
| `src/components/loans/LoanStatusBadge.tsx:13-14` | `LOAN_STATUS_VARIANTS[status]`, Overdue `destructive` | `LOAN_STATUS_STYLES` / `OVERDUE_STYLE` (+ icons) | map |
| `src/components/users/TrustedLenderBadge.tsx:7` | `variant="secondary"` | `TRUSTED_LENDER_STYLE` (`brand`) | map |
| `src/components/activity/ActivityEntry.tsx:16,23,25` | inline icon / `text-destructive` / `text-muted-foreground` choice | `ACTIVITY_STATUS_STYLES[item.status]` | map |
| `src/components/activity/ActivityEntry.tsx:28` | `text-muted-foreground/80` (3.86:1) | `text-muted-foreground` | contrast |
| `src/components/ui/button.tsx:18` | `dark:hover:bg-destructive/30` | `dark:hover:bg-destructive/25` | contrast |
| `src/components/layout/AppHeader.tsx:20`, `src/components/admin/AdminNav.tsx:32` | active link `bg-muted font-medium text-foreground` | `bg-secondary font-medium text-secondary-foreground` | brand polish (tokens) |
| `src/app/page.tsx:11-14` | text `h1` "LendLoop", tagline `text-muted-foreground` | `LendLoopLogo size="lg"` in the `h1`; tagline `font-medium text-primary` | brand polish (tokens) |
| `src/components/ui/sonner.tsx:31-38` | inline `style` mapping `--normal-*` to tokens | **kept** (shadcn-generated, token-only; see *Doc Conflicts*) | — |

## Default Branding Inventory

| File / item | State | Action |
|---|---|---|
| `src/app/favicon.ico` | create-next-app default (Next.js logo) | **Replace** with the LendLoop `.ico` (Decision 8) |
| `public/next.svg` | default, unreferenced | **Candidate for deletion — needs the user's confirmation** |
| `public/vercel.svg` | default, unreferenced | **Candidate for deletion — needs confirmation** |
| `public/file.svg` | default, unreferenced | **Candidate for deletion — needs confirmation** |
| `public/globe.svg` | default, unreferenced | **Candidate for deletion — needs confirmation** |
| `public/window.svg` | default, unreferenced | **Candidate for deletion — needs confirmation** (if all five go, `public/` becomes empty; Git drops empty folders, Next.js doesn't need it) |
| `metadata` in `src/app/layout.tsx` | already "LendLoop" + tagline (not the default) | Extend (template, `applicationName`, `viewport.themeColor`) |
| Geist fonts | create-next-app default, but neutral | Keep for body text |
| `README.md` | out of scope | Next spec |

## Metadata

```ts
// src/app/layout.tsx
export const metadata: Metadata = {
  title: { default: "LendLoop", template: "%s · LendLoop" },
  description: "Borrow what you need. Lend what you don't. A neighborhood board for lending and borrowing tools.",
  applicationName: "LendLoop",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBFCFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0C22" },
  ],
};
```

Per-page titles (static `export const metadata = { title: "…" }` in each `page.tsx`, next to `await auth.protect()`): `/tools` "All tools", `/tools/mine` "My listings", `/loans/requests` "My requests", `/loans/incoming` "Incoming requests", `/admin/loans` "Admin: loans", `/admin/listings` "Admin: listings", `/admin/users` "Admin: users". `/` keeps the default "LendLoop". Static metadata needs no request data, so `cacheComponents` is unaffected. Icons need no `metadata.icons` entry: the file conventions add the `<link>` tags.

## Public Page `/`

Colors and spacing only, no new feature, no restructuring of the data flow. Variation (a): **no colored panel**, everything on the page background.

- Heading block stays centered in the existing `max-w-5xl` column: `LendLoopLogo size="lg"` as the `h1` content (mark + Geist semibold wordmark, `text-4xl sm:text-5xl`, `text-primary`).
- Tagline `text-lg font-medium text-primary` (10.54:1), then `AuthStatus` unchanged (primary indigo button; "Checking session…" stays `text-muted-foreground`, 5.88:1).
- "Available tools" heading and the grid unchanged, with the existing cards; category badges `secondary` (lavender).
- Fits 375px: the wordmark wraps under the mark if needed (`flex-wrap justify-center`).

## Files to Create / Modify

| Path | Action | Responsibility |
|---|---|---|
| `src/app/globals.css` | modify | Palette (`:root` light + `[data-theme="dark"]`), new tokens and `@theme inline` entries, `@custom-variant dark` on `data-theme`, `color-scheme` |
| `src/lib/theme.ts`, `src/hooks/useTheme.ts`, `src/components/theme/ThemeToggle.tsx` | create | Theme toggle (see *Theme Toggle*) |
| `src/components/ui/badge.tsx` | modify | Variants `success`, `warning`, `info`, `brand` |
| `src/components/ui/dialog.tsx`, `src/components/ui/alert-dialog.tsx` | modify | `bg-black/10` → `bg-overlay` |
| `src/components/ui/button.tsx` | modify | `dark:hover:bg-destructive/30` → `/25` |
| `src/components/ui/sonner.tsx` | modify | `toastOptions.classNames.success/error/warning/info` icon colors; `theme` from `useResolvedTheme()` |
| `src/lib/status-styles.ts` | create | The single status → style map |
| `src/lib/loans.ts` | modify | Remove `BadgeVariant` and `LOAN_STATUS_VARIANTS` |
| `src/components/loans/LoanStatusBadge.tsx`, `src/components/tools/ToolCard.tsx`, `src/components/users/TrustedLenderBadge.tsx`, `src/components/activity/ActivityEntry.tsx` | modify | Use the map; icons; activity contrast fix |
| `src/components/layout/AppHeader.tsx`, `src/components/admin/AdminNav.tsx` | modify | Logo component and `ThemeToggle` in the header; active link style |
| `src/components/brand/logo-paths.ts`, `src/components/brand/LendLoopLogo.tsx` | create | Logo (see *Logo deliverables*) |
| `src/app/icon.svg`, `src/app/apple-icon.tsx` | create | Icons |
| `src/app/favicon.ico` | replace | LendLoop `.ico` |
| `src/app/layout.tsx` | modify | Metadata + viewport; `ClerkProvider appearance={clerkAppearance}`; theme inline script in `<head>`, `suppressHydrationWarning` on `<html>` |
| `src/lib/clerk-appearance.ts` | create | `clerkAppearance` (`variables` with `var(--token)`) |
| `src/app/page.tsx` | modify | Logo heading + indigo tagline; `ThemeToggle` top-right |
| `src/app/(app)/**/page.tsx` (7 files) | modify | `export const metadata = { title }` |
| `src/app/opengraph-image.tsx` | create | Only if Decision 12 = yes |
| `public/*.svg` (5) | delete | **Only after the user confirms** |
| `context/project-overview.md` | modify | Tech stack row "UI": brand palette + OS-driven dark mode; no feature change |

Clerk appearance (shape):

```ts
// src/lib/clerk-appearance.ts
import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

// @clerk/types is not installed with @clerk/nextjs 7; derive the type from the provider props.
type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;

export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorBackground: "var(--popover)",
    colorForeground: "var(--popover-foreground)",
    colorMuted: "var(--muted)",
    colorMutedForeground: "var(--muted-foreground)",
    colorInput: "var(--card)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    colorRing: "var(--ring)",
    colorDanger: "var(--destructive)",
    colorSuccess: "var(--success)",
    colorWarning: "var(--warning)",
    colorNeutral: "var(--foreground)",
    colorModalBackdrop: "var(--overlay)",
    borderRadius: "var(--radius)",
    fontFamily: "var(--font-sans)",
  },
} satisfies Appearance;
```

No new npm package and no new shadcn component (the toggle uses the existing `Button`).

## Manual Steps (User)

1. **Choices:** done (variation a, logo A, Geist, Indigo). Still open: OG image (yes / **no**, default no).
2. **Deletions:** ✅ confirmed for the five `public/*.svg` files (the default `favicon.ico` is replaced, not deleted).
3. **Browser check (DEV, translation off):** with `npx convex dev` + `npm run dev`, visit `/`, `/tools`, `/tools/mine`, `/loans/requests`, `/loans/incoming`, `/admin/loans`, `/admin/listings`, `/admin/users`, and open a dialog (request loan, remove tool), a toast, the Clerk sign-in modal and the `UserButton` menu.
   - in **light** and **dark** with the header toggle; then set it to **System** and switch the OS theme (or DevTools → Rendering → *Emulate CSS prefers-color-scheme*): the page follows without reload;
   - toggle persistence: choose Dark, reload → still dark with **no white flash**; open a second tab → same theme; change it in one tab → the other follows;
   - at **375px** (DevTools device mode) and on desktop;
   - check every status: a pending, approved, rejected, cancelled, returned and an overdue loan; available / on loan tools; Trusted Lender; activity entries (sent / failed at least).
4. **Favicon:** the browser tab shows the LendLoop tile in light and dark browser themes; on a phone, "Add to Home Screen" shows the apple icon. Hard-reload (or open `/icon.svg` and `/favicon.ico` directly) if the old icon is cached.
5. **Contrast spot-check:** in DevTools, inspect the `/` tagline, a `warning` badge and a muted text and confirm the ratios shown match *Contrast*.

## Implementation Steps (Claude)

All against DEV.

1. Branch `feature/theme-colors` from `main`.
2. `globals.css`: tokens (variation a, Indigo), `[data-theme="dark"]` block, `@theme inline` entries, `@custom-variant dark`, `color-scheme`. Replace `.dark`. Theme toggle: `src/lib/theme.ts`, `useTheme` hooks, inline script in `layout.tsx`, `ThemeToggle`, Sonner `theme`. Ask whether to `npm uninstall next-themes`.
3. Badge variants; `bg-overlay` in the two dialogs; destructive hover in `button.tsx`.
4. `src/lib/status-styles.ts`; refactor `loans.ts`, `LoanStatusBadge`, `ToolCard`, `TrustedLenderBadge`, `ActivityEntry` (incl. `/80` fix).
5. Logo (Option A): `logo-paths.ts`, `LendLoopLogo.tsx`, `AppHeader`, `AdminNav` active style.
6. Icons: `icon.svg`, `apple-icon.tsx`; generate `favicon.ico` with a scratchpad script (`sharp`, read `icon.svg`, write 16/32 PNGs, pack as ICO) and replace the file.
7. Metadata + viewport + per-page titles; Clerk `appearance`; Sonner icon classes.
8. Public page heading (`page.tsx`).
9. Grep again: no palette classes, no hex outside `globals.css` / logo files; no `next.svg` / `vercel.svg` references.
10. Check with Playwright (`browser_emulate_media` light/dark, `browser_resize` 375 / 1280) and screenshots; then walk the user through *Manual Steps*.
11. Delete the five `public/*.svg` defaults (already confirmed by the user).
12. Update `context/project-overview.md`.
13. `npm run lint`, `npm run test:run` (382, unchanged), `npm run build`.
14. Ask before committing. Go through *PROD Impact* before merging.

## PROD Impact

- **UI only.** No schema, index, Convex function, n8n, Clerk dashboard or env var change. The Vercel build still runs `npx convex deploy --cmd 'npm run build'`; the Convex push is a no-op (same functions).
- Clerk "LendLoop Prod" is not touched: `appearance` is client code shipped with the Next.js bundle.
- Rollback: Vercel Instant Rollback (nothing to revert in Convex).

After merge, on https://lendloop-tawny.vercel.app:

- [ ] `/` shows the indigo logo heading and tagline, signed out and signed in
- [ ] Header logo on the app pages; active link style
- [ ] Badges: a real PROD loan in each visible status; Trusted Lender on `/admin/users`
- [ ] Clerk sign-in modal and `UserButton` menu in the palette (light and dark OS theme)
- [ ] A toast (e.g. mark/unmark trusted) with the colored icon
- [ ] Favicon: open `/icon.svg`, `/favicon.ico`, `/apple-icon` directly (browsers cache favicons aggressively; a hard reload or a new profile may be needed to see the tab icon change)
- [ ] Page titles ("All tools · LendLoop") in the tab

Before merging:

- [ ] `npm run build` / `lint` / `test:run` pass
- [ ] DEV manual steps 1–5 done
- [ ] User confirms the merge

## Acceptance Criteria

- [ ] No Tailwind palette classes (`bg-black/10`, `text-green-600`, …) and no hex/rgb/hsl/oklch in `src/` outside `globals.css` and the logo/icon files
- [ ] All status looks come from `src/lib/status-styles.ts`; `on_loan` is no longer `destructive`
- [ ] No Next.js / Vercel default branding visible (tab icon, apple icon, `/favicon.ico`); unreferenced defaults deleted only if the user confirmed
- [ ] Favicon (tab, light and dark browser themes) and header logo show the Option A mark; `/` has the logo heading with no colored panel (variation a)
- [ ] WCAG 2.2 AA in light and dark: every pair in *Contrast* meets its target
- [ ] Every status has a text label (and the icons listed in *Status Map*) besides color
- [ ] Header and `/` have a theme button cycling System → Light → Dark with an accessible label; the choice persists (`localStorage`), syncs across tabs, and applies before first paint (no flash on reload); System follows live OS changes
- [ ] Dark mode covers the app, dialogs, toasts, Clerk modal / menu and native date inputs; no `next-themes` `ThemeProvider`; pages stay statically prerendered (no `cookies()` read)
- [ ] Clerk and Sonner use the palette; no new npm package; no new shadcn component
- [ ] Fits 375px without horizontal scroll (header, `/` heading, cards, dialogs)
- [ ] `npm run build`, `npm run lint`, `npm run test:run` pass; test count unchanged (382)
- [ ] No `--prod` command run

## Testing

No new tests: this feature changes styling and static assets only, and the coding standards exclude component tests. `src/lib/status-styles.ts` is a constant map typed with `Record<…>`, so a missing status fails `tsc` during `npm run build`. `LOAN_STATUS_VARIANTS` / `BadgeVariant` are used only by `src/lib/loans.ts` and `LoanStatusBadge.tsx` (grep), so moving them touches no test. Visual checks are the *Manual Steps* plus Playwright screenshots in light/dark at 375px and 1280px.

## Out of Scope

- `README.md` and screenshots (next spec)
- Animations, transitions, component restructuring, new layouts or features
- Saving the theme per account (Convex): the preference is per browser (`localStorage`)
- Any Convex, n8n, schema, function or env var change; any Clerk dashboard change
- An Open Graph image, unless the user opts in (Decision 12)
- Changing body typography (Geist stays)

## Decisions for the User

> **Decided by the user (2026-11-15), after a side-by-side preview:** palette variation **(a)** neutral + indigo, **Indigo** palette (alternatives Sage / Peach / Sunflower rejected), logo **Option A** (loop arrows), **Geist** (no new font). Items 4–7 keep the recommended defaults unless the user says otherwise. Item 8: **user confirmed the deletion** (2026-11-15); delete the five files on the feature branch (Implementation step 11), not on `main`.

1. **Palette variation** (Decision 1): ✅ (a) neutral + indigo.
2. **Logo** (*Logo Options*): ✅ A loop arrows.
3. **Serif display font** (Decision 2): ✅ no (Geist).
4. **Dark mode** (Decision 3): ✅ toggle button (System / Light / Dark), Next.js inline-script pattern, no new package. Open: remove the now-unused `next-themes` from `package.json`? (asked during implementation).
5. **Clerk** (Decision 6): `appearance.variables` with our tokens, no new package (recommended) vs the official shadcn theme (`npm install @clerk/ui`).
6. **Sonner** (Decision 7): token colors + colored icons (recommended) vs `richColors`.
7. **OG image** (Decision 12): yes / **no**.
8. **Delete** `public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`: ✅ yes (confirmed).

## Doc Conflicts

| Topic | Conflict | Followed |
|---|---|---|
| Dark mode wiring | Task brief and the shadcn Next.js guide: `next-themes` `ThemeProvider` with `attribute="class"` + `suppressHydrationWarning` | Next.js guide's inline-script pattern with `data-theme` + own toggle (Decision 3): official Next.js guidance, no package; next-themes 0.4.6 warns on Next.js 16 (issues #385 / #387) |
| Theme storage | Next.js guide shows both `localStorage` and a cookie | `localStorage` + script; a cookie read with `cookies()` in the root layout would block every segment under `cacheComponents` (guide) |
| Clerk shadcn theme package | Task brief / older docs: `@clerk/themes`; current Clerk docs: `@clerk/ui/themes` + `@clerk/ui/themes/shadcn.css` | Neither: `appearance.variables` (Decision 6), no new package |
| Clerk values | Clerk docs show `var(--brand-primary)` in `variables` but recommend direct colors "for maximum browser compatibility" | `var()` (app already needs modern browsers); hex fallback listed in *Tokens* |
| Clerk CSS variables | Changelog documents `--clerk-color-primary` only; other names inferred | Typed `appearance.variables` instead |
| Inline styles | `coding-standards.md`: "No inline styles"; shadcn's generated `sonner.tsx` uses `style` to map `--normal-*` to tokens | Kept (primitive code, token-only, documented by shadcn) |
| `--destructive-foreground` | Task brief asks for a `-foreground` pair; shadcn base-nova (v4) no longer ships `--destructive-foreground` (destructive is used as a soft tint) | Added back as a pair for consistency; current components keep the soft style |
| `--font-heading` | Task brief: serif for wordmark/titles only; base-nova maps `--font-heading` into card and dialog titles | Moot: the user chose no serif font (Decision 2) |
| SVG favicon support | Next.js docs list `icon.svg` as a valid icon; caniuse: Safari only from 26 | `icon.svg` + replaced `favicon.ico` (Decision 8) |
| `apple-icon` format | Task brief: "`apple-icon.png`"; Next.js: `.jpg`/`.png` or generated by code | Generated `apple-icon.tsx` (no binary, same path data) |
| Sonner docs | Context7 had no match for `richColors` in Sonner 2.0.8 | Read the installed `sonner/dist/styles.css` (hard-coded `hsl()` rich colors) |
| Status colors in History | `current-feature.md` (Automation Activity): "existing tokens only, no new colors" for activity | Superseded on purpose by this feature: activity icons get `success` / `warning` |

## References

- shadcn/ui — Theming (token pairs, OKLCH, `@theme inline`, adding `--warning`): https://ui.shadcn.com/docs/theming
- shadcn/ui — Dark mode for Next.js (`ThemeProvider`, `attribute="class"`, `suppressHydrationWarning`): https://ui.shadcn.com/docs/dark-mode/next
- shadcn/ui — Introduction ("open code", components are meant to be edited): https://ui.shadcn.com/docs
- shadcn/ui — Badge: https://ui.shadcn.com/docs/components/badge
- Tailwind CSS v4 — Theme variables (`@theme`, `@theme inline`): https://tailwindcss.com/docs/theme
- Tailwind CSS v4 — Dark mode (default `prefers-color-scheme`, `@custom-variant dark`, data-attribute variant): https://tailwindcss.com/docs/dark-mode
- Next.js — Preventing flash before hydration (Themes: inline `<head>` script, `data-theme`, `suppressHydrationWarning`, `localStorage` vs cookie under Cache Components, Strict Mode re-apply with `useLayoutEffect`, `InlineScript` helper): https://nextjs.org/docs/app/guides/preventing-flash-before-hydration
- Next.js — `favicon`, `icon`, `apple-icon` file conventions (types, `sizes="any"` for SVG, generated icons are statically optimized): https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons
- Next.js — `next/font` (self-hosting, `variable`, preloading scope: root layout → all routes): https://nextjs.org/docs/app/api-reference/components/font
- Next.js — `generateMetadata` / `metadata` (title template) and `viewport` (`themeColor`): https://nextjs.org/docs/app/api-reference/functions/generate-metadata · https://nextjs.org/docs/app/api-reference/functions/generate-viewport
- Next.js — `ImageResponse`: https://nextjs.org/docs/app/api-reference/functions/image-response
- caniuse — SVG favicons (Safari 26+, 92.55 % global): https://caniuse.com/link-icon-svg
- Clerk — Themes (shadcn theme in `@clerk/ui/themes`, optional CSS import): https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/themes
- Clerk — Variables (`colorPrimary` … `colorModalBackdrop`, `var()` example, direct-color recommendation, `color-mix()` requirements): https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/variables
- Clerk — CSS variables support changelog (`--clerk-color-primary`): https://clerk.com/changelog/2025-07-15-clerk-css-variables-support
- Sonner — Toaster (`richColors`, `toastOptions.classNames`, `theme`): https://sonner.emilkowal.ski/toaster
- next-themes — README: https://github.com/pacocoursey/next-themes · script-tag warning on Next.js 16: https://github.com/pacocoursey/next-themes/issues/385 · https://github.com/pacocoursey/next-themes/issues/387
- Google Fonts — Fraunces: https://fonts.google.com/specimen/Fraunces
- W3C — WCAG 2.2: 1.4.1 Use of Color, 1.4.3 Contrast (Minimum), 1.4.11 Non-text Contrast, 2.4.7 Focus Visible: https://www.w3.org/TR/WCAG22/ · Understanding 1.4.3: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html · Understanding 1.4.11: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- W3C — CSS Color 4 (OKLab/OKLCH → sRGB conversion): https://www.w3.org/TR/css-color-4/#color-conversion-code
- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/ · OKLCH picker/converter: https://oklch.com
- Local sources (read 2026-11-15): `node_modules/sonner/dist/styles.css` (rich colors), `node_modules/@clerk/` (no `@clerk/ui`), `node_modules/sharp` (present via Next.js), installed versions in `node_modules/*/package.json`; project code in `src/`, `components.json`, `next.config.ts`; the reference image (pixels sampled with Pillow)

Source notes: Context7 had no Sonner `richColors` entry, so the installed package CSS was read instead. The shadcn, Next.js, Clerk and caniuse pages above were fetched live on 2026-11-15. Contrast numbers come from Claude's own computation (CSS Color 4 matrices + WCAG relative luminance); the user should spot-check them in DevTools.
