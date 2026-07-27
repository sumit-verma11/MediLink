# MedLink — Project Brief & Working Agreement

> **Provenance note.** The plan documents in `docs/superpowers/plans/` cite a
> normative "CLAUDE.md" that was never committed to this repo — it existed only
> as instructions given to the agent that wrote those plans, in a prior
> conversation. That original text is **not recoverable from this repository**.
> This file is a reconstruction, assembled from the repo's own authoritative
> artifacts (the Phase 1 plan, the roadmap, the seed data, and the shipped code)
> so the repo is self-describing. Section numbers referenced by the plans
> (§0–§6) are reproduced where their content could be recovered; where it could
> not, that is stated explicitly rather than invented. **If you hold the original
> CLAUDE.md, replace this file with it.**

## §0 Product

MedLink is a healthcare platform connecting patients, doctors, and diagnostic
labs, with an admin role that verifies doctor and lab credentials.

The end-to-end product (built phase by phase — see §2) covers: appointment
booking against doctor availability, AI symptom triage that routes a patient to
the right specialty, digital prescriptions, lab referrals with a public booking
link, and ratings/analytics.

### §0.1 Non-negotiables

1. Patient data is medical data. Nothing that identifies a patient is exposed on
   a public route.
2. Verification documents (medical registration certificates, ID scans) are
   never publicly readable. `/uploads` is auth-gated to `admin` and `doctor`.
3. **Every cross-role action leaves an audit trail: who, what, when.** Written
   via `logAudit()` into the `AuditLog` collection.

### §0.3 Files

Uploads go to local disk in development (`apps/api/uploads/`, gitignored,
created at runtime). Object storage is a Phase 6 deployment concern.

## §1 Data model

Mongoose models for **all** entities are defined in Phase 1, even though only
some get routes in Phase 1 — "define ALL in Phase 1, evolve carefully". All live
in `apps/api/src/models/`.

| Model | Routed in | Notes |
|---|---|---|
| `User` | Phase 1 | Four roles: `patient`, `doctor`, `lab`, `admin` |
| `PatientProfile` | Phase 1 | |
| `DoctorProfile` | Phase 1 | Carries `verificationStatus` |
| `LabProfile` | Phase 1 | Embeds the test catalog |
| `AuditLog` | Phase 6 | Written to from Phase 1 via `logAudit()` |
| `Notification` | Phase 6 | Written to by the seed script from Phase 1 |
| `AvailabilityRule` | Phase 2 | |
| `Appointment` | Phase 2 | |
| `TriageSession` | Phase 3 | |
| `Prescription` | Phase 4 | |
| `LabReferral` | Phase 5 | |
| `LabBooking` | Phase 5 | |

**Id convention** (applies across all models): `doctorId` / `labId` refer to the
**profile** `_id` (`DoctorProfile` / `LabProfile`), while `patientId` refers to
the **User** `_id`. Every doctor-side authorization check therefore needs a
`DoctorProfile` lookup from `req.user.id` first.

Known model gaps deliberately deferred to the phase that needs them are tracked
in `docs/superpowers/plans/2026-07-27-roadmap.md` — read that before extending a
model.

## §2 Phases

| Phase | Scope |
|---|---|
| 1 | Foundation: auth, RBAC, profiles, admin verification, seed — **complete** |
| 2 | Availability & booking engine (Redis slot locking, state machine, Socket.io) |
| 3 | AI triage & doctor matching (FastAPI + sentence-transformers, `apps/ai`) |
| 4 | Prescriptions (composer, PDF via pdf-lib, immutable/amend-creates-v2) |
| 5 | Lab referral flow (public `/r/{token}` landing page, status pipeline) |
| 6 | Polish, admin analytics, ratings, security pass, deploy |
| 7 | Optional differentiators, post-launch |

Detailed per-phase plans live in `docs/superpowers/plans/`. Each phase's plan is
written **right before that phase starts**, not up front.

RBAC middleware is applied to every non-public route from day 1.

## §3 Engineering conventions

- **TypeScript strict everywhere; no `any`.** `tsconfig.base.json` also sets
  `noUncheckedIndexedAccess`.
- **Zod schemas in `packages/shared` are the single source of truth for API
  contracts.** Both the API and the web app import from `@medlink/shared`.
- Every mutating route runs `validate(schema)`.
- Every list endpoint: pagination + sort from day 1.
- **Conventional commits.**
- Tests: Vitest + Supertest + `mongodb-memory-server` + `ioredis-mock`.

### Tech stack

Node 20, TypeScript 5 (strict), Express 4, Mongoose 8, ioredis 5, Zod 3,
jsonwebtoken 9, bcryptjs, pino/pino-http, helmet, cors, express-rate-limit,
multer. Frontend: Next.js (App Router), Tailwind, shadcn/ui, Redux Toolkit +
RTK Query.

### Auth model

Stateless JWT in httpOnly cookies — 15-minute access token, 7-day refresh token
— with Redis-tracked refresh rotation and an access-token blacklist keyed by
`jti`. Refresh reuse is rejected.

## §4–§5

Not recoverable from this repository. (The plans reference §3 and §6 heavily;
§4 and §5 are not cited by any surviving document.)

## §6 Seed data

`npm run seed --workspace=apps/api`. The seed is **idempotent**: it wipes the
collections it owns and re-inserts.

Each phase adds its own slice of seed data once that phase's models and routes
are locked in, rather than seeding everything up front — see the roadmap's table.
Phase 1 seeds accounts, doctor/lab profiles with test catalogs, and notifications.

All entities are pre-approved **except one doctor** (Dr. Karan Mehta) and **one
lab** (Metro Scans & Labs), which are left `'pending'` so the admin verification
flow has something to act on in a demo.

### §6.7 Demo credentials

All seeded accounts share the password **`Demo@123`**.

| Role | Email |
|---|---|
| Admin | `admin@medlink.demo` |
| Patient | `rahul.p@medlink.demo` |
| Doctor (approved) | `meera.d@medlink.demo` |
| Doctor (pending verification) | `karan.d@medlink.demo` |
| Lab (approved) | `healthfirst.l@medlink.demo` |

Additional seeded accounts follow the same pattern — see
`apps/api/src/seed/data.ts` for the full list (6 patients, 12 doctors, 4 labs).

## Repository layout

```
medlink/
├── apps/
│   ├── api/          # Express + TypeScript backend
│   └── web/          # Next.js frontend (App Router)
├── packages/
│   └── shared/       # Zod schemas — the API contract
└── docs/superpowers/plans/
```

`packages/shared` is consumed via its built `dist/`, which is gitignored. Its
`prepare` script builds it automatically on `npm install`, so workspace ordering
does not break a clean checkout.
