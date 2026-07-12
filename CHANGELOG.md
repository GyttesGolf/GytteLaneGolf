# Gytte Lane Golf Society Website — Change Log

Website for Gytte Lane Golf Society (Syresham, Northamptonshire, founded 1994). A single self-contained `index.html` (HTML/CSS/vanilla JavaScript, no frameworks) plus a service worker (`sw.js`), hosted on Netlify, with a Supabase (PostgreSQL) backend for all content, authentication, and file storage. Built collaboratively with Claude (Anthropic).

**Stack:** Netlify (hosting, free tier) · Supabase (database, auth, storage, realtime — free tier) · Leaflet + OpenStreetMap (map) · postcodes.io (UK postcode geocoding)

---

## Phase 1 — Initial site

- Replaced the society's old third-party Society Golfing site with a bespoke single-page website.
- Pages: Home, Events, Committee, Gallery, News, Shop (external link), Results.
- Design: burgundy (`#4B1320`) and brass/gold (`#B8862F`) colour scheme with a diagonal "club tie" stripe motif; Archivo headings (originally Fraunces, briefly Playfair Display), Work Sans body, IBM Plex Mono for dates/scores/labels.
- Cross-linking between sections: gallery items and news posts link to their fixture; results link back to events; clicking through highlights the target fixture.
- Society crest: the club's shield logo uploaded, recoloured so the shield background exactly matches the site burgundy (other colours untouched), and embedded in the header as an inline image.
- Footer: society name, `enquires@gyttelanegolf.co.uk` contact, and "Created by Gytte Lane Golf Society, assisted by AI."

## Phase 2 — Database (Supabase)

- Migrated all content out of hardcoded JavaScript into Supabase tables: `events`, `committee`, `gallery`, `news`, `results`. *(SQL: `supabase-setup.sql`)*
- Row Level Security throughout: public read access; writes restricted (see Phase 4).
- Site deployed to Netlify via drag-and-drop. Resolved a connection failure caused by a trailing slash in the Supabase project URL.

## Phase 3 — Events & sign-ups

- Event cards made clickable/expandable, showing a description, sign-up form, and attendee list. *(SQL: `supabase-update-signups.sql` — adds `players` and `signups` tables and an event `description` field)*
- Sign-up: returning players pick their name from a dropdown; new players enter first name, last name, email. Public insert allowed on `players`/`signups` only.
- Signed-up player count badge shown on collapsed event cards.
- Events view defaults to the "Upcoming" filter.
- WhatsApp share button on each fixture (committee-only): opens WhatsApp with a pre-written message (event details + site link). Initially also on news posts; later removed from news at committee request.

## Phase 4 — Committee authentication

- Supabase Auth with a single shared committee account.
- Login moved from an inline box on the Committee page to a discreet padlock button at the right of the nav, opening a modal; padlock turns brass and reads "Logged in" while a session is active. Login field label changed from "Email" to "Username". *(SQL: `add-photo-auth.sql` restricts storage uploads to authenticated users)*

## Phase 5 — Photos & media

- Supabase Storage bucket (`photos`) for all media. *(SQL: `add-photo-storage.sql`)*
- Committee page: photo upload per member (visible only when logged in); photos or initials placeholders shown on cards. *(SQL: `add-leaders-fields.sql` — first/last name split + `photo_url`)*
- Home page: "Captain & Vice-Captain" spotlight section (year self-updates each January) with a "Past captains →" link (added in Phase 11).
- Gallery: real photo/video display with committee upload per tile; later a one-step phone-friendly "Add to gallery" form (pick file → preview → title → description → linked fixture → publish). *(SQL: `add-gallery-description.sql`)*
- Fixed uploads silently not persisting: `gallery`/`committee` tables were missing UPDATE policies. *(SQL: `fix-upload-permissions.sql`)*
- Home page gallery preview prioritises items with real media over placeholders.

## Phase 6 — Home page

- Hero copy iterations, settling on: "Tradition on the fairway. Good company on the 19th." with intro text covering the society's UK and European travels. "Founded X years ago" self-calculates from 1994 (corrected from 1995).
- Removed the Founded/Fixtures/Home village stat row.
- "Next fixture" panel redesigned as a dark burgundy feature card with club-tie stripe, drop shadow, and a live countdown ("12 days to go" / "Today! Good luck out there").
- "Where we play" map: Leaflet + OpenStreetMap, plotting every fixture automatically from a `postcode` field via postcodes.io (no manual coordinates). Marker popups link to the fixture. *(SQL: `add-event-postcode.sql`)*
- Buttons: See upcoming fixtures · Meet the committee · Visit the shop.

## Phase 7 — Players & membership

- New Players page listing every member with: events attended (auto-counted from past-fixture sign-ups), Gyttes handicap (committee-editable), and a Membership Paid indicator. *(SQL: `add-player-handicap-membership.sql`)*
- Membership stores the *year last paid* rather than a flag, so it automatically resets every 1 January with no manual work; the column header year self-updates.
- Imported all 96 members with handicaps from screenshots of the old site's member list; email made optional to allow the import. *(SQL: `import-members.sql`)*
- Duplicate incident: the import was accidentally run twice, duplicating every member. Resolved with a transaction-safe merge script that kept the best record per person (preferring records with email, then handicap), migrated sign-ups/scorecards across, deleted duplicates, and added a `unique (first_name, last_name)` constraint to prevent recurrence. *(SQL: `delete-second-import-batch.sql`; earlier diagnostic/general-purpose scripts: `fix-duplicate-players.sql`, `auto-merge-duplicate-players.sql`)*
- Sign-up form also now matches existing players by name (not just email), linking rather than duplicating members imported without email addresses.

## Phase 8 — On-site content editing

All content became editable directly on the website when logged in as committee — no Supabase dashboard needed for day-to-day updates:

- **Events**: edit form (name, date, course, format, postcode, status, trophy, description), delete, "+ Add new fixture". *(SQL: `add-events-news-edit-permissions.sql`)*
- **News**: per-post edit toggle (title, date, excerpt, linked fixture), delete, "+ Add news post". Edit forms hidden behind an Edit button rather than always open.
- **Committee**: edit member name/role/sort order, remove, "+ Add member". *(SQL: `add-committee-gallery-edit-permissions.sql`)*
- **Gallery**: edit title/description/type/linked fixture, delete, add (see Phase 5).
- **Results**: inline edit (fixture, winner, runner-up, 3rd place, score), delete, "+ Add result". *(SQL: `add-results-edit-permissions.sql`; 3rd place column added with live scoring)*
- **Rules & Regulations**: new page of numbered rule cards, fully committee-editable, seeded with starter rules. *(SQL: `add-rules.sql`)*

## Phase 9 — Live Stableford scoring

*(SQL: `add-live-scores.sql` — `scorecards` and `hole_scores` tables, realtime enabled, `third_place` added to results)*

- New Live Scores page with three views: Leaderboard, group setup, and hole-by-hole entry.
- One marker per group selects their players (searchable list), then taps points (0–5) per player per hole across holes 1–18. Rounds resume automatically if the phone is closed mid-round.
- Live leaderboard updates in real time via Supabase Realtime; medal emoji for the top three; "Thru" column ("F" when finished); includes every signed-up player, with "Not started" rows for groups yet to begin.
- Jokey rotating labels on the current leader ("The handicap secretary would like a word") and last place ("Spent more time in the trees than a squirrel 🌳") — index-based last-place detection fixed so the label always lands on the lowest player who has actually started.
- **Score blackout**: public leaderboard freezes after hole 13 (`SCORE_BLACKOUT_HOLE` constant) to keep the finish a surprise; when all 18 holes are complete the public sees a "Scores are sealed!" screen while committee sees the full final standings.
- **Finalise**: committee button writes 1st/2nd/3rd + score summary to the Results page, with course details, updating rather than duplicating on re-finalise.
- Event selector shows name — course — date, with "Golf Club"/"GC" stripped and dd/mm/yy dates for phone-friendly width.

## Phase 10 — Offline support

- **Offline score queue**: every score tap saves to the phone first (localStorage) and syncs to Supabase when possible; queued scores upload automatically when signal returns (plus a 20-second retry loop). Status strip shows "All scores synced" / "No signal — N scores saved on this phone" / "Syncing…". Queue survives browser restarts.
- **Service worker (`sw.js`)**: the site opens with no signal — the page shell and CDN libraries are cached on-device; navigation is network-first so updates still come through. Supabase, postcodes.io and map tile requests are never intercepted.
- **Offline data snapshot**: all content is snapshotted to the device after each successful load and restored (with an "Offline mode" banner) when there's no connection.
- Group setup requires signal (best done at the clubhouse before teeing off); scoring itself then works fully offline. **Deployment note: Netlify deploys are now a two-file folder — `index.html` + `sw.js`.**

## Phase 11 — Hall of Fame

*(SQL: `add-hall-of-fame.sql`, `add-event-trophy.sql`)*

- Historical honours (1994–2002) transcribed from a photographed paper "Hall of Fame" sheet, normalised to current event naming (Winter/Spring/Summer/Autumn Trophy, Captains Day, Tour), reviewed and confirmed by the committee, and seeded into a new `honours` table. Most Consistent Player excluded at committee request. "Spring Tour" later renamed "Tour". 2003–2006 handwritten entries and the 2002 Winter Trophy winner still to be transcribed.
- **Trophy shelf design**: a grid of cards, each with a hand-drawn brass SVG trophy silhouette per competition (cup, shield, claret jug, salver, column cup, globe, medal, twin cups). Tapping a trophy unfolds a burgundy panel listing its winners year by year with course names. Oldest-first ordering.
- **Past Captains board**: burgundy board with brass frame and gold lettering; supports Vice-Captains (no historical VC records exist; recorded from now on). Linked from the home page captain spotlight.
- Fully committee-editable (edit/delete per entry, "+ Add entry").
- **Automatic feed**: events carry an optional Trophy field; when a trophy fixture's result is finalised (live scoring or manual entry), the winner is automatically written to the Hall of Fame — titled "Trophy — Course", linked by event ID so corrections update rather than duplicate.

## Phase 12 — Results page redesign

- Results restyled from a table into **vintage scorecard cards**: ruled-paper background, burgundy header strip with fixture details, angled red "RESULT" stamp, and a podium layout — winner large in handwritten script (Caveat), runner-up and 3rd flanking — with score summary and fixture link in a dashed footer.
- The society crest displayed as a large faint watermark behind the page (reuses the header crest automatically).
- Editing, deleting, adding, and fixture links all preserved within the new card design.

## Content & housekeeping

- Shop: links to the society's shop at T Kings (`uniformcity.co.uk/shop/gytte-lane-golf-society`); copy settled on "ties and tops".
- News: launch posts written and published for the shop opening and the new ties/t-shirts.
- Founded date corrected to 1994 site-wide.
- Copy iterations on hero, shop, and event text throughout.

## Known limitations / future ideas

- 2003–2006 Hall of Fame entries and 2002 Winter Trophy winner still to be added.
- Payments (event fees at sign-up) discussed: recommended approach is a Stripe Payment Link with success-redirect (no infrastructure), or Netlify Functions for a fully verified flow. Not yet implemented.
- Free-tier watch items: Supabase pauses after 7 days with zero traffic; Supabase 5 GB/month bandwidth (videos are the main consumer) and 1 GB storage; Netlify credit costs per deploy — batch changes where possible. Neither platform can incur surprise charges.
- No automatic database backups on the free tier — export key tables (especially `players`) as CSV once a season.
- Recommended next step: move deployment to GitHub + Netlify auto-deploy for version history and easier updates.

---

## Database migration order

For a from-scratch rebuild, run in this order:

1. `supabase-setup.sql`
2. `supabase-update-signups.sql`
3. `add-photo-storage.sql`
4. `add-leaders-fields.sql`
5. `add-photo-auth.sql`
6. `fix-upload-permissions.sql`
7. `add-event-postcode.sql`
8. `add-player-handicap-membership.sql`
9. `import-members.sql` — **run once only**
10. `add-events-news-edit-permissions.sql`
11. `add-committee-gallery-edit-permissions.sql`
12. `add-results-edit-permissions.sql`
13. `add-live-scores.sql`
14. `delete-second-import-batch.sql` — includes the unique-name constraint
15. `add-rules.sql`
16. `add-gallery-description.sql`
17. `add-hall-of-fame.sql`
18. `add-event-trophy.sql`
19. One-off: `update honours set title = replace(title, 'Spring Tour', 'Tour') where title like 'Spring Tour%';`

Also required outside SQL: a Supabase Auth user (the shared committee login, auto-confirmed) and the Realtime publication for `hole_scores` (included in `add-live-scores.sql`).
