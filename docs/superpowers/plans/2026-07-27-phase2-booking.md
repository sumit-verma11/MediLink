# Phase 2 — Availability & Booking Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A doctor can set weekly availability and block specific dates; a
patient can see the resulting open slots for the next 14 days and book one;
two patients racing for the same slot resolve to exactly one winner; a
doctor can confirm/reject a request and a patient can cancel (2h cutoff);
every status change is pushed live over Socket.io and emailed; a cron job
sends 24h-ahead reminders; minimal dashboard pages let a patient and doctor
see this working in a browser.

**Architecture:** New `apps/api/src/modules/appointments/` module set,
following the exact controller/routes/test layout Phase 1 established
(`patients`, `doctors`, `labs`). The slot-generation logic is a pure,
independently-unit-tested function with no I/O; the booking-creation
endpoint is the only place that touches Redis and Mongo together, and it is
the one piece of code the double-booking concurrency test exists to prove
correct. Real-time updates and email are both driven from one place — a
single `transitionAppointment()` service function that every status-changing
route calls, so "emit socket event" and "send email" happen exactly once per
transition, not once per route handler.

**Tech Stack:** Same as Phase 1 (Node 20, TS strict, Express, Mongoose,
ioredis, Zod, Vitest/Supertest/mongodb-memory-server/ioredis-mock), plus new
for this phase: `socket.io` (server) + `socket.io-client` (frontend),
`nodemailer` (+ `nodemailer-mock` — no real SMTP calls in tests) for email,
`node-cron` for the reminder job.

## Global Constraints

- TypeScript strict everywhere; no `any` (carried over from Phase 1).
- Zod schemas in `packages/shared` are the single source of truth for API contracts — **this phase corrects a Phase 1 residual**: the fix-wave's `LabTestPatch` schema was left inline in `apps/api/src/modules/labs/labs.routes.ts` instead of `packages/shared`; Task 1 of this plan moves it before adding any new schemas, so the convention is clean before this phase adds to it.
- Every list endpoint: pagination + sort from day 1.
- Every cross-role action leaves an audit trail (who, what, when) via the existing `logAudit()` from `apps/api/src/modules/audit/audit.service.ts` — booking request, confirm, reject, and cancel are all cross-role actions.
- `req.user` is always `{ id: string; role: string }` where `id` is the **User** `_id` (set by `requireAuth`, `apps/api/src/middleware/auth.ts:9`). Doctor-scoped routes receive a User id but every `Appointment.doctorId` / `AvailabilityRule.doctorId` field stores a **`DoctorProfile` `_id`** — every doctor-side handler must look up `DoctorProfile.findOne({ userId: req.user!.id })` first to get the profile id before querying/writing Appointment or AvailabilityRule documents. `Appointment.patientId` stores a **User** `_id` directly — no lookup needed for patient-side handlers. (This is the id-convention gap the Phase 1 final review flagged in `2026-07-27-roadmap.md` — now documented here instead of being rediscovered mid-task.)
- Conventional commits.
- Redis lock key format (from CLAUDE.md §2 Phase 2): `slot:{doctorId}:{slotStartISO}`, `SET ... NX EX 300`.
- No frontend automated test suite is required (per Phase 1's precedent, carried forward) — frontend tasks verify via `npm run build --workspace=apps/web`.

## Scope decision

CLAUDE.md's Phase 2 checklist includes real-time updates, email, and a cron
reminder job alongside the core slot-locking engine. All of it is included in
this single plan (not deferred to a follow-up), because the phase's own
Definition of Done — "doctor's dashboard pings live" — depends on Socket.io
being wired end to end, not just the REST API. Frontend dashboard pages are
kept intentionally minimal (list + action buttons, no polish), mirroring how
Phase 1 kept `register`/`login` minimal — this is a demo-grade increment, not
a finished UI.

---

## File Structure

```
apps/api/src/
├── models/
│   ├── Appointment.ts              # MODIFY: partial unique index, reminderSentAt field
│   └── BlockedDate.ts              # NEW
├── modules/
│   └── appointments/
│       ├── availability.controller.ts   # AvailabilityRule + BlockedDate CRUD
│       ├── availability.routes.ts
│       ├── availability.test.ts
│       ├── slotService.ts               # pure slot-generation function
│       ├── slotService.test.ts
│       ├── slotLock.ts                  # Redis SET NX EX / DEL helpers
│       ├── appointments.service.ts      # transitionAppointment(), booking creation
│       ├── appointments.controller.ts
│       ├── appointments.routes.ts
│       ├── appointments.test.ts
│       └── appointments.concurrency.test.ts   # the double-booking race
├── lib/
│   ├── mailer.ts                   # nodemailer transporter + send helpers
│   └── socket.ts                   # Socket.io server instance + emit helper
├── jobs/
│   └── reminderJob.ts              # node-cron 24h-ahead reminder scan
└── server.ts                       # MODIFY: attach Socket.io, start cron job

packages/shared/src/schemas/
├── lab.ts                          # MODIFY: move LabTestPatch here from apps/api
└── appointment.ts                  # NEW: AvailabilityRuleInput, BlockedDateInput,
                                     #      CreateAppointmentInput, RejectAppointmentInput

apps/web/src/
├── store/
│   └── appointmentsApi.ts          # RTK Query endpoints for slots/appointments
├── app/
│   ├── dashboard/
│   │   ├── patient/page.tsx        # upcoming/past list, cancel button
│   │   └── doctor/page.tsx         # pending requests, today's queue, confirm/reject
│   └── doctors/[id]/book/page.tsx  # slot picker + booking form
└── lib/socket.ts                   # socket.io-client connection helper
```

---

### Task 1: Move `LabTestPatch` into `packages/shared` (Phase 1 cleanup) + add Phase 2 shared schemas

**Files:**
- Modify: `packages/shared/src/schemas/lab.ts`
- Modify: `apps/api/src/modules/labs/labs.routes.ts`
- Create: `packages/shared/src/schemas/appointment.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/schemas.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `LabTestPatchInput` (moved, same shape as before), `AvailabilityRuleInput`, `BlockedDateInput`, `CreateAppointmentInput`, `RejectAppointmentInput` — all imported by Tasks 3–11.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/schemas/schemas.test.ts (append)
import { LabTestPatchInput } from './lab';
import {
  AvailabilityRuleInput,
  BlockedDateInput,
  CreateAppointmentInput,
  RejectAppointmentInput,
} from './appointment';

describe('LabTestPatchInput', () => {
  it('rejects an empty object', () => {
    expect(LabTestPatchInput.safeParse({}).success).toBe(false);
  });
  it('accepts a partial update', () => {
    expect(LabTestPatchInput.safeParse({ price: 275 }).success).toBe(true);
  });
  it('rejects a negative price', () => {
    expect(LabTestPatchInput.safeParse({ price: -10 }).success).toBe(false);
  });
});

describe('AvailabilityRuleInput', () => {
  it('rejects dayOfWeek out of range', () => {
    expect(
      AvailabilityRuleInput.safeParse({
        dayOfWeek: 7, startTime: '18:00', endTime: '21:00', slotMinutes: 15,
        validFrom: '2026-01-01', validTo: '2026-12-31',
      }).success
    ).toBe(false);
  });
  it('accepts a valid rule', () => {
    expect(
      AvailabilityRuleInput.safeParse({
        dayOfWeek: 1, startTime: '18:00', endTime: '21:00', slotMinutes: 15,
        validFrom: '2026-01-01', validTo: '2026-12-31',
      }).success
    ).toBe(true);
  });
});

describe('BlockedDateInput', () => {
  it('requires a date', () => {
    expect(BlockedDateInput.safeParse({ reason: 'leave' }).success).toBe(false);
  });
});

describe('CreateAppointmentInput', () => {
  it('requires doctorId, slotStart, slotEnd', () => {
    expect(CreateAppointmentInput.safeParse({}).success).toBe(false);
  });
  it('accepts a minimal valid booking', () => {
    expect(
      CreateAppointmentInput.safeParse({
        doctorId: '507f1f77bcf86cd799439011',
        slotStart: '2026-08-01T18:00:00.000Z',
        slotEnd: '2026-08-01T18:15:00.000Z',
      }).success
    ).toBe(true);
  });
});

describe('RejectAppointmentInput', () => {
  it('requires a reason', () => {
    expect(RejectAppointmentInput.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@medlink/shared`
Expected: FAIL — `Cannot find module './appointment'`, and `LabTestPatchInput` not exported from `./lab`.

- [ ] **Step 3: Move `LabTestPatch` and add the new schemas**

```ts
// packages/shared/src/schemas/lab.ts (append to the existing file — GeoInput/LabProfileInput/LabTestInput stay as-is)
export const LabTestPatchInput = LabTestInput.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);
export type LabTestPatchInput = z.infer<typeof LabTestPatchInput>;
```

```ts
// packages/shared/src/schemas/appointment.ts
import { z } from 'zod';

export const AvailabilityRuleInput = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotMinutes: z.number().int().min(5).max(120),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
});
export type AvailabilityRuleInput = z.infer<typeof AvailabilityRuleInput>;

export const BlockedDateInput = z.object({
  date: z.coerce.date(),
  reason: z.string().optional(),
});
export type BlockedDateInput = z.infer<typeof BlockedDateInput>;

export const CreateAppointmentInput = z.object({
  doctorId: z.string().min(1),
  slotStart: z.coerce.date(),
  slotEnd: z.coerce.date(),
  symptomSummary: z.string().optional(),
  triageSessionId: z.string().optional(),
});
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentInput>;

export const RejectAppointmentInput = z.object({
  reason: z.string().min(1),
});
export type RejectAppointmentInput = z.infer<typeof RejectAppointmentInput>;
```

```ts
// packages/shared/src/index.ts (add one line)
export * from './schemas/appointment';
```

- [ ] **Step 4: Update the labs route to import from shared**

```ts
// apps/api/src/modules/labs/labs.routes.ts (modify)
import { LabTestInput, LabTestPatchInput } from '@medlink/shared';
// remove the local `LabTestPatch` definition entirely; replace its one usage:
labsRouter.patch('/me/tests/:code', validate(LabTestPatchInput), editTest);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=@medlink/shared && npm run test --workspace=apps/api -- labs.test.ts`
Expected: PASS (shared: 13 tests; labs.test.ts: unaffected, still 3 passing)

- [ ] **Step 6: Build and commit**

Run: `npm run build --workspace=@medlink/shared && npm run typecheck`
Expected: clean.

```bash
git add packages/shared apps/api/src/modules/labs/labs.routes.ts
git commit -m "refactor(shared): move LabTestPatch into packages/shared; add Phase 2 appointment schemas"
```

---

### Task 2: `BlockedDate` model + `Appointment` index/field additions

**Files:**
- Create: `apps/api/src/models/BlockedDate.ts`
- Modify: `apps/api/src/models/Appointment.ts`
- Test: `apps/api/src/models/models.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `BlockedDate` model (Task 4). `Appointment`'s new partial unique index (Task 8's concurrency test asserts against it as a backstop to the Redis lock) and `reminderSentAt?: Date` field (Task 15).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/models/models.test.ts (append, inside the existing describe blocks' file — add new describes)
import { BlockedDate } from './BlockedDate';
import { Appointment } from './Appointment';

describe('BlockedDate model', () => {
  it('enforces one block per doctor per date', async () => {
    const doctorId = new mongoose.Types.ObjectId();
    await BlockedDate.create({ doctorId, date: new Date('2026-08-15') });
    await expect(
      BlockedDate.create({ doctorId, date: new Date('2026-08-15') })
    ).rejects.toThrow();
  });
});

describe('Appointment model — partial unique index', () => {
  it('rejects a second active appointment for the same doctor+slot, but allows one after the first is cancelled', async () => {
    const doctorId = new mongoose.Types.ObjectId();
    const patientId = new mongoose.Types.ObjectId();
    const slotStart = new Date('2026-08-15T18:00:00.000Z');
    const slotEnd = new Date('2026-08-15T18:15:00.000Z');

    const first = await Appointment.create({ doctorId, patientId, slotStart, slotEnd, status: 'requested' });

    await expect(
      Appointment.create({ doctorId, patientId, slotStart, slotEnd, status: 'requested' })
    ).rejects.toThrow();

    await Appointment.findByIdAndUpdate(first._id, { status: 'cancelled' });

    await expect(
      Appointment.create({ doctorId, patientId, slotStart, slotEnd, status: 'requested' })
    ).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- models.test.ts`
Expected: FAIL — `Cannot find module './BlockedDate'`; the second `Appointment.create` in the unique-index test does NOT currently throw (no index exists yet), so that assertion also fails.

- [ ] **Step 3: Implement the model and index**

```ts
// apps/api/src/models/BlockedDate.ts
import { Schema, model, Types } from 'mongoose';

export interface IBlockedDate {
  _id: Types.ObjectId;
  doctorId: Types.ObjectId;
  date: Date;
  reason?: string;
}

const blockedDateSchema = new Schema<IBlockedDate>({
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },
  date: { type: Date, required: true },
  reason: String,
});

blockedDateSchema.index({ doctorId: 1, date: 1 }, { unique: true });

export const BlockedDate = model<IBlockedDate>('BlockedDate', blockedDateSchema);
```

```ts
// apps/api/src/models/Appointment.ts (modify — add reminderSentAt to the interface and schema, add the index)
export interface IAppointment {
  // ...existing fields...
  reminderSentAt?: Date;
}

// ...inside appointmentSchema definition, add one field:
  reminderSentAt: Date,

// after the schema definition, before `export const Appointment = ...`:
appointmentSchema.index(
  { doctorId: 1, slotStart: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['requested', 'confirmed'] } } }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- models.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/models/BlockedDate.ts apps/api/src/models/Appointment.ts apps/api/src/models/models.test.ts
git commit -m "feat(api): add BlockedDate model; Appointment partial unique index + reminderSentAt"
```

---

### Task 3: Doctor availability-rule CRUD

**Files:**
- Create: `apps/api/src/modules/appointments/availability.controller.ts`, `availability.routes.ts`, `availability.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `AvailabilityRuleInput`, `BlockedDateInput` (Task 1), `AvailabilityRule`, `BlockedDate` models (Phase 1 Task 3 / this phase's Task 2), `requireAuth`/`requireRole` (Phase 1).
- Produces: `GET/POST/DELETE /api/doctors/me/availability-rules`, `GET/POST/DELETE /api/doctors/me/blocked-dates` — consumed by Task 5's slot generation.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/appointments/availability.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import type { Express } from 'express';
import { createApp } from '../../app';
import { setRedisClient } from '../../lib/redis';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  setRedisClient(new RedisMock());
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function registerAndLogin(app: Express, role: string, email: string) {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'Doc A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

describe('availability rules CRUD', () => {
  it('creates and lists a doctor availability rule', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'avail1@medlink.demo');

    const createRes = await request(app).post('/api/doctors/me/availability-rules').set('Cookie', cookies).send({
      dayOfWeek: 1, startTime: '18:00', endTime: '21:00', slotMinutes: 15,
      validFrom: '2026-01-01', validTo: '2026-12-31',
    });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get('/api/doctors/me/availability-rules').set('Cookie', cookies);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
  });

  it('deletes an availability rule', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'avail2@medlink.demo');
    const createRes = await request(app).post('/api/doctors/me/availability-rules').set('Cookie', cookies).send({
      dayOfWeek: 2, startTime: '09:00', endTime: '12:00', slotMinutes: 10,
      validFrom: '2026-01-01', validTo: '2026-12-31',
    });
    const ruleId = createRes.body.rule._id;

    const deleteRes = await request(app).delete(`/api/doctors/me/availability-rules/${ruleId}`).set('Cookie', cookies);
    expect(deleteRes.status).toBe(200);

    const listRes = await request(app).get('/api/doctors/me/availability-rules').set('Cookie', cookies);
    expect(listRes.body.items).toHaveLength(0);
  });

  it('rejects a patient trying to set availability', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'notdoc@medlink.demo');
    const res = await request(app).post('/api/doctors/me/availability-rules').set('Cookie', cookies).send({
      dayOfWeek: 1, startTime: '18:00', endTime: '21:00', slotMinutes: 15,
      validFrom: '2026-01-01', validTo: '2026-12-31',
    });
    expect(res.status).toBe(403);
  });
});

describe('blocked dates CRUD', () => {
  it('creates and lists a blocked date', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'block1@medlink.demo');

    const createRes = await request(app).post('/api/doctors/me/blocked-dates').set('Cookie', cookies).send({
      date: '2026-08-15', reason: 'On leave',
    });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get('/api/doctors/me/blocked-dates').set('Cookie', cookies);
    expect(listRes.body.items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- availability.test.ts`
Expected: FAIL — 404s

- [ ] **Step 3: Implement controller and routes**

```ts
// apps/api/src/modules/appointments/availability.controller.ts
import { Request, Response, NextFunction } from 'express';
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { BlockedDate } from '../../models/BlockedDate';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';

async function requireDoctorProfileId(userId: string): Promise<string> {
  const profile = await DoctorProfile.findOne({ userId });
  if (!profile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');
  return profile._id.toString();
}

export async function listAvailabilityRules(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctorId = await requireDoctorProfileId(req.user!.id);
    const items = await AvailabilityRule.find({ doctorId }).sort({ dayOfWeek: 1 });
    res.status(200).json({ items });
  } catch (err) {
    next(err);
  }
}

export async function createAvailabilityRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctorId = await requireDoctorProfileId(req.user!.id);
    const rule = await AvailabilityRule.create({ ...req.body, doctorId });
    res.status(201).json({ rule });
  } catch (err) {
    next(err);
  }
}

export async function deleteAvailabilityRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctorId = await requireDoctorProfileId(req.user!.id);
    const result = await AvailabilityRule.findOneAndDelete({ _id: req.params.id, doctorId });
    if (!result) throw new AppError(404, 'Rule not found', 'RULE_NOT_FOUND');
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function listBlockedDates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctorId = await requireDoctorProfileId(req.user!.id);
    const items = await BlockedDate.find({ doctorId }).sort({ date: 1 });
    res.status(200).json({ items });
  } catch (err) {
    next(err);
  }
}

export async function createBlockedDate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctorId = await requireDoctorProfileId(req.user!.id);
    const blocked = await BlockedDate.create({ ...req.body, doctorId });
    res.status(201).json({ blocked });
  } catch (err) {
    next(err);
  }
}

export async function deleteBlockedDate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctorId = await requireDoctorProfileId(req.user!.id);
    const result = await BlockedDate.findOneAndDelete({ _id: req.params.id, doctorId });
    if (!result) throw new AppError(404, 'Blocked date not found', 'BLOCKED_DATE_NOT_FOUND');
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/appointments/availability.routes.ts
import { Router } from 'express';
import { AvailabilityRuleInput, BlockedDateInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  listAvailabilityRules, createAvailabilityRule, deleteAvailabilityRule,
  listBlockedDates, createBlockedDate, deleteBlockedDate,
} from './availability.controller';

export const availabilityRouter = Router();

availabilityRouter.use(requireAuth, requireRole('doctor'));
availabilityRouter.get('/availability-rules', listAvailabilityRules);
availabilityRouter.post('/availability-rules', validate(AvailabilityRuleInput), createAvailabilityRule);
availabilityRouter.delete('/availability-rules/:id', deleteAvailabilityRule);
availabilityRouter.get('/blocked-dates', listBlockedDates);
availabilityRouter.post('/blocked-dates', validate(BlockedDateInput), createBlockedDate);
availabilityRouter.delete('/blocked-dates/:id', deleteBlockedDate);
```

- [ ] **Step 4: Mount the router**

```ts
// apps/api/src/app.ts (modify)
import { availabilityRouter } from './modules/appointments/availability.routes';
// ...
app.use('/api/doctors/me', availabilityRouter);
```

Note: this mounts a second router under the `/api/doctors` prefix family, alongside Phase 1's `doctorsRouter` (mounted at `/api/doctors`). Express matches routes in mount order, so `availabilityRouter`'s `/api/doctors/me/availability-rules` does not collide with `doctorsRouter`'s `/api/doctors/me` (`GET`/`PUT`) or `/api/doctors/public/:id` — mount `availabilityRouter` **before** `doctorsRouter` in `app.ts` so its more specific `/me/availability-rules` and `/me/blocked-dates` paths are matched first; verify by running the full test suite (Step 6) rather than guessing at Express's path-matching order.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- availability.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full suite to confirm no route collision with Phase 1's doctors router**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files, including `doctors.test.ts`)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/appointments/availability.controller.ts apps/api/src/modules/appointments/availability.routes.ts apps/api/src/modules/appointments/availability.test.ts apps/api/src/app.ts
git commit -m "feat(api): doctor availability-rule and blocked-date CRUD"
```

---

### Task 4: Slot generation service (pure function)

**Files:**
- Create: `apps/api/src/modules/appointments/slotService.ts`, `slotService.test.ts`

**Interfaces:**
- Consumes: `AvailabilityRule`, `BlockedDate`, `Appointment` models.
- Produces: `generateSlotsForDoctor(doctorId: string, fromDate: Date, days: number): Promise<{ start: Date; end: Date }[]>` — consumed by Task 5's endpoint and Task 7's booking-creation validation.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/appointments/slotService.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { BlockedDate } from '../../models/BlockedDate';
import { Appointment } from '../../models/Appointment';
import { generateSlotsForDoctor } from './slotService';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// A fixed Wednesday so day-of-week arithmetic in the test is deterministic.
const FIXED_WEDNESDAY = new Date('2026-08-05T00:00:00.000Z'); // 2026-08-05 is a Wednesday

describe('generateSlotsForDoctor', () => {
  it('generates slots only on the rule\'s day of week, within start/end time', async () => {
    const doctorId = new mongoose.Types.ObjectId().toString();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: 3 /* Wednesday */, startTime: '18:00', endTime: '19:00', slotMinutes: 15,
      validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
    });

    const slots = await generateSlotsForDoctor(doctorId, FIXED_WEDNESDAY, 7);

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.start.getUTCDay()).toBe(3);
      const hours = slot.start.getUTCHours();
      expect(hours).toBeGreaterThanOrEqual(18);
      expect(hours).toBeLessThan(19);
    }
    // 18:00-19:00 at 15-min intervals = 4 slots per matching day
    const daysMatched = slots.length / 4;
    expect(Number.isInteger(daysMatched)).toBe(true);
  });

  it('excludes a fully blocked date', async () => {
    const doctorId = new mongoose.Types.ObjectId().toString();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00', slotMinutes: 15,
      validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
    });
    await BlockedDate.create({ doctorId, date: FIXED_WEDNESDAY });

    const slots = await generateSlotsForDoctor(doctorId, FIXED_WEDNESDAY, 1);
    expect(slots).toHaveLength(0);
  });

  it('excludes a slot already booked by an active appointment', async () => {
    const doctorId = new mongoose.Types.ObjectId().toString();
    const patientId = new mongoose.Types.ObjectId();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00', slotMinutes: 15,
      validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
    });
    const bookedStart = new Date('2026-08-05T18:00:00.000Z');
    await Appointment.create({
      doctorId, patientId, slotStart: bookedStart, slotEnd: new Date('2026-08-05T18:15:00.000Z'), status: 'confirmed',
    });

    const slots = await generateSlotsForDoctor(doctorId, FIXED_WEDNESDAY, 1);
    expect(slots.some((s) => s.start.getTime() === bookedStart.getTime())).toBe(false);
    expect(slots).toHaveLength(3); // 4 slots minus the 1 booked
  });

  it('does not exclude a slot whose appointment was rejected (inactive status)', async () => {
    const doctorId = new mongoose.Types.ObjectId().toString();
    const patientId = new mongoose.Types.ObjectId();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00', slotMinutes: 15,
      validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
    });
    await Appointment.create({
      doctorId, patientId, slotStart: new Date('2026-08-05T18:00:00.000Z'),
      slotEnd: new Date('2026-08-05T18:15:00.000Z'), status: 'rejected',
    });

    const slots = await generateSlotsForDoctor(doctorId, FIXED_WEDNESDAY, 1);
    expect(slots).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- slotService.test.ts`
Expected: FAIL — `Cannot find module './slotService'`

- [ ] **Step 3: Implement the service**

```ts
// apps/api/src/modules/appointments/slotService.ts
import { Types } from 'mongoose';
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { BlockedDate } from '../../models/BlockedDate';
import { Appointment } from '../../models/Appointment';

export interface Slot {
  start: Date;
  end: Date;
}

const ACTIVE_STATUSES = ['requested', 'confirmed'];

function parseTimeToMinutes(hhmm: string): number {
  const parts = hhmm.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  return hours * 60 + minutes;
}

function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function generateSlotsForDoctor(doctorId: string, fromDate: Date, days: number): Promise<Slot[]> {
  const rangeStart = startOfUTCDay(fromDate);
  const rangeEnd = new Date(rangeStart.getTime() + days * 24 * 60 * 60 * 1000);

  const [rules, blockedDates, bookedAppointments] = await Promise.all([
    AvailabilityRule.find({
      doctorId: new Types.ObjectId(doctorId),
      validFrom: { $lte: rangeEnd },
      validTo: { $gte: rangeStart },
    }),
    BlockedDate.find({ doctorId: new Types.ObjectId(doctorId), date: { $gte: rangeStart, $lt: rangeEnd } }),
    Appointment.find({
      doctorId: new Types.ObjectId(doctorId),
      status: { $in: ACTIVE_STATUSES },
      slotStart: { $gte: rangeStart, $lt: rangeEnd },
    }),
  ]);

  const blockedDateKeys = new Set(blockedDates.map((b) => startOfUTCDay(b.date).getTime()));
  const bookedStartTimes = new Set(bookedAppointments.map((a) => a.slotStart.getTime()));

  const rulesByDayOfWeek = new Map<number, typeof rules>();
  for (const rule of rules) {
    const existing = rulesByDayOfWeek.get(rule.dayOfWeek) ?? [];
    existing.push(rule);
    rulesByDayOfWeek.set(rule.dayOfWeek, existing);
  }

  const slots: Slot[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const day = new Date(rangeStart.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    if (blockedDateKeys.has(day.getTime())) continue;

    const dayOfWeek = day.getUTCDay();
    const rulesForDay = rulesByDayOfWeek.get(dayOfWeek) ?? [];

    for (const rule of rulesForDay) {
      if (rule.validFrom > day || rule.validTo < day) continue;

      const startMinutes = parseTimeToMinutes(rule.startTime);
      const endMinutes = parseTimeToMinutes(rule.endTime);

      for (let minutes = startMinutes; minutes + rule.slotMinutes <= endMinutes; minutes += rule.slotMinutes) {
        const slotStart = new Date(day.getTime() + minutes * 60 * 1000);
        const slotEnd = new Date(slotStart.getTime() + rule.slotMinutes * 60 * 1000);
        if (bookedStartTimes.has(slotStart.getTime())) continue;
        slots.push({ start: slotStart, end: slotEnd });
      }
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- slotService.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/appointments/slotService.ts apps/api/src/modules/appointments/slotService.test.ts
git commit -m "feat(api): pure slot-generation service (rules + blocked dates + bookings)"
```

---

### Task 5: `GET` available-slots endpoint

**Files:**
- Modify: `apps/api/src/modules/appointments/availability.controller.ts`, `availability.routes.ts` (or create a small dedicated controller — see below)
- Modify: `apps/api/src/app.ts`
- Test: extend `apps/api/src/modules/appointments/availability.test.ts`

**Interfaces:**
- Consumes: `generateSlotsForDoctor` (Task 4).
- Produces: `GET /api/doctors/:id/slots?days=14` — consumed by Task 7's booking flow and the frontend's Task 17 slot picker.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/appointments/availability.test.ts (append)
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { DoctorProfile } from '../../models/DoctorProfile';

describe('GET /api/doctors/:id/slots', () => {
  it('returns generated slots for a patient-authenticated request', async () => {
    const app = createApp();
    const docCookies = await registerAndLogin(app, 'doctor', 'slotsdoc@medlink.demo');
    await request(app).put('/api/doctors/me').set('Cookie', docCookies).send({
      specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00001',
      experienceYears: 5, bio: 'bio', clinicName: 'Clinic', clinicAddress: 'Addr',
      city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'],
    });
    const doctorProfile = await DoctorProfile.findOne({});
    await AvailabilityRule.create({
      doctorId: doctorProfile!._id, dayOfWeek: new Date().getUTCDay(), startTime: '00:00', endTime: '23:00', slotMinutes: 60,
      validFrom: new Date('2020-01-01'), validTo: new Date('2030-12-31'),
    });

    const patientCookies = await registerAndLogin(app, 'patient', 'slotspatient@medlink.demo');
    const res = await request(app)
      .get(`/api/doctors/${doctorProfile!._id}/slots?days=1`)
      .set('Cookie', patientCookies);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.slots)).toBe(true);
  });

  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).get('/api/doctors/000000000000000000000000/slots');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- availability.test.ts`
Expected: FAIL — 404

- [ ] **Step 3: Implement the handler**

```ts
// apps/api/src/modules/appointments/availability.controller.ts (append)
import { generateSlotsForDoctor } from './slotService';

export async function getDoctorSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const days = Math.min(30, Math.max(1, Number(req.query.days ?? 14)));
    const slots = await generateSlotsForDoctor(req.params.id!, new Date(), days);
    res.status(200).json({ slots });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/appointments/availability.routes.ts (add a second, separately-mounted router — this one requires only requireAuth, not requireRole('doctor'), since patients call it too)
import { requireAuth } from '../../middleware/auth';
import { getDoctorSlots } from './availability.controller';

export const doctorSlotsRouter = Router();
doctorSlotsRouter.get('/:id/slots', requireAuth, getDoctorSlots);
```

- [ ] **Step 4: Mount the new router**

```ts
// apps/api/src/app.ts (modify)
import { availabilityRouter, doctorSlotsRouter } from './modules/appointments/availability.routes';
// ...
app.use('/api/doctors/me', availabilityRouter);
app.use('/api/doctors', doctorSlotsRouter);
```

Mount `doctorSlotsRouter` after `availabilityRouter` but the ordering relative to Phase 1's `doctorsRouter` (also mounted at `/api/doctors`) matters: `doctorSlotsRouter`'s `/:id/slots` and `doctorsRouter`'s `/public/:id` are structurally distinct paths (different suffixes) so they don't collide regardless of order — but mount `doctorSlotsRouter` before the Phase 1 `doctorsRouter` for consistency with `availabilityRouter`'s ordering, and verify with the full suite.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- availability.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Run the full suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/appointments/availability.controller.ts apps/api/src/modules/appointments/availability.routes.ts apps/api/src/modules/appointments/availability.test.ts apps/api/src/app.ts
git commit -m "feat(api): GET available slots endpoint for a doctor"
```

---

### Task 6: Redis slot-lock service

**Files:**
- Create: `apps/api/src/modules/appointments/slotLock.ts`
- Test: `apps/api/src/modules/appointments/slotLock.test.ts`

**Interfaces:**
- Consumes: `getRedis()` (Phase 1 `lib/redis.ts`).
- Produces: `acquireSlotLock(doctorId, slotStartISO, patientId): Promise<boolean>`, `releaseSlotLock(doctorId, slotStartISO): Promise<void>` — consumed by Task 7's booking creation and Task 9's concurrency test.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/appointments/slotLock.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import { setRedisClient } from '../../lib/redis';
import { acquireSlotLock, releaseSlotLock } from './slotLock';

beforeEach(() => {
  setRedisClient(new RedisMock());
});

describe('acquireSlotLock', () => {
  it('acquires a free lock', async () => {
    const acquired = await acquireSlotLock('doc1', '2026-08-05T18:00:00.000Z', 'patient1');
    expect(acquired).toBe(true);
  });

  it('rejects acquiring an already-held lock', async () => {
    await acquireSlotLock('doc1', '2026-08-05T18:00:00.000Z', 'patient1');
    const secondAttempt = await acquireSlotLock('doc1', '2026-08-05T18:00:00.000Z', 'patient2');
    expect(secondAttempt).toBe(false);
  });

  it('allows acquiring again after release', async () => {
    await acquireSlotLock('doc1', '2026-08-05T18:00:00.000Z', 'patient1');
    await releaseSlotLock('doc1', '2026-08-05T18:00:00.000Z');
    const secondAttempt = await acquireSlotLock('doc1', '2026-08-05T18:00:00.000Z', 'patient2');
    expect(secondAttempt).toBe(true);
  });

  it('locks are independent per doctor+slot combination', async () => {
    const a = await acquireSlotLock('doc1', '2026-08-05T18:00:00.000Z', 'patient1');
    const b = await acquireSlotLock('doc2', '2026-08-05T18:00:00.000Z', 'patient1');
    const c = await acquireSlotLock('doc1', '2026-08-05T19:00:00.000Z', 'patient1');
    expect(a && b && c).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- slotLock.test.ts`
Expected: FAIL — `Cannot find module './slotLock'`

- [ ] **Step 3: Implement the service**

```ts
// apps/api/src/modules/appointments/slotLock.ts
import { getRedis } from '../../lib/redis';

const LOCK_TTL_SECONDS = 300;

function lockKey(doctorId: string, slotStartISO: string): string {
  return `slot:${doctorId}:${slotStartISO}`;
}

export async function acquireSlotLock(doctorId: string, slotStartISO: string, patientId: string): Promise<boolean> {
  const result = await getRedis().set(lockKey(doctorId, slotStartISO), patientId, 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

export async function releaseSlotLock(doctorId: string, slotStartISO: string): Promise<void> {
  await getRedis().del(lockKey(doctorId, slotStartISO));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- slotLock.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/appointments/slotLock.ts apps/api/src/modules/appointments/slotLock.test.ts
git commit -m "feat(api): Redis-backed slot lock (SET NX EX 300 / DEL)"
```

---

### Task 7: Booking creation (`POST /api/appointments`)

**Files:**
- Create: `apps/api/src/modules/appointments/appointments.service.ts`, `appointments.controller.ts`, `appointments.routes.ts`, `appointments.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `acquireSlotLock`/`releaseSlotLock` (Task 6), `generateSlotsForDoctor` (Task 4), `CreateAppointmentInput` (Task 1), `logAudit` (Phase 1 Task 8), `Appointment` model's partial unique index (Task 2).
- Produces: `createAppointment()` in `appointments.service.ts` — the function Task 9's concurrency test calls twice in parallel; `POST /api/appointments`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/appointments/appointments.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import type { Express } from 'express';
import { createApp } from '../../app';
import { setRedisClient } from '../../lib/redis';
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { DoctorProfile } from '../../models/DoctorProfile';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  setRedisClient(new RedisMock());
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function registerAndLogin(app: Express, role: string, email: string) {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

async function seedDoctorWithAvailability(app: Express) {
  const docCookies = await registerAndLogin(app, 'doctor', `doc-${Date.now()}@medlink.demo`);
  await request(app).put('/api/doctors/me').set('Cookie', docCookies).send({
    specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00001',
    experienceYears: 5, bio: 'bio', clinicName: 'Clinic', clinicAddress: 'Addr',
    city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'],
  });
  const doctorProfile = await DoctorProfile.findOne({}).sort({ _id: -1 });
  await AvailabilityRule.create({
    doctorId: doctorProfile!._id, dayOfWeek: new Date().getUTCDay(), startTime: '00:00', endTime: '23:00', slotMinutes: 60,
    validFrom: new Date('2020-01-01'), validTo: new Date('2030-12-31'),
  });
  return doctorProfile!._id.toString();
}

describe('POST /api/appointments', () => {
  it('creates a requested appointment for a free slot', async () => {
    const app = createApp();
    const doctorId = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'bookpatient1@medlink.demo');

    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=1`).set('Cookie', patientCookies);
    const firstSlot = slotsRes.body.slots[0];

    const res = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: firstSlot.start, slotEnd: firstSlot.end,
    });

    expect(res.status).toBe(201);
    expect(res.body.appointment.status).toBe('requested');
    expect(res.body.appointment.timeline).toHaveLength(1);
  });

  it('rejects a second booking for the same slot with 409', async () => {
    const app = createApp();
    const doctorId = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'bookpatient2@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=1`).set('Cookie', patientCookies);
    const firstSlot = slotsRes.body.slots[0];

    await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: firstSlot.start, slotEnd: firstSlot.end,
    });

    const secondPatientCookies = await registerAndLogin(app, 'patient', 'bookpatient3@medlink.demo');
    const res = await request(app).post('/api/appointments').set('Cookie', secondPatientCookies).send({
      doctorId, slotStart: firstSlot.start, slotEnd: firstSlot.end,
    });

    expect(res.status).toBe(409);
  });

  it('rejects a doctor trying to book', async () => {
    const app = createApp();
    const doctorId = await seedDoctorWithAvailability(app);
    const docCookies = await registerAndLogin(app, 'doctor', 'bookingdoc2@medlink.demo');
    const res = await request(app).post('/api/appointments').set('Cookie', docCookies).send({
      doctorId, slotStart: '2026-08-05T18:00:00.000Z', slotEnd: '2026-08-05T18:15:00.000Z',
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- appointments.test.ts`
Expected: FAIL — 404s

- [ ] **Step 3: Implement the service**

```ts
// apps/api/src/modules/appointments/appointments.service.ts
import { Types } from 'mongoose';
import { Appointment, IAppointment, AppointmentStatus } from '../../models/Appointment';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';
import { acquireSlotLock, releaseSlotLock } from './slotLock';
import type { CreateAppointmentInput } from '@medlink/shared';

export async function createAppointment(patientId: string, input: CreateAppointmentInput): Promise<IAppointment> {
  const slotStartISO = input.slotStart.toISOString();
  const acquired = await acquireSlotLock(input.doctorId, slotStartISO, patientId);
  if (!acquired) {
    throw new AppError(409, 'Slot is no longer available', 'SLOT_UNAVAILABLE');
  }

  try {
    const appointment = await Appointment.create({
      patientId: new Types.ObjectId(patientId),
      doctorId: new Types.ObjectId(input.doctorId),
      slotStart: input.slotStart,
      slotEnd: input.slotEnd,
      status: 'requested',
      symptomSummary: input.symptomSummary,
      triageSessionId: input.triageSessionId ? new Types.ObjectId(input.triageSessionId) : undefined,
      timeline: [{ status: 'requested', at: new Date(), by: new Types.ObjectId(patientId) }],
    });

    await logAudit({
      actorId: patientId, actorRole: 'patient', action: 'appointment.requested',
      entityType: 'Appointment', entityId: appointment._id.toString(),
    });

    return appointment;
  } catch (err) {
    // The Mongo write failed (including a partial-unique-index collision that slipped
    // past the Redis lock, e.g. a pre-existing active appointment from before this lock
    // existed) — release the lock immediately so the slot isn't stuck held for 5 minutes
    // over a booking that never actually succeeded.
    await releaseSlotLock(input.doctorId, slotStartISO);
    if ((err as { code?: number }).code === 11000) {
      throw new AppError(409, 'Slot is no longer available', 'SLOT_UNAVAILABLE');
    }
    throw err;
  }
}

export async function appendTimelineEntry(
  appointmentId: string,
  status: AppointmentStatus,
  by: string,
  extra: Record<string, unknown> = {}
): Promise<IAppointment | null> {
  return Appointment.findByIdAndUpdate(
    appointmentId,
    {
      $set: { status, ...extra },
      $push: { timeline: { status, at: new Date(), by: new Types.ObjectId(by) } },
    },
    { new: true }
  );
}
```

- [ ] **Step 4: Implement controller and routes**

```ts
// apps/api/src/modules/appointments/appointments.controller.ts
import { Request, Response, NextFunction } from 'express';
import { createAppointment } from './appointments.service';

export async function createAppointmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await createAppointment(req.user!.id, req.body);
    res.status(201).json({ appointment });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/appointments/appointments.routes.ts
import { Router } from 'express';
import { CreateAppointmentInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createAppointmentHandler } from './appointments.controller';

export const appointmentsRouter = Router();

appointmentsRouter.use(requireAuth);
appointmentsRouter.post('/', requireRole('patient'), validate(CreateAppointmentInput), createAppointmentHandler);
```

- [ ] **Step 5: Mount the router**

```ts
// apps/api/src/app.ts (modify)
import { appointmentsRouter } from './modules/appointments/appointments.routes';
// ...
app.use('/api/appointments', appointmentsRouter);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- appointments.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/appointments/appointments.service.ts apps/api/src/modules/appointments/appointments.controller.ts apps/api/src/modules/appointments/appointments.routes.ts apps/api/src/modules/appointments/appointments.test.ts apps/api/src/app.ts
git commit -m "feat(api): booking creation (POST /api/appointments) with Redis slot locking"
```

---

### Task 8: Double-booking concurrency test

> This is the phase's headline correctness proof (CLAUDE.md §2 Phase 2: "two parallel requests → exactly one wins"). It has its own file and its own task because it deserves a reviewer's full, undivided attention — do not bury it inside Task 7.

**Files:**
- Create: `apps/api/src/modules/appointments/appointments.concurrency.test.ts`

**Interfaces:**
- Consumes: `createAppointment` (Task 7).
- Produces: nothing — this is a pure verification task.

- [ ] **Step 1: Write the test**

```ts
// apps/api/src/modules/appointments/appointments.concurrency.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Redis from 'ioredis-mock';
import { setRedisClient } from '../../lib/redis';
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { createAppointment } from './appointments.service';
import { AppError } from '../../lib/errors';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('double-booking race', () => {
  it('exactly one of two parallel requests for the same doctor+slot succeeds', async () => {
    // A real ioredis-mock instance (not shared with other test files) so this test's
    // NX semantics aren't affected by state from any other suite.
    setRedisClient(new Redis());

    const doctorId = new mongoose.Types.ObjectId().toString();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: new Date().getUTCDay(), startTime: '00:00', endTime: '23:00', slotMinutes: 60,
      validFrom: new Date('2020-01-01'), validTo: new Date('2030-12-31'),
    });

    const patientA = new mongoose.Types.ObjectId().toString();
    const patientB = new mongoose.Types.ObjectId().toString();
    const slotStart = new Date();
    slotStart.setUTCHours(10, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const input = { doctorId, slotStart, slotEnd };

    const results = await Promise.allSettled([
      createAppointment(patientA, input),
      createAppointment(patientB, input),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
    expect(((rejected[0] as PromiseRejectedResult).reason as AppError).statusCode).toBe(409);
  });

  it('ten parallel requests for the same slot still produce exactly one winner', async () => {
    setRedisClient(new Redis());

    const doctorId = new mongoose.Types.ObjectId().toString();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: new Date().getUTCDay(), startTime: '00:00', endTime: '23:00', slotMinutes: 60,
      validFrom: new Date('2020-01-01'), validTo: new Date('2030-12-31'),
    });
    const slotStart = new Date();
    slotStart.setUTCHours(11, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
    const input = { doctorId, slotStart, slotEnd };

    const attempts = Array.from({ length: 10 }, () =>
      createAppointment(new mongoose.Types.ObjectId().toString(), input)
    );
    const results = await Promise.allSettled(attempts);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(9);
  });
});
```

- [ ] **Step 2: Run and confirm it passes against the Task 6/7 implementation**

Run: `npm run test --workspace=apps/api -- appointments.concurrency.test.ts`
Expected: PASS (2 tests). If either test is flaky (occasionally shows 2 fulfilled), the bug is in `acquireSlotLock`'s atomicity or `createAppointment`'s lock-then-write ordering — do not adjust the test to tolerate it; fix the race in `slotLock.ts`/`appointments.service.ts`.

- [ ] **Step 3: Run the full suite once to confirm no cross-test interference**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/appointments/appointments.concurrency.test.ts
git commit -m "test(api): prove double-booking race resolves to exactly one winner"
```

---

### Task 9: Doctor confirm/reject actions

**Files:**
- Modify: `apps/api/src/modules/appointments/appointments.service.ts`, `appointments.controller.ts`, `appointments.routes.ts`, `appointments.test.ts`

**Interfaces:**
- Consumes: `appendTimelineEntry` (Task 7), `logAudit`, `DoctorProfile` lookup pattern (Task 3's `requireDoctorProfileId` — duplicate the same one-line lookup here, don't import across controller files).
- Produces: `confirmAppointment()`, `rejectAppointment()` service functions — consumed by Task 12's email/socket wiring.

- [ ] **Step 1: Write the failing test**

Confirm/reject need the OWNING doctor's login session, but Task 7's
`seedDoctorWithAvailability` helper only returns the doctor's profile id, not
their login cookies. Modify that helper first to return both, then update
Task 7's three existing call sites to match before writing this task's new
tests.

```ts
// apps/api/src/modules/appointments/appointments.test.ts (modify the Task 7 helper to also return cookies)
async function seedDoctorWithAvailability(app: Express) {
  const docCookies = await registerAndLogin(app, 'doctor', `doc-${Date.now()}-${Math.random()}@medlink.demo`);
  await request(app).put('/api/doctors/me').set('Cookie', docCookies).send({
    specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00001',
    experienceYears: 5, bio: 'bio', clinicName: 'Clinic', clinicAddress: 'Addr',
    city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'],
  });
  const doctorProfile = await DoctorProfile.findOne({}).sort({ _id: -1 });
  await AvailabilityRule.create({
    doctorId: doctorProfile!._id, dayOfWeek: new Date().getUTCDay(), startTime: '00:00', endTime: '23:00', slotMinutes: 60,
    validFrom: new Date('2020-01-01'), validTo: new Date('2030-12-31'),
  });
  return { doctorId: doctorProfile!._id.toString(), docCookies };
}
```

This changes `seedDoctorWithAvailability`'s return shape from `string` to `{ doctorId, docCookies }` — update Task 7's three existing call sites (`await seedDoctorWithAvailability(app)` → `const { doctorId } = await seedDoctorWithAvailability(app)`) as part of this task's diff, and re-run Task 7's tests to confirm they still pass with the updated helper before adding the new tests below.

```ts
// apps/api/src/modules/appointments/appointments.test.ts (append, using the updated helper)
describe('PATCH /api/appointments/:id/confirm and /reject', () => {
  it('lets the owning doctor confirm a requested appointment', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'confirmpatient@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=1`).set('Cookie', patientCookies);
    const slot = slotsRes.body.slots[0];
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slot.start, slotEnd: slot.end,
    });
    const appointmentId = bookRes.body.appointment._id;

    const confirmRes = await request(app).patch(`/api/appointments/${appointmentId}/confirm`).set('Cookie', docCookies);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.appointment.status).toBe('confirmed');
    expect(confirmRes.body.appointment.timeline).toHaveLength(2);
  });

  it('rejects a doctor confirming another doctor\'s appointment', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const { docCookies: otherDocCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'confirmpatient2@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=1`).set('Cookie', patientCookies);
    const slot = slotsRes.body.slots[0];
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slot.start, slotEnd: slot.end,
    });

    const res = await request(app)
      .patch(`/api/appointments/${bookRes.body.appointment._id}/confirm`)
      .set('Cookie', otherDocCookies);
    expect(res.status).toBe(404);
  });

  it('lets the owning doctor reject with a reason', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'rejectpatient@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=1`).set('Cookie', patientCookies);
    const slot = slotsRes.body.slots[0];
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slot.start, slotEnd: slot.end,
    });

    const rejectRes = await request(app)
      .patch(`/api/appointments/${bookRes.body.appointment._id}/reject`)
      .set('Cookie', docCookies)
      .send({ reason: 'Fully booked elsewhere' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.appointment.status).toBe('rejected');
    expect(rejectRes.body.appointment.rejectionReason).toBe('Fully booked elsewhere');
  });

  it('releases the slot lock on rejection so it can be rebooked', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'rejectpatient2@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=1`).set('Cookie', patientCookies);
    const slot = slotsRes.body.slots[0];
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slot.start, slotEnd: slot.end,
    });
    await request(app).patch(`/api/appointments/${bookRes.body.appointment._id}/reject`).set('Cookie', docCookies).send({ reason: 'no' });

    const secondPatientCookies = await registerAndLogin(app, 'patient', 'rebookpatient@medlink.demo');
    const rebookRes = await request(app).post('/api/appointments').set('Cookie', secondPatientCookies).send({
      doctorId, slotStart: slot.start, slotEnd: slot.end,
    });
    expect(rebookRes.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- appointments.test.ts`
Expected: FAIL — 404s on `/confirm`/`/reject`

- [ ] **Step 3: Extend the service**

```ts
// apps/api/src/modules/appointments/appointments.service.ts (add)
import { DoctorProfile } from '../../models/DoctorProfile';
import { releaseSlotLock } from './slotLock';

export async function confirmAppointment(appointmentId: string, doctorUserId: string): Promise<IAppointment> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const appointment = await Appointment.findOne({ _id: appointmentId, doctorId: doctorProfile._id });
  if (!appointment) throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');

  const updated = await appendTimelineEntry(appointmentId, 'confirmed', doctorUserId);
  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'appointment.confirmed',
    entityType: 'Appointment', entityId: appointmentId,
  });
  return updated!;
}

export async function rejectAppointment(appointmentId: string, doctorUserId: string, reason: string): Promise<IAppointment> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const appointment = await Appointment.findOne({ _id: appointmentId, doctorId: doctorProfile._id });
  if (!appointment) throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');

  const updated = await appendTimelineEntry(appointmentId, 'rejected', doctorUserId, { rejectionReason: reason });
  await releaseSlotLock(appointment.doctorId.toString(), appointment.slotStart.toISOString());
  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'appointment.rejected',
    entityType: 'Appointment', entityId: appointmentId, meta: { reason },
  });
  return updated!;
}
```

- [ ] **Step 4: Extend controller and routes**

```ts
// apps/api/src/modules/appointments/appointments.controller.ts (add)
import { confirmAppointment, rejectAppointment } from './appointments.service';

export async function confirmAppointmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await confirmAppointment(req.params.id!, req.user!.id);
    res.status(200).json({ appointment });
  } catch (err) {
    next(err);
  }
}

export async function rejectAppointmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await rejectAppointment(req.params.id!, req.user!.id, req.body.reason);
    res.status(200).json({ appointment });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/appointments/appointments.routes.ts (modify)
import { RejectAppointmentInput } from '@medlink/shared';
import { confirmAppointmentHandler, rejectAppointmentHandler } from './appointments.controller';

appointmentsRouter.patch('/:id/confirm', requireRole('doctor'), confirmAppointmentHandler);
appointmentsRouter.patch('/:id/reject', requireRole('doctor'), validate(RejectAppointmentInput), rejectAppointmentHandler);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- appointments.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/appointments/appointments.service.ts apps/api/src/modules/appointments/appointments.controller.ts apps/api/src/modules/appointments/appointments.routes.ts apps/api/src/modules/appointments/appointments.test.ts
git commit -m "feat(api): doctor confirm/reject appointment actions"
```

---

### Task 10: Patient cancel action (2h cutoff)

**Files:**
- Modify: `apps/api/src/modules/appointments/appointments.service.ts`, `appointments.controller.ts`, `appointments.routes.ts`, `appointments.test.ts`

**Interfaces:**
- Consumes: `appendTimelineEntry`, `releaseSlotLock`.
- Produces: `cancelAppointment()` service function.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/appointments/appointments.test.ts (append)
describe('PATCH /api/appointments/:id/cancel', () => {
  it('lets the owning patient cancel more than 2 hours before the slot', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'cancelpatient1@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=7`).set('Cookie', patientCookies);
    // pick a slot far enough in the future to be outside the 2h cutoff
    const farSlot = slotsRes.body.slots.find((s: { start: string }) => new Date(s.start).getTime() - Date.now() > 3 * 60 * 60 * 1000);
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: farSlot.start, slotEnd: farSlot.end,
    });

    const cancelRes = await request(app)
      .patch(`/api/appointments/${bookRes.body.appointment._id}/cancel`)
      .set('Cookie', patientCookies);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.appointment.status).toBe('cancelled');
  });

  it('rejects a cancellation within the 2-hour cutoff', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'cancelpatient2@medlink.demo');
    const nearSlotStart = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: nearSlotStart, slotEnd: new Date(nearSlotStart.getTime() + 15 * 60 * 1000),
    });

    const cancelRes = await request(app)
      .patch(`/api/appointments/${bookRes.body.appointment._id}/cancel`)
      .set('Cookie', patientCookies);
    expect(cancelRes.status).toBe(400);
  });

  it('rejects a different patient cancelling', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'cancelpatient3@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=7`).set('Cookie', patientCookies);
    const farSlot = slotsRes.body.slots.find((s: { start: string }) => new Date(s.start).getTime() - Date.now() > 3 * 60 * 60 * 1000);
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: farSlot.start, slotEnd: farSlot.end,
    });

    const otherPatientCookies = await registerAndLogin(app, 'patient', 'notowner@medlink.demo');
    const res = await request(app)
      .patch(`/api/appointments/${bookRes.body.appointment._id}/cancel`)
      .set('Cookie', otherPatientCookies);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- appointments.test.ts`
Expected: FAIL — 404 on `/cancel`

- [ ] **Step 3: Extend the service**

```ts
// apps/api/src/modules/appointments/appointments.service.ts (add)
const CANCEL_CUTOFF_MS = 2 * 60 * 60 * 1000;

export async function cancelAppointment(appointmentId: string, patientUserId: string): Promise<IAppointment> {
  const appointment = await Appointment.findOne({ _id: appointmentId, patientId: patientUserId });
  if (!appointment) throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');

  if (appointment.slotStart.getTime() - Date.now() < CANCEL_CUTOFF_MS) {
    throw new AppError(400, 'Cannot cancel within 2 hours of the appointment', 'CANCEL_CUTOFF');
  }

  const updated = await appendTimelineEntry(appointmentId, 'cancelled', patientUserId);
  await releaseSlotLock(appointment.doctorId.toString(), appointment.slotStart.toISOString());
  await logAudit({
    actorId: patientUserId, actorRole: 'patient', action: 'appointment.cancelled',
    entityType: 'Appointment', entityId: appointmentId,
  });
  return updated!;
}
```

- [ ] **Step 4: Extend controller and routes**

```ts
// apps/api/src/modules/appointments/appointments.controller.ts (add)
import { cancelAppointment } from './appointments.service';

export async function cancelAppointmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await cancelAppointment(req.params.id!, req.user!.id);
    res.status(200).json({ appointment });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/appointments/appointments.routes.ts (modify)
import { cancelAppointmentHandler } from './appointments.controller';

appointmentsRouter.patch('/:id/cancel', requireRole('patient'), cancelAppointmentHandler);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- appointments.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/appointments/appointments.service.ts apps/api/src/modules/appointments/appointments.controller.ts apps/api/src/modules/appointments/appointments.routes.ts apps/api/src/modules/appointments/appointments.test.ts
git commit -m "feat(api): patient cancel action with 2-hour cutoff"
```

---

### Task 11: `GET /api/appointments/me` (paginated, role-aware list)

**Files:**
- Modify: `apps/api/src/modules/appointments/appointments.controller.ts`, `appointments.routes.ts`, `appointments.test.ts`

**Interfaces:**
- Consumes: `Appointment` model, id-convention lookup pattern.
- Produces: `GET /api/appointments/me?status=&from=&to=&page=&limit=` — consumed by Task 17/18's dashboard pages.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/appointments/appointments.test.ts (append)
describe('GET /api/appointments/me', () => {
  it('lists a patient\'s own appointments with pagination fields', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'listpatient@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=1`).set('Cookie', patientCookies);
    await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slotsRes.body.slots[0].start, slotEnd: slotsRes.body.slots[0].end,
    });

    const res = await request(app).get('/api/appointments/me').set('Cookie', patientCookies);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.page).toBe(1);
    expect(res.body.total).toBe(1);
  });

  it('lists a doctor\'s own appointments, filtered by status', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'listpatient2@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=1`).set('Cookie', patientCookies);
    await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slotsRes.body.slots[0].start, slotEnd: slotsRes.body.slots[0].end,
    });

    const res = await request(app).get('/api/appointments/me?status=requested').set('Cookie', docCookies);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].status).toBe('requested');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- appointments.test.ts`
Expected: FAIL — 404

- [ ] **Step 3: Implement the handler**

```ts
// apps/api/src/modules/appointments/appointments.controller.ts (add)
import { DoctorProfile } from '../../models/DoctorProfile';
import { Appointment } from '../../models/Appointment';

export async function listMyAppointments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));

    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.slotStart = {
        ...(req.query.from ? { $gte: new Date(String(req.query.from)) } : {}),
        ...(req.query.to ? { $lte: new Date(String(req.query.to)) } : {}),
      };
    }

    if (req.user!.role === 'doctor') {
      const doctorProfile = await DoctorProfile.findOne({ userId: req.user!.id });
      filter.doctorId = doctorProfile?._id ?? null;
    } else {
      filter.patientId = req.user!.id;
    }

    const [items, total] = await Promise.all([
      Appointment.find(filter).sort({ slotStart: -1 }).skip((page - 1) * limit).limit(limit),
      Appointment.countDocuments(filter),
    ]);

    res.status(200).json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 4: Add the route**

```ts
// apps/api/src/modules/appointments/appointments.routes.ts (modify)
import { listMyAppointments } from './appointments.controller';

appointmentsRouter.get('/me', requireRole('patient', 'doctor'), listMyAppointments);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- appointments.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 6: Run the full suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/appointments/appointments.controller.ts apps/api/src/modules/appointments/appointments.routes.ts apps/api/src/modules/appointments/appointments.test.ts
git commit -m "feat(api): paginated, role-aware GET /api/appointments/me"
```

---

### Task 12: Socket.io — live status updates

**Files:**
- Create: `apps/api/src/lib/socket.ts`
- Modify: `apps/api/src/server.ts`, `apps/api/src/modules/appointments/appointments.service.ts`
- Test: `apps/api/src/lib/socket.test.ts`

**Interfaces:**
- Consumes: nothing new (wraps the `http.Server` `server.ts` already creates via `app.listen()`).
- Produces: `initSocket(httpServer)`, `emitAppointmentUpdate(userId, appointment)` — called from every state-transition function in `appointments.service.ts`; consumed by Task 18's frontend socket client.

- [ ] **Step 1: Install dependencies**

```bash
npm install --workspace=apps/api socket.io
npm install --workspace=apps/web socket.io-client
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/src/lib/socket.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { initSocket, emitAppointmentUpdate } from './socket';

let httpServer: ReturnType<typeof createServer>;
let port: number;

beforeAll(async () => {
  httpServer = createServer();
  initSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(() => {
  httpServer.close();
});

describe('socket.io appointment updates', () => {
  it('delivers an appointment update to a client that joined the right user room', async () => {
    const userId = 'user-123';
    const client: ClientSocket = ioClient(`http://localhost:${port}`);

    await new Promise<void>((resolve) => client.on('connect', resolve));
    client.emit('join', userId);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const received = new Promise((resolve) => client.on('appointment:updated', resolve));
    emitAppointmentUpdate(userId, { _id: 'appt-1', status: 'confirmed' });

    const payload = await received;
    expect(payload).toEqual({ _id: 'appt-1', status: 'confirmed' });

    client.close();
  });

  it('does not deliver to a client in a different room', async () => {
    const client: ClientSocket = ioClient(`http://localhost:${port}`);
    await new Promise<void>((resolve) => client.on('connect', resolve));
    client.emit('join', 'some-other-user');
    await new Promise((resolve) => setTimeout(resolve, 50));

    let received = false;
    client.on('appointment:updated', () => { received = true; });

    emitAppointmentUpdate('user-not-in-any-connected-room', { _id: 'appt-2', status: 'confirmed' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(received).toBe(false);
    client.close();
  });
});
```

- [ ] **Step 3: Implement the socket module**

```ts
// apps/api/src/lib/socket.ts
import { Server as HTTPServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | undefined;

export function initSocket(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true },
  });

  io.on('connection', (socket) => {
    socket.on('join', (userId: string) => {
      socket.join(userId);
    });
  });

  return io;
}

export function emitAppointmentUpdate(userId: string, appointment: unknown): void {
  io?.to(userId).emit('appointment:updated', appointment);
}
```

- [ ] **Step 4: Wire into `server.ts`**

```ts
// apps/api/src/server.ts (modify)
import { createServer } from 'node:http';
import { initSocket } from './lib/socket';

async function main(): Promise<void> {
  await connectDB(process.env.MONGO_URI ?? 'mongodb://localhost:27017/medlink');
  const app = createApp();
  const httpServer = createServer(app);
  initSocket(httpServer);
  httpServer.listen(PORT, () => logger.info(`api listening on ${PORT}`));
}
```

- [ ] **Step 5: Emit from every state transition**

```ts
// apps/api/src/modules/appointments/appointments.service.ts (modify each of createAppointment/confirmAppointment/rejectAppointment/cancelAppointment)
import { emitAppointmentUpdate } from '../../lib/socket';

// at the end of createAppointment, before `return appointment;`:
emitAppointmentUpdate(appointment.doctorId.toString(), appointment); // note: doctorId here is a DoctorProfile id, not a socket room key yet — see Task 12's note below
emitAppointmentUpdate(patientId, appointment);

// at the end of confirmAppointment/rejectAppointment/cancelAppointment, before each `return updated!;`:
emitAppointmentUpdate(updated!.patientId.toString(), updated);
```

**Important correction to apply while implementing this step:** the frontend's `join` room key is the logged-in user's `User._id` (Task 18 emits `join` with the value from its own auth state, which is a `User._id`). `Appointment.doctorId` is a `DoctorProfile._id`, so emitting to `appointment.doctorId.toString()` joins the wrong room — no doctor client will ever be in a room named after a `DoctorProfile` id. Look up the doctor's `User._id` first: in `createAppointment`, after creating the appointment, do `const doctorProfile = await DoctorProfile.findById(appointment.doctorId); if (doctorProfile) emitAppointmentUpdate(doctorProfile.userId.toString(), appointment);` — and similarly in `confirmAppointment`/`rejectAppointment`/`cancelAppointment`, emit to the patient's id directly (already a `User._id`) and to the doctor's `DoctorProfile.userId` (not `doctorId`) for the other side. Write this correctly the first time; do not commit the `doctorId.toString()` version even as an intermediate step.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test --workspace=apps/api -- socket.test.ts appointments.test.ts appointments.concurrency.test.ts`
Expected: PASS (socket.test.ts: 2 tests; appointments suites: unaffected, still passing — socket emission failures must never throw, since `emitAppointmentUpdate` only calls `io?.to(...)`, a no-op if `io` is undefined in the test environment where `initSocket` was never called)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/socket.ts apps/api/src/lib/socket.test.ts apps/api/src/server.ts apps/api/src/modules/appointments/appointments.service.ts apps/api/package.json apps/web/package.json package-lock.json
git commit -m "feat(api): Socket.io live appointment-status updates"
```

---

### Task 13: Email notifications (Nodemailer)

**Files:**
- Create: `apps/api/src/lib/mailer.ts`, `mailer.test.ts`
- Modify: `apps/api/src/modules/appointments/appointments.service.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `sendAppointmentEmail(to: string, template: 'requested'|'confirmed'|'rejected'|'reminder', data: Record<string, unknown>): Promise<void>` — consumed by every `appointments.service.ts` transition and Task 15's reminder job.

- [ ] **Step 1: Install dependencies**

```bash
npm install --workspace=apps/api nodemailer
npm install --workspace=apps/api --save-dev @types/nodemailer nodemailer-mock
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/src/lib/mailer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('nodemailer', async () => {
  const mock = await import('nodemailer-mock');
  return mock.default;
});

import nodemailer from 'nodemailer-mock';
import { sendAppointmentEmail } from './mailer';

beforeEach(() => {
  nodemailer.mock.reset();
});

describe('sendAppointmentEmail', () => {
  it('sends a "requested" email with the recipient and a non-empty subject/body', async () => {
    await sendAppointmentEmail('patient@medlink.demo', 'requested', { doctorName: 'Dr. Meera Sharma', slotStart: '2026-08-05T18:00:00.000Z' });

    const sent = nodemailer.mock.getSentMail();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('patient@medlink.demo');
    expect(sent[0].subject).toContain('Dr. Meera Sharma');
  });

  it('sends a distinct subject per template', async () => {
    await sendAppointmentEmail('a@medlink.demo', 'confirmed', { doctorName: 'Dr. X', slotStart: '2026-08-05T18:00:00.000Z' });
    await sendAppointmentEmail('a@medlink.demo', 'rejected', { doctorName: 'Dr. X', slotStart: '2026-08-05T18:00:00.000Z', reason: 'busy' });

    const sent = nodemailer.mock.getSentMail();
    expect(sent[0].subject).not.toBe(sent[1].subject);
  });
});
```

- [ ] **Step 3: Implement the mailer**

```ts
// apps/api/src/lib/mailer.ts
import nodemailer from 'nodemailer';
import { logger } from './logger';

type Template = 'requested' | 'confirmed' | 'rejected' | 'reminder';

function transporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function subjectFor(template: Template, data: Record<string, unknown>): string {
  const doctorName = String(data.doctorName ?? 'your doctor');
  switch (template) {
    case 'requested':
      return `Appointment request sent to ${doctorName}`;
    case 'confirmed':
      return `Appointment confirmed with ${doctorName}`;
    case 'rejected':
      return `Appointment request declined by ${doctorName}`;
    case 'reminder':
      return `Reminder: appointment with ${doctorName} tomorrow`;
  }
}

function bodyFor(template: Template, data: Record<string, unknown>): string {
  const doctorName = String(data.doctorName ?? 'your doctor');
  const slotStart = String(data.slotStart ?? '');
  switch (template) {
    case 'requested':
      return `Your appointment request with ${doctorName} for ${slotStart} has been sent and is awaiting confirmation.`;
    case 'confirmed':
      return `Your appointment with ${doctorName} for ${slotStart} is confirmed.`;
    case 'rejected':
      return `Your appointment request with ${doctorName} for ${slotStart} was declined. Reason: ${String(data.reason ?? 'not specified')}.`;
    case 'reminder':
      return `This is a reminder of your appointment with ${doctorName} tomorrow at ${slotStart}.`;
  }
}

export async function sendAppointmentEmail(to: string, template: Template, data: Record<string, unknown>): Promise<void> {
  try {
    await transporter().sendMail({
      from: process.env.SMTP_USER ?? 'no-reply@medlink.demo',
      to,
      subject: subjectFor(template, data),
      text: bodyFor(template, data),
    });
  } catch (err) {
    // Email is a best-effort side effect of a booking transition, not part of its
    // correctness — a down SMTP server must never fail an appointment state change.
    logger.error(err, 'failed to send appointment email');
  }
}
```

- [ ] **Step 4: Wire into state transitions**

```ts
// apps/api/src/modules/appointments/appointments.service.ts (modify)
import { sendAppointmentEmail } from '../../lib/mailer';
import { User } from '../../models/User';

// In createAppointment, after logAudit, before return:
const patientUser = await User.findById(patientId);
const doctorProfileForEmail = await DoctorProfile.findById(input.doctorId);
if (patientUser) {
  await sendAppointmentEmail(patientUser.email, 'requested', {
    doctorName: doctorProfileForEmail?.clinicName ?? 'the doctor',
    slotStart: input.slotStart.toISOString(),
  });
}

// In confirmAppointment/rejectAppointment, after logAudit, before return: look up the
// patient via `updated!.patientId`, and the doctor's clinicName via `doctorProfile`
// (already fetched earlier in each function), then call sendAppointmentEmail with
// template 'confirmed' / 'rejected' (passing `{ reason }` for the rejected case) the
// same way as above.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- mailer.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the full suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files — the email calls in `appointments.service.ts` must not be mocked out for other test files, since `sendAppointmentEmail` swallows its own errors; confirm no test hangs or times out waiting on a real network call, since `nodemailer`'s Gmail transport will fail fast on connection refusal in this sandboxed test environment, not hang)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/mailer.ts apps/api/src/lib/mailer.test.ts apps/api/src/modules/appointments/appointments.service.ts apps/api/package.json package-lock.json
git commit -m "feat(api): Nodemailer email notifications on appointment transitions"
```

---

### Task 14: 24-hour reminder cron job

**Files:**
- Create: `apps/api/src/jobs/reminderJob.ts`, `reminderJob.test.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `sendAppointmentEmail` (Task 13), `Appointment.reminderSentAt` field (Task 2).
- Produces: `runReminderScan(): Promise<number>` (returns count of reminders sent — the number a cron tick logs and a test asserts on), `startReminderCron(): void`.

- [ ] **Step 1: Install dependency**

```bash
npm install --workspace=apps/api node-cron
npm install --workspace=apps/api --save-dev @types/node-cron
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/src/jobs/reminderJob.test.ts
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Appointment } from '../models/Appointment';
import { User } from '../models/User';
import { DoctorProfile } from '../models/DoctorProfile';

vi.mock('nodemailer', async () => {
  const mock = await import('nodemailer-mock');
  return mock.default;
});
import nodemailer from 'nodemailer-mock';
import { runReminderScan } from './reminderJob';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
beforeEach(() => {
  nodemailer.mock.reset();
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function seedConfirmedAppointment(hoursFromNow: number) {
  const patient = await User.create({ role: 'patient', email: `p-${Date.now()}-${Math.random()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'P' });
  const doctorUser = await User.create({ role: 'doctor', email: `d-${Date.now()}-${Math.random()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'D' });
  const doctorProfile = await DoctorProfile.create({
    userId: doctorUser._id, specialties: ['X'], qualifications: ['MBBS'], regNo: 'DMC/R/1',
    experienceYears: 1, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida',
    geo: { lat: 1, lng: 1 }, consultationFee: 100, languages: ['English'],
  });
  const slotStart = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  return Appointment.create({
    patientId: patient._id, doctorId: doctorProfile._id, slotStart, slotEnd: new Date(slotStart.getTime() + 15 * 60 * 1000),
    status: 'confirmed',
  });
}

describe('runReminderScan', () => {
  it('sends a reminder for an appointment ~24h out and marks reminderSentAt', async () => {
    const appt = await seedConfirmedAppointment(24);
    const sentCount = await runReminderScan();
    expect(sentCount).toBe(1);

    const updated = await Appointment.findById(appt._id);
    expect(updated!.reminderSentAt).toBeInstanceOf(Date);
    expect(nodemailer.mock.getSentMail()).toHaveLength(1);
  });

  it('does not send twice for an appointment already reminded', async () => {
    const appt = await seedConfirmedAppointment(24);
    await runReminderScan();
    nodemailer.mock.reset();

    const secondRun = await runReminderScan();
    expect(secondRun).toBe(0);
    expect(nodemailer.mock.getSentMail()).toHaveLength(0);
  });

  it('does not send for an appointment far in the future', async () => {
    await seedConfirmedAppointment(72);
    const sentCount = await runReminderScan();
    expect(sentCount).toBe(0);
  });

  it('does not send for a non-confirmed appointment', async () => {
    const patient = await User.create({ role: 'patient', email: 'rp@medlink.demo', phone: '9999999999', passwordHash: 'x', name: 'P' });
    const doctorUser = await User.create({ role: 'doctor', email: 'rd@medlink.demo', phone: '9999999999', passwordHash: 'x', name: 'D' });
    const doctorProfile = await DoctorProfile.create({
      userId: doctorUser._id, specialties: ['X'], qualifications: ['MBBS'], regNo: 'DMC/R/2',
      experienceYears: 1, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida',
      geo: { lat: 1, lng: 1 }, consultationFee: 100, languages: ['English'],
    });
    const slotStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await Appointment.create({
      patientId: patient._id, doctorId: doctorProfile._id, slotStart, slotEnd: new Date(slotStart.getTime() + 15 * 60 * 1000),
      status: 'requested',
    });

    const sentCount = await runReminderScan();
    expect(sentCount).toBe(0);
  });
});
```

- [ ] **Step 3: Implement the job**

```ts
// apps/api/src/jobs/reminderJob.ts
import cron from 'node-cron';
import { Appointment } from '../models/Appointment';
import { DoctorProfile } from '../models/DoctorProfile';
import { User } from '../models/User';
import { sendAppointmentEmail } from '../lib/mailer';
import { logger } from '../lib/logger';

const REMINDER_WINDOW_START_MS = 23 * 60 * 60 * 1000;
const REMINDER_WINDOW_END_MS = 25 * 60 * 60 * 1000;

export async function runReminderScan(): Promise<number> {
  const now = Date.now();
  const windowStart = new Date(now + REMINDER_WINDOW_START_MS);
  const windowEnd = new Date(now + REMINDER_WINDOW_END_MS);

  const dueAppointments = await Appointment.find({
    status: 'confirmed',
    slotStart: { $gte: windowStart, $lte: windowEnd },
    reminderSentAt: { $exists: false },
  });

  let sentCount = 0;
  for (const appointment of dueAppointments) {
    const [patient, doctorProfile] = await Promise.all([
      User.findById(appointment.patientId),
      DoctorProfile.findById(appointment.doctorId),
    ]);
    if (!patient) continue;

    await sendAppointmentEmail(patient.email, 'reminder', {
      doctorName: doctorProfile?.clinicName ?? 'your doctor',
      slotStart: appointment.slotStart.toISOString(),
    });
    appointment.reminderSentAt = new Date();
    await appointment.save();
    sentCount++;
  }

  return sentCount;
}

export function startReminderCron(): void {
  cron.schedule('0 * * * *', () => {
    runReminderScan().catch((err) => logger.error(err, 'reminder scan failed'));
  });
}
```

- [ ] **Step 4: Wire into `server.ts`**

```ts
// apps/api/src/server.ts (modify)
import { startReminderCron } from './jobs/reminderJob';

// after httpServer.listen(...):
startReminderCron();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- reminderJob.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/jobs apps/api/src/server.ts apps/api/package.json package-lock.json
git commit -m "feat(api): 24h appointment reminder cron job"
```

---

### Task 15: Phase 2 seed data (15 appointments)

**Files:**
- Modify: `apps/api/src/seed/seed.ts`, `data.ts`
- Test: extend `apps/api/src/seed/seed.test.ts`

**Interfaces:**
- Consumes: `Appointment`, `AvailabilityRule` models, existing `runSeed()` (Phase 1 Task 15).
- Produces: the 15-appointment slice of CLAUDE.md §6.4's dataset, per `2026-07-27-roadmap.md`'s table.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/seed/seed.test.ts (append)
import { Appointment } from '../models/Appointment';
import { AvailabilityRule } from '../models/AvailabilityRule';

describe('runSeed — Phase 2 slice', () => {
  it('seeds availability rules for approved doctors and exactly 15 appointments with the spec\'d status distribution', async () => {
    await runSeed();

    const ruleCount = await AvailabilityRule.countDocuments({});
    expect(ruleCount).toBeGreaterThan(0);

    const appointments = await Appointment.find({});
    expect(appointments).toHaveLength(15);

    const counts: Record<string, number> = {};
    for (const appt of appointments) counts[appt.status] = (counts[appt.status] ?? 0) + 1;

    // CLAUDE.md §6.4 lists "6 completed ... each with prescription" as distinct from
    // the separately-listed "1 completed-without-prescription" — 7 completed total,
    // not 6. Phase 4 is what actually distinguishes the two (by whether a Prescription
    // document references the appointment); this phase just needs the status counts right.
    expect(counts.completed).toBe(7);
    expect(counts.confirmed).toBe(3);
    expect(counts.requested).toBe(2);
    expect(counts.rejected).toBe(1);
    expect(counts.cancelled).toBe(1);
    expect(counts.no_show).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- seed.test.ts`
Expected: FAIL — 0 appointments, 0 rules

- [ ] **Step 3: Add availability rules and appointment seed data**

```ts
// apps/api/src/seed/data.ts (append)
// One weekly rule per approved doctor, matching the CLAUDE.md §6.2 "Availability" column
// (days abbreviated; only the pattern needed for slot generation is encoded here — exact
// days/times are illustrative demo data, not load-bearing for any test).
export const AVAILABILITY_RULES_BY_DOCTOR_EMAIL: Record<string, { dayOfWeek: number; startTime: string; endTime: string; slotMinutes: number }[]> = {
  'meera.d@medlink.demo': [{ dayOfWeek: 1, startTime: '18:00', endTime: '21:00', slotMinutes: 15 }],
  'arjun.d@medlink.demo': [{ dayOfWeek: 2, startTime: '10:00', endTime: '13:00', slotMinutes: 20 }],
  'kavita.d@medlink.demo': [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00', slotMinutes: 10 }],
  'sanjay.d@medlink.demo': [{ dayOfWeek: 1, startTime: '17:00', endTime: '20:00', slotMinutes: 15 }],
  'neha.d@medlink.demo': [{ dayOfWeek: 1, startTime: '11:00', endTime: '14:00', slotMinutes: 20 }],
  'rohit.d@medlink.demo': [{ dayOfWeek: 2, startTime: '09:00', endTime: '12:00', slotMinutes: 20 }],
  'anjali.d@medlink.demo': [{ dayOfWeek: 1, startTime: '16:00', endTime: '19:00', slotMinutes: 15 }],
  'farhan.d@medlink.demo': [{ dayOfWeek: 2, startTime: '18:00', endTime: '21:00', slotMinutes: 15 }],
  'pooja.d@medlink.demo': [{ dayOfWeek: 1, startTime: '10:00', endTime: '13:00', slotMinutes: 15 }],
  'vivek.d@medlink.demo': [{ dayOfWeek: 1, startTime: '11:00', endTime: '13:00', slotMinutes: 15 }],
  'ritu.d@medlink.demo': [{ dayOfWeek: 2, startTime: '15:00', endTime: '18:00', slotMinutes: 30 }],
};
```

```ts
// apps/api/src/seed/seed.ts (modify — add after the LABS loop, before the admin Notification)
import { AvailabilityRule } from '../models/AvailabilityRule';
import { Appointment } from '../models/Appointment';
import { AVAILABILITY_RULES_BY_DOCTOR_EMAIL } from './data';

// ...inside runSeed(), add:
await AvailabilityRule.deleteMany({});
await Appointment.deleteMany({});

const doctorUsersByEmail = new Map<string, { userId: import('mongoose').Types.ObjectId; profileId: import('mongoose').Types.ObjectId }>();
for (const d of DOCTORS) {
  const user = await User.findOne({ email: d.email });
  const profile = await DoctorProfile.findOne({ userId: user!._id });
  if (user && profile) doctorUsersByEmail.set(d.email, { userId: user._id, profileId: profile._id });

  const rules = AVAILABILITY_RULES_BY_DOCTOR_EMAIL[d.email];
  if (rules && profile) {
    for (const rule of rules) {
      await AvailabilityRule.create({
        doctorId: profile._id, ...rule,
        validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
      });
    }
  }
}

const patientUsers = await Promise.all(PATIENTS.map((p) => User.findOne({ email: p.email })));
const meera = doctorUsersByEmail.get('meera.d@medlink.demo')!;
const kavita = doctorUsersByEmail.get('kavita.d@medlink.demo')!;
const rohit = doctorUsersByEmail.get('rohit.d@medlink.demo')!;
const anjali = doctorUsersByEmail.get('anjali.d@medlink.demo')!;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}
function withTimeline(status: string, patientId: import('mongoose').Types.ObjectId) {
  return [{ status, at: new Date(), by: patientId }];
}

const appointmentSeeds = [
  // 7 completed, past 2 weeks (6 of these get a Prescription in Phase 4; the 7th,
  // last entry below, is CLAUDE.md §6.4's "1 completed-without-prescription" — a
  // genuinely separate appointment, not one of the 6, so Phase 4 has exactly one
  // completed appointment it should NOT attach a prescription to)
  { doctorId: meera.profileId, patientId: patientUsers[0]!._id, slotStart: daysAgo(2), status: 'completed' },
  { doctorId: kavita.profileId, patientId: patientUsers[1]!._id, slotStart: daysAgo(3), status: 'completed' },
  { doctorId: rohit.profileId, patientId: patientUsers[2]!._id, slotStart: daysAgo(5), status: 'completed' },
  { doctorId: anjali.profileId, patientId: patientUsers[3]!._id, slotStart: daysAgo(7), status: 'completed' },
  { doctorId: meera.profileId, patientId: patientUsers[4]!._id, slotStart: daysAgo(10), status: 'completed' },
  { doctorId: kavita.profileId, patientId: patientUsers[5]!._id, slotStart: daysAgo(12), status: 'completed' },
  { doctorId: rohit.profileId, patientId: patientUsers[4]!._id, slotStart: daysAgo(14), status: 'completed' }, // completed-without-prescription
  // 3 confirmed, next 3 days
  { doctorId: meera.profileId, patientId: patientUsers[0]!._id, slotStart: daysFromNow(1), status: 'confirmed' },
  { doctorId: rohit.profileId, patientId: patientUsers[1]!._id, slotStart: daysFromNow(2), status: 'confirmed' },
  { doctorId: anjali.profileId, patientId: patientUsers[2]!._id, slotStart: daysFromNow(3), status: 'confirmed' },
  // 2 requested, pending on Dr. Meera + Dr. Kavita
  { doctorId: meera.profileId, patientId: patientUsers[3]!._id, slotStart: daysFromNow(1), status: 'requested' },
  { doctorId: kavita.profileId, patientId: patientUsers[4]!._id, slotStart: daysFromNow(2), status: 'requested' },
  // 1 rejected
  { doctorId: rohit.profileId, patientId: patientUsers[3]!._id, slotStart: daysAgo(1), status: 'rejected', rejectionReason: 'Please book with a pediatrician for a child patient' },
  // 1 cancelled, 1 no_show
  { doctorId: anjali.profileId, patientId: patientUsers[5]!._id, slotStart: daysFromNow(4), status: 'cancelled' },
  { doctorId: meera.profileId, patientId: patientUsers[2]!._id, slotStart: daysAgo(4), status: 'no_show' },
];

for (const seed of appointmentSeeds) {
  await Appointment.create({
    doctorId: seed.doctorId,
    patientId: seed.patientId,
    slotStart: seed.slotStart,
    slotEnd: new Date(seed.slotStart.getTime() + 15 * 60 * 1000),
    status: seed.status,
    rejectionReason: (seed as { rejectionReason?: string }).rejectionReason,
    timeline: withTimeline(seed.status, seed.patientId),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- seed.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/seed
git commit -m "feat(api): seed Phase 2 availability rules and 15 demo appointments"
```

---

### Task 16: RTK Query appointments API slice

**Files:**
- Create: `apps/web/src/store/appointmentsApi.ts`

**Interfaces:**
- Consumes: `baseApi` (Phase 1 Task 13).
- Produces: `useGetDoctorSlotsQuery`, `useCreateAppointmentMutation`, `useListMyAppointmentsQuery`, `useConfirmAppointmentMutation`, `useRejectAppointmentMutation`, `useCancelAppointmentMutation` — consumed by Tasks 17–18.

- [ ] **Step 1: Implement the API slice**

```ts
// apps/web/src/store/appointmentsApi.ts
import { baseApi } from './api';

export interface Slot { start: string; end: string }
export interface AppointmentTimelineEntry { status: string; at: string; by: string }
export interface Appointment {
  _id: string; doctorId: string; patientId: string; slotStart: string; slotEnd: string;
  status: string; rejectionReason?: string; timeline: AppointmentTimelineEntry[];
}

export const appointmentsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDoctorSlots: builder.query<{ slots: Slot[] }, { doctorId: string; days?: number }>({
      query: ({ doctorId, days = 14 }) => `/doctors/${doctorId}/slots?days=${days}`,
    }),
    createAppointment: builder.mutation<{ appointment: Appointment }, { doctorId: string; slotStart: string; slotEnd: string }>({
      query: (body) => ({ url: '/appointments', method: 'POST', body }),
      invalidatesTags: ['MyAppointments'],
    }),
    listMyAppointments: builder.query<{ items: Appointment[]; total: number }, { status?: string } | void>({
      query: (params) => ({ url: '/appointments/me', params: params ?? {} }),
      providesTags: ['MyAppointments'],
    }),
    confirmAppointment: builder.mutation<{ appointment: Appointment }, string>({
      query: (id) => ({ url: `/appointments/${id}/confirm`, method: 'PATCH' }),
      invalidatesTags: ['MyAppointments'],
    }),
    rejectAppointment: builder.mutation<{ appointment: Appointment }, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/appointments/${id}/reject`, method: 'PATCH', body: { reason } }),
      invalidatesTags: ['MyAppointments'],
    }),
    cancelAppointment: builder.mutation<{ appointment: Appointment }, string>({
      query: (id) => ({ url: `/appointments/${id}/cancel`, method: 'PATCH' }),
      invalidatesTags: ['MyAppointments'],
    }),
  }),
});

export const {
  useGetDoctorSlotsQuery,
  useCreateAppointmentMutation,
  useListMyAppointmentsQuery,
  useConfirmAppointmentMutation,
  useRejectAppointmentMutation,
  useCancelAppointmentMutation,
} = appointmentsApi;
```

- [ ] **Step 2: Add the `MyAppointments` tag type to `baseApi`**

```ts
// apps/web/src/store/api.ts (modify the existing tagTypes array)
tagTypes: ['PatientProfile', 'DoctorProfile', 'LabProfile', 'Verification', 'MyAppointments'],
```

- [ ] **Step 3: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds, zero type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/store/appointmentsApi.ts apps/web/src/store/api.ts
git commit -m "feat(web): RTK Query endpoints for slots and appointments"
```

---

### Task 17: Patient booking page + dashboard

**Files:**
- Create: `apps/web/src/app/doctors/[id]/book/page.tsx`, `apps/web/src/app/dashboard/patient/page.tsx`

**Interfaces:**
- Consumes: `useGetDoctorSlotsQuery`, `useCreateAppointmentMutation`, `useListMyAppointmentsQuery`, `useCancelAppointmentMutation` (Task 16).
- Produces: nothing consumed elsewhere in this plan.

- [ ] **Step 1: Implement the booking page**

```tsx
// apps/web/src/app/doctors/[id]/book/page.tsx
'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGetDoctorSlotsQuery, useCreateAppointmentMutation } from '@/store/appointmentsApi';

export default function BookAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: doctorId } = use(params);
  const { data, isLoading } = useGetDoctorSlotsQuery({ doctorId, days: 14 });
  const [createAppointment, { isLoading: isBooking, error }] = useCreateAppointmentMutation();
  const [selected, setSelected] = useState<{ start: string; end: string } | null>(null);
  const router = useRouter();

  async function onBook() {
    if (!selected) return;
    await createAppointment({ doctorId, slotStart: selected.start, slotEnd: selected.end }).unwrap();
    router.push('/dashboard/patient');
  }

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading slots…</main>;

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Book an appointment</h1>
      <div className="grid grid-cols-3 gap-2">
        {data?.slots.map((slot) => (
          <button
            key={slot.start}
            className={`border p-2 rounded ${selected?.start === slot.start ? 'bg-black text-white' : ''}`}
            onClick={() => setSelected(slot)}
          >
            {new Date(slot.start).toLocaleString()}
          </button>
        ))}
      </div>
      <button className="bg-black text-white px-4 py-2 rounded" disabled={!selected || isBooking} onClick={onBook}>
        {isBooking ? 'Booking…' : 'Confirm booking'}
      </button>
      {error ? <p className="text-red-600">That slot is no longer available — pick another.</p> : null}
    </main>
  );
}
```

- [ ] **Step 2: Implement the patient dashboard**

```tsx
// apps/web/src/app/dashboard/patient/page.tsx
'use client';

import { useListMyAppointmentsQuery, useCancelAppointmentMutation } from '@/store/appointmentsApi';

export default function PatientDashboard() {
  const { data, isLoading, refetch } = useListMyAppointmentsQuery();
  const [cancelAppointment] = useCancelAppointmentMutation();

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading…</main>;

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-2">
      <h1 className="text-2xl font-bold">My appointments</h1>
      {data?.items.map((appt) => (
        <div key={appt._id} className="border p-3 rounded flex justify-between items-center">
          <div>
            <p>{new Date(appt.slotStart).toLocaleString()}</p>
            <p className="text-sm text-gray-600">Status: {appt.status}</p>
          </div>
          {appt.status === 'confirmed' || appt.status === 'requested' ? (
            <button
              className="border px-3 py-1 rounded"
              onClick={async () => { await cancelAppointment(appt._id).unwrap(); refetch(); }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ))}
    </main>
  );
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/doctors/[id]/book apps/web/src/app/dashboard/patient
git commit -m "feat(web): patient booking page and appointments dashboard"
```

---

### Task 18: Doctor dashboard + Socket.io client wiring

**Files:**
- Create: `apps/web/src/lib/socket.ts`, `apps/web/src/app/dashboard/doctor/page.tsx`

**Interfaces:**
- Consumes: `useListMyAppointmentsQuery`, `useConfirmAppointmentMutation`, `useRejectAppointmentMutation` (Task 16); `socket.io-client` (Task 12's dependency install).
- Produces: nothing consumed elsewhere — this is the plan's final task.

- [ ] **Step 1: Implement the socket client helper**

```ts
// apps/web/src/lib/socket.ts
import { io, Socket } from 'socket.io-client';

let socket: Socket | undefined;

export function getSocket(userId: string): Socket {
  if (!socket) {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
    socket = io(base.replace(/\/api$/, ''));
    socket.on('connect', () => socket?.emit('join', userId));
  }
  return socket;
}
```

- [ ] **Step 2: Implement the doctor dashboard**

```tsx
// apps/web/src/app/dashboard/doctor/page.tsx
'use client';

import { useEffect } from 'react';
import {
  useListMyAppointmentsQuery,
  useConfirmAppointmentMutation,
  useRejectAppointmentMutation,
} from '@/store/appointmentsApi';
import { getSocket } from '@/lib/socket';

export default function DoctorDashboard() {
  const { data, isLoading, refetch } = useListMyAppointmentsQuery({ status: 'requested' });
  const [confirmAppointment] = useConfirmAppointmentMutation();
  const [rejectAppointment] = useRejectAppointmentMutation();

  useEffect(() => {
    // A doctor's own User id isn't available here without reading auth state (out of
    // scope for this minimal dashboard) — using a placeholder join value means this
    // dashboard won't actually receive live pushes until real auth-state wiring lands;
    // refetch() below on a fixed interval keeps the list correct in the meantime.
    const socket = getSocket('current-user-placeholder');
    socket.on('appointment:updated', () => refetch());
    const interval = setInterval(refetch, 10000);
    return () => {
      socket.off('appointment:updated');
      clearInterval(interval);
    };
  }, [refetch]);

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading…</main>;

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-2">
      <h1 className="text-2xl font-bold">Pending requests</h1>
      {data?.items.map((appt) => (
        <div key={appt._id} className="border p-3 rounded flex justify-between items-center">
          <p>{new Date(appt.slotStart).toLocaleString()}</p>
          <div className="space-x-2">
            <button
              className="bg-black text-white px-3 py-1 rounded"
              onClick={async () => { await confirmAppointment(appt._id).unwrap(); refetch(); }}
            >
              Confirm
            </button>
            <button
              className="border px-3 py-1 rounded"
              onClick={async () => { await rejectAppointment({ id: appt._id, reason: 'Not available' }).unwrap(); refetch(); }}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </main>
  );
}
```

**Known gap, deliberately left for this plan's follow-up review to triage:** the `'current-user-placeholder'` join value means Socket.io push delivery does not actually reach the right room yet — real-time push requires reading the logged-in user's id out of the JWT-derived session state, which Phase 1 never exposed to the frontend (no `/api/auth/me` endpoint exists, and RTK Query has no client-side auth-state slice). The 10-second poll fallback keeps the dashboard functionally correct for a demo; do not treat this as done until a task reviewer either accepts the poll-based fallback for this phase's DoD or flags that an `/api/auth/me` endpoint + auth-state slice belongs earlier in this same plan.

- [ ] **Step 3: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/socket.ts apps/web/src/app/dashboard/doctor
git commit -m "feat(web): doctor dashboard with live-update polling fallback"
```

---

## Phase 2 Definition of Done (from CLAUDE.md §2)

Two browser sessions (or two `curl`/Postman sessions using two different
patient logins) racing `POST /api/appointments` for the identical
`doctorId`+`slotStart` — one gets `201`, the other gets `409`. A doctor
confirming or rejecting a request updates the patient's dashboard within the
10-second poll window (true live push is the known gap noted in Task 18).

## Self-Review Notes

- **Spec coverage:** every Phase 2 CLAUDE.md §2 checklist item maps to a task: availability rules → Task 3; slot generation → Task 4; slot query endpoint → Task 5; Redis locking → Task 6; booking flow → Tasks 7–11; blocked dates (leave) → Task 3; Socket.io → Task 12; email → Task 13; cron reminder → Task 14; concurrency test → Task 8.
- **Known, disclosed gap:** Task 18's Socket.io client wiring cannot join the correct room without a real auth-state mechanism the frontend doesn't have yet (Phase 1 never built one). This is flagged inline rather than silently shipped as if it worked — a task reviewer must decide whether the polling fallback satisfies this phase's DoD or whether an `/api/auth/me` + auth-state task needs inserting before Task 18.
- **Ledger carry-forward:** this plan's Task 1 closes the one residual finding from Phase 1's final review (`LabTestPatch` schema misplacement) before adding any new shared schemas, so the project's own "single source of truth" constraint is clean going into Phase 2.
- **Type consistency check:** `req.user.id` (User id) vs. `doctorId`/`AvailabilityRule.doctorId` (DoctorProfile id) is threaded consistently through every task via the repeated `DoctorProfile.findOne({ userId: req.user!.id })` lookup pattern (Tasks 3, 9, 10, 11) — the exact gap the Phase 1 final review flagged in the roadmap is addressed by making the lookup explicit and repeated at every doctor-scoped call site, not abstracted into a shared helper that could silently drift from what each call site actually needs.
