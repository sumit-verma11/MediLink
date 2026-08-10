# Phase 7 — Doctor Earnings/Analytics (design spec)

## Context

Phases 1–6 are complete and merged. Phase 6 added an admin-wide analytics
endpoint, `GET /api/admin/analytics` (`apps/api/src/modules/admin/analytics.service.ts`
+ `admin.controller.ts` + `admin.routes.ts`, commit "feat(api): add GET
/api/admin/analytics"), which aggregates registrations, appointments/day,
top specialties, and triage→booking conversion **across every doctor**,
gated by `requireRole('admin')`. There is no per-doctor view of any of this
— a doctor today only sees their own appointment queue
(`apps/web/src/app/dashboard/doctor/page.tsx`), not how their practice is
trending.

CLAUDE.md §2 lists "Doctor earnings/appointment analytics" as one of five
optional, unsequenced Phase 7 post-launch differentiators
(`docs/superpowers/plans/2026-07-27-roadmap.md`, "Phase 7 — Optional
differentiators"). This spec scopes that one item only: a doctor-facing
dashboard section showing their own earnings and practice analytics, reusing
the admin analytics endpoint's aggregation patterns but scoped to a single
doctor.

**No payments system exists anywhere in the repo.** CLAUDE.md §0.4 states
this explicitly as a non-goal ("No payments (fake 'pay at clinic' flag).
Razorpay is Phase 8+ if ever."), and a repo-wide grep for
`stripe|razorpay|payment` (case-insensitive, excluding `node_modules`) turns
up only CLAUDE.md's own non-goals line and this design doc's ancestor
research — no payment integration, no transaction ledger, no captured
amount anywhere. **"Earnings" in this feature is therefore a projected
figure — `count(completed appointments) × DoctorProfile.consultationFee` —
not real transacted revenue**, and the spec, the API response shape, and
the UI copy all say so explicitly so it is never misread as real payment
data.

## Goals

1. A new endpoint, `GET /api/doctors/me/analytics`, scoped to the
   authenticated doctor's own `DoctorProfile` only — reusing the aggregation
   *patterns* (Mongoose `$match`/`$group`/date-bucketing, the
   `totalX > 0 ? … : 0` divide-by-zero guard already used in
   `analytics.service.ts`) from the admin analytics service, without
   threading a doctor-scope parameter through the existing admin-wide
   function.
2. A small, fixed set of metrics: earnings-over-time, completed/cancelled/
   no-show/rejected breakdown + no-show/cancellation rate, rating trend,
   and new-vs-returning patient split. Not a BI tool — no custom date
   ranges, no CSV export, no drill-down.
3. A "My Analytics" section on the existing doctor dashboard
   (`apps/web/src/app/dashboard/doctor/page.tsx`), rendered the same way the
   admin dashboard already renders its analytics card — plain numbers/text
   rows, because **no charting library is installed** (`apps/web/package.json`
   has no `recharts`/`chart.js`/`d3`/etc., and the admin dashboard's own
   "Analytics" card at `apps/web/src/app/dashboard/admin/page.tsx:71-99`
   is plain text, not a chart). Adding a charting dependency for one small
   dashboard section is out of scope for an optional Phase 7 item.
4. A doctor must never be able to fetch another doctor's analytics.

## Non-goals

- Real payment/transaction data — there is none to aggregate (see Context).
- Configurable date ranges, CSV/PDF export, or any admin-analytics-style
  cross-doctor comparison.
- A charting library dependency. If a future pass wants actual charts, that
  is a separate, explicit decision (see Open questions).
- Changes to the existing admin analytics endpoint's response shape or
  behavior — this is purely additive.

## Design

### 1. Metrics (final list)

| Metric | Shape | Source |
|---|---|---|
| `earningsByWeek` | `{ weekStart: string /* ISO week label, e.g. "2026-W12" */; completedCount: number; estimatedEarnings: number }[]` | `Appointment` (`status: 'completed'`) × `DoctorProfile.consultationFee`, trailing 90 days, bucketed by ISO week |
| `appointmentBreakdown` | `{ completed, cancelled, noShow, rejected, requested, confirmed }` (all `number`) | `Appointment.status` counts, trailing 90 days |
| `noShowCancellationRate` | `number` (0–100, one decimal) | `(cancelled + noShow) / (completed + cancelled + noShow + rejected)` over the same 90-day window, terminal statuses only; `0` when the denominator is `0` (same guard pattern as `analytics.service.ts`'s `conversionRate`) |
| `ratingTrend` | `{ weekStart: string; avgScore: number; count: number }[]` | `Rating` (`doctorId`), trailing 90 days, bucketed by ISO week |
| `currentRating` | `{ avgRating: number; ratingCount: number }` | Read directly off `DoctorProfile.avgRating`/`ratingCount` — these are already maintained by Phase 6's post-completion rating flow; no need to recompute an all-time average independently |
| `patientVolume` | `{ totalDistinctPatients: number; newPatients: number; returningPatients: number }` | Distinct `patientId` values on this doctor's appointments in the trailing 90 days; a patient is "returning" if they have any appointment with this doctor whose `slotStart` predates the window, else "new" |

**Window:** a fixed trailing **90 days**, no query parameters. Mirrors the
admin endpoint's own fixed 14-day window for `appointmentsPerDay` (no
`?from=&to=` there either) — keeps the aggregation and the test surface
small, and avoids adding a new Zod query schema for a single optional
dashboard card. If a doctor later wants a custom range, that is a follow-up,
not part of this scope.

**Week bucketing:** `$dateToString` with format `'%G-W%V'` (ISO week-year +
ISO week number) — the same Mongo aggregation operator family
`analytics.service.ts` already uses for `appointmentsPerDay`
(`$dateToString: { format: '%Y-%m-%d', date: '$slotStart' }`), just a
different format string. No new operator, no `$dateTrunc`.

### 2. Earnings definition and its stated limitation

`estimatedEarnings = completedCount × DoctorProfile.consultationFee` for
that week. `consultationFee` is read once per request (current value, not a
historical snapshot) — if a doctor changes their fee, past weeks re-price at
the *current* fee, not what was actually charged at the time. This is an
accepted simplification for an estimate feature with no real transaction
ledger to snapshot from; it is called out in the API response itself via a
static `disclaimer` string (see §4) and in the dashboard UI copy, so it is
never presented as reconciled revenue.

### 3. Endpoint shape and RBAC

```
GET /api/doctors/me/analytics
```

Added to `apps/api/src/modules/doctors/doctors.routes.ts`, inside the
existing `doctorsRouter.use(requireAuth, requireRole('doctor'))` block
(same block that already guards `GET /me` and `PUT /me`) — no new
middleware needed, and no `:id`/`:doctorId` route parameter exists at all.
This is the load-bearing security property: the query is derived entirely
from `req.user.id` → `DoctorProfile.findOne({ userId: req.user!.id })`,
the exact lookup `getMyProfile`/`upsertMyProfile` already perform
(`doctors.controller.ts:9-16`). There is no code path by which a doctor's
own request can name a different doctor's profile — cross-doctor leakage
isn't a check that can be forgotten, because there is nothing in the
request to check against. If the caller's `DoctorProfile` doesn't exist yet
(a doctor who registered but never called `PUT /me`), the handler responds
`404 DOCTOR_PROFILE_NOT_FOUND`, matching `uploadVerificationDocs`'s existing
404 convention (`doctors.controller.ts:40`).

Response is a single summary object (not a list) — same precedent as
`GET /api/admin/analytics`, which also isn't paginated because CLAUDE.md
§3's "every list endpoint: pagination + sort" applies to list endpoints,
and a one-row-per-doctor summary isn't one.

### 4. Response type

```ts
// apps/api/src/modules/doctors/doctor-analytics.service.ts
export interface DoctorAnalyticsSummary {
  windowDays: 90;
  disclaimer: string; // static string explaining estimatedEarnings is projected, not real payment data
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
```

Not added to `packages/shared` — `AnalyticsSummary` (the admin equivalent)
is likewise defined only as a plain TS interface duplicated in
`apps/api/src/modules/admin/analytics.service.ts` and
`apps/web/src/store/adminApi.ts`, not a Zod schema in the shared package
(there is no request body to validate; it's a GET with no input). This
feature follows the same precedent rather than introducing a new pattern.

### 5. Reuse vs. duplication — decided: small parallel service, shared patterns

The admin `getAnalytics()` function (`analytics.service.ts:13-57`) is
purpose-built for admin-wide questions: registrations *by role*, top
specialties *across all doctors* (via a `$lookup` into `DoctorProfile`),
and triage-session conversion *across all patients*. None of its four
aggregations scope down to a single doctor by adding a parameter — the
registrations aggregation has no doctor dimension at all, and the
specialties aggregation's `$lookup`/`$unwind` exists specifically to fan
appointments out *across* doctors, the opposite of what a single-doctor
view needs. Threading an optional `doctorId` through `getAnalytics()` would
turn one function into two unrelated code paths glued together by an `if`,
which is worse than two small, honest functions.

Decision: a new file, `apps/api/src/modules/doctors/doctor-analytics.service.ts`,
with its own `getDoctorAnalytics(doctorId: Types.ObjectId)`. It reuses the
admin service's *aggregation patterns*, not its code:
- The same `$group` + `$dateToString` date-bucketing shape (§1).
- The same `total > 0 ? … : 0` divide-by-zero guard for
  `noShowCancellationRate` that `analytics.service.ts` already uses for
  `conversionRate`.
- The same "read straight off the model" shortcut `analytics.service.ts`
  doesn't currently use but the `Rating`-flow precedent (`DoctorProfile.avgRating`
  already recomputed by Phase 6) makes obviously correct for `currentRating`
  — no reason to re-aggregate `Rating` for an all-time average that already
  lives on the doctor's own document.

No changes to `analytics.service.ts` or the admin route/controller.

### 6. Aggregation pipeline sketch (for the implementation task, not exhaustive)

```ts
const windowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

const earningsByWeekAgg = await Appointment.aggregate([
  { $match: { doctorId, status: 'completed', slotStart: { $gte: windowStart } } },
  { $group: { _id: { $dateToString: { format: '%G-W%V', date: '$slotStart' } }, completedCount: { $sum: 1 } } },
  { $sort: { _id: 1 } },
]);
// estimatedEarnings = completedCount * doctorProfile.consultationFee, computed in JS after the aggregate

const breakdownAgg = await Appointment.aggregate([
  { $match: { doctorId, slotStart: { $gte: windowStart } } },
  { $group: { _id: '$status', count: { $sum: 1 } } },
]);
// reduce into { completed, cancelled, noShow, rejected, requested, confirmed }, defaulting missing statuses to 0

const ratingTrendAgg = await Rating.aggregate([
  { $match: { doctorId, createdAt: { $gte: windowStart } } },
  { $group: { _id: { $dateToString: { format: '%G-W%V', date: '$createdAt' } }, avgScore: { $avg: '$score' }, count: { $sum: 1 } } },
  { $sort: { _id: 1 } },
]);

const distinctPatientIds = await Appointment.distinct('patientId', { doctorId, slotStart: { $gte: windowStart } });
// for each, check Appointment.exists({ doctorId, patientId, slotStart: { $lt: windowStart } }) to classify new vs returning
```

`doctorId` throughout is the caller's own `DoctorProfile._id` (resolved
from `req.user.id` per §3) — per the roadmap's documented convention,
`Appointment.doctorId`/`Rating.doctorId` reference `DoctorProfile._id`, not
`User._id` (`2026-07-27-roadmap.md`, "Phase 2 booking" gap note).

### 7. Frontend

- `apps/web/src/store/doctorsApi.ts` gets a new `getMyAnalytics` RTK Query
  endpoint (`query: () => '/doctors/me/analytics'`), same shape as
  `adminApi.ts`'s `getAnalytics`.
- `apps/web/src/app/dashboard/doctor/page.tsx` gets a new "My Analytics"
  `Card` section, placed after the existing "Confirmed appointments"
  section, rendered as plain text/number rows — directly mirroring the
  admin dashboard's existing Analytics `Card` (`admin/page.tsx:71-99`):
  a line per metric, no visualization library. The disclaimer string from
  the API response is rendered as a small muted caption under the earnings
  rows so a doctor never mistakes the projected figure for a bank balance.

### 8. Test coverage (mirrors `admin.test.ts`'s existing pattern)

`apps/api/src/modules/doctors/doctors.test.ts` gets a new
`describe('GET /api/doctors/me/analytics', …)` block, following the same
structure `admin.test.ts` uses for `GET /api/admin/analytics`
(register/approve a doctor, seed `Appointment`/`Rating` fixtures directly
via the Mongoose models, hit the endpoint with cookies, assert on response
shape and computed values) — see the implementation plan for the exact
cases.

## Open questions

- **Charts later?** If a future pass wants real charts instead of number
  rows, that means picking and installing a charting library first (none
  exists today) — explicitly out of scope here per Goal 3's rationale.
- **Historical fee snapshot?** If a real payments system is ever added
  (Phase 8+ per CLAUDE.md §0.4), `estimatedEarnings` should be replaced by
  actual transaction sums rather than `count × currentFee`. Not addressed
  here since no such system exists to integrate with.
