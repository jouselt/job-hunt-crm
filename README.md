# Job Hunt CRM

[![CI](https://github.com/jouselt/job-hunt-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/jouselt/job-hunt-crm/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A **self-hosted** pipeline CRM for job seekers. Track every application as a
pipeline, follow up on time, and see your search at a glance — all running on
your own hardware behind your own reverse proxy. No cloud account, no vendor
lock-in.

> **This project is built for self-hosting.** It ships as a small Docker Compose
> stack (PostgreSQL + NestJS API + static Angular frontend) that sits behind a
> reverse proxy like Caddy, Traefik, or nginx. The example config assumes a
> subpath (`/job-hunt-crm/`) so it coexists with your other self-hosted apps.

## Features

- **Applications CRUD** — record roles you applied to, with source, stage, and notes.
- **Stage pipeline** — `saved → applied → screened → interview → offer`. `saved` is the entry point: tracking a posting records that you saved it, not that you applied. `applied_date` is sealed when a row *reaches* `applied`. `rejected` is terminal (not a Kanban column).
- **Follow-up scheduling** — promoting a stage sets a follow-up +7 days out unless you set an explicit future date; `rejected` clears it.
- **Next follow-ups** — a view of everything due today or overdue.
- **Pipeline analytics** — per-stage counts, percentages over active applications, and average days-in-stage.
- **Daily reminder** — a 09:00 cron builds a per-user follow-up summary (emailed via SendGrid when configured; otherwise logged).
- **Offer triage** — a 09:00 cron scores new imported offers with the TypeSafe Jev API and applies fixed thresholds to decide SEND (card created) vs REVIEW (you decide).
- **Vacancy scoreboard** — a live feed of job postings scored against *your own* profile, ranked, with the breakdown behind every score. Track a posting into the pipeline or mark it gone; both are idempotent.
- **Per-user profile** — the skills and roles used for scoring live in Settings, per user. A second account scores against its own profile, not someone else's.
- **Per-user isolation** — every query is scoped by `user_id`; a PostgreSQL RLS policy backs it as defense-in-depth.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Angular 22.1 (standalone components) |
| Backend | NestJS 10.4 + TypeORM 0.3 + PostgreSQL 15 |
| Auth | JWT (`@nestjs/jwt` + `passport-jwt`), bcrypt password hashing |
| Scheduler | `@nestjs/schedule` (daily 09:00) |
| Email | SendGrid (optional) |
| DB | PostgreSQL 15, Row-Level Security per user |

## Architecture

```
                ┌──────────────────────────────────────────┐
   Browser ───► │  Reverse proxy (Caddy/Traefik/nginx)        │
                │   /job-hunt-crm/      → frontend:80         │
                │   /job-hunt-crm/api/  → backend:3000         │
                └──────────────────────────────────────────┘
                          │ compose network (jobhunt)
        ┌─────────────────┼─────────────────┐
     postgres          backend            frontend
   (bind mount)      (NestJS)           (nginx static)
```

All three services run on a private Docker network. Only the reverse proxy
reaches them; no ports are published to the wild (the compose file binds to
`127.0.0.1` and lets the proxy route from the host).

## Quick start (local, no proxy)

```bash
cp .env.example .env          # set JWT_SECRET (openssl rand -hex 32)
docker compose up -d --build
# open http://127.0.0.1:8092/job-hunt-crm/
```

The stack self-runs migrations on boot, so no manual migration step is needed.
Register the first account at `/register`, then sign in.

> **Prebuilt images.** Once a release is tagged, `amd64` and `arm64` images are
> published to GHCR, so an ARM homelab pulls instead of compiling:
> `ghcr.io/jouselt/job-hunt-crm-backend:<tag>` and
> `ghcr.io/jouselt/job-hunt-crm-frontend:<tag>`. Until the first tag exists, the
> build path above is the way in. See `CHANGELOG.md` for the current state.

> Local CORS: leave `CORS_ORIGIN` blank for a permissive local setup. For
> anything beyond localhost, put a reverse proxy in front (below) and set
> `CORS_ORIGIN` to your public origin.

## Configuration (`.env`)

| Variable | Purpose | Required |
|----------|---------|----------|
| `JWT_SECRET` | Secret used to sign JWTs | Yes |
| `DATABASE_URL` | PostgreSQL connection string (use host `postgres` inside compose) | Yes |
| `DB_USER` / `DB_PASS` / `DB_NAME` | Alternative to `DATABASE_URL` | No |
| `SENDGRID_API_KEY` | Enables reminder emails (otherwise they are logged) | No |
| `SENDGRID_FROM_EMAIL` | From address for reminder emails | No |
| `JEV_API_KEY` | TypeSafe Jev API key for offer triage (`POST /offers/import` → daily scoring). Optional fallback; users can save their own key in Settings | No |
| `CORS_ORIGIN` | Public origin of the frontend (comma-separated). Blank = permissive | No |

`.env` is gitignored — never commit it.

## Offer Triage

`POST /offers/import` stores an offer with status `NEW`. The daily 09:00 cron
(`OfferTriageService.runDailyTriage`) then sends each `NEW` offer to the
TypeSafe Jev API, stores the raw answers, and applies a fixed threshold to turn
those answers into a decision. The decision is deterministic and auditable: the
numbers live in one file, `backend/src/offer-triage/triage-rules.ts`.

Jev is asked two questions:

| Question | Type | Value used |
|----------|------|------------|
| `fit` | `score` on `["poor", "fair", "good", "strong"]` | `score`, 0 to 3 |
| `hard_gate` | `noul`, asked as a disqualifier | `noul`, probability of a blocker, 0 to 1 |

The threshold rule:

```
SEND   iff  fitScore >= 2.0   (at least "good")
       AND  hardGateProbability < 0.2
REVIEW otherwise
```

`hard_gate` is deliberately phrased as a disqualifier ("is there a clear reason
to reject this offer?"), so a low `noul` means "no blocker" and is the
safe-to-send signal.

What each outcome does:

- `SEND` creates a Kanban card for the offer.
- `REVIEW` leaves the offer in the triage view for you to send or skip.
- `REJECTED` only ever comes from the manual skip endpoint. Jev no longer
  produces an automatic skip.
- A Jev error, a request timeout (5s), or a missing API key marks the offer
  `REVIEW`, so you see it instead of it being retried silently forever.

**Creating the card is not submitting the application.** A triage `SEND`
records the application at stage `applied` with `applied_date = today` and a
follow-up 7 days out; sending the CV itself is still manual. Move the card's
stage once you have actually applied.

The API key comes from one of two places:

- Per user: save it in **Settings** (stored encrypted, used for that user only).
- Global fallback: `JEV_API_KEY` in `.env`, used when the user has no saved key.

## Vacancy scoreboard

A second surface, for the part of a search that happens before you apply: postings
you have not read yet. The app ingests a feed, scores every posting against
**your** profile, and ranks them.

```
POST /vacancies/refresh    # ingest (background job, progress via GET)
GET  /vacancies/scoreboard # ranked list + rejected list + totals
```

**Scoring is deterministic and lives in one place.**
`backend/src/vacancies/vacancy-rules.generated.ts` holds the weights; it is
generated from the Python ranker in `tools/`, which is the source of truth. The
TypeScript port exists so the app and the ranker cannot disagree, and
`backend/test/fixtures/scoring-golden.json` is a fixture of scored cases that
fails the build if they drift. Change a rule in the Python, regenerate, and the
fixture tells you what moved.

**Scores are shown with their denominator.** A raw number with no ceiling reads as
a grade, so the UI shows the rank, the percentage over the top score, and the raw
points. Ordering is always by raw points.

**Every score can be opened.** Tapping a card shows the breakdown: which skills
matched, which of them were in the title, the signals that fired, and where the
scored text came from.

**Honest limits, stated in the UI.** The feed publishes roughly 59 characters of
description, so a posting is scored from its title alone. The app says so on the
posting instead of implying it read the ad, and the detail view repeats it.

**Track records that you saved, not that you applied.** It creates the row at
stage `saved` with no `applied_date`; the date is sealed when you move the card to
`applied`. Nothing in this project applies to a job for you.

**Gone is your call.** The feed never says when a posting closes, so the app does
not guess and does not probe LinkedIn. Marking a posting gone removes it from the
ranked list and from the ceiling the percentages are drawn against, and it can be
restored. Both operations are idempotent.

### About the feed

The bundled adapter reads [pegas.devschile.cl](https://pegas.devschile.cl), a
Chilean community job board. It is one adapter, not the product; the scoreboard is
useful against any list of postings with a title, a company and a date.

The adapter is deliberately polite, because it talks to somebody else's server:
browser User-Agent, a one-second pause between pages, and retries. If you point it
at a different source, keep that behaviour.

## Reverse proxy (Caddy)

See `Caddyfile.example`:

- **Variant A** — JWT only (the app keeps its own login).
- **Variant B** — optional Authelia SSO in front of the subpath.

The route is subpath-first:

```caddy
handle /job-hunt-crm/api/* {
    uri strip_prefix /job-hunt-crm
    reverse_proxy backend:3000
}
handle /job-hunt-crm/* {
    reverse_proxy frontend:80
}
```

## Deploying on a NixOS homelab (step by step)

Recommended if you already run Caddy + Docker on NixOS. The app is designed to
live alongside your other self-hosted services.

1. **Clone** the repo somewhere on the host (e.g. under your services dir):
   ```bash
   git clone https://github.com/jouselt/job-hunt-crm.git /home/shared/data/job-hunt-crm
   cd /home/shared/data/job-hunt-crm
   ```
2. **Configure secrets** — copy `.env.example` to `.env` and set at least `JWT_SECRET`:
   ```bash
   cp .env.example .env
   sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
   ```
   Set `CORS_ORIGIN` to your public origin (e.g. `https://nixos-x99.tailf8f9a2.ts.net`).
   Leave it blank if Caddy serves the frontend and API from the same origin.
3. **Start the stack** (migrations run automatically on first boot):
   ```bash
   docker compose up -d --build
   ```
4. **Wire Caddy** — add the `/job-hunt-crm` routes from `Caddyfile.example`
   (Variant A) to your Caddy config. If you manage Caddy via NixOS, add them to
   your `caddy.nix` (a `nixos-module.example.nix` is provided as a reference) and
   run `sudo nixos-rebuild switch`; otherwise `caddy reload`.
5. **Open it** — visit `https://<your-domain>/job-hunt-crm/`, click **Create
   account**, and register your first user.
6. **Backups** — the compose file already bind-mounts PostgreSQL's data
   directory to `/home/shared/data/job-hunt-crm/postgres`. As long as
   `/home/shared/data` is in your host backup routine (rclone, restic, Borg,
   …), the database is covered. No extra step needed.
7. **Health checks** — the compose defines a backend healthcheck on `/api/health`
   and a frontend (nginx) healthcheck. Point Uptime Kuma or similar at
   `http://127.0.0.1:3100/api/health` and `http://127.0.0.1:8092/` if you want
   monitoring.
8. **(Optional) SSO** — to protect the app behind Authelia/SSO, use Variant B
   from `Caddyfile.example`. The app still keeps its own login; SSO just gates
   the subpath.

That's it — the app is now a first-class citizen of your homelab.

## Auth & registration

Registration is **open by default**: anyone who can reach the login page can
create an account. For a private homelab behind Tailscale/VPN this is fine. If
you expose the subpath publicly, put Authelia (Variant B) or another
authenticating proxy in front, or close registration after your first user.

Accounts are isolated: each user only sees their own applications and follow-ups.

## API reference

Base URL (behind proxy): `https://<your-domain>/job-hunt-crm/api`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/health` | Health check | — |
| POST | `/auth/register` | Register `{ email, password }` → `{ access_token, user }` | — |
| POST | `/auth/login` | Login `{ email, password }` → `{ access_token, user }` | — |
| GET | `/applications` | List own applications | JWT |
| POST | `/applications` | Create (company + role required; optional `stage`, defaults to `applied`) | JWT |
| PATCH | `/applications/:id/stage` | Promote stage (forward or reject only) | JWT |
| GET | `/analytics/pipeline` | Pipeline stats | JWT |
| GET | `/follow-ups` | Applications due (`follow_up_date` ≤ today) | JWT |
| POST | `/offers/import` | Store an offer as `NEW`, to be scored by the next triage run | JWT |
| GET | `/offers` | List own offers with their decision | JWT |
| GET | `/offers/review` | The queue that needs your decision | JWT |
| POST | `/offers/:id/send` | Accept the offer and create its application card | JWT |
| POST | `/offers/:id/skip` | Reject the offer. The only path to `REJECTED` | JWT |
| GET | `/settings/jev-key` | The saved Jev key, masked | JWT |
| POST | `/settings/jev-key` | Save the key (204). Verified against the vendor first | JWT |
| GET | `/settings/profile` | `{ configured, profile }` — the scoring profile | JWT |
| POST | `/settings/profile` | Set skills, roles and depth used for scoring | JWT |
| GET | `/vacancies/scoreboard` | Ranked postings, the rejected list, and totals | JWT |
| GET | `/vacancies/refresh` | Progress of the running ingest, or the last result | JWT |
| POST | `/vacancies/refresh` | Start an ingest from the feed | JWT |
| POST | `/vacancies/rescore` | Re-score stored postings against the current profile | JWT |
| POST | `/vacancies/:id/track` | Create an application from a posting, at stage `saved` | JWT |
| POST | `/vacancies/:id/dismiss` | Mark a posting as gone. Idempotent | JWT |
| POST | `/vacancies/:id/restore` | Undo a dismiss. Idempotent | JWT |

Headers: `Authorization: Bearer <token>` and `Content-Type: application/json`.

## Optional seed data

```bash
docker compose run --rm backend npm run seed
```

Inserts three sample applications for a demo user. These rows are not tied to
any registered login, so they are invisible from the UI — handy only as a schema
check.

## Development

```bash
# backend
cd backend && cp .env.example .env && npm install && npm run migration:run && npm run start:dev
# frontend
cd frontend && npm install && npm run start   # http://localhost:4200
```

The frontend dev server talks to `http://localhost:3000/api` (see
`frontend/src/environments/environment.ts`).

## Project layout

```
backend/src/
  applications/   entity, DTOs, service, controller, stage transitions
  auth/           JWT strategy, guard, service + controller (register/login)
  analytics/      pipeline stats service + controller
  follow-ups/     due service, controller, daily reminder cron
  health/         /health
  offer-triage/   offers entity/service, Jev client, deterministic triage rules + cron
  vacancies/      feed ingest, scoring, scoreboard, track/dismiss/restore
  settings/       per-user Jev key and scoring profile
  migrations/     Initxxxxxx (tables + RLS policies) and later feature migrations
  seed/           sample data
frontend/src/app/
  components/     applied-list, add-application, kanban-board,
                  pipeline-overview, next-followups, login, register, stage-badge
  services/       job-hunt.service (applications$, pipelineStats$, due$)
spec.md           specification (what)
design.md         design decisions (how)
```

## License

[MIT](./LICENSE) — do what you want, just keep the notice.
