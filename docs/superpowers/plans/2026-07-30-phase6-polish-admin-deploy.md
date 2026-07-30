# Phase 6 — Polish, Admin, Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out MedLink's feature roadmap (CLAUDE.md Phase 6): doctor ratings, admin analytics, a notification center, global doctor/lab search, the deferred Phase-5 lab-referral-visibility gap, a security hardening pass, refreshed seed data, CI image publishing, and a rewritten README.

**Architecture:** Every new feature follows the established module split already used in `apps/api/src/modules/*` (`*.service.ts` / `*.controller.ts` / `*.routes.ts` / `*.test.ts`, mounted in `apps/api/src/app.ts` under `/api/<segment>`), the established pagination shape `{items, total, page, limit}` via `toPositiveInt` (`apps/api/src/lib/pagination.ts`), and the established RTK Query slice-per-domain pattern on the frontend (`apps/web/src/store/*Api.ts`, `injectEndpoints`).

**Tech Stack:** No new dependencies required for any backend feature — Mongoose aggregation pipelines cover analytics, `express-rate-limit` + the existing `SimpleRedisStore` covers the security pass, `nanoid`/`multer`/`pdf-lib` are already in place. CI adds `docker/build-push-action@v5` (GitHub-hosted, no new secrets — pushes to GHCR using the built-in `GITHUB_TOKEN`).

## Global Constraints

- TypeScript strict everywhere; no `any`. Every new list endpoint returns exactly `{ items, total, page, limit }` and uses `toPositiveInt(req.query.page, 1)` / `Math.min(50, toPositiveInt(req.query.limit, 20))`, matching every existing list endpoint in this codebase (`listBookingsForLab`, `listReferralsForDoctor`, `listVerifications`).
- Every doctor-or-lab-scoped handler resolves `DoctorProfile`/`LabProfile` via `findOne({ userId: req.user!.id })` first — a User `_id` and a DoctorProfile/LabProfile `_id` are never interchangeable in this codebase (see `Appointment.doctorId`, `LabReferral.labId`, etc. — all profile-ids, while `patientId` fields are User-ids).
- Every new Express router must apply a rate limiter — this phase closes the "some routers have zero rate limiting" gap identified in Phase 5's research, so no new router this phase may ship unlimited (see Task 15).
- Any user-supplied string used inside a Mongo `$regex` filter MUST be passed through `escapeRegex` (Task 8) first. An unescaped regex from user input lets a query like `city=".*"` match every document regardless of intent, and pathological patterns risk ReDoS.
- Reuse `AppError(statusCode, message, code)` (`apps/api/src/lib/errors.ts`) for all thrown errors; the global `errorHandler` already maps it, `ZodError`s (via `validate()`), Mongoose `CastError`s, and `MulterError`s to sensible HTTP statuses — do not add new error-handling branches.
- Every new authenticated route must run through `requireAuth` and, where role-specific, `requireRole('<role>')` from `apps/api/src/middleware/auth.ts`.
- Frontend pages follow the existing minimalist convention seen in every current page under `apps/web/src/app/dashboard/*`: a `'use client'` component, an `isLoading` → `"Loading…"` branch, an empty-list → a one-line "No X yet." message, Tailwind utility classes only (no component library).

---

### Task 1: `Rating` model + shared Zod schema

**Files:**
- Create: `apps/api/src/models/Rating.ts`
- Modify: `packages/shared/src/schemas/rating.ts` (new file)
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/models/models.test.ts` (extend the existing file — it already has a "models" describe block covering every other model's required-field validation; add `Rating` to it, do not create a new test file)

**Interfaces:**
- Produces: `IRating { _id, doctorId: Types.ObjectId, patientId: Types.ObjectId, appointmentId: Types.ObjectId, score: number, text?: string, createdAt: Date }`, exported `Rating` Mongoose model. `CreateRatingInput` Zod schema, exported type `CreateRatingInput`.

- [ ] **Step 1: Write the model**

```ts
// apps/api/src/models/Rating.ts
import { Schema, model, Types } from 'mongoose';

export interface IRating {
  _id: Types.ObjectId;
  doctorId: Types.ObjectId;
  patientId: Types.ObjectId;
  appointmentId: Types.ObjectId;
  score: number;
  text?: string;
  createdAt: Date;
}

const ratingSchema = new Schema<IRating>({
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // Unique, not just indexed: one appointment can only ever be rated once. This is the
  // race-safety guard -- createRating (Task 2) relies on catching the resulting E11000
  // duplicate-key error rather than a check-then-create race.
  appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true },
  score: { type: Number, required: true, min: 1, max: 5 },
  text: { type: String, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
});

export const Rating = model<IRating>('Rating', ratingSchema);
```

- [ ] **Step 2: Write the shared Zod schema**

```ts
// packages/shared/src/schemas/rating.ts
import { z } from 'zod';

export const CreateRatingInput = z.object({
  appointmentId: z.string().min(1),
  score: z.number().int().min(1).max(5),
  text: z.string().max(1000).optional(),
});
export type CreateRatingInput = z.infer<typeof CreateRatingInput>;
```

- [ ] **Step 3: Export it from the shared package**

```ts
// packages/shared/src/index.ts -- add this line among the existing `export * from './schemas/...'` lines
export * from './schemas/rating';
```

- [ ] **Step 4: Rebuild the shared package and extend the model test**

Run: `npm run build --workspace=packages/shared` (so `apps/api`'s TS project sees the new export immediately, matching how every prior phase's new shared schema was picked up).

Add a case to the existing model-validation describe block in `apps/api/src/models/models.test.ts` (read the file first to match its exact existing style for one other model, e.g. how it tests `LabReferral`'s required fields) asserting: (a) `Rating.create({...valid fields...})` succeeds, (b) creating a second `Rating` with the same `appointmentId` throws (duplicate key), (c) omitting `score` throws a Mongoose validation error.

- [ ] **Step 5: Run tests, then commit**

Run: `npm run test --workspace=apps/api -- models.test.ts`
Expected: all pass, including the 2 new/extended cases.

```bash
git add apps/api/src/models/Rating.ts packages/shared/src/schemas/rating.ts packages/shared/src/index.ts apps/api/src/models/models.test.ts
git commit -m "feat(api,shared): add Rating model and CreateRatingInput schema"
```

---

### Task 2: Ratings service — `createRating` + `listRatingsForDoctor`

**Files:**
- Create: `apps/api/src/modules/ratings/ratings.service.ts`
- Test: `apps/api/src/modules/ratings/ratings.test.ts`

**Interfaces:**
- Consumes: `Rating` model, `IRating` (Task 1); `Appointment`/`IAppointment` (`apps/api/src/models/Appointment.ts`); `DoctorProfile` (`apps/api/src/models/DoctorProfile.ts`); `AppError` (`apps/api/src/lib/errors.ts`); `toPositiveInt`-style pagination convention.
- Produces: `createRating(patientId: string, appointmentId: string, score: number, text?: string): Promise<IRating>`; `listRatingsForDoctor(doctorId: string, page: number, limit: number): Promise<{ items: Pick<IRating, 'score'|'text'|'createdAt'>[]; total: number; page: number; limit: number }>` (deliberately excludes `patientId` from the returned shape — a public rating list should not disclose which patient left which review).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/modules/ratings/ratings.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createRating, listRatingsForDoctor } from './ratings.service';
import { User } from '../../models/User';
import { DoctorProfile } from '../../models/DoctorProfile';
import { Appointment } from '../../models/Appointment';
import { Rating } from '../../models/Rating';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Rating.init();
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

async function seedCompletedAppointment() {
  const doctorUser = await User.create({ role: 'doctor', email: `doc-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr. Test' });
  const doctorProfile = await DoctorProfile.create({
    userId: doctorUser._id, specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00001',
    experienceYears: 5, bio: 'bio', clinicName: 'Clinic', clinicAddress: 'Addr', city: 'Noida',
    geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'], verificationStatus: 'approved',
  });
  const patientUser = await User.create({ role: 'patient', email: `pat-${Date.now()}@medlink.demo`, phone: '8888888888', passwordHash: 'x', name: 'Pat Test' });
  const appointment = await Appointment.create({
    patientId: patientUser._id, doctorId: doctorProfile._id,
    slotStart: new Date(Date.now() - 86400000), slotEnd: new Date(Date.now() - 86400000 + 900000),
    status: 'completed',
  });
  return { doctorProfile, patientUser, appointment };
}

describe('createRating', () => {
  it('creates a rating for a completed appointment and recomputes the doctor avgRating/ratingCount', async () => {
    const { doctorProfile, patientUser, appointment } = await seedCompletedAppointment();

    await createRating(patientUser._id.toString(), appointment._id.toString(), 4, 'Great doctor');
    await createRating((await User.create({ role: 'patient', email: `pat2-${Date.now()}@medlink.demo`, phone: '7777777777', passwordHash: 'x', name: 'Pat Two' }))._id.toString(),
      (await Appointment.create({ patientId: new mongoose.Types.ObjectId(), doctorId: doctorProfile._id, slotStart: new Date(), slotEnd: new Date(), status: 'completed' }))._id.toString(),
      2);

    const reloaded = await DoctorProfile.findById(doctorProfile._id);
    expect(reloaded!.ratingCount).toBe(2);
    expect(reloaded!.avgRating).toBe(3); // (4 + 2) / 2
  });

  it('rejects rating an appointment that is not completed', async () => {
    const { patientUser, appointment } = await seedCompletedAppointment();
    await Appointment.findByIdAndUpdate(appointment._id, { status: 'confirmed' });

    await expect(createRating(patientUser._id.toString(), appointment._id.toString(), 5)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects rating an appointment that belongs to a different patient', async () => {
    const { appointment } = await seedCompletedAppointment();
    const otherPatient = await User.create({ role: 'patient', email: `other-${Date.now()}@medlink.demo`, phone: '6666666666', passwordHash: 'x', name: 'Other' });

    await expect(createRating(otherPatient._id.toString(), appointment._id.toString(), 5)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects rating the same appointment twice', async () => {
    const { patientUser, appointment } = await seedCompletedAppointment();
    await createRating(patientUser._id.toString(), appointment._id.toString(), 5);

    await expect(createRating(patientUser._id.toString(), appointment._id.toString(), 1)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('listRatingsForDoctor', () => {
  it('lists ratings for a doctor without exposing patientId', async () => {
    const { doctorProfile, patientUser, appointment } = await seedCompletedAppointment();
    await createRating(patientUser._id.toString(), appointment._id.toString(), 5, 'Excellent');

    const result = await listRatingsForDoctor(doctorProfile._id.toString(), 1, 20);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ score: 5, text: 'Excellent' });
    expect((result.items[0] as unknown as Record<string, unknown>).patientId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/api -- ratings.test.ts`
Expected: FAIL — `./ratings.service` does not exist yet.

- [ ] **Step 3: Write the service**

```ts
// apps/api/src/modules/ratings/ratings.service.ts
import { Appointment } from '../../models/Appointment';
import { DoctorProfile } from '../../models/DoctorProfile';
import { Rating, IRating } from '../../models/Rating';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';

export async function createRating(
  patientId: string,
  appointmentId: string,
  score: number,
  text?: string
): Promise<IRating> {
  const appointment = await Appointment.findOne({ _id: appointmentId, patientId, status: 'completed' });
  if (!appointment) throw new AppError(404, 'Completed appointment not found', 'APPOINTMENT_NOT_FOUND');

  let rating: IRating;
  try {
    rating = await Rating.create({ doctorId: appointment.doctorId, patientId, appointmentId, score, text });
  } catch (err) {
    // E11000 duplicate key on the unique appointmentId index -- catching this (rather
    // than a check-then-create findOne) is what makes double-rating race-safe: two
    // concurrent requests for the same appointment can both pass the findOne above,
    // but only one Rating.create ever succeeds.
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: number }).code === 11000) {
      throw new AppError(409, 'This appointment has already been rated', 'ALREADY_RATED');
    }
    throw err;
  }

  // Recompute avgRating/ratingCount as a fresh aggregate over every Rating for this
  // doctor, rather than an incremental running average -- an incremental update is not
  // idempotent under retries and drifts under any missed write, whereas a full aggregate
  // always reflects exactly what's stored in the Rating collection.
  const [agg] = await Rating.aggregate<{ _id: unknown; avg: number; count: number }>([
    { $match: { doctorId: appointment.doctorId } },
    { $group: { _id: '$doctorId', avg: { $avg: '$score' }, count: { $sum: 1 } } },
  ]);
  await DoctorProfile.findByIdAndUpdate(appointment.doctorId, {
    avgRating: agg ? Math.round(agg.avg * 10) / 10 : 0,
    ratingCount: agg ? agg.count : 0,
  });

  await logAudit({
    actorId: patientId,
    actorRole: 'patient',
    action: 'rating.created',
    entityType: 'Rating',
    entityId: rating._id.toString(),
    meta: { doctorId: appointment.doctorId.toString(), score },
  });

  return rating;
}

export async function listRatingsForDoctor(
  doctorId: string,
  page: number,
  limit: number
): Promise<{ items: { score: number; text?: string; createdAt: Date }[]; total: number; page: number; limit: number }> {
  const cappedLimit = Math.min(50, limit);
  const [items, total] = await Promise.all([
    Rating.find({ doctorId }, 'score text createdAt -_id')
      .sort({ createdAt: -1 })
      .skip((page - 1) * cappedLimit)
      .limit(cappedLimit),
    Rating.countDocuments({ doctorId }),
  ]);
  return { items, total, page, limit: cappedLimit };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/api -- ratings.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ratings/ratings.service.ts apps/api/src/modules/ratings/ratings.test.ts
git commit -m "feat(api): add ratings service with race-safe double-rate guard and avgRating recompute"
```

---

### Task 3: Ratings controller + routes + mount

**Files:**
- Create: `apps/api/src/modules/ratings/ratings.controller.ts`
- Create: `apps/api/src/modules/ratings/ratings.routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/modules/ratings/ratings.test.ts` (extend with HTTP-level tests)

**Interfaces:**
- Consumes: `createRating`, `listRatingsForDoctor` (Task 2); `CreateRatingInput` (Task 1); `validate`, `requireAuth`, `requireRole`, `toPositiveInt`.
- Produces: exported `ratingsRouter` (Express `Router`), mounted at `/api/ratings`. Routes: `POST /api/ratings` (patient, body validated against `CreateRatingInput`) → `201 { rating }`; `GET /api/ratings/doctor/:doctorId` (public, paginated) → `200 { items, total, page, limit }`.

- [ ] **Step 1: Write the controller**

```ts
// apps/api/src/modules/ratings/ratings.controller.ts
import { Request, Response, NextFunction } from 'express';
import { createRating, listRatingsForDoctor } from './ratings.service';
import { toPositiveInt } from '../../lib/pagination';

export async function createRatingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appointmentId, score, text } = req.body as { appointmentId: string; score: number; text?: string };
    const rating = await createRating(req.user!.id, appointmentId, score, text);
    res.status(201).json({ rating });
  } catch (err) {
    next(err);
  }
}

export async function listRatingsForDoctorHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(50, toPositiveInt(req.query.limit, 20));
    const result = await listRatingsForDoctor(req.params.doctorId!, page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 2: Write the routes**

```ts
// apps/api/src/modules/ratings/ratings.routes.ts
import { Router } from 'express';
import { CreateRatingInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createRatingHandler, listRatingsForDoctorHandler } from './ratings.controller';

export const ratingsRouter = Router();

ratingsRouter.get('/doctor/:doctorId', listRatingsForDoctorHandler);
ratingsRouter.post('/', requireAuth, requireRole('patient'), validate(CreateRatingInput), createRatingHandler);
```

- [ ] **Step 3: Mount it**

```ts
// apps/api/src/app.ts -- add the import near the other module imports
import { ratingsRouter } from './modules/ratings/ratings.routes';
// ...and add the mount line near the other app.use('/api/...') lines
app.use('/api/ratings', ratingsRouter);
```

- [ ] **Step 4: Write the failing HTTP-level tests**

Append to `apps/api/src/modules/ratings/ratings.test.ts` (reuse this file's existing imports/setup; add `import request from 'supertest'; import { createApp } from '../../app';` and a helper mirroring `seedLabAndPrescriptionHttp`-style patterns from `labBookings.test.ts` — register a doctor+patient over HTTP, create a completed appointment directly via `Appointment.create` since there is no HTTP path to mark one 'completed' outside the prescription flow):

```ts
describe('POST /api/ratings and GET /api/ratings/doctor/:doctorId', () => {
  it('lets a patient rate their own completed appointment, then the rating is publicly listable', async () => {
    const app = createApp();
    const { doctorProfile, patientUser, appointment } = await seedCompletedAppointment();
    const patientCookies = await loginAs(app, patientUser.email);

    const res = await request(app).post('/api/ratings').set('Cookie', patientCookies).send({
      appointmentId: appointment._id.toString(), score: 5, text: 'Very patient, explained everything clearly',
    });
    expect(res.status).toBe(201);

    const listRes = await request(app).get(`/api/ratings/doctor/${doctorProfile._id.toString()}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(1);
  });

  it('rejects a doctor trying to submit a rating', async () => {
    const app = createApp();
    const { appointment } = await seedCompletedAppointment();
    const doctorUser = await User.findOne({ role: 'doctor' });
    const doctorCookies = await loginAs(app, doctorUser!.email);

    const res = await request(app).post('/api/ratings').set('Cookie', doctorCookies).send({
      appointmentId: appointment._id.toString(), score: 5,
    });
    expect(res.status).toBe(403);
  });
});
```

Since `passwordHash: 'x'` in `seedCompletedAppointment` is not a real bcrypt hash, a real login won't work against it — read `apps/api/src/modules/labBookings/labBookings.test.ts`'s existing `registerAndLogin` helper (used throughout that file) and reuse the SAME helper/pattern here instead of `loginAs` (register a fresh user over `/api/auth/register` with a real password, then log in) rather than trying to log in against the directly-created `seedCompletedAppointment` users. Concretely: register the doctor and patient via `POST /api/auth/register` (capturing their real `User._id`), then build the `DoctorProfile`/`Appointment` documents against those real ids — mirror exactly how `labBookings.test.ts`'s `seedLabAndPrescriptionHttp` combines `registerAndLogin` with direct model creation for the entities that have no HTTP-creation path (a 'completed' `Appointment` has no HTTP path either, same as that file's referral/booking setup).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=apps/api -- ratings.test.ts`
Expected: PASS (7 tests total)

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm run test --workspace=apps/api && npm run typecheck --workspace=apps/api`
Expected: all green, no new failures.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/ratings/ratings.controller.ts apps/api/src/modules/ratings/ratings.routes.ts apps/api/src/app.ts apps/api/src/modules/ratings/ratings.test.ts
git commit -m "feat(api): mount ratings routes at /api/ratings"
```

---

### Task 4: Web — ratings API slice + rate-appointment page + patient dashboard link

**Files:**
- Create: `apps/web/src/store/ratingsApi.ts`
- Create: `apps/web/src/app/appointments/[id]/rate/page.tsx`
- Modify: `apps/web/src/app/dashboard/patient/page.tsx`
- Modify: `apps/web/src/store/appointmentsApi.ts` (the `Appointment` interface needs a way for the dashboard to know whether an appointment has already been rated — see Step 3)

**Interfaces:**
- Consumes: `POST /api/ratings`, `GET /api/ratings/doctor/:doctorId` (Task 3); `baseApi` (`apps/web/src/store/api.ts`); the existing `Appointment` type/`useListMyAppointmentsQuery` (`apps/web/src/store/appointmentsApi.ts`).
- Produces: `useCreateRatingMutation`, `useListDoctorRatingsQuery` hooks.

- [ ] **Step 1: Write the RTK Query slice**

```ts
// apps/web/src/store/ratingsApi.ts
import { baseApi } from './api';

export interface Rating {
  score: number;
  text?: string;
  createdAt: string;
}

export const ratingsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createRating: builder.mutation<{ rating: unknown }, { appointmentId: string; score: number; text?: string }>({
      query: (body) => ({ url: '/ratings', method: 'POST', body }),
      invalidatesTags: ['MyAppointments'],
    }),
    listDoctorRatings: builder.query<{ items: Rating[]; total: number }, string>({
      query: (doctorId) => `/ratings/doctor/${doctorId}`,
    }),
  }),
});

export const { useCreateRatingMutation, useListDoctorRatingsQuery } = ratingsApi;
```

- [ ] **Step 2: Write the rate-appointment page**

```tsx
// apps/web/src/app/appointments/[id]/rate/page.tsx
'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateRatingMutation } from '@/store/ratingsApi';

export default function RateAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [score, setScore] = useState(5);
  const [text, setText] = useState('');
  const [createRating, { isLoading, error }] = useCreateRatingMutation();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createRating({ appointmentId: id, score, text: text || undefined }).unwrap();
    router.push('/dashboard/patient');
  }

  return (
    <main className="max-w-md mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Rate your appointment</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          Score (1-5)
          <select className="border rounded w-full p-2 mt-1" value={score} onChange={(e) => setScore(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="block">
          Comment (optional)
          <textarea className="border rounded w-full p-2 mt-1" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
        </label>
        {error ? <p className="text-sm text-red-600">Could not submit rating — it may already be rated.</p> : null}
        <button type="submit" disabled={isLoading} className="border px-3 py-1 rounded">
          {isLoading ? 'Submitting…' : 'Submit rating'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Add a `rated` flag to appointments so the dashboard knows what's already rated**

The backend has no cheap way to tell the frontend "this appointment already has a Rating" without a new field or a join. Rather than adding a new backend endpoint just for this, extend `Appointment`'s existing list response minimally: read `apps/api/src/modules/appointments/appointments.controller.ts`'s `listMyAppointments` and `apps/api/src/modules/appointments/appointments.service.ts` to find where the appointment list is assembled for a patient, and add a `rated: boolean` computed field — for each `'completed'` appointment in the result set, check `Rating.exists({ appointmentId: appointment._id })` (batch this: `Rating.find({ appointmentId: { $in: completedIds } }, 'appointmentId')` once, then map into a `Set`, rather than one query per appointment). Only compute this for `role === 'patient'` callers (doctors listing their own appointments don't need it). Add the corresponding `rated?: boolean` field to the `Appointment` interface in `apps/web/src/store/appointmentsApi.ts`.

Add a regression test to `apps/api/src/modules/appointments/appointments.test.ts` asserting a patient's completed-and-rated appointment comes back with `rated: true` and an unrated one with `rated: false`.

- [ ] **Step 4: Wire the "Rate" button into the patient dashboard**

```tsx
// apps/web/src/app/dashboard/patient/page.tsx -- inside the existing appt.map(...) block,
// alongside the existing conditional Cancel button, add:
{appt.status === 'completed' && !appt.rated ? (
  <a href={`/appointments/${appt._id}/rate`} className="text-sm underline">
    Rate this appointment
  </a>
) : null}
```

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck --workspace=apps/api && npm run test --workspace=apps/api -- appointments.test.ts && npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/store/ratingsApi.ts apps/web/src/app/appointments/[id]/rate/page.tsx apps/web/src/app/dashboard/patient/page.tsx apps/web/src/store/appointmentsApi.ts apps/api/src/modules/appointments/appointments.controller.ts apps/api/src/modules/appointments/appointments.service.ts apps/api/src/modules/appointments/appointments.test.ts
git commit -m "feat(web,api): patient rating flow with a rated-appointment indicator"
```

---

### Task 5: Notifications service — list + mark-read

**Files:**
- Create: `apps/api/src/modules/notifications/notifications.service.ts`
- Test: `apps/api/src/modules/notifications/notifications.test.ts`

**Interfaces:**
- Consumes: `Notification`/`INotification` (`apps/api/src/models/Notification.ts`); `AppError`.
- Produces: `listNotificationsForUser(userId: string, page: number, limit: number): Promise<{ items: INotification[]; total: number; page: number; limit: number; unreadCount: number }>`; `markNotificationRead(userId: string, notificationId: string): Promise<INotification>`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/modules/notifications/notifications.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { listNotificationsForUser, markNotificationRead } from './notifications.service';
import { Notification } from '../../models/Notification';
import { User } from '../../models/User';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('listNotificationsForUser', () => {
  it('returns only the requesting user\'s own notifications with an unread count', async () => {
    const user = await User.create({ role: 'patient', email: `u-${Date.now()}@medlink.demo`, phone: '1', passwordHash: 'x', name: 'U' });
    const other = await User.create({ role: 'patient', email: `o-${Date.now()}@medlink.demo`, phone: '2', passwordHash: 'x', name: 'O' });
    await Notification.create({ userId: user._id, type: 't', title: 'A', body: 'a' });
    await Notification.create({ userId: user._id, type: 't', title: 'B', body: 'b', readAt: new Date() });
    await Notification.create({ userId: other._id, type: 't', title: 'C', body: 'c' });

    const result = await listNotificationsForUser(user._id.toString(), 1, 20);
    expect(result.total).toBe(2);
    expect(result.unreadCount).toBe(1);
  });
});

describe('markNotificationRead', () => {
  it('marks the owning user\'s notification as read', async () => {
    const user = await User.create({ role: 'patient', email: `u2-${Date.now()}@medlink.demo`, phone: '3', passwordHash: 'x', name: 'U2' });
    const notification = await Notification.create({ userId: user._id, type: 't', title: 'A', body: 'a' });

    const updated = await markNotificationRead(user._id.toString(), notification._id.toString());
    expect(updated.readAt).toBeDefined();
  });

  it('rejects marking a different user\'s notification as read', async () => {
    const owner = await User.create({ role: 'patient', email: `own-${Date.now()}@medlink.demo`, phone: '4', passwordHash: 'x', name: 'Own' });
    const other = await User.create({ role: 'patient', email: `oth-${Date.now()}@medlink.demo`, phone: '5', passwordHash: 'x', name: 'Oth' });
    const notification = await Notification.create({ userId: owner._id, type: 't', title: 'A', body: 'a' });

    await expect(markNotificationRead(other._id.toString(), notification._id.toString())).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/api -- notifications.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write the service**

```ts
// apps/api/src/modules/notifications/notifications.service.ts
import { Notification, INotification } from '../../models/Notification';
import { AppError } from '../../lib/errors';

export async function listNotificationsForUser(
  userId: string,
  page: number,
  limit: number
): Promise<{ items: INotification[]; total: number; page: number; limit: number; unreadCount: number }> {
  const cappedLimit = Math.min(50, limit);
  const [items, total, unreadCount] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).skip((page - 1) * cappedLimit).limit(cappedLimit),
    Notification.countDocuments({ userId }),
    Notification.countDocuments({ userId, readAt: { $exists: false } }),
  ]);
  return { items, total, page, limit: cappedLimit, unreadCount };
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<INotification> {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { readAt: new Date() },
    { new: true }
  );
  if (!notification) throw new AppError(404, 'Notification not found', 'NOTIFICATION_NOT_FOUND');
  return notification;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/api -- notifications.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/notifications/notifications.service.ts apps/api/src/modules/notifications/notifications.test.ts
git commit -m "feat(api): add notifications list/mark-read service"
```

---

### Task 6: Notifications controller + routes + mount

**Files:**
- Create: `apps/api/src/modules/notifications/notifications.controller.ts`
- Create: `apps/api/src/modules/notifications/notifications.routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/modules/notifications/notifications.test.ts` (extend)

**Interfaces:**
- Consumes: `listNotificationsForUser`, `markNotificationRead` (Task 5); `requireAuth`; `toPositiveInt`.
- Produces: exported `notificationsRouter`, mounted at `/api/notifications`. Routes (any authenticated role): `GET /api/notifications/me` → `200 { items, total, page, limit, unreadCount }`; `PATCH /api/notifications/:id/read` → `200 { notification }`.

- [ ] **Step 1: Write the controller**

```ts
// apps/api/src/modules/notifications/notifications.controller.ts
import { Request, Response, NextFunction } from 'express';
import { listNotificationsForUser, markNotificationRead } from './notifications.service';
import { toPositiveInt } from '../../lib/pagination';

export async function listMyNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(50, toPositiveInt(req.query.limit, 20));
    const result = await listNotificationsForUser(req.user!.id, page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function markReadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const notification = await markNotificationRead(req.user!.id, req.params.id!);
    res.status(200).json({ notification });
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 2: Write the routes**

```ts
// apps/api/src/modules/notifications/notifications.routes.ts
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { listMyNotifications, markReadHandler } from './notifications.controller';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get('/me', listMyNotifications);
notificationsRouter.patch('/:id/read', markReadHandler);
```

- [ ] **Step 3: Mount it**

```ts
// apps/api/src/app.ts
import { notificationsRouter } from './modules/notifications/notifications.routes';
// ...
app.use('/api/notifications', notificationsRouter);
```

- [ ] **Step 4: Write the failing HTTP-level tests**

Append to `apps/api/src/modules/notifications/notifications.test.ts` (add `import request from 'supertest'; import { createApp } from '../../app'; import { resetTestRedis } from '../../test-utils/resetRateLimit';` and a `registerAndLogin`-style helper — copy the exact one from `apps/api/src/modules/labBookings/labBookings.test.ts` since it is already proven correct):

```ts
describe('GET /api/notifications/me and PATCH /api/notifications/:id/read', () => {
  it('lets a user list and mark-read only their own notifications', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', `notif-http-${Date.now()}@medlink.demo`);
    const user = await User.findOne({ email: /notif-http-/ }).sort({ _id: -1 });
    await Notification.create({ userId: user!._id, type: 't', title: 'Hi', body: 'body' });

    const listRes = await request(app).get('/api/notifications/me').set('Cookie', cookies);
    expect(listRes.status).toBe(200);
    expect(listRes.body.unreadCount).toBe(1);

    const notificationId = listRes.body.items[0]._id;
    const readRes = await request(app).patch(`/api/notifications/${notificationId}/read`).set('Cookie', cookies);
    expect(readRes.status).toBe(200);
    expect(readRes.body.notification.readAt).toBeDefined();
  });
});
```

- [ ] **Step 5: Run tests, then the full suite**

Run: `npm run test --workspace=apps/api -- notifications.test.ts && npm run test --workspace=apps/api && npm run typecheck --workspace=apps/api`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/notifications/notifications.controller.ts apps/api/src/modules/notifications/notifications.routes.ts apps/api/src/app.ts apps/api/src/modules/notifications/notifications.test.ts
git commit -m "feat(api): mount notifications routes at /api/notifications"
```

---

### Task 7: Web — notifications API slice + `/notifications` page + dashboard links

**Files:**
- Create: `apps/web/src/store/notificationsApi.ts`
- Create: `apps/web/src/app/notifications/page.tsx`
- Modify: `apps/web/src/app/dashboard/patient/page.tsx`
- Modify: `apps/web/src/app/dashboard/doctor/page.tsx`
- Modify: `apps/web/src/app/dashboard/lab/page.tsx`

**Interfaces:**
- Consumes: `GET /api/notifications/me`, `PATCH /api/notifications/:id/read` (Task 6).
- Produces: `useListMyNotificationsQuery`, `useMarkNotificationReadMutation` hooks.

- [ ] **Step 1: Write the RTK Query slice**

```ts
// apps/web/src/store/notificationsApi.ts
import { baseApi } from './api';

export interface AppNotification {
  _id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  readAt?: string;
  createdAt: string;
}

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listMyNotifications: builder.query<{ items: AppNotification[]; total: number; unreadCount: number }, void>({
      query: () => '/notifications/me',
    }),
    markNotificationRead: builder.mutation<{ notification: AppNotification }, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'PATCH' }),
    }),
  }),
});

export const { useListMyNotificationsQuery, useMarkNotificationReadMutation } = notificationsApi;
```

- [ ] **Step 2: Write the notifications page**

```tsx
// apps/web/src/app/notifications/page.tsx
'use client';

import { useListMyNotificationsQuery, useMarkNotificationReadMutation } from '@/store/notificationsApi';

export default function NotificationsPage() {
  const { data, isLoading, refetch } = useListMyNotificationsQuery();
  const [markRead] = useMarkNotificationReadMutation();

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading…</main>;

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-2">
      <h1 className="text-2xl font-bold">Notifications</h1>
      {data?.items.map((n) => (
        <div key={n._id} className={`border p-3 rounded ${n.readAt ? '' : 'bg-blue-50'}`}>
          <p className="font-semibold">{n.title}</p>
          <p className="text-sm text-gray-600">{n.body}</p>
          <div className="flex gap-3 mt-1">
            {n.link ? <a href={n.link} className="text-sm underline">Open</a> : null}
            {!n.readAt ? (
              <button
                className="text-sm underline"
                onClick={async () => {
                  await markRead(n._id).unwrap();
                  refetch();
                }}
              >
                Mark read
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {data?.items.length === 0 ? <p className="text-sm text-gray-600">No notifications yet.</p> : null}
    </main>
  );
}
```

- [ ] **Step 3: Add a notifications link with an unread badge to each dashboard**

In each of `apps/web/src/app/dashboard/patient/page.tsx`, `apps/web/src/app/dashboard/doctor/page.tsx`, and `apps/web/src/app/dashboard/lab/page.tsx`, add near the page's `<h1>`:

```tsx
import { useListMyNotificationsQuery } from '@/store/notificationsApi';
import Link from 'next/link';
// ...inside the component, alongside the existing data-fetching hooks:
const { data: notifData } = useListMyNotificationsQuery();
// ...in the JSX, near the <h1>:
<Link href="/notifications" className="text-sm underline">
  Notifications{notifData && notifData.unreadCount > 0 ? ` (${notifData.unreadCount} unread)` : ''}
</Link>
```

(The doctor dashboard already imports `Link` for its Task-I6 referrals link — reuse that import rather than adding a duplicate.)

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: clean; confirm `/notifications` appears in the build's route list.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/store/notificationsApi.ts apps/web/src/app/notifications/page.tsx apps/web/src/app/dashboard/patient/page.tsx apps/web/src/app/dashboard/doctor/page.tsx apps/web/src/app/dashboard/lab/page.tsx
git commit -m "feat(web): notification center page and dashboard unread-count links"
```

---

### Task 8: `escapeRegex` helper + doctor search (`listDoctors`)

**Files:**
- Create: `apps/api/src/lib/regex.ts`
- Modify: `apps/api/src/modules/doctors/doctors.controller.ts` (add `listDoctorsHandler`)
- Modify: `apps/api/src/modules/doctors/doctors.routes.ts`
- Test: `apps/api/src/lib/regex.test.ts` (new)
- Test: `apps/api/src/modules/doctors/doctors.test.ts` (extend)

**Interfaces:**
- Produces: `escapeRegex(input: string): string`; `GET /api/doctors?name=&specialty=&city=&page=&limit=` (public) → `200 { items, total, page, limit }`, items are approved `DoctorProfile` documents populated with `userId` → `{ name, avatarUrl }` (same populate shape `getPublicProfile` already uses).

- [ ] **Step 1: Write the failing regex-escape test**

```ts
// apps/api/src/lib/regex.test.ts
import { describe, it, expect } from 'vitest';
import { escapeRegex } from './regex';

describe('escapeRegex', () => {
  it('escapes regex metacharacters so they are matched literally', () => {
    expect(escapeRegex('a.b')).toBe('a\\.b');
    expect(escapeRegex('C++')).toBe('C\\+\\+');
    expect(escapeRegex('(test)')).toBe('\\(test\\)');
  });

  it('leaves plain alphanumeric input unchanged', () => {
    expect(escapeRegex('Dermatology')).toBe('Dermatology');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- regex.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write the helper**

```ts
// apps/api/src/lib/regex.ts
/**
 * Escape regex metacharacters in user-supplied search input before it is interpolated
 * into a Mongo `$regex` filter. Without this, a query like `?city=.*` matches every
 * document regardless of the caller's intent, and a crafted pattern can cause
 * catastrophic backtracking (ReDoS) against the query engine.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- regex.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing `listDoctors` HTTP tests**

Add to `apps/api/src/modules/doctors/doctors.test.ts` (read this file first for its existing setup/imports style and reuse them):

```ts
describe('GET /api/doctors', () => {
  it('filters approved doctors by specialty and city, and excludes pending/rejected ones', async () => {
    const app = createApp();
    await DoctorProfile.create({
      userId: (await User.create({ role: 'doctor', email: `d1-${Date.now()}@medlink.demo`, phone: '1', passwordHash: 'x', name: 'Dr. Approved' }))._id,
      specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00001', experienceYears: 5, bio: 'b',
      clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500,
      languages: ['English'], verificationStatus: 'approved',
    });
    await DoctorProfile.create({
      userId: (await User.create({ role: 'doctor', email: `d2-${Date.now()}@medlink.demo`, phone: '2', passwordHash: 'x', name: 'Dr. Pending' }))._id,
      specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00002', experienceYears: 5, bio: 'b',
      clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500,
      languages: ['English'], verificationStatus: 'pending',
    });

    const res = await request(app).get('/api/doctors').query({ specialty: 'Dermatology', city: 'Noida' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].userId.name).toBe('Dr. Approved');
  });

  it('treats regex metacharacters in the city filter literally, not as a wildcard', async () => {
    const app = createApp();
    await DoctorProfile.create({
      userId: (await User.create({ role: 'doctor', email: `d3-${Date.now()}@medlink.demo`, phone: '3', passwordHash: 'x', name: 'Dr. X' }))._id,
      specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: 'DMC/R/00003', experienceYears: 5, bio: 'b',
      clinicName: 'C', clinicAddress: 'A', city: 'Delhi', geo: { lat: 1, lng: 1 }, consultationFee: 500,
      languages: ['English'], verificationStatus: 'approved',
    });

    const res = await request(app).get('/api/doctors').query({ city: '.*' });
    expect(res.body.total).toBe(0);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test --workspace=apps/api -- doctors.test.ts`
Expected: FAIL — 404 (no such route yet).

- [ ] **Step 7: Implement `listDoctors` in the controller and wire the route**

```ts
// apps/api/src/modules/doctors/doctors.controller.ts -- add these imports at the top
import { User } from '../../models/User';
import { FilterQuery } from 'mongoose';
import { escapeRegex } from '../../lib/regex';
import { toPositiveInt } from '../../lib/pagination';
import { IDoctorProfile } from '../../models/DoctorProfile';

// ...and add this handler
export async function listDoctorsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(50, toPositiveInt(req.query.limit, 20));

    const filter: FilterQuery<IDoctorProfile> = { verificationStatus: 'approved' };
    if (typeof req.query.specialty === 'string' && req.query.specialty) {
      filter.specialties = { $regex: escapeRegex(req.query.specialty), $options: 'i' };
    }
    if (typeof req.query.city === 'string' && req.query.city) {
      filter.city = { $regex: `^${escapeRegex(req.query.city)}$`, $options: 'i' };
    }
    if (typeof req.query.name === 'string' && req.query.name) {
      const matchingUsers = await User.find({ role: 'doctor', name: { $regex: escapeRegex(req.query.name), $options: 'i' } }, '_id');
      filter.userId = { $in: matchingUsers.map((u) => u._id) };
    }

    const [items, total] = await Promise.all([
      DoctorProfile.find(filter)
        .sort({ avgRating: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'name avatarUrl'),
      DoctorProfile.countDocuments(filter),
    ]);

    res.status(200).json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/doctors/doctors.routes.ts -- add to the import from './doctors.controller' and register before the `.use(requireAuth, ...)` line
doctorsRouter.get('/', listDoctorsHandler);
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run test --workspace=apps/api -- doctors.test.ts`
Expected: PASS (all existing + 2 new)

- [ ] **Step 9: Run the full suite and typecheck**

Run: `npm run test --workspace=apps/api && npm run typecheck --workspace=apps/api`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/lib/regex.ts apps/api/src/lib/regex.test.ts apps/api/src/modules/doctors/doctors.controller.ts apps/api/src/modules/doctors/doctors.routes.ts apps/api/src/modules/doctors/doctors.test.ts
git commit -m "feat(api): add GET /api/doctors search with escaped regex filters"
```

---

### Task 9: Lab search (`listLabs`)

**Files:**
- Modify: `apps/api/src/modules/labs/labs.controller.ts` (add `listLabsHandler`)
- Modify: `apps/api/src/modules/labs/labs.routes.ts`
- Test: `apps/api/src/modules/labs/labs.test.ts` (extend)

**Interfaces:**
- Consumes: `escapeRegex` (Task 8), `toPositiveInt`.
- Produces: `GET /api/labs?testCode=&testName=&city=&page=&limit=` (public) → `200 { items, total, page, limit }`.

- [ ] **Step 1: Write the failing HTTP tests**

Add to `apps/api/src/modules/labs/labs.test.ts` (reuse its existing setup style):

```ts
describe('GET /api/labs', () => {
  it('filters approved labs by testCode and city', async () => {
    const app = createApp();
    await LabProfile.create({
      userId: (await User.create({ role: 'lab', email: `l1-${Date.now()}@medlink.demo`, phone: '1', passwordHash: 'x', name: 'Lab One' }))._id,
      labName: 'HealthFirst', address: 'A', city: 'Noida', geo: { lat: 1, lng: 1 }, timings: '07:00-21:00',
      homeCollection: true, verificationStatus: 'approved',
      tests: [{ code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6 }],
    });
    await LabProfile.create({
      userId: (await User.create({ role: 'lab', email: `l2-${Date.now()}@medlink.demo`, phone: '2', passwordHash: 'x', name: 'Lab Two' }))._id,
      labName: 'OtherLab', address: 'A', city: 'Delhi', geo: { lat: 1, lng: 1 }, timings: '07:00-21:00',
      homeCollection: false, verificationStatus: 'approved',
      tests: [{ code: 'TSH', name: 'Thyroid Profile', price: 300, turnaroundHours: 12 }],
    });

    const res = await request(app).get('/api/labs').query({ testCode: 'CBC' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].labName).toBe('HealthFirst');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- labs.test.ts`
Expected: FAIL — 404.

- [ ] **Step 3: Implement `listLabs`**

```ts
// apps/api/src/modules/labs/labs.controller.ts -- add these imports
import { FilterQuery } from 'mongoose';
import { escapeRegex } from '../../lib/regex';
import { toPositiveInt } from '../../lib/pagination';
import { ILabProfile } from '../../models/LabProfile';

// ...and add this handler
export async function listLabsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(50, toPositiveInt(req.query.limit, 20));

    const filter: FilterQuery<ILabProfile> = { verificationStatus: 'approved' };
    if (typeof req.query.city === 'string' && req.query.city) {
      filter.city = { $regex: `^${escapeRegex(req.query.city)}$`, $options: 'i' };
    }
    if (typeof req.query.testCode === 'string' && req.query.testCode) {
      filter['tests.code'] = req.query.testCode.toUpperCase();
    }
    if (typeof req.query.testName === 'string' && req.query.testName) {
      filter['tests.name'] = { $regex: escapeRegex(req.query.testName), $options: 'i' };
    }

    const [items, total] = await Promise.all([
      LabProfile.find(filter).sort({ _id: -1 }).skip((page - 1) * limit).limit(limit),
      LabProfile.countDocuments(filter),
    ]);

    res.status(200).json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/labs/labs.routes.ts
labsRouter.get('/', listLabsHandler);
```

- [ ] **Step 4: Run tests, then full suite**

Run: `npm run test --workspace=apps/api -- labs.test.ts && npm run test --workspace=apps/api && npm run typecheck --workspace=apps/api`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/labs/labs.controller.ts apps/api/src/modules/labs/labs.routes.ts apps/api/src/modules/labs/labs.test.ts
git commit -m "feat(api): add GET /api/labs search by test code/name/city"
```

---

### Task 10: Web — global search page

**Files:**
- Create: `apps/web/src/store/searchApi.ts`
- Create: `apps/web/src/app/search/page.tsx`
- Modify: `apps/web/src/app/page.tsx` (home page — add a link to `/search`, read this file first to see what it currently contains)

**Interfaces:**
- Consumes: `GET /api/doctors`, `GET /api/labs` (Tasks 8-9).
- Produces: `useSearchDoctorsQuery`, `useSearchLabsQuery` hooks; a single `/search` page with two filter forms (doctors, labs) and result lists linking to `/doctors/[id]` and `/labs/[id]` (both already exist).

- [ ] **Step 1: Write the RTK Query slice**

```ts
// apps/web/src/store/searchApi.ts
import { baseApi } from './api';

export interface DoctorSearchResult {
  _id: string;
  specialties: string[];
  city: string;
  consultationFee: number;
  avgRating: number;
  ratingCount: number;
  userId: { name: string; avatarUrl?: string };
}
export interface LabSearchResult {
  _id: string;
  labName: string;
  city: string;
  homeCollection: boolean;
  tests: { code: string; name: string; price: number }[];
}

export const searchApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    searchDoctors: builder.query<{ items: DoctorSearchResult[]; total: number }, { name?: string; specialty?: string; city?: string }>({
      query: (params) => ({ url: '/doctors', params }),
    }),
    searchLabs: builder.query<{ items: LabSearchResult[]; total: number }, { testCode?: string; testName?: string; city?: string }>({
      query: (params) => ({ url: '/labs', params }),
    }),
  }),
});

export const { useSearchDoctorsQuery, useSearchLabsQuery } = searchApi;
```

- [ ] **Step 2: Write the search page**

```tsx
// apps/web/src/app/search/page.tsx
'use client';

import { useState } from 'react';
import { useSearchDoctorsQuery, useSearchLabsQuery } from '@/store/searchApi';

export default function SearchPage() {
  const [doctorFilters, setDoctorFilters] = useState({ name: '', specialty: '', city: '' });
  const [labFilters, setLabFilters] = useState({ testName: '', city: '' });
  const { data: doctorResults } = useSearchDoctorsQuery(doctorFilters);
  const { data: labResults } = useSearchLabsQuery(labFilters);

  return (
    <main className="max-w-3xl mx-auto mt-12 space-y-8">
      <h1 className="text-2xl font-bold">Search</h1>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Doctors</h2>
        <div className="flex gap-2">
          <input className="border rounded p-2" placeholder="Name" value={doctorFilters.name} onChange={(e) => setDoctorFilters({ ...doctorFilters, name: e.target.value })} />
          <input className="border rounded p-2" placeholder="Specialty" value={doctorFilters.specialty} onChange={(e) => setDoctorFilters({ ...doctorFilters, specialty: e.target.value })} />
          <input className="border rounded p-2" placeholder="City" value={doctorFilters.city} onChange={(e) => setDoctorFilters({ ...doctorFilters, city: e.target.value })} />
        </div>
        {doctorResults?.items.map((d) => (
          <a key={d._id} href={`/doctors/${d._id}`} className="block border p-3 rounded">
            {d.userId.name} — {d.specialties.join(', ')} — {d.city} — ₹{d.consultationFee} — {d.avgRating.toFixed(1)}★ ({d.ratingCount})
          </a>
        ))}
        {doctorResults?.items.length === 0 ? <p className="text-sm text-gray-600">No doctors match.</p> : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Labs</h2>
        <div className="flex gap-2">
          <input className="border rounded p-2" placeholder="Test name" value={labFilters.testName} onChange={(e) => setLabFilters({ ...labFilters, testName: e.target.value })} />
          <input className="border rounded p-2" placeholder="City" value={labFilters.city} onChange={(e) => setLabFilters({ ...labFilters, city: e.target.value })} />
        </div>
        {labResults?.items.map((l) => (
          <a key={l._id} href={`/labs/${l._id}`} className="block border p-3 rounded">
            {l.labName} — {l.city}{l.homeCollection ? ' (home collection)' : ''}
          </a>
        ))}
        {labResults?.items.length === 0 ? <p className="text-sm text-gray-600">No labs match.</p> : null}
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Link to it from the home page**

Read `apps/web/src/app/page.tsx` and add a `<a href="/search">Search doctors & labs</a>` link alongside whatever navigation it already offers (e.g. next to existing login/register/triage links).

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: clean; `/search` appears in the route list.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/store/searchApi.ts apps/web/src/app/search/page.tsx apps/web/src/app/page.tsx
git commit -m "feat(web): global doctor/lab search page"
```

---

### Task 11: `listReferralsForLab` + lab-side referral notification (closes Phase 5's I5)

**Files:**
- Modify: `apps/api/src/modules/labReferrals/labReferrals.service.ts` (add `listReferralsForLab`; add a lab notification inside `createReferral`)
- Modify: `apps/api/src/modules/labReferrals/labReferrals.controller.ts`
- Modify: `apps/api/src/modules/labReferrals/labReferrals.routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/modules/labReferrals/labReferrals.test.ts` (extend)

**Interfaces:**
- Consumes: `LabProfile` (`apps/api/src/models/LabProfile.ts`), `createNotification` (`apps/api/src/lib/notifications.ts`).
- Produces: `listReferralsForLab(labUserId: string, page: number, limit: number): Promise<{ items, total, page, limit }>`; exported `labFacingReferralsRouter`, mounted at `/api/lab-referrals` alongside the existing `labReferralsRouter`; route `GET /api/lab-referrals/for-lab` (lab role) → `200 { items, total, page, limit }`; `createReferral` now also notifies the referred lab.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/modules/labReferrals/labReferrals.test.ts` (reuse its existing setup/helpers):

```ts
describe('listReferralsForLab', () => {
  it('returns only the requesting lab\'s own referrals, paginated', async () => {
    // Reuse this file's existing referral-creation helper/fixtures to create two
    // referrals against two DIFFERENT labs, then assert listReferralsForLab(labA)
    // returns only labA's referral.
  });
});

describe('createReferral notifications', () => {
  it('notifies both the patient and the referred lab', async () => {
    // After calling createReferral, assert a Notification exists for
    // prescription.patientId (type 'lab_referral_sent', already covered) AND a NEW
    // Notification exists for lab.userId (type 'lab_referral_received').
  });
});
```

Write these out fully once the surrounding file's existing helper functions (for creating a doctor+prescription+lab fixture) are visible — mirror the exact fixture-building pattern already used by this file's `createReferral` tests, since `listReferralsForDoctor`'s existing test (already in this file) does the same "two labs/two referrals" shape for the doctor side; adapt it for the lab side.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/api -- labReferrals.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add `listReferralsForLab` to the service**

```ts
// apps/api/src/modules/labReferrals/labReferrals.service.ts -- add this import
import { LabProfile } from '../../models/LabProfile'; // already imported above for createReferral -- do not duplicate the import line, just reuse it

// ...and add this function (mirrors listReferralsForDoctor immediately above it)
export async function listReferralsForLab(
  labUserId: string,
  page: number,
  limit: number
): Promise<{ items: ILabReferral[]; total: number; page: number; limit: number }> {
  const lab = await LabProfile.findOne({ userId: labUserId });
  if (!lab) throw new AppError(404, 'Lab profile not found', 'PROFILE_NOT_FOUND');

  const cappedLimit = Math.min(50, limit);
  const [items, total] = await Promise.all([
    LabReferral.find({ labId: lab._id })
      .sort({ _id: -1 })
      .skip((page - 1) * cappedLimit)
      .limit(cappedLimit),
    LabReferral.countDocuments({ labId: lab._id }),
  ]);
  return { items, total, page, limit: cappedLimit };
}
```

- [ ] **Step 4: Add the lab notification inside `createReferral`**

Immediately after the existing `await createNotification({... patient ...})` call in `createReferral`, add:

```ts
  await createNotification({
    userId: lab.userId.toString(),
    type: 'lab_referral_received',
    title: 'New lab referral',
    body: `A doctor referred a patient to you for: ${testCodes.join(', ')}.`,
  });
```

(`lab` is already in scope — it's the `LabProfile` document fetched earlier in this same function.)

- [ ] **Step 5: Add the controller handler**

```ts
// apps/api/src/modules/labReferrals/labReferrals.controller.ts -- add this import
import { listReferralsForLab } from './labReferrals.service';
import { toPositiveInt } from '../../lib/pagination';

// ...and add this handler
export async function listReferralsForLabHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(50, toPositiveInt(req.query.limit, 20));
    const result = await listReferralsForLab(req.user!.id, page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 6: Add the lab-facing router**

```ts
// apps/api/src/modules/labReferrals/labReferrals.routes.ts -- add to the existing controller import
import { createReferralHandler, getReferralByTokenHandler, listReferralsForDoctorHandler, listReferralsForLabHandler } from './labReferrals.controller';

// ...add this new router, alongside the existing labReferralsRouter/publicReferralRouter exports
// A separate router (not a route on labReferralsRouter above) because that router is
// gated router-wide to requireRole('doctor') via .use() -- a lab-only route cannot live
// on it without changing that gate. Mirrors how publicReferralRouter already coexists at
// the same /api/lab-referrals base path for the same structural reason.
export const labFacingReferralsRouter = Router();
labFacingReferralsRouter.get('/for-lab', requireAuth, requireRole('lab'), listReferralsForLabHandler);
```

- [ ] **Step 7: Mount it**

```ts
// apps/api/src/app.ts
import { labReferralsRouter, publicReferralRouter, labFacingReferralsRouter } from './modules/labReferrals/labReferrals.routes';
// ...
app.use('/api/lab-referrals', labReferralsRouter);
app.use('/api/lab-referrals', labFacingReferralsRouter);
app.use('/api/r', publicReferralRouter);
```

- [ ] **Step 8: Run tests, then full suite**

Run: `npm run test --workspace=apps/api -- labReferrals.test.ts && npm run test --workspace=apps/api && npm run typecheck --workspace=apps/api`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/labReferrals/labReferrals.service.ts apps/api/src/modules/labReferrals/labReferrals.controller.ts apps/api/src/modules/labReferrals/labReferrals.routes.ts apps/api/src/app.ts apps/api/src/modules/labReferrals/labReferrals.test.ts
git commit -m "feat(api): lab-facing referral listing + notify the lab on referral creation"
```

---

### Task 12: Web — lab dashboard referral visibility

**Files:**
- Modify: `apps/web/src/store/labReferralsApi.ts` (add `listReferralsForLab`)
- Modify: `apps/web/src/app/dashboard/lab/page.tsx`

**Interfaces:**
- Consumes: `GET /api/lab-referrals/for-lab` (Task 11).
- Produces: `useListReferralsForLabQuery` hook; a new "Incoming referrals" section on the lab dashboard, above the existing bookings list.

- [ ] **Step 1: Extend the RTK Query slice**

```ts
// apps/web/src/store/labReferralsApi.ts -- add this endpoint inside the existing injectEndpoints call
listReferralsForLab: builder.query<{ items: LabReferral[]; total: number }, { page?: number; limit?: number } | void>({
  query: (params) => ({ url: '/lab-referrals/for-lab', params: params ?? undefined }),
}),
// ...and export its hook alongside the existing ones
export const { useCreateReferralMutation, useGetReferralByTokenQuery, useListMyReferralsQuery, useListReferralsForLabQuery } = labReferralsApi;
```

- [ ] **Step 2: Add the section to the lab dashboard**

```tsx
// apps/web/src/app/dashboard/lab/page.tsx -- add this import
import { useListReferralsForLabQuery } from '@/store/labReferralsApi';

// ...inside the component, alongside the existing useListMyLabBookingsQuery call:
const { data: referralsData } = useListReferralsForLabQuery();

// ...in the JSX, before the existing bookings <ul>:
<section className="space-y-2">
  <h2 className="text-xl font-semibold">Incoming referrals</h2>
  {referralsData?.items.map((r) => (
    <div key={r._id} className="border p-3 rounded">
      <p>Tests: {r.suggestedTestCodes.join(', ')}</p>
      <p className="text-sm text-gray-600">Status: {r.status}</p>
    </div>
  ))}
  {referralsData?.items.length === 0 ? <p className="text-sm text-gray-600">No incoming referrals yet.</p> : null}
</section>
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/store/labReferralsApi.ts apps/web/src/app/dashboard/lab/page.tsx
git commit -m "feat(web): show incoming lab referrals on the lab dashboard"
```

---

### Task 13: Admin analytics service + route

**Files:**
- Create: `apps/api/src/modules/admin/analytics.service.ts`
- Modify: `apps/api/src/modules/admin/admin.controller.ts` (add `getAnalyticsHandler`)
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Test: `apps/api/src/modules/admin/admin.test.ts` (extend — read this file first for its existing setup)

**Interfaces:**
- Produces: `getAnalytics(): Promise<AnalyticsSummary>` where
  ```ts
  interface AnalyticsSummary {
    totalRegistrations: { patients: number; doctors: number; labs: number };
    appointmentsPerDay: { date: string; count: number }[]; // last 14 days, ascending
    topSpecialties: { specialty: string; count: number }[]; // top 5 by appointment count
    triageToBookingConversion: { totalSessions: number; sessionsWithBooking: number; conversionRate: number };
  }
  ```
  Route `GET /api/admin/analytics` (admin only, already covered by `adminRouter.use(requireAuth, requireRole('admin'))`) → `200 <AnalyticsSummary>`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/modules/admin/admin.test.ts`:

```ts
describe('GET /api/admin/analytics', () => {
  it('returns registration counts, per-day appointment counts, top specialties, and triage conversion', async () => {
    const app = createApp();
    const adminCookies = await registerAndLogin(app, 'admin', `admin-analytics-${Date.now()}@medlink.demo`);

    // Reuse this file's existing fixture-creation helpers (or create directly) for:
    // one patient, one approved doctor with specialty 'Cardiology', one completed
    // Appointment for that doctor dated today, and one TriageSession -- then assert the
    // response's totalRegistrations.patients/doctors are >= 1, appointmentsPerDay has an
    // entry for today with count >= 1, topSpecialties includes {specialty: 'Cardiology',
    // count: >=1}, and triageToBookingConversion.totalSessions >= 1.

    const res = await request(app).get('/api/admin/analytics').set('Cookie', adminCookies);
    expect(res.status).toBe(200);
    expect(res.body.totalRegistrations).toBeDefined();
    expect(Array.isArray(res.body.appointmentsPerDay)).toBe(true);
    expect(Array.isArray(res.body.topSpecialties)).toBe(true);
    expect(res.body.triageToBookingConversion).toBeDefined();
  });

  it('rejects a non-admin caller', async () => {
    const app = createApp();
    const patientCookies = await registerAndLogin(app, 'patient', `patient-analytics-${Date.now()}@medlink.demo`);
    const res = await request(app).get('/api/admin/analytics').set('Cookie', patientCookies);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- admin.test.ts`
Expected: FAIL — 404.

- [ ] **Step 3: Write the analytics service**

```ts
// apps/api/src/modules/admin/analytics.service.ts
import { User } from '../../models/User';
import { Appointment } from '../../models/Appointment';
import { DoctorProfile } from '../../models/DoctorProfile';
import { TriageSession } from '../../models/TriageSession';

export interface AnalyticsSummary {
  totalRegistrations: { patients: number; doctors: number; labs: number };
  appointmentsPerDay: { date: string; count: number }[];
  topSpecialties: { specialty: string; count: number }[];
  triageToBookingConversion: { totalSessions: number; sessionsWithBooking: number; conversionRate: number };
}

export async function getAnalytics(): Promise<AnalyticsSummary> {
  const [patients, doctors, labs] = await Promise.all([
    User.countDocuments({ role: 'patient' }),
    User.countDocuments({ role: 'doctor' }),
    User.countDocuments({ role: 'lab' }),
  ]);

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const appointmentsPerDayAgg = await Appointment.aggregate<{ _id: string; count: number }>([
    { $match: { slotStart: { $gte: fourteenDaysAgo } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$slotStart' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const appointmentsPerDay = appointmentsPerDayAgg.map((row) => ({ date: row._id, count: row.count }));

  // `DoctorProfile.collection.name` (rather than a hardcoded 'doctorprofiles') keeps this
  // aggregation correct even if the model's collection naming ever changes.
  const topSpecialtiesAgg = await Appointment.aggregate<{ _id: string; count: number }>([
    { $lookup: { from: DoctorProfile.collection.name, localField: 'doctorId', foreignField: '_id', as: 'doctor' } },
    { $unwind: '$doctor' },
    { $unwind: '$doctor.specialties' },
    { $group: { _id: '$doctor.specialties', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);
  const topSpecialties = topSpecialtiesAgg.map((row) => ({ specialty: row._id, count: row.count }));

  const totalSessions = await TriageSession.countDocuments();
  const sessionsWithBooking = await Appointment.countDocuments({ triageSessionId: { $exists: true } });
  const conversionRate = totalSessions > 0 ? Math.round((sessionsWithBooking / totalSessions) * 1000) / 10 : 0;

  return {
    totalRegistrations: { patients, doctors, labs },
    appointmentsPerDay,
    topSpecialties,
    triageToBookingConversion: { totalSessions, sessionsWithBooking, conversionRate },
  };
}
```

- [ ] **Step 4: Wire the controller and route**

```ts
// apps/api/src/modules/admin/admin.controller.ts -- add this import
import { getAnalytics } from './analytics.service';

// ...and add this handler
export async function getAnalyticsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summary = await getAnalytics();
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/admin/admin.routes.ts -- add to the existing controller import, then:
adminRouter.get('/analytics', getAnalyticsHandler);
```

- [ ] **Step 5: Run tests, then full suite**

Run: `npm run test --workspace=apps/api -- admin.test.ts && npm run test --workspace=apps/api && npm run typecheck --workspace=apps/api`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/admin/analytics.service.ts apps/api/src/modules/admin/admin.controller.ts apps/api/src/modules/admin/admin.routes.ts apps/api/src/modules/admin/admin.test.ts
git commit -m "feat(api): add GET /api/admin/analytics"
```

---

### Task 14: Web — admin dashboard (verifications + analytics)

**Files:**
- Create: `apps/web/src/store/adminApi.ts`
- Create: `apps/web/src/app/dashboard/admin/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/verifications`, `POST /api/admin/verifications/:role/:id/decision`, `GET /api/admin/analytics` (existing + Task 13).
- Produces: `useListVerificationsQuery`, `useDecideVerificationMutation`, `useGetAnalyticsQuery` hooks; the FIRST admin-facing frontend page this project has ever had (Phase 1 built the backend, no UI was ever built for it — confirmed absent from the codebase).

- [ ] **Step 1: Write the RTK Query slice**

```ts
// apps/web/src/store/adminApi.ts
import { baseApi } from './api';

export interface PendingProfile {
  _id: string;
  verificationStatus: string;
  [key: string]: unknown;
}
export interface AnalyticsSummary {
  totalRegistrations: { patients: number; doctors: number; labs: number };
  appointmentsPerDay: { date: string; count: number }[];
  topSpecialties: { specialty: string; count: number }[];
  triageToBookingConversion: { totalSessions: number; sessionsWithBooking: number; conversionRate: number };
}

export const adminApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listVerifications: builder.query<{ items: PendingProfile[]; total: number }, { role: 'doctor' | 'lab'; status?: string }>({
      query: ({ role, status = 'pending' }) => ({ url: '/admin/verifications', params: { role, status } }),
    }),
    decideVerification: builder.mutation<{ profile: PendingProfile }, { role: 'doctor' | 'lab'; id: string; decision: 'approved' | 'rejected'; reason?: string }>({
      query: ({ role, id, decision, reason }) => ({ url: `/admin/verifications/${role}/${id}/decision`, method: 'POST', body: { decision, reason } }),
    }),
    getAnalytics: builder.query<AnalyticsSummary, void>({
      query: () => '/admin/analytics',
    }),
  }),
});

export const { useListVerificationsQuery, useDecideVerificationMutation, useGetAnalyticsQuery } = adminApi;
```

- [ ] **Step 2: Write the admin dashboard page**

```tsx
// apps/web/src/app/dashboard/admin/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useListVerificationsQuery, useDecideVerificationMutation, useGetAnalyticsQuery } from '@/store/adminApi';

export default function AdminDashboardPage() {
  const [role, setRole] = useState<'doctor' | 'lab'>('doctor');
  const { data: verifications, isLoading: loadingVerifications, refetch } = useListVerificationsQuery({ role, status: 'pending' });
  const [decide] = useDecideVerificationMutation();
  const { data: analytics, isLoading: loadingAnalytics } = useGetAnalyticsQuery();

  return (
    <main className="max-w-3xl mx-auto mt-12 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <Link href="/notifications" className="text-sm underline">Notifications</Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Pending verifications</h2>
        <div className="flex gap-2">
          <button className={`border px-3 py-1 rounded ${role === 'doctor' ? 'bg-gray-100' : ''}`} onClick={() => setRole('doctor')}>Doctors</button>
          <button className={`border px-3 py-1 rounded ${role === 'lab' ? 'bg-gray-100' : ''}`} onClick={() => setRole('lab')}>Labs</button>
        </div>
        {loadingVerifications ? <p>Loading…</p> : null}
        {verifications?.items.map((p) => (
          <div key={p._id} className="border p-3 rounded flex justify-between items-center">
            <span>{p._id}</span>
            <div className="flex gap-2">
              <button
                className="border px-3 py-1 rounded"
                onClick={async () => {
                  await decide({ role, id: p._id, decision: 'approved' }).unwrap();
                  refetch();
                }}
              >
                Approve
              </button>
              <button
                className="border px-3 py-1 rounded"
                onClick={async () => {
                  await decide({ role, id: p._id, decision: 'rejected', reason: 'Does not meet verification requirements' }).unwrap();
                  refetch();
                }}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
        {verifications?.items.length === 0 ? <p className="text-sm text-gray-600">No pending {role}s.</p> : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Analytics</h2>
        {loadingAnalytics ? <p>Loading…</p> : null}
        {analytics ? (
          <div className="space-y-2">
            <p>Patients: {analytics.totalRegistrations.patients} · Doctors: {analytics.totalRegistrations.doctors} · Labs: {analytics.totalRegistrations.labs}</p>
            <div>
              <p className="font-semibold">Appointments per day (last 14 days)</p>
              {analytics.appointmentsPerDay.map((d) => (
                <p key={d.date} className="text-sm text-gray-600">{d.date}: {d.count}</p>
              ))}
            </div>
            <div>
              <p className="font-semibold">Top specialties</p>
              {analytics.topSpecialties.map((s) => (
                <p key={s.specialty} className="text-sm text-gray-600">{s.specialty}: {s.count}</p>
              ))}
            </div>
            <p>
              Triage → booking conversion: {analytics.triageToBookingConversion.conversionRate}%
              {' '}({analytics.triageToBookingConversion.sessionsWithBooking}/{analytics.triageToBookingConversion.totalSessions})
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: clean; `/dashboard/admin` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/store/adminApi.ts apps/web/src/app/dashboard/admin/page.tsx
git commit -m "feat(web): admin dashboard with pending verifications and analytics"
```

---

### Task 15: Security pass — rate limiters on every remaining router

**Files:**
- Modify: `apps/api/src/middleware/rateLimit.ts` (add `apiLimiter`)
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/src/modules/appointments/appointments.routes.ts`
- Modify: `apps/api/src/modules/appointments/availability.routes.ts` (both `availabilityRouter` and `doctorSlotsRouter`)
- Modify: `apps/api/src/modules/doctors/doctors.routes.ts`
- Modify: `apps/api/src/modules/labs/labs.routes.ts`
- Modify: `apps/api/src/modules/patients/patients.routes.ts`
- Modify: `apps/api/src/modules/labBookings/labBookings.routes.ts`
- Modify: `apps/api/src/modules/ratings/ratings.routes.ts`
- Modify: `apps/api/src/modules/notifications/notifications.routes.ts`
- Modify: `apps/api/src/modules/labReferrals/labReferrals.routes.ts` (the new `labFacingReferralsRouter` from Task 11)
- Test: `apps/api/src/modules/patients/patients.test.ts` (extend with one 429 test — representative, not repeated per router)

**Interfaces:**
- Produces: `apiLimiter` export from `apps/api/src/middleware/rateLimit.ts` (100 req/min per key, prefix `rl:api:`), applied as the FIRST `.use()` on every router listed above (before any `requireAuth`/`requireRole`, so it covers both authenticated and public routes on that router uniformly).

This closes Phase 5's research finding that `admin`, `appointments`, `availability`, `doctors`, `labs`, `patients`, and `labBookings` had zero rate limiting, and ensures the three routers this phase adds (`ratings`, `notifications`, the lab-facing referrals router) don't ship with the same gap.

- [ ] **Step 1: Add the limiter**

```ts
// apps/api/src/middleware/rateLimit.ts -- add at the end of the file
// General-purpose limiter for routers that have no more specific one. 100/min is loose
// enough not to interfere with normal dashboard polling (the existing 10s-interval
// fallback refetches on several dashboards) while still bounding abuse.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SimpleRedisStore('rl:api:'),
});
```

- [ ] **Step 2: Write the failing 429 test**

Add to `apps/api/src/modules/patients/patients.test.ts` (adjust the exact route/method to whatever this file's own patient-profile endpoints actually are — read the file first):

```ts
describe('rate limiting', () => {
  it('returns 429 once the apiLimiter budget is exhausted', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', `ratelimit-patients-${Date.now()}@medlink.demo`);

    let lastStatus = 200;
    for (let i = 0; i < 101; i += 1) {
      const res = await request(app).get('/api/patients/me').set('Cookie', cookies);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test --workspace=apps/api -- patients.test.ts`
Expected: FAIL — no 429 ever returned (currently unlimited).

- [ ] **Step 4: Apply `apiLimiter` as the first `.use()` on every listed router**

For each of the 10 route files listed under **Files** above: import `apiLimiter` from `../../middleware/rateLimit`, and add `<routerName>.use(apiLimiter);` as the very first statement after the router is created — before any existing `.use(requireAuth, ...)` line and before any route registration, so it covers every route on that router including public ones (e.g. `doctorsRouter`'s `/public/:id` and the new `/`, `labsRouter`'s equivalents). For `availability.routes.ts`, which exports two routers (`availabilityRouter` and `doctorSlotsRouter`), apply it to both.

Example for one file:

```ts
// apps/api/src/modules/patients/patients.routes.ts
import { apiLimiter } from '../../middleware/rateLimit';
// ...
export const patientsRouter = Router();
patientsRouter.use(apiLimiter);
// ...rest of file unchanged
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test --workspace=apps/api -- patients.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm run test --workspace=apps/api && npm run typecheck --workspace=apps/api`
Expected: all green. If any existing test in another module's file now fails because it makes >100 requests to the same limited router within one test run without resetting Redis between tests, add `beforeEach(resetTestRedis)` to that file (mirroring the existing pattern already used in `auth.test.ts` and `labBookings.test.ts`) — do not raise `apiLimiter`'s `max` to work around a test-isolation gap.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/middleware/rateLimit.ts apps/api/src/modules/admin/admin.routes.ts apps/api/src/modules/appointments/appointments.routes.ts apps/api/src/modules/appointments/availability.routes.ts apps/api/src/modules/doctors/doctors.routes.ts apps/api/src/modules/labs/labs.routes.ts apps/api/src/modules/patients/patients.routes.ts apps/api/src/modules/labBookings/labBookings.routes.ts apps/api/src/modules/ratings/ratings.routes.ts apps/api/src/modules/notifications/notifications.routes.ts apps/api/src/modules/labReferrals/labReferrals.routes.ts apps/api/src/modules/patients/patients.test.ts
git commit -m "fix(api): apply apiLimiter to every previously-unprotected router"
```

---

### Task 16: Seed data — real ratings, lab-referral notification

**Files:**
- Modify: `apps/api/src/seed/seed.ts`
- Modify: `apps/api/src/seed/seed.test.ts` (update any exact-count assertions this change affects)

**Interfaces:**
- Consumes: `createRating` (Task 2) — call the real service function from the seed script rather than hand-writing `Rating.create` + a separate `DoctorProfile` update, so the seeded `avgRating`/`ratingCount` are guaranteed consistent with the same logic real usage produces.

- [ ] **Step 1: Read the current seed script's Ratings-adjacent code**

Read `apps/api/src/seed/seed.ts` end to end (it's the single source of truth for exact variable names — the doctors loop currently fakes `avgRating`/`ratingCount` with `Math.random()`, and the completed-appointments array is what CLAUDE.md §6.4 calls for 8 Ratings against).

- [ ] **Step 2: Remove the random `avgRating`/`ratingCount` fakes from the doctors loop**

In the doctors-creation loop, change the `DoctorProfile.create({...})` call to NOT set `avgRating`/`ratingCount` at all (they default to `0` per the schema) — real ratings created in Step 3 below will populate them correctly via the same `createRating` recompute logic used in production.

- [ ] **Step 3: Add a Ratings section after the Appointments/Prescriptions sections**

```ts
// apps/api/src/seed/seed.ts -- new section, placed after the completed appointments and
// prescriptions are created (it needs their _ids), before the TriageSessions section.
// CLAUDE.md §6.4: 8 Ratings, spread across doctors, with realistic text.
console.log('Seeding ratings...');
const ratingTexts = [
  'Very patient, explained everything clearly',
  'Quick appointment, straight to the point',
  'Helped me understand my condition much better',
  'Would recommend to anyone in the area',
  'Waited a bit but the consultation was thorough',
  'Friendly staff and a clean clinic',
  'Diagnosis was spot on',
  'Good follow-up advice',
];
const completedAppointmentsForRating = completedAppointments.slice(0, 8); // reuse whatever
  // variable name this file's completed-appointments array actually has -- confirm by
  // reading Step 1's output rather than assuming "completedAppointments" is correct.
for (const [index, appointment] of completedAppointmentsForRating.entries()) {
  await createRating(
    appointment.patientId.toString(),
    appointment._id.toString(),
    3 + (index % 3), // spreads scores across 3-5, matching CLAUDE.md's "3.9-4.8 avgRating" target range
    ratingTexts[index]
  );
}
```

Import `createRating` from `../modules/ratings/ratings.service` at the top of `seed.ts`.

- [ ] **Step 4: Add the lab notification to the seed's existing "sent" referral scenario**

Read the existing LabReferrals section in `seed.ts` (it already creates a `Notification` for the patient on the `sentReferral` — see the comment there from Phase 5's I8 fix). Add an equivalent `Notification.create` for that referral's lab (`cityPathLab.userId` per the Phase 5 fix-report's own naming, confirm the exact variable name by reading the file), mirroring the shape `createReferral`'s own new lab notification produces (Task 11):

```ts
await Notification.create({
  userId: cityPathLab.userId, // confirm exact variable name from the file
  type: 'lab_referral_received',
  title: 'New lab referral',
  body: `A doctor referred a patient to you for: ${sentReferral.suggestedTestCodes.join(', ')}.`,
});
```

- [ ] **Step 5: Update `seed.test.ts`'s exact-count assertions**

Read `apps/api/src/seed/seed.test.ts` and update any assertion that counts total `Notification` documents (now +1 for the lab notification) or that asserts doctors' `avgRating`/`ratingCount` are random/nonzero-by-construction (now real, deterministic values from Step 3 — assert the specific doctors who received ratings have the exact expected `ratingCount`, e.g. however many of the 8 ratings landed on each doctor).

- [ ] **Step 6: Run the seed script against a real local Mongo/Redis and the seed test**

Run: `npm run test --workspace=apps/api -- seed.test.ts`
Expected: PASS with updated counts.

If a local Docker Compose stack is available, also run `npm run seed --workspace=apps/api` against it and spot-check in `mongosh` that a rated doctor's `avgRating` is a real average (not 0, not a suspicious round Math.random() artifact).

- [ ] **Step 7: Run the full suite**

Run: `npm run test --workspace=apps/api && npm run typecheck --workspace=apps/api`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/seed/seed.ts apps/api/src/seed/seed.test.ts
git commit -m "feat(seed): replace faked avgRating with real Ratings, seed lab referral notification"
```

---

### Task 17: CI — build and push Docker images on `main`

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: a new `docker` job that runs ONLY on `push` to `main` (not on `pull_request`, since PRs from forks can't be trusted with registry push permissions), building and pushing `apps/api`, `apps/web`, and `apps/ai`'s existing Dockerfiles to GHCR under the repository's own namespace, tagged `latest` and with the commit SHA.

- [ ] **Step 1: Add the docker job**

```yaml
# .github/workflows/ci.yml -- add this job at the end of the file (same indentation
# level as the existing `build` and `ai` jobs)
  docker:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: [build, ai]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      matrix:
        app: [api, web, ai]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/${{ matrix.app }}/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/medlink-${{ matrix.app }}:latest
            ghcr.io/${{ github.repository_owner }}/medlink-${{ matrix.app }}:${{ github.sha }}
```

`needs: [build, ai]` means images are only built/pushed after both existing quality-gate jobs pass — a red `build` or `ai` job blocks the image push, matching this repo's existing "don't ship on a failing check" posture (mirrors why `git push` is never done past a failing local suite elsewhere in this project's own workflow).

- [ ] **Step 2: Validate the YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` (or any available YAML validator) to catch indentation errors before pushing — GitHub Actions gives poor feedback on malformed YAML.
Expected: no error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: build and push Docker images to GHCR on push to main"
```

(This job's actual execution can only be verified once this branch's PR is merged to `main` and a real push-to-main event fires — note this explicitly in the final PR description rather than claiming it as independently verified.)

---

### Task 18: README rewrite

**Files:**
- Modify: `README.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Read the current README in full**

It currently states Phase 1 is the only complete phase — this is stale; Phases 1-6 are all complete as of this branch.

- [ ] **Step 2: Rewrite the status/phases section**

Replace the "Phase 1 (Foundation) is complete... later phases... not yet built" paragraph with an accurate phase-by-phase summary (one line each, matching CLAUDE.md's own Phase 1-6 headings): Foundation & Auth, Availability & Booking, AI Triage & Matching, Prescriptions, Lab Referral Flow, Polish/Admin/Deploy — all shipped.

- [ ] **Step 3: Add an architecture diagram**

Add a `## Architecture` section reproducing (as a fenced ```` ```text```` or mermaid block) the three-box diagram already in `CLAUDE.md` §0.2 (Next.js → Express ↔ FastAPI → MongoDB/Redis), plus the one-paragraph "why two backends" explanation already written in CLAUDE.md §0.2 — this project's README should not require a reader to also open CLAUDE.md to understand the shape of the system.

- [ ] **Step 4: Update the demo credentials table**

Replace/verify the existing demo credentials table against CLAUDE.md §6.7's exact block (admin/doctor/patient/lab, all `Demo@123`) — confirm these emails still match what `seed.ts` actually creates after this phase's changes (Task 16 doesn't rename any seeded account, so this should already match, but verify by reading `seed.ts`'s account list once more).

- [ ] **Step 5: Add placeholders for screenshots and the Loom walkthrough**

Add a `## Screenshots` section and a `## Demo video` section, each with a one-line note: `<!-- TODO: add screenshots from a live run -->` / `<!-- TODO: record and link a 2-minute Loom walkthrough -->` — do not fabricate image links or a video URL that doesn't exist; CLAUDE.md asks for these but they require a human to actually record/capture them.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for Phase 1-6 completion, add architecture section"
```

---

## Self-Review Notes

**Spec coverage check against CLAUDE.md Phase 6's 9 checklist items:**
1. Ratings + avgRating/ratingCount recompute → Tasks 1-4, 16. ✅
2. Admin analytics → Tasks 13-14. ✅
3. Notification center + mark-read → Tasks 5-7. ✅
4. Global search (doctors + labs) → Tasks 8-10. ✅
5. Empty states/loading skeletons/mobile pass → folded into every UI task's own spec (Global Constraints mandates the existing "Loading…"/"No X yet." convention on every new page) rather than a separate vague task, since this codebase has no component library to retrofit and every existing page already follows this convention.
6. Security pass (rate limits, NoSQL injection, upload validation, CORS) → rate limits: Task 15. NoSQL injection: `escapeRegex` in Task 8, applied in Tasks 8-9 (the only two places this phase introduces user-controlled regex). Upload validation and CORS: already correct per Phase 5's own research (multer type/size limits on both existing upload surfaces, CORS already origin-locked via `WEB_ORIGIN`) — no code change needed, verified as part of Task 15's own review rather than invented as busywork.
7. Seed data refresh + deploy wiring → Task 16 (seed) + Task 17 (CI images). Actual Render/Vercel/Atlas/Upstash account provisioning is an external, credential-bearing action outside what an agent can do from this repo — the plan's own PR description (per the finishing-a-development-branch step) should note this explicitly as a manual follow-up, not claim it as done.
8. README → Task 18.
9. CI docker build/push → Task 17.
10. (Phase 5's own deferred I5) → Tasks 11-12.

**Placeholder scan:** no "TODO: implement" left in code steps; the two explicit `<!-- TODO -->` markers in Task 18 are intentional — they mark genuinely human-only follow-up (recording a video, capturing screenshots), not deferred engineering work, and are called out as such rather than silently left in the diff.

**Type consistency check:** `{items, total, page, limit}` used identically across every new list endpoint (Tasks 3, 6, 8, 9, 11, 13's non-list-shaped analytics response is deliberately different, not an inconsistency). `AppError(statusCode, message, code)` construction matches its Task-1-era definition throughout. `escapeRegex` defined once in Task 8, imported (not re-implemented) in Task 9.
