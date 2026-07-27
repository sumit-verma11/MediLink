# MedLink

A healthcare platform connecting patients, doctors, and diagnostic labs, with an
admin role that verifies doctor and lab credentials.

**Phase 1 (Foundation) is complete:** four roles can register, log in, manage
role-specific profiles, and an admin can approve or reject doctor and lab
verification. An approved doctor's public profile page is live and a full demo
dataset is seeded. Later phases (booking, AI triage, prescriptions, lab
referrals) are planned but not yet built — see
[`docs/superpowers/plans/`](docs/superpowers/plans/).

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
