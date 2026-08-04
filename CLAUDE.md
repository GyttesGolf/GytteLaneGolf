# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The website for Gytte Lane Golf Society (Syresham, Northamptonshire, founded 1994). It is **not a build project** — there is no package.json, bundler, or test suite. It's a handful of self-contained static files deployed as-is:

- `index.html` — the entire site (~5,600 lines: all pages, styles, and JS in one file)
- `login.html` — the only sign-in surface (see Auth below); `index.html` has no login UI of its own, it links out to this page
- `sw.js` — service worker for offline support
- `CHANGELOG.md` — narrative history of the project, written phase-by-phase. Useful for *why* something exists, but the code has moved on in places — verify against the actual code before trusting it, especially for auth (it describes an earlier, now-superseded design).

No npm, no build step, no local dev server config. To preview changes, open `index.html` directly in a browser or serve the directory with any static file server. **Deployment is automatic**: Netlify is connected directly to this GitHub repo (`GyttesGolf/GytteLaneGolf`) and deploys on every push to `main` (verified via the Netlify API, 2026-08-04) — pushing to `main` is a live production deploy, there's no separate staging/review step unless you add branch protection or a PR requirement yourself.

## Working in this codebase

- Everything lives in `index.html`: HTML sections, a single `<style>` block, and a single `<script>` block at the end. There's no module system — all JS is global functions and top-level `let`/`const` state (`events`, `committee`, `players`, `signups`, `allScorecards`, `isLoggedIn`, etc. — see top of the main script block).
- Find your way around by searching for the `/* ===== name ===== */` comment banners — the script is organized into clearly delimited regions (helpers, navigation, render: events, edit: events, render: committee, committee login, render: gallery, render: news, render: players, render: home, events map, live scores, offline score queue, render: rules, render: hall of fame, courses & ratings, payments, accounts, bottom nav, groupings, leaderboard, lightbox, init). The HTML above it has matching `<!-- ===== NAME ===== -->` banners for each page section.
- Rendering is manual DOM string-building: each `render*()` function rebuilds an element's `innerHTML` from the in-memory state arrays. There's no virtual DOM/diffing and no reactive framework — after mutating state (or after a Supabase write), call the relevant `render*()` function yourself.
- Navigation between "pages" (Home, Events, Committee, Players, Gallery, News, Shop, Live Scores, Rules, Hall of Fame, Accounts, Groupings, Leaderboard) is done client-side via `goTo(sectionName)`, which shows/hides `<section>` elements — there's no router or URL-based state.
- CSS custom properties at the top of `<style>` define the design system (colors, fonts) — check that block before hardcoding colors. Current palette is burgundy/ink (`--ink:#4B1320`) with brass/gold accents (`--brass:#B8862F`); the diagonal club-tie stripe (ink/claret/brass) is the repeated visual signature across header, dividers, and nav.
- Mobile-first: a bottom tab bar (`BOTTOM NAV`) plus a "More" drawer handle primary navigation; layout throughout should be checked at phone width first.

## Backend (Supabase)

All content, auth, and file storage is Supabase (PostgreSQL + Auth + Storage + Realtime, free tier). Client init and config are near the top of the script block (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `const db = window.supabase.createClient(...)`). There is no server-side code in this repo — all reads/writes happen client-side via `db.from('<table>')...`.

Known tables (verified directly against the live schema, 2026-08-04 — grep `db.from(` if this drifts): `societies`, `events`, `committee`, `gallery`, `news`, `players`, `signups`, `rules`, `honours`, `scorecards`, `hole_scores`, `courses`, `course_ratings`, `groups`, `group_players`, `event_payments`, `expenditures`. There is no `results` table, despite some UI copy saying "results" — `finaliseScores()` only ever writes to `honours`. There are no `.sql` migration files in this repo — if you need to change schema, you'll be writing SQL to run directly against the Supabase project, not editing a tracked migration file.

**Multi-tenancy: schema scaffolding only, not actually implemented.** Every content table has a `society_id` column, and inserts stamp it via a module-level `societyId` variable — but that variable is just "whichever row `societies` happens to return first" (`select('id').limit(1).single()`), and **no read query anywhere filters by `society_id`** (`grep -c "eq('society_id'" index.html` → 0). In practice this is invisible because there is exactly one row in `societies` right now. But this is not multi-tenant in any working sense: if a second society row were ever added, every list/read in the app would show a mixed pool of both societies' data, and new records would get attributed to an unpredictable one of them. Treat `society_id` as a label carried on each row for a possible future migration, not as an access boundary — it isn't enforced by RLS either. If you're asked to make this genuinely multi-tenant, that means adding `society_id` filters to every `select()` *and* to every RLS policy below, not just trusting the column already being there.

**RLS is scoped and enforced as of 2026-08-04** (tightened from an earlier state where every write was open to `public` with no auth check at all — verify this hasn't regressed by re-running `select tablename, policyname, cmd, roles from pg_policies where schemaname='public'` before assuming it's still true). Current model, backed by a `public.is_admin()` SQL function (checks `auth.email()` against `players.is_committee`/`active`):
- **Public** (no login) SELECT on all content tables except `expenditures` (admin-only, since it's never shown to non-admins anyway); public INSERT on `signups` and `course_ratings` only (event sign-up and course rating are both deliberately login-free, self-service by picking your own name from a dropdown — there's no identity check tying a row to the person who actually created it).
- **Member** (any authenticated player, `is_committee` or not) INSERT on `gallery` only — the database permits this, but as of this writing `index.html`'s `renderGallery()` still only shows the upload form when `isLoggedIn` (admin) is true, so no client-side UI actually exposes this to non-admin members yet. Closing that gap (an `isMember` flag distinct from `isLoggedIn`) is pending — don't assume it's wired up without checking.
- **Admin** (`is_committee`) — everything else: all UPDATE/DELETE, and INSERT on every table other than `signups`/`course_ratings`/`gallery`.
- This is enforced at the database level now, not just hidden in the UI — confirmed by a live anonymous `curl` against the REST API returning 401 on a write attempt.

## Auth: Supabase Auth (passkey + magic link), admin gated by `is_committee`

The Hanko/Supabase migration referenced in older commits is finished — `index.html` no longer loads `@teamhanko/hanko-elements` or has any login modal of its own. `login.html` is the sole sign-in surface, offering passkey (`signInWithPasskey()`/`registerPasskey()`, WebAuthn via Supabase's `experimental.passkey` flag) or a magic-link email fallback (`handleEmailSubmit()`). Both paths funnel through `completeLogin()`, which looks the signed-in email up in `players` and requires `active !== false`.

**Known sharp edge**: `signInWithPasskey()`'s own response doesn't reliably carry the user's email (it's an experimental Supabase feature) — always re-fetch via `sb.auth.getUser()` before trusting `user.email`, rather than the direct sign-in response. Getting this wrong produces a false "this email isn't registered" error for genuinely registered players.

Auth is **not** a single shared committee account — any active player can sign in via `login.html`. But signing in alone doesn't grant admin rights: `index.html`'s `initAuth()` only sets `isLoggedIn` (which gates all edit/delete/add UI and the Accounts page) when the signed-in email matches an active player whose `is_committee` column is also `true`. Since all player/event data is already publicly readable, a signed-in non-admin player currently sees the same view as an anonymous visitor — there's no third "logged in, not admin" experience yet (may change later, but don't assume one exists).

The player-edit "Admin access" checkbox (DB column `is_committee`, element id `ep-committee-${p.id}` — name kept for now to avoid a schema rename) is what actually grants edit rights. This is unrelated to the "Committee" nav page/table (`committee` table, `renderCommittee()`) — that's the public list of club officers (captain, secretary, etc.), a different concept from site admin permissions. All user-facing text uses "Admin"/"Admin access" for the permission concept and "Committee" only for the officers page.

## Offline support (`sw.js` + in-page logic)

- `sw.js` precaches the app shell and CDN libraries; navigation requests are network-first (falls back to cache offline), other assets are cache-first. It explicitly never intercepts `*.supabase.co`, `api.postcodes.io`, or `*.tile.openstreetmap.org` — live data must always hit the network.
- Separately, `index.html` keeps its own `localStorage` snapshot of all loaded data (`saveDataSnapshot`/`restoreDataSnapshot`, key `glgs-data-cache`) so the page has content to render even before/without the service worker.
- Live scoring has its own offline write queue (`/* offline score queue */` region): score taps are saved to `localStorage` first and synced to Supabase opportunistically (plus a periodic retry), so scoring works with no signal at the course and catches up later.

## Live scoring specifics

Stableford scoring by hole, entered per group. `SCORE_BLACKOUT_HOLE` (currently 13) controls when the public leaderboard freezes to preserve the finish as a surprise — admin logins bypass the blackout and see the full live standings. "Finalise" (`finaliseScores()`) writes only the winner into `honours` via `syncHonourForEvent()`, keyed by event id so re-finalising updates rather than duplicates — there's no separate table recording the full top-3/score summary despite what the button copy implies.

## Known follow-up work (not yet done)

- **No HTML escaping anywhere.** Every `render*()` function inserts data straight into `innerHTML` with no `escapeHtml()`-style helper in the codebase. Now that RLS is scoped (see above), the practical risk is narrower than it was — only `is_committee` admins can write most free-text fields, and any signed-in member can write `gallery` caption/description — but a compromised or careless admin/member account can still stored-XSS every visitor. Fix in progress; not done as of this writing.
- **`isMember` client-side tier** (see RLS section above) — needed so the gallery upload form actually appears for non-admin signed-in members, matching what the database already permits.

## Third-party services (all free tier — mind the limits)

- **Netlify** — hosting; auto-deploys from GitHub on push to `main` (see "What this is" above).
- **Supabase** — DB/auth/storage/realtime. Pauses the project after 7 days of zero traffic; 5GB/month bandwidth and 1GB storage caps (video uploads are the main consumer); no automatic backups — export key tables (especially `players`) periodically.
- **Leaflet + OpenStreetMap** — "Where we play" map on Home, plotting fixtures via each event's `postcode` field.
- **postcodes.io** — UK postcode → lat/lng geocoding for the map (client-side fetch, no key).
- **T Kings / uniformcity.co.uk** — external shop link, not part of this codebase.
