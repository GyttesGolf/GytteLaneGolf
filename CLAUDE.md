# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The website for Gytte Lane Golf Society (Syresham, Northamptonshire, founded 1994). It is **not a build project** — there is no package.json, bundler, or test suite. It's a handful of self-contained static files deployed as-is:

- `index.html` — the entire site (~5,600 lines: all pages, styles, and JS in one file)
- `login.html` — standalone sign-in page (separate from index.html's own login modal — see Auth below)
- `sw.js` — service worker for offline support
- `CHANGELOG.md` — narrative history of the project, written phase-by-phase. Useful for *why* something exists, but the code has moved on in places (see "CHANGELOG vs. code" below) — verify against the code, don't take it as current truth.

No npm, no build step, no local dev server config. To preview changes, open `index.html` directly in a browser or serve the directory with any static file server. Deployment is a manual two-file drag-and-drop to Netlify (`index.html` + `sw.js`); there's no CI.

## Working in this codebase

- Everything lives in `index.html`: HTML sections, a single `<style>` block, and a single `<script>` block at the end. There's no module system — all JS is global functions and top-level `let`/`const` state (`events`, `committee`, `players`, `signups`, `allScorecards`, `isLoggedIn`, etc. — see top of the main script block).
- Find your way around by searching for the `/* ===== name ===== */` comment banners — the script is organized into clearly delimited regions (helpers, navigation, render: events, edit: events, render: committee, committee login, render: gallery, render: news, render: players, render: home, events map, live scores, offline score queue, render: rules, render: hall of fame, courses & ratings, payments, accounts, bottom nav, groupings, leaderboard, lightbox, init). The HTML above it has matching `<!-- ===== NAME ===== -->` banners for each page section.
- Rendering is manual DOM string-building: each `render*()` function rebuilds an element's `innerHTML` from the in-memory state arrays. There's no virtual DOM/diffing and no reactive framework — after mutating state (or after a Supabase write), call the relevant `render*()` function yourself.
- Navigation between "pages" (Home, Events, Committee, Players, Gallery, News, Shop, Live Scores, Rules, Hall of Fame, Accounts, Groupings, Leaderboard) is done client-side via `goTo(sectionName)`, which shows/hides `<section>` elements — there's no router or URL-based state.
- CSS custom properties at the top of `<style>` define the design system (colors, fonts) — check that block before hardcoding colors. Current palette is burgundy/ink (`--ink:#4B1320`) with brass/gold accents (`--brass:#B8862F`); the diagonal club-tie stripe (ink/claret/brass) is the repeated visual signature across header, dividers, and nav.
- Mobile-first: a bottom tab bar (`BOTTOM NAV`) plus a "More" drawer handle primary navigation; layout throughout should be checked at phone width first.

## Backend (Supabase)

All content, auth, and file storage is Supabase (PostgreSQL + Auth + Storage + Realtime, free tier). Client init and config are near the top of the script block (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `const db = window.supabase.createClient(...)`). There is no server-side code in this repo — all reads/writes happen client-side via `db.from('<table>')...`.

Known tables (grep `db.from(` to confirm current usage before assuming a schema): `societies`, `events`, `committee`, `gallery`, `news`, `players`, `signups`, `rules`, `honours`, `scorecards`, `hole_scores`, `courses`, `course_ratings`, `groups`, `group_players`, `event_payments`, `expenditures`. There are no `.sql` migration files in this repo (they're referenced by name in `CHANGELOG.md`'s "Database migration order" section but aren't checked in here) — if you need to change schema, you'll be writing SQL to run directly against the Supabase project, not editing a tracked migration file.

Row Level Security is used throughout: public read on content tables, public insert on `players`/`signups` only, and writes elsewhere gated to the authenticated committee account. When adding a new editable field/table, it needs a corresponding RLS policy in Supabase — this repo won't show you the policy, only the client code that assumes it exists.

## Auth: mid-migration state — verify before touching

The commit history shows several back-and-forth passes between Hanko (passkey provider) and native Supabase Auth, and **the code currently contains both**: `index.html` still loads `@teamhanko/hanko-elements` and defines a `<hanko-auth>` element / `HANKO_API` constant *and* has a Supabase-session-based `initAuth()`. `login.html` implements its own separate passkey flow via `signInWithPasskey()`/`registerPasskey()` (WebAuthn) plus Supabase. Do not assume either file's auth is in a finished/consistent state — read the actual `initAuth`, `renderLoginModal`, `committeeLogout`, and `handleEmailSubmit`/`signInWithPasskey` functions before modifying auth behavior, and check recent git log for the latest intent, since `CHANGELOG.md`'s Phase 4 description ("Supabase Auth with a single shared committee account") predates this passkey work and is out of date on this point.

There's a single shared committee login (not per-member accounts). `isLoggedIn` gates all edit/delete/add UI and committee-only views (e.g. Accounts) throughout the render functions.

## Offline support (`sw.js` + in-page logic)

- `sw.js` precaches the app shell and CDN libraries; navigation requests are network-first (falls back to cache offline), other assets are cache-first. It explicitly never intercepts `*.supabase.co`, `api.postcodes.io`, or `*.tile.openstreetmap.org` — live data must always hit the network.
- Separately, `index.html` keeps its own `localStorage` snapshot of all loaded data (`saveDataSnapshot`/`restoreDataSnapshot`, key `glgs-data-cache`) so the page has content to render even before/without the service worker.
- Live scoring has its own offline write queue (`/* offline score queue */` region): score taps are saved to `localStorage` first and synced to Supabase opportunistically (plus a periodic retry), so scoring works with no signal at the course and catches up later.

## Live scoring specifics

Stableford scoring by hole, entered per group. `SCORE_BLACKOUT_HOLE` (currently 13) controls when the public leaderboard freezes to preserve the finish as a surprise — committee logins bypass the blackout and see the full live standings. "Finalise" writes the top 3 + score summary into `results`/`honours`, keyed by event id so re-finalising updates rather than duplicates.

## Third-party services (all free tier — mind the limits)

- **Netlify** — hosting, manual/drag-and-drop deploy.
- **Supabase** — DB/auth/storage/realtime. Pauses the project after 7 days of zero traffic; 5GB/month bandwidth and 1GB storage caps (video uploads are the main consumer); no automatic backups — export key tables (especially `players`) periodically.
- **Leaflet + OpenStreetMap** — "Where we play" map on Home, plotting fixtures via each event's `postcode` field.
- **postcodes.io** — UK postcode → lat/lng geocoding for the map (client-side fetch, no key).
- **T Kings / uniformcity.co.uk** — external shop link, not part of this codebase.
