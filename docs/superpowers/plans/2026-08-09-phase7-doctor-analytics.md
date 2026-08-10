# Phase 7 — Doctor Earnings/Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A doctor can see their own practice analytics — projected
earnings over time, appointment outcome breakdown + no-show/cancellation
rate, rating trend, and new-vs-returning patient split — on their existing
dashboard, via a new `GET /api/doctors/me/analytics` endpoint scoped
entirely to their own `DoctorProfile`. No other doctor's data is ever
reachable from this endpoint.

**Architecture:** Extends the existing `apps/api/src/modules/doctors`
module (adds one service file + one controller handler + one route) and
the existing `apps/web/src/app/dashboard/doctor/page.tsx` (adds one Card
section). Does **not** modify `apps/api/src/modules/admin/analytics.service.ts`
or any admin route — this is an additive, doctor-scoped sibling that reuses
the admin service's aggregation *patterns* (Mongoose `$group` +
`$dateToString` date-bucketing, the `total > 0 ? … : 0` guard), not its
code, per the design spec's §5 reuse decision. Full rationale:
`docs/superpowers/specs/2026-08-09-phase7-doctor-analytics-design.md`.

**Tech Stack:** Same as Phases 1–6 — Node 20, TypeScript 5 (strict),
Express 4, Mongoose 8, Zod 3 (unused here — GET with no input body), Next.js
14 (App Router), Redux Toolkit + RTK Query. Tests: Vitest + Supertest +
mongodb-memory-server, following the existing `admin.test.ts`/`doctors.test.ts`
pattern (register via `/api/auth/register`, log in, `set('Cookie', …)`, seed
fixture documents directly via the Mongoose models). No new dependency is
added anywhere in this plan — no charting library (none exists in
`apps/web/package.json`; the doctor analytics section renders as plain
number/text rows, matching the admin dashboard's existing Analytics card).

## Global Constraints

- TypeScript strict everywhere; no `any` (CLAUDE.md §3).
- `Appointment.doctorId`/`Rating.doctorId` reference `DoctorProfile._id`,
  not `User._id` — every query in this plan resolves the caller's
  `DoctorProfile` from `req.user!.id` first (`DoctorProfile.findOne({ userId: req.user!.id })`),
  the same lookup `getMyProfile` already performs
  (`apps/api/src/modules/doctors/doctors.controller.ts:9-16`).
- The endpoint takes **no route parameter** for the doctor — it is always
  `req.user`'s own profile. This is the security property from design spec
  §3: there is no id to authorize against, so no authorization check can be
  forgotten. Do not add a `:doctorId` param "for flexibility" — that would
  reopen exactly the cross-doctor leak this design avoids.
- Fixed 90-day trailing window, no query parameters (design spec §1) — do
  not add `?from=`/`?to=`.
- `estimatedEarnings` is a projected figure (`completedCount × consultationFee`),
  never real transacted revenue — the API response carries a static
  `disclaimer` string and the UI surfaces it. No payment/Stripe/Razorpay
  integration exists in this repo to compute real revenue from (confirmed
  via repo-wide grep during design).
- Response is a single summary object, not a list — no pagination (CLAUDE.md
  §3's pagination rule applies to list endpoints; same precedent as
  `GET /api/admin/analytics`).
- Conventional commits (CLAUDE.md §3).
- Reuse the existing `doctorsRouter.use(requireAuth, requireRole('doctor'))`
  block already guarding `/me` — do not add new middleware.

---

## File Structure (additions only)

```
apps/api/src/modules/doctors/
├── doctor-analytics.service.ts   # NEW — getDoctorAnalytics(doctorProfileId)
├── doctors.controller.ts         # MODIFY — add getMyAnalyticsHandler
├── doctors.routes.ts             # MODIFY — add GET /me/analytics
└── doctors.test.ts               # MODIFY — add describe blocks

apps/web/src/
├── store/doctorsApi.ts           # MODIFY — add getMyAnalytics query + types
└── app/dashboard/doctor/page.tsx # MODIFY — add "My Analytics" Card section
```

---

### Task 1: Doctor-scoped analytics service + endpoint (core metrics)

**Files:**
- Create: `apps/api/src/modules/doctors/doctor-analytics.service.ts`
- Modify: `apps/api/src/modules/doctors/doctors.controller.ts` (add `getMyAnalyticsHandler`)
- Modify: `apps/api/src/modules/doctors/doctors.routes.ts` (add `GET /me/analytics`)
- Test: `apps/api/src/modules/doctors/doctors.test.ts` (new `describe('GET /api/doctors/me/analytics', …)` block, core cases)

**Interfaces:**
- Consumes: `Appointment`, `Rating`, `DoctorProfile` models; `requireAuth`, `requireRole('doctor')` (already applied to the router block this route joins); `req.user!.id` (`User._id`).
- Produces: `DoctorAnalyticsSummary` interface + `getDoctorAnalytics(doctorProfileId: Types.ObjectId): Promise<DoctorAnalyticsSummary>`, and `GET /api/doctors/me/analytics` returning `200 { ...DoctorAnalyticsSummary }` or `404 DOCTOR_PROFILE_NOT_FOUND`. Consumed by Task 3's RTK Query endpoint.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/modules/doctors/doctors.test.ts` (imports for
`Appointment` and `Rating` models added alongside the existing
`DoctorProfile`/`User` imports at the top of the file):

```ts
import { Appointment } from '../../models/Appointment';
import { Rating } from '../../models/Rating';

describe('GET /api/doctors/me/analytics', () => {
  it('returns earnings, breakdown, rating trend, and patient volume for the caller\'s own profile', async () => {
    const app = createApp();
    const docCookies = await registerAndLogin(app, 'doctor', `analytics-doc-${Date.now()}@medlink.demo`);
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', docCookies).send({
      ...validDoctor, consultationFee: 500,
    });
    const doctorId = putRes.body.profile._id;
    await DoctorProfile.findByIdAndUpdate(doctorId, { verificationStatus: 'approved', avgRating: 4.5, ratingCount: 3 });

    const patient1 = await User.create({ role: 'patient', email: `p1-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'P1' });
    const patient2 = await User.create({ role: 'patient', email: `p2-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'P2' });
    const now = new Date();

    // 2 completed, 1 cancelled, 1 no_show -- within the 90-day window
    await Appointment.create([
      { patientId: patient1._id, doctorId, slotStart: now, slotEnd: now, status: 'completed' },
      { patientId: patient2._id, doctorId, slotStart: now, slotEnd: now, status: 'completed' },
      { patientId: patient1._id, doctorId, slotStart: now, slotEnd: now, status: 'cancelled' },
      { patientId: patient2._id, doctorId, slotStart: now, slotEnd: now, status: 'no_show' },
    ]);
    await Rating.create({ doctorId, patientId: patient1._id, appointmentId: new mongoose.Types.ObjectId(), score: 5, createdAt: now });

    const res = await request(app).get('/api/doctors/me/analytics').set('Cookie', docCookies);

    expect(res.status).toBe(200);
    expect(res.body.windowDays).toBe(90);
    expect(typeof res.body.disclaimer).toBe('string');

    // earnings: 2 completed this week * fee 500 = 1000, in exactly one weekly bucket
    expect(res.body.earningsByWeek).toHaveLength(1);
    expect(res.body.earningsByWeek[0].completedCount).toBe(2);
    expect(res.body.earningsByWeek[0].estimatedEarnings).toBe(1000);

    expect(res.body.appointmentBreakdown).toEqual({
      completed: 2, cancelled: 1, noShow: 1, rejected: 0, requested: 0, confirmed: 0,
    });
    // (cancelled + noShow) / (completed + cancelled + noShow + rejected) = 2/4 = 50%
    expect(res.body.noShowCancellationRate).toBe(50);

    expect(res.body.currentRating).toEqual({ avgRating: 4.5, ratingCount: 3 });
    expect(res.body.ratingTrend).toHaveLength(1);
    expect(res.body.ratingTrend[0].avgScore).toBe(5);

    expect(res.body.patientVolume.totalDistinctPatients).toBe(2);
    expect(res.body.patientVolume.newPatients).toBe(2);
    expect(res.body.patientVolume.returningPatients).toBe(0);
  });

  it('rejects an unauthenticated caller', async () => {
    const app = createApp();
    const res = await request(app).get('/api/doctors/me/analytics');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the caller has no DoctorProfile yet', async () => {
    const app = createApp();
    const docCookies = await registerAndLogin(app, 'doctor', `noprofile-${Date.now()}@medlink.demo`);
    const res = await request(app).get('/api/doctors/me/analytics').set('Cookie', docCookies);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/api -- doctors.test.ts`
Expected: FAIL — `GET /api/doctors/me/analytics` returns 404 for the whole
router (route doesn't exist) or a TypeError, not the 200 the first two
assertions expect.

- [ ] **Step 3: Implement `doctor-analytics.service.ts`**

```ts
// apps/api/src/modules/doctors/doctor-analytics.service.ts
import { Types } from 'mongoose';
import { Appointment, AppointmentStatus } from '../../models/Appointment';
import { Rating } from '../../models/Rating';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';

const WINDOW_DAYS = 90;
const WEEK_FORMAT = '%G-W%V'; // ISO week-year + ISO week number, same $dateToString family analytics.service.ts uses
const DISCLAIMER =
  'Estimated earnings are projected from completed appointments x your current consultation fee. ' +
  'MedLink has no payment processing -- this is not a record of money actually received.';

export interface DoctorAnalyticsSummary {
  windowDays: number;
  disclaimer: string;
  earningsByWeek: { weekStart: string; completedCount: number; estimatedEarnings: number }[];
  appointmentBreakdown: {
    completed: number; cancelled: number; noShow: number; rejected: number;
    requested: number; confirmed: number;
  };
  noShowCancellationRate: number;
  ratingTrend: { weekStart: string; avgScore: number; count: number }[];
  currentRating: { avgRating: number; ratingCount: number };
  patientVolume: { totalDistinctPatients: number; newPatients: number; returningPatients: number };
}

const BREAKDOWN_KEYS: Record<AppointmentStatus, keyof DoctorAnalyticsSummary['appointmentBreakdown']> = {
  completed: 'completed', cancelled: 'cancelled', no_show: 'noShow',
  rejected: 'rejected', requested: 'requested', confirmed: 'confirmed',
};

export async function getDoctorAnalytics(doctorId: Types.ObjectId): Promise<DoctorAnalyticsSummary> {
  const doctorProfile = await DoctorProfile.findById(doctorId);
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'DOCTOR_PROFILE_NOT_FOUND');

  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const earningsAgg = await Appointment.aggregate<{ _id: string; completedCount: number }>([
    { $match: { doctorId, status: 'completed', slotStart: { $gte: windowStart } } },
    { $group: { _id: { $dateToString: { format: WEEK_FORMAT, date: '$slotStart' } }, completedCount: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const earningsByWeek = earningsAgg.map((row) => ({
    weekStart: row._id,
    completedCount: row.completedCount,
    estimatedEarnings: row.completedCount * doctorProfile.consultationFee,
  }));

  const breakdownAgg = await Appointment.aggregate<{ _id: AppointmentStatus; count: number }>([
    { $match: { doctorId, slotStart: { $gte: windowStart } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const appointmentBreakdown = { completed: 0, cancelled: 0, noShow: 0, rejected: 0, requested: 0, confirmed: 0 };
  for (const row of breakdownAgg) appointmentBreakdown[BREAKDOWN_KEYS[row._id]] = row.count;
  const terminal = appointmentBreakdown.completed + appointmentBreakdown.cancelled
    + appointmentBreakdown.noShow + appointmentBreakdown.rejected;
  const noShowCancellationRate = terminal > 0
    ? Math.round(((appointmentBreakdown.cancelled + appointmentBreakdown.noShow) / terminal) * 1000) / 10
    : 0;

  const ratingTrendAgg = await Rating.aggregate<{ _id: string; avgScore: number; count: number }>([
    { $match: { doctorId, createdAt: { $gte: windowStart } } },
    { $group: { _id: { $dateToString: { format: WEEK_FORMAT, date: '$createdAt' } }, avgScore: { $avg: '$score' }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const ratingTrend = ratingTrendAgg.map((row) => ({
    weekStart: row._id,
    avgScore: Math.round(row.avgScore * 10) / 10,
    count: row.count,
  }));

  const distinctPatientIds = await Appointment.distinct('patientId', { doctorId, slotStart: { $gte: windowStart } });
  let newPatients = 0;
  for (const patientId of distinctPatientIds) {
    const hadEarlier = await Appointment.exists({ doctorId, patientId, slotStart: { $lt: windowStart } });
    if (!hadEarlier) newPatients += 1;
  }
  const patientVolume = {
    totalDistinctPatients: distinctPatientIds.length,
    newPatients,
    returningPatients: distinctPatientIds.length - newPatients,
  };

  return {
    windowDays: WINDOW_DAYS,
    disclaimer: DISCLAIMER,
    earningsByWeek,
    appointmentBreakdown,
    noShowCancellationRate,
    ratingTrend,
    currentRating: { avgRating: doctorProfile.avgRating, ratingCount: doctorProfile.ratingCount },
    patientVolume,
  };
}
```

- [ ] **Step 4: Wire up the controller and route**

```ts
// apps/api/src/modules/doctors/doctors.controller.ts -- add:
import { getDoctorAnalytics } from './doctor-analytics.service';

export async function getMyAnalyticsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await DoctorProfile.findOne({ userId: req.user!.id });
    if (!profile) throw new AppError(404, 'Doctor profile not found', 'DOCTOR_PROFILE_NOT_FOUND');
    const summary = await getDoctorAnalytics(profile._id);
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/doctors/doctors.routes.ts -- add inside the existing
// requireAuth/requireRole('doctor') block, alongside GET /me:
import { getMyAnalyticsHandler } from './doctors.controller'; // add to existing import line
doctorsRouter.get('/me/analytics', getMyAnalyticsHandler);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=apps/api -- doctors.test.ts`
Expected: PASS (all `GET /api/doctors/me/analytics` cases plus every
pre-existing test in the file still green).

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck --workspace=apps/api`
Expected: no errors (strict mode, no `any`).

```bash
git add apps/api/src/modules/doctors/doctor-analytics.service.ts apps/api/src/modules/doctors/doctors.controller.ts apps/api/src/modules/doctors/doctors.routes.ts apps/api/src/modules/doctors/doctors.test.ts
git commit -m "feat(api): add GET /api/doctors/me/analytics (doctor-scoped earnings/practice analytics)"
```

---

### Task 2: Cross-doctor isolation + edge-case regression tests

**Files:**
- Modify: `apps/api/src/modules/doctors/doctors.test.ts` (append to the `describe('GET /api/doctors/me/analytics', …)` block from Task 1)

**Interfaces:**
- Consumes: the endpoint built in Task 1. No production code changes expected — these tests pin down the security guarantee and the zero-data/edge-case math described in the design spec, following the same precedent as `admin.test.ts`'s dedicated "rejects a non-admin caller" and "I2 regression" tests appended after the main case.

- [ ] **Step 1: Write the tests**

```ts
it('never includes another doctor\'s appointments, ratings, or earnings', async () => {
  const app = createApp();

  const docACookies = await registerAndLogin(app, 'doctor', `iso-a-${Date.now()}@medlink.demo`);
  const putA = await request(app).put('/api/doctors/me').set('Cookie', docACookies).send({ ...validDoctor, consultationFee: 500 });
  await DoctorProfile.findByIdAndUpdate(putA.body.profile._id, { verificationStatus: 'approved' });

  const docBCookies = await registerAndLogin(app, 'doctor', `iso-b-${Date.now()}@medlink.demo`);
  const putB = await request(app).put('/api/doctors/me').set('Cookie', docBCookies).send({ ...validDoctor, consultationFee: 9999 });
  await DoctorProfile.findByIdAndUpdate(putB.body.profile._id, { verificationStatus: 'approved' });

  const patient = await User.create({ role: 'patient', email: `iso-p-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'P' });
  const now = new Date();
  // Only doctor B has any activity
  await Appointment.create({ patientId: patient._id, doctorId: putB.body.profile._id, slotStart: now, slotEnd: now, status: 'completed' });
  await Rating.create({ doctorId: putB.body.profile._id, patientId: patient._id, appointmentId: new mongoose.Types.ObjectId(), score: 4, createdAt: now });

  const resA = await request(app).get('/api/doctors/me/analytics').set('Cookie', docACookies);

  expect(resA.status).toBe(200);
  expect(resA.body.earningsByWeek).toHaveLength(0);
  expect(resA.body.appointmentBreakdown).toEqual({ completed: 0, cancelled: 0, noShow: 0, rejected: 0, requested: 0, confirmed: 0 });
  expect(resA.body.patientVolume.totalDistinctPatients).toBe(0);
  expect(resA.body.ratingTrend).toHaveLength(0);
});

it('returns a 0% no-show/cancellation rate with no error when the doctor has zero appointments', async () => {
  const app = createApp();
  const docCookies = await registerAndLogin(app, 'doctor', `empty-${Date.now()}@medlink.demo`);
  const putRes = await request(app).put('/api/doctors/me').set('Cookie', docCookies).send(validDoctor);
  await DoctorProfile.findByIdAndUpdate(putRes.body.profile._id, { verificationStatus: 'approved' });

  const res = await request(app).get('/api/doctors/me/analytics').set('Cookie', docCookies);
  expect(res.status).toBe(200);
  expect(res.body.noShowCancellationRate).toBe(0);
});

it('classifies a patient as returning when their earlier appointment falls outside the 90-day window', async () => {
  const app = createApp();
  const docCookies = await registerAndLogin(app, 'doctor', `returning-${Date.now()}@medlink.demo`);
  const putRes = await request(app).put('/api/doctors/me').set('Cookie', docCookies).send(validDoctor);
  const doctorId = putRes.body.profile._id;
  await DoctorProfile.findByIdAndUpdate(doctorId, { verificationStatus: 'approved' });

  const patient = await User.create({ role: 'patient', email: `ret-p-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'P' });
  const now = new Date();
  const beforeWindow = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000); // 120 days ago, outside the 90-day window

  await Appointment.create({ patientId: patient._id, doctorId, slotStart: beforeWindow, slotEnd: beforeWindow, status: 'completed' });
  await Appointment.create({ patientId: patient._id, doctorId, slotStart: now, slotEnd: now, status: 'completed' });

  const res = await request(app).get('/api/doctors/me/analytics').set('Cookie', docCookies);
  expect(res.body.patientVolume.totalDistinctPatients).toBe(1);
  expect(res.body.patientVolume.newPatients).toBe(0);
  expect(res.body.patientVolume.returningPatients).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm run test --workspace=apps/api -- doctors.test.ts`
Expected: PASS. These should already pass against Task 1's implementation
with no production-code changes — that's the point: the isolation guarantee
falls out of "no `:doctorId` param, always `req.user`'s own profile" rather
than an explicit ownership check that could be missed. If the isolation
test fails, that is a real bug in Task 1's controller (e.g. a stray
`req.params.doctorId` fallback) and must be fixed before proceeding, not
worked around here.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/doctors/doctors.test.ts
git commit -m "test(api): pin doctor analytics cross-doctor isolation and edge-case behavior"
```

---

### Task 3: Doctor dashboard "My Analytics" section

**Files:**
- Modify: `apps/web/src/store/doctorsApi.ts` (add `getMyAnalytics` query + `DoctorAnalyticsSummary` type)
- Modify: `apps/web/src/app/dashboard/doctor/page.tsx` (add "My Analytics" Card section)

**Interfaces:**
- Consumes: `GET /api/doctors/me/analytics` from Task 1.
- Produces: `useGetMyAnalyticsQuery()` hook, consumed only by the doctor dashboard page.

- [ ] **Step 1: Add the RTK Query endpoint**

```ts
// apps/web/src/store/doctorsApi.ts -- add alongside the existing endpoint:
export interface DoctorAnalyticsSummary {
  windowDays: number;
  disclaimer: string;
  earningsByWeek: { weekStart: string; completedCount: number; estimatedEarnings: number }[];
  appointmentBreakdown: { completed: number; cancelled: number; noShow: number; rejected: number; requested: number; confirmed: number };
  noShowCancellationRate: number;
  ratingTrend: { weekStart: string; avgScore: number; count: number }[];
  currentRating: { avgRating: number; ratingCount: number };
  patientVolume: { totalDistinctPatients: number; newPatients: number; returningPatients: number };
}

export const doctorsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPublicDoctorProfile: builder.query<{ profile: PublicDoctorProfile }, string>({
      query: (doctorId) => `/doctors/public/${doctorId}`,
    }),
    getMyAnalytics: builder.query<DoctorAnalyticsSummary, void>({
      query: () => '/doctors/me/analytics',
    }),
  }),
});

export const { useGetPublicDoctorProfileQuery, useGetMyAnalyticsQuery } = doctorsApi;
```

- [ ] **Step 2: Add the dashboard section**

In `apps/web/src/app/dashboard/doctor/page.tsx`, add the hook alongside the
existing ones and render a new `Card` after the "Confirmed appointments"
section, following the exact plain-text rendering style of the admin
dashboard's Analytics card (`apps/web/src/app/dashboard/admin/page.tsx:71-99`)
— no chart, no new dependency:

```tsx
import { useGetMyAnalyticsQuery } from '@/store/doctorsApi'; // add to existing imports

// inside the component:
const { data: analytics, isLoading: loadingAnalytics } = useGetMyAnalyticsQuery();

// JSX, after the "Confirmed appointments" section's closing </div>:
<Card>
  <CardHeader>
    <CardTitle>My Analytics (last {analytics?.windowDays ?? 90} days)</CardTitle>
  </CardHeader>
  <CardContent className="space-y-2">
    {loadingAnalytics ? <p>Loading…</p> : null}
    {analytics ? (
      <div className="space-y-2">
        <div>
          <p className="font-semibold">Estimated earnings by week</p>
          {analytics.earningsByWeek.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed appointments in this window yet.</p>
          ) : (
            analytics.earningsByWeek.map((w) => (
              <p key={w.weekStart} className="text-sm text-muted-foreground">
                {w.weekStart}: {w.completedCount} completed · ₹{w.estimatedEarnings}
              </p>
            ))
          )}
          <p className="text-xs text-muted-foreground italic">{analytics.disclaimer}</p>
        </div>
        <p>
          Completed: {analytics.appointmentBreakdown.completed} · Cancelled: {analytics.appointmentBreakdown.cancelled}
          {' '}· No-show: {analytics.appointmentBreakdown.noShow} · Rejected: {analytics.appointmentBreakdown.rejected}
        </p>
        <p>No-show/cancellation rate: {analytics.noShowCancellationRate}%</p>
        <p>Current rating: {analytics.currentRating.avgRating.toFixed(1)} ({analytics.currentRating.ratingCount} ratings)</p>
        <p>
          Patients (this window): {analytics.patientVolume.totalDistinctPatients} total
          {' '}· {analytics.patientVolume.newPatients} new · {analytics.patientVolume.returningPatients} returning
        </p>
      </div>
    ) : null}
  </CardContent>
</Card>
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev --workspace=apps/api` and `npm run dev --workspace=apps/web`
(or `npm run seed --workspace=apps/api` first for realistic demo data),
log in as a seeded doctor, open `/dashboard/doctor`, confirm the "My
Analytics" card renders below the confirmed-appointments list with numbers
matching the seeded appointment/rating data, and that the disclaimer text
is visible under the earnings rows. No automated frontend test suite exists
for dashboard pages elsewhere in the repo (same precedent as the admin
dashboard's analytics card) — this manual pass is the check.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck --workspace=apps/web`
Expected: no errors.

```bash
git add apps/web/src/store/doctorsApi.ts apps/web/src/app/dashboard/doctor/page.tsx
git commit -m "feat(web): add My Analytics section to doctor dashboard"
```
