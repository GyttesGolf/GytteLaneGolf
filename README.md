# Golf App Platform

A multi-tenant platform for golf societies — one codebase and database serving multiple societies, each isolated by tenant and reachable on their own domain.

It started as a dedicated website for **Gytte Lane Golf Society** (Syresham, Northamptonshire, founded 1994), live at **[gyttelanegolf.co.uk](https://gyttelanegolf.co.uk)**, and later grew into a platform. Gytte Lane remains the first society onboarded and the only one live in production today.

It's a **pure cloud platform, built entirely on managed SaaS** — no server of its own to provision, patch, or scale. Every one of those services (GitHub, Netlify, Supabase, Grafana Cloud) is also directly reachable by Claude via API, so day-to-day operation — deploys, database queries, dashboard changes — can be driven agentically rather than through each provider's dashboard by hand.

📐 **[Architecture diagram](docs/architecture.html)** — how the pieces (GitHub, Netlify, Supabase, GoDaddy DNS, mapping, Grafana) fit together. GitHub won't render it inline (it's SVG embedded in HTML, not a standalone `.svg`), so open it via the live deploy: [gyttelanegolf.co.uk/docs/architecture.html](https://gyttelanegolf.co.uk/docs/architecture.html).

📊 **[Grafana dashboard](https://savvyscone988.grafana.net/d/azg5k6/golf-app-platform-overview)** — cross-society activity, players, signups, and payments, rolled up read-only from the live database (Platform Admin login required to reach it from within the app).

## What's here

There's no build step, bundler, or test suite — just a handful of self-contained static files:

| File | Purpose |
|---|---|
| `index.html` | The entire site — all pages, styles, and JS in one file |
| `login.html` | The sign-in surface (passkey or magic link via Supabase Auth) |
| `sw.js` | Service worker for offline support |
| `docs/architecture.html` | Component architecture diagram |
| `CLAUDE.md` | Full technical reference — schema, RLS model, multi-tenancy, auth, offline design, third-party services |
| `CHANGELOG.md` | Narrative history of the project, phase by phase |

To preview changes, open `index.html` directly in a browser or serve the directory with any static file server.

## Stack

- **Hosting/deploy**: [Netlify](https://netlify.com), auto-deploying every push to `main` — no staging step
- **Domain/DNS**: GoDaddy, pointed at Netlify
- **Backend**: [Supabase](https://supabase.com) — Postgres, Auth, Storage, Realtime, all accessed client-side (no server code in this repo)
- **Analytics**: [Grafana Cloud](https://grafana.com), read-only against the same Postgres database via a connection pooler — see the [dashboard](https://savvyscone988.grafana.net/d/azg5k6/golf-app-platform-overview)
- **Mapping**: Leaflet + OpenStreetMap for the "Where we play" map, [postcodes.io](https://postcodes.io) for postcode geocoding

All managed SaaS, free tier — nothing here is self-hosted, and every service above has an API Claude can use directly to operate the platform (deploy status, live SQL, dashboard edits) rather than just advise on it.

## Contributing

Read [CLAUDE.md](CLAUDE.md) first — it's the up-to-date technical reference (schema, RLS policies, auth flow, known follow-up work) for anyone or anything working on this codebase, including Claude Code.
