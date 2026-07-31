# MedLink

A healthcare platform connecting patients, doctors, and diagnostic labs, with an
admin role that verifies doctor and lab credentials.

**All six planned phases are complete:**

1. **Foundation** — four roles register, log in, and manage role-specific profiles; admin approves/rejects doctor and lab verification; public doctor/lab profile pages.
2. **Availability & Booking** — doctors publish weekly availability, patients book slots with Redis-backed locking that makes double-booking impossible, live status updates over Socket.io, email notifications.
3. **AI Triage & Doctor Matching** — a FastAPI service maps free-text symptoms to specialties via local sentence-transformer embeddings, with a red-flag layer that short-circuits to an emergency banner before any matching runs.
4. **Prescriptions** — doctors issue immutable, PDF prescriptions with a QR-verifiable link; patients get a chronological health timeline.
5. **Lab Referral Flow** — doctors refer patients to a lab for specific tests via an unguessable, expiring link; the lab tracks the booking through to report upload, notifying both patient and referring doctor.
6. **Polish, Admin, Deploy** — doctor ratings, an admin analytics dashboard, a notification center, global doctor/lab search, a rate-limiting pass across every route, and CI image publishing.

See [`docs/superpowers/plans/`](docs/superpowers/plans/) for the phase-by-phase
implementation plans this was built from, and [`CLAUDE.md`](CLAUDE.md) for the
full product/engineering brief.

## Architecture

```text
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Next.js    │ ──► │  Node.js/Express API │ ──► │  MongoDB (primary)  │
│  (frontend) │     │  auth, bookings,     │     │  Redis (slots,      │
│             │     │  profiles, rx, labs  │     │  cache, queues)     │
│             │ ──► │──────────────────────│     └─────────────────────┘
│             │     │  FastAPI (Python)    │
│             │     │  symptom triage +    │
│             │     │  doctor matching     │
└─────────────┘     └──────────────────────┘
```

Two backends, deliberately:

- **Node/Express** owns the *transactional* domain — auth, CRUD, bookings, file
  uploads. I/O-bound work where Node's async model excels.
- **FastAPI** owns the *intelligence* domain — embeddings, symptom→specialty
  mapping, ranking. Python's ML ecosystem (sentence-transformers, scikit-learn)
  is the natural fit, and it costs nothing to run since the model runs locally.
- The two services talk over HTTP inside the Docker network only — FastAPI is
  never exposed publicly. Node proxies every request to it, with a timeout and
  a fallback to a manual specialty picker if the AI service is down, so a
  single service outage never blocks the booking flow.

## Layout

| Path | What it is |
|---|---|
| `apps/api` | Express + TypeScript backend |
| `apps/web` | Next.js frontend (App Router) |
| `packages/shared` | Zod schemas — the single source of truth for API contracts |

## Prerequisites

- Node 20
- Docker (for MongoDB and Redis, or to run the whole stack)

## Setup

```bash
npm install
```

That's the whole install step. `packages/shared` builds itself via its `prepare`
script, so its `dist/` (which is gitignored, and which `apps/api` imports) exists
before anything else runs. If you ever see `Cannot find module '@medlink/shared'`,
build it explicitly:

```bash
npm run build --workspace=@medlink/shared
```

Then copy the env templates:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

## Running

### Option A — Docker Compose (everything, zero config)

```bash
docker compose up
```

Brings up MongoDB, Redis, the API on `http://localhost:4000`, and the web app on
`http://localhost:3000`. Demo secrets are baked into `docker-compose.yml`, so no
`.env` file is needed. **Do not use those secrets outside local development.**

### Option B — Locally, with only the datastores in Docker

```bash
docker compose up mongo redis     # datastores only
npm run dev:api                   # http://localhost:4000
npm run dev:web                   # http://localhost:3000
```

### Seed the demo data

With MongoDB running:

```bash
npm run seed --workspace=apps/api
```

The seed is idempotent — it wipes the collections it owns and re-inserts, so you
can run it as often as you like.

## Deployment

The target free-tier stack is Vercel (web), Render or Railway (api, ai),
MongoDB Atlas, and Upstash Redis — all ₹0. `.github/workflows/ci.yml` builds
and pushes Docker images for all three services to GHCR on every push to
`main`, using the `Dockerfile`s already in each app directory. Provisioning
the actual hosted accounts (Vercel project, Render/Railway services, Atlas
cluster, Upstash instance) and wiring their env vars is a one-time manual step
outside this repo — nothing here does it automatically.

## Demo credentials

All seeded accounts use the password **`Demo@123`**.

| Role | Email |
|---|---|
| Admin | `admin@medlink.demo` |
| Patient | `rahul.p@medlink.demo` |
| Doctor (approved) | `meera.d@medlink.demo` |
| Doctor (pending verification) | `karan.d@medlink.demo` |
| Lab (approved) | `healthfirst.l@medlink.demo` |
| Lab (pending verification) | `metroscans.l@medlink.demo` |

The two pending accounts exist so the admin verification flow has something to
act on. Log in as the admin to approve or reject them. The full list — 6
patients, 12 doctors, 4 labs — is in `apps/api/src/seed/data.ts`.

## Screenshots

<!-- TODO: add screenshots from a live run -->

## Demo video

<!-- TODO: record and link a 2-minute Loom walkthrough -->

## Checks

```bash
npm run typecheck    # all workspaces
npm test             # all workspaces
npm run build        # all workspaces
```

The API test suite uses `mongodb-memory-server` and `ioredis-mock`, so it needs
no running MongoDB or Redis.

## API URL configuration

The web app talks to the API through two separate variables, because the browser
and the Next.js server do not resolve the same hostnames:

| Variable | Used by | Value |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Browser (client bundle) | `http://localhost:4000/api` |
| `API_INTERNAL_URL` | SSR fetches on the Next.js server | Docker only: `http://api:4000/api` |

`NEXT_PUBLIC_*` values are inlined into the client bundle at build time, which is
why `docker-compose.yml` also passes it as a build arg. `API_INTERNAL_URL` is
read at request time and is only needed under Docker Compose; local development
falls back to the same localhost default for both.

## Further reading

- [`CLAUDE.md`](CLAUDE.md) — project brief, data model, and engineering conventions
- [`docs/superpowers/plans/`](docs/superpowers/plans/) — phase-by-phase implementation plans and roadmap
