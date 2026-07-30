# Phase 5 — Lab Referral Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After writing a prescription with recommended tests, a doctor picks a
lab (matched by which tests it offers), which creates an unguessable-token
`LabReferral`. The patient follows the link to a public landing page with the
referred tests pre-selected and priced, books (with home collection if the
lab offers it), and the lab's own dashboard tracks the booking through a
status pipeline ending in a report upload — which notifies both the patient
and the referring doctor, closing the loop. A patient can also book any lab
directly, with no referral at all.

**Architecture:** Pure Node/Express/Mongoose work, no new service. A new
`apps/api/src/modules/labReferrals/` module owns referral creation (doctor
picks a lab for a prescription's recommended tests) and the public,
token-based referral lookup. A new `apps/api/src/modules/labBookings/` module
owns booking creation (from a referral or as a walk-in) and the lab's own
status-pipeline transitions (booked → sample_collected → report_ready, with a
file upload on the last step). A small `createNotification` helper is added
since this is the first phase to actually write `Notification` documents as a
real side effect (Phase 1 only ever seeded them; the notification-center UI
itself is explicitly Phase 6's scope, not this phase's).

**Tech Stack:** Existing stack only. `nanoid` is already a dependency (used
for JWT `jti`s) — reused here for the referral token.

## Global Constraints

- TypeScript strict everywhere; no `any`.
- Zod schemas in `packages/shared` are the single source of truth for new API
  contracts.
- **Closes a gap flagged by an earlier phase's review:** `LabBooking.status`
  is currently a bare `string` while every other status field in this
  codebase (`Appointment.status`, `LabReferral.status`) is a literal union +
  Mongoose `enum`. Fix this in Task 1, before anything else references it.
- `LabReferral.token` is unguessable (nanoid, 21 chars by default — no need
  to widen it) and must never be derivable from the referral's own `_id` or
  any other public field.
- The public referral-lookup and booking-creation-from-referral endpoints are
  unauthenticated (a patient clicking a link from a notification/PDF has no
  session yet) — apply the same per-route rate-limiting pattern already
  established for `GET /api/prescriptions/verify/:id` in Phase 4
  (`SimpleRedisStore` with its own key prefix), since this is the second
  unauthenticated surface in the API.
- Every cross-role action leaves an audit trail (referral creation, booking
  creation, report upload).
- Every list endpoint: pagination + sort from day 1, matching the established
  pattern (`page`/`limit`/`total`, capped `limit`).
- A `LabProfile`'s tests are looked up by `code` (string, e.g. `"CBC"`), not
  by a separate test-catalog id — matching the existing `ILabTest` shape from
  Phase 1 (`{code, name, price, turnaroundHours, description}` embedded
  directly on `LabProfile.tests`).
- File uploads follow the existing `apps/api/src/modules/doctors/upload.ts`
  pattern: `fs.mkdirSync(dir, {recursive: true})` at module load, disk storage
  under `apps/api/uploads/`, MIME/size validation. Given Phase 4's final
  review found a real bypass where a Phase-1-era static mount served an
  unrelated upload directory to any doctor/admin, lab report PDFs must NOT be
  placed under a path any blanket static mount could serve — store them under
  `apps/api/uploads/lab-reports/` and serve them ONLY through a dedicated,
  ownership-scoped route (`GET /api/lab-bookings/:id/report`), never via
  `express.static`.

---

## File Structure

```
packages/shared/src/schemas/
└── labReferral.ts              # NEW: CreateLabReferralInput, CreateLabBookingInput, UpdateBookingStatusInput

apps/api/src/models/
└── LabBooking.ts                # MODIFY: status: string -> LabBookingStatus union + enum

apps/api/src/lib/
└── notifications.ts             # NEW: createNotification(...) helper

apps/api/src/modules/labReferrals/
├── labReferrals.service.ts       # createReferral, getReferralByToken (marks 'opened'), listReferralsForDoctor
├── labReferrals.controller.ts
├── labReferrals.routes.ts
└── labReferrals.test.ts

apps/api/src/modules/labBookings/
├── labBookings.service.ts        # createBooking (referral or walk-in), listBookingsForLab, updateBookingStatus, uploadReport, getReportPath
├── labBookings.controller.ts
├── labBookings.routes.ts
├── labBookings.upload.ts         # multer config for report PDFs
└── labBookings.test.ts

apps/api/src/app.ts                # MODIFY: mount labReferralsRouter, labBookingsRouter

apps/web/src/store/
├── labReferralsApi.ts
└── labBookingsApi.ts

apps/web/src/app/
├── prescriptions/[id]/refer/page.tsx     # doctor-only: pick a lab for a just-written prescription's recommended tests
├── r/[token]/page.tsx                    # public referral landing page (tests pre-selected, priced, book)
├── labs/[id]/book/page.tsx               # walk-in booking (no referral) — pick tests + book directly
└── dashboard/lab/page.tsx                # lab's own dashboard: incoming referrals + bookings, status actions, report upload

apps/web/src/app/appointments/[id]/prescribe/page.tsx  # MODIFY: after creating a prescription with recommendedTests, redirect to the refer page instead of the dashboard
apps/web/src/app/dashboard/patient/timeline/page.tsx   # MODIFY: include lab referrals/bookings in the chronological view
apps/web/src/app/prescriptions/[id]/page.tsx           # MODIFY: show referral status timeline if the prescription has one

apps/api/src/seed/seed.ts          # MODIFY: add Phase 5's 3 LabReferrals + LabBookings + a dummy report PDF
apps/api/src/seed/assets/report_sample.pdf  # NEW: generated once via pdf-lib, per CLAUDE.md §6.5
```

---

### Task 1: `LabBooking.status` typing fix + shared Zod schemas

**Files:**
- Modify: `apps/api/src/models/LabBooking.ts`
- Create: `packages/shared/src/schemas/labReferral.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/models/models.test.ts` (append), `packages/shared/src/schemas/schemas.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `LabBookingStatus` union type, `ILabBooking.status: LabBookingStatus` — consumed by Task 5's booking service; `CreateLabReferralInput`, `CreateLabBookingInput`, `UpdateBookingStatusInput` — consumed by later tasks' routes.

This closes the gap flagged by an earlier phase's review: `LabBooking.status` was a bare `string`, unlike every other status field in this codebase.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/models/models.test.ts (append)
import { LabBooking } from './LabBooking';

describe('LabBooking model', () => {
  it('defaults status to booked and rejects an invalid status value', async () => {
    const booking = await LabBooking.create({
      patientId: new mongoose.Types.ObjectId(),
      labId: new mongoose.Types.ObjectId(),
      testCodes: ['CBC'],
      totalPrice: 250,
      scheduledAt: new Date(),
      homeCollection: false,
    });
    expect(booking.status).toBe('booked');

    await expect(
      LabBooking.create({
        patientId: new mongoose.Types.ObjectId(),
        labId: new mongoose.Types.ObjectId(),
        testCodes: ['CBC'],
        totalPrice: 250,
        scheduledAt: new Date(),
        homeCollection: false,
        status: 'not_a_real_status',
      })
    ).rejects.toThrow();
  });
});
```

```ts
// packages/shared/src/schemas/schemas.test.ts (append)
import { CreateLabReferralInput, CreateLabBookingInput, UpdateBookingStatusInput } from './labReferral';

describe('CreateLabReferralInput', () => {
  it('requires a labId and at least one test code', () => {
    expect(CreateLabReferralInput.safeParse({ labId: 'x', testCodes: [] }).success).toBe(false);
    expect(CreateLabReferralInput.safeParse({ labId: 'x', testCodes: ['CBC'] }).success).toBe(true);
  });
});

describe('CreateLabBookingInput', () => {
  it('requires at least one test code and a scheduled date', () => {
    expect(
      CreateLabBookingInput.safeParse({ testCodes: ['CBC'], scheduledAt: new Date().toISOString(), homeCollection: false }).success
    ).toBe(true);
    expect(CreateLabBookingInput.safeParse({ testCodes: [], scheduledAt: new Date().toISOString(), homeCollection: false }).success).toBe(false);
  });
});

describe('UpdateBookingStatusInput', () => {
  it('only accepts the pipeline statuses a lab can set', () => {
    expect(UpdateBookingStatusInput.safeParse({ status: 'sample_collected' }).success).toBe(true);
    expect(UpdateBookingStatusInput.safeParse({ status: 'booked' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- models.test.ts` and `npm run test --workspace=@medlink/shared`
Expected: FAIL — invalid status string currently persists successfully; shared schema module not found.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/models/LabBooking.ts (modify)
export type LabBookingStatus = 'booked' | 'sample_collected' | 'report_ready' | 'cancelled';

export interface ILabBooking {
  _id: Types.ObjectId;
  referralId?: Types.ObjectId;
  patientId: Types.ObjectId;
  labId: Types.ObjectId;
  testCodes: string[];
  totalPrice: number;
  scheduledAt: Date;
  homeCollection: boolean;
  status: LabBookingStatus;
  reportUrl?: string;
}

// ...inside labBookingSchema, replace the status field:
  status: { type: String, enum: ['booked', 'sample_collected', 'report_ready', 'cancelled'], default: 'booked' },
```

```ts
// packages/shared/src/schemas/labReferral.ts
import { z } from 'zod';

export const CreateLabReferralInput = z.object({
  labId: z.string().min(1),
  testCodes: z.array(z.string().min(1)).min(1),
});
export type CreateLabReferralInput = z.infer<typeof CreateLabReferralInput>;

export const CreateLabBookingInput = z.object({
  testCodes: z.array(z.string().min(1)).min(1),
  scheduledAt: z.coerce.date(),
  homeCollection: z.boolean(),
});
export type CreateLabBookingInput = z.infer<typeof CreateLabBookingInput>;

export const UpdateBookingStatusInput = z.object({
  status: z.enum(['sample_collected', 'report_ready']),
});
export type UpdateBookingStatusInput = z.infer<typeof UpdateBookingStatusInput>;
```

```ts
// packages/shared/src/index.ts (add line)
export * from './schemas/labReferral';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- models.test.ts` and `npm run test --workspace=@medlink/shared`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/models/LabBooking.ts packages/shared/src/schemas/labReferral.ts packages/shared/src/index.ts apps/api/src/models/models.test.ts packages/shared/src/schemas/schemas.test.ts
git commit -m "fix(api,shared): type LabBooking.status as a real union+enum, add lab referral/booking Zod schemas"
```

---

### Task 2: `createNotification` helper

**Files:**
- Create: `apps/api/src/lib/notifications.ts`, `apps/api/src/lib/notifications.test.ts`

**Interfaces:**
- Consumes: `Notification` model (already exists from Phase 1).
- Produces: `createNotification(params: {userId: string; type: string; title: string; body: string; link?: string}): Promise<void>` — consumed by Tasks 3 and 6.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/notifications.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createNotification } from './notifications';
import { Notification } from '../models/Notification';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterEach(async () => {
  await Notification.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('createNotification', () => {
  it('persists a notification with the given fields', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    await createNotification({
      userId, type: 'lab_referral_sent', title: 'Lab referral ready',
      body: 'Your doctor recommended a lab test.', link: '/r/abc123',
    });

    const notifications = await Notification.find({ userId });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe('lab_referral_sent');
    expect(notifications[0]!.readAt).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- notifications.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/lib/notifications.ts
import { Types } from 'mongoose';
import { Notification } from '../models/Notification';

export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  await Notification.create({
    userId: new Types.ObjectId(params.userId),
    type: params.type,
    title: params.title,
    body: params.body,
    link: params.link,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- notifications.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/notifications.ts apps/api/src/lib/notifications.test.ts
git commit -m "feat(api): createNotification helper"
```

---

### Task 3: Lab referral creation (`createReferral`)

**Files:**
- Create: `apps/api/src/modules/labReferrals/labReferrals.service.ts`, `labReferrals.test.ts`

**Interfaces:**
- Consumes: `Prescription`, `DoctorProfile`, `LabProfile`, `createNotification` (Task 2).
- Produces: `createReferral(doctorUserId: string, prescriptionId: string, labId: string, testCodes: string[]): Promise<ILabReferral>` — consumed by Task 6's controller.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/labReferrals/labReferrals.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createReferral } from './labReferrals.service';
import { User } from '../../models/User';
import { DoctorProfile } from '../../models/DoctorProfile';
import { LabProfile } from '../../models/LabProfile';
import { Prescription } from '../../models/Prescription';
import { LabReferral } from '../../models/LabReferral';
import { Notification } from '../../models/Notification';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await LabReferral.init();
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function seedPrescriptionAndLab() {
  const doctorUser = await User.create({ role: 'doctor', email: `doc-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Test' });
  const patientUser = await User.create({ role: 'patient', email: `pat-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Patient Test' });
  const doctorProfile = await DoctorProfile.create({
    userId: doctorUser._id, specialties: ['General Physician'], qualifications: ['MBBS'], regNo: 'DMC/R/12345',
    experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
    consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
  });
  const labUser = await User.create({ role: 'lab', email: `lab-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'HealthFirst' });
  const labProfile = await LabProfile.create({
    userId: labUser._id, labName: 'HealthFirst Diagnostics', address: 'A', city: 'Noida',
    geo: { lat: 1, lng: 1 }, timings: '07:00-21:00', homeCollection: true, verificationStatus: 'approved',
    tests: [{ code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6 }],
  });
  const prescription = await Prescription.create({
    appointmentId: new mongoose.Types.ObjectId(), doctorId: doctorProfile._id, patientId: patientUser._id,
    diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    recommendedTests: [{ testName: 'Complete Blood Count' }],
  });
  return { doctorUser, patientUser, doctorProfile, labProfile, prescription };
}

describe('createReferral', () => {
  it('creates a referral with an unguessable token and notifies the patient', async () => {
    const { doctorUser, patientUser, prescription, labProfile } = await seedPrescriptionAndLab();

    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);

    expect(referral.token).toBeTruthy();
    expect(referral.token.length).toBeGreaterThanOrEqual(20);
    expect(referral.status).toBe('sent');
    expect(referral.suggestedTestCodes).toEqual(['CBC']);
    expect(referral.patientId.toString()).toBe(patientUser._id.toString());

    const updatedPrescription = await Prescription.findById(prescription._id);
    expect(updatedPrescription!.recommendedTests[0]!.labReferralId!.toString()).toBe(referral._id.toString());

    const notifications = await Notification.find({ userId: patientUser._id });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.link).toBe(`/r/${referral.token}`);
  });

  it('rejects a doctor who did not write the prescription', async () => {
    const { prescription, labProfile } = await seedPrescriptionAndLab();
    const otherDoctorUser = await User.create({ role: 'doctor', email: `other-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Other' });
    await DoctorProfile.create({
      userId: otherDoctorUser._id, specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: 'DMC/R/54321',
      experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
      consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
    });

    await expect(
      createReferral(otherDoctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC'])
    ).rejects.toThrow();
  });

  it('rejects a lab that does not offer the requested test code', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();

    await expect(
      createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['LFT'])
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- labReferrals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/labReferrals/labReferrals.service.ts
import { nanoid } from 'nanoid';
import { LabReferral, ILabReferral } from '../../models/LabReferral';
import { Prescription } from '../../models/Prescription';
import { DoctorProfile } from '../../models/DoctorProfile';
import { LabProfile } from '../../models/LabProfile';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';
import { createNotification } from '../../lib/notifications';

export async function createReferral(
  doctorUserId: string,
  prescriptionId: string,
  labId: string,
  testCodes: string[]
): Promise<ILabReferral> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const prescription = await Prescription.findOne({ _id: prescriptionId, doctorId: doctorProfile._id });
  if (!prescription) throw new AppError(404, 'Prescription not found', 'PRESCRIPTION_NOT_FOUND');

  const lab = await LabProfile.findOne({ _id: labId, verificationStatus: 'approved' });
  if (!lab) throw new AppError(404, 'Lab not found', 'LAB_NOT_FOUND');

  const labTestCodes = new Set(lab.tests.map((t) => t.code));
  const unavailable = testCodes.filter((code) => !labTestCodes.has(code));
  if (unavailable.length > 0) {
    throw new AppError(400, `This lab does not offer: ${unavailable.join(', ')}`, 'TEST_NOT_OFFERED');
  }

  const referral = await LabReferral.create({
    prescriptionId: prescription._id,
    doctorId: doctorProfile._id,
    patientId: prescription.patientId,
    labId: lab._id,
    suggestedTestCodes: testCodes,
    token: nanoid(),
    status: 'sent',
    timeline: [{ status: 'sent', at: new Date() }],
  });

  // Link the referral back onto the prescription's recommendedTests entries
  // whose testName matches one of the referred lab tests, so the patient's
  // prescription view can show "referred" status per test.
  const referredTestNames = new Set(
    lab.tests.filter((t) => testCodes.includes(t.code)).map((t) => t.name)
  );
  prescription.recommendedTests = prescription.recommendedTests.map((rt) =>
    referredTestNames.has(rt.testName) ? { ...rt, labReferralId: referral._id } : rt
  );
  await prescription.save();

  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'lab_referral.created',
    entityType: 'LabReferral', entityId: referral._id.toString(),
    meta: { prescriptionId: prescription._id.toString(), labId: lab._id.toString() },
  });

  await createNotification({
    userId: prescription.patientId.toString(),
    type: 'lab_referral_sent',
    title: 'Your doctor has recommended a lab test',
    body: `${lab.labName} offers the recommended test(s). Tap to book.`,
    link: `/r/${referral.token}`,
  });

  return referral;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- labReferrals.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/labReferrals/labReferrals.service.ts apps/api/src/modules/labReferrals/labReferrals.test.ts
git commit -m "feat(api): createReferral service (nanoid token, prescription linkage, patient notification)"
```

---

### Task 4: Public referral lookup by token (`getReferralByToken`)

**Files:**
- Modify: `apps/api/src/modules/labReferrals/labReferrals.service.ts`, `labReferrals.test.ts`

**Interfaces:**
- Consumes: `LabReferral`, `LabProfile` models.
- Produces: `getReferralByToken(token: string): Promise<{referral: ILabReferral; lab: {labName: string; city: string; homeCollection: boolean}; tests: ILabTest[]; totalPrice: number} | null>` (marks the referral `'opened'` on first lookup) — consumed by Task 9's public route and the frontend `/r/[token]` page.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/labReferrals/labReferrals.test.ts (append)
import { getReferralByToken } from './labReferrals.service';

describe('getReferralByToken', () => {
  it('returns the lab, referred tests, and total price, marking the referral opened on first view', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    expect(referral.status).toBe('sent');

    const result = await getReferralByToken(referral.token);

    expect(result).not.toBeNull();
    expect(result!.lab.labName).toBe('HealthFirst Diagnostics');
    expect(result!.tests).toHaveLength(1);
    expect(result!.tests[0]!.code).toBe('CBC');
    expect(result!.totalPrice).toBe(250);

    const reloaded = await LabReferral.findById(referral._id);
    expect(reloaded!.status).toBe('opened');
    expect(reloaded!.timeline.map((t) => t.status)).toContain('opened');
  });

  it('does not regress status from booked/further back to opened on a re-view', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    await LabReferral.findByIdAndUpdate(referral._id, { status: 'booked', $push: { timeline: { status: 'booked', at: new Date() } } });

    await getReferralByToken(referral.token);

    const reloaded = await LabReferral.findById(referral._id);
    expect(reloaded!.status).toBe('booked');
  });

  it('returns null for an unknown token', async () => {
    const result = await getReferralByToken('nonexistent-token-xyz');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- labReferrals.test.ts`
Expected: FAIL — function not exported.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/labReferrals/labReferrals.service.ts (append)
import { ILabTest } from '../../models/LabProfile';

export async function getReferralByToken(token: string): Promise<{
  referral: ILabReferral;
  lab: { labName: string; city: string; homeCollection: boolean };
  tests: ILabTest[];
  totalPrice: number;
} | null> {
  const referral = await LabReferral.findOne({ token });
  if (!referral) return null;

  const lab = await LabProfile.findById(referral.labId);
  if (!lab) return null;

  // Only advance status to 'opened' the first time -- a referral that's
  // already progressed further in the pipeline (booked, sample_collected,
  // etc.) must never regress on a later re-view of the same link.
  if (referral.status === 'sent') {
    referral.status = 'opened';
    referral.timeline.push({ status: 'opened', at: new Date() });
    await referral.save();
  }

  const tests = lab.tests.filter((t) => referral.suggestedTestCodes.includes(t.code));
  const totalPrice = tests.reduce((sum, t) => sum + t.price, 0);

  return {
    referral,
    lab: { labName: lab.labName, city: lab.city, homeCollection: lab.homeCollection },
    tests,
    totalPrice,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- labReferrals.test.ts`
Expected: PASS (all tests, now 6)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/labReferrals/labReferrals.service.ts apps/api/src/modules/labReferrals/labReferrals.test.ts
git commit -m "feat(api): public referral lookup by token, marks opened without regressing later statuses"
```

---

### Task 5: Lab booking creation (referral-linked and walk-in) + status pipeline

**Files:**
- Create: `apps/api/src/modules/labBookings/labBookings.service.ts`, `labBookings.test.ts`

**Interfaces:**
- Consumes: `LabBooking`, `LabReferral`, `LabProfile` models, `createNotification`, `logAudit`.
- Produces: `createBooking(patientUserId: string, labId: string, input: CreateLabBookingInput, referralToken?: string): Promise<ILabBooking>`, `updateBookingStatus(labUserId: string, bookingId: string, status: 'sample_collected' | 'report_ready', reportPath?: string): Promise<ILabBooking>` — consumed by Task 6's controller.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/labBookings/labBookings.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createBooking, updateBookingStatus } from './labBookings.service';
import { createReferral, getReferralByToken } from '../labReferrals/labReferrals.service';
import { User } from '../../models/User';
import { DoctorProfile } from '../../models/DoctorProfile';
import { LabProfile } from '../../models/LabProfile';
import { Prescription } from '../../models/Prescription';
import { LabReferral } from '../../models/LabReferral';
import { LabBooking } from '../../models/LabBooking';
import { Notification } from '../../models/Notification';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await LabReferral.init();
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function seedLabAndPrescription() {
  const doctorUser = await User.create({ role: 'doctor', email: `doc-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Test' });
  const patientUser = await User.create({ role: 'patient', email: `pat-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Patient Test' });
  const doctorProfile = await DoctorProfile.create({
    userId: doctorUser._id, specialties: ['General Physician'], qualifications: ['MBBS'], regNo: 'DMC/R/12345',
    experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
    consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
  });
  const labUser = await User.create({ role: 'lab', email: `lab-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'HealthFirst' });
  const labProfile = await LabProfile.create({
    userId: labUser._id, labName: 'HealthFirst Diagnostics', address: 'A', city: 'Noida',
    geo: { lat: 1, lng: 1 }, timings: '07:00-21:00', homeCollection: true, verificationStatus: 'approved',
    tests: [{ code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6 }],
  });
  const prescription = await Prescription.create({
    appointmentId: new mongoose.Types.ObjectId(), doctorId: doctorProfile._id, patientId: patientUser._id,
    diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    recommendedTests: [{ testName: 'Complete Blood Count' }],
  });
  return { doctorUser, patientUser, labUser, labProfile, prescription };
}

describe('createBooking', () => {
  it('creates a walk-in booking with a computed total price', async () => {
    const { patientUser, labProfile } = await seedLabAndPrescription();

    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    });

    expect(booking.totalPrice).toBe(250);
    expect(booking.status).toBe('booked');
    expect(booking.referralId).toBeUndefined();
  });

  it('creates a referral-linked booking and transitions the referral to booked', async () => {
    const { doctorUser, patientUser, labProfile, prescription } = await seedLabAndPrescription();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    await getReferralByToken(referral.token); // simulate the patient opening the link first

    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: true,
    }, referral.token);

    expect(booking.referralId!.toString()).toBe(referral._id.toString());

    const reloadedReferral = await LabReferral.findById(referral._id);
    expect(reloadedReferral!.status).toBe('booked');
  });

  it('rejects home collection when the lab does not offer it', async () => {
    const { patientUser, labProfile } = await seedLabAndPrescription();
    labProfile.homeCollection = false;
    await labProfile.save();

    await expect(
      createBooking(patientUser._id.toString(), labProfile._id.toString(), {
        testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: true,
      })
    ).rejects.toThrow();
  });
});

describe('updateBookingStatus', () => {
  it('transitions a booking through the pipeline and notifies patient + doctor on report_ready', async () => {
    const { doctorUser, patientUser, labUser, labProfile, prescription } = await seedLabAndPrescription();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    }, referral.token);

    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'sample_collected');
    const afterCollection = await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'report_ready', '/uploads/lab-reports/fake.pdf');

    expect(afterCollection.status).toBe('report_ready');
    expect(afterCollection.reportUrl).toBe('/uploads/lab-reports/fake.pdf');

    const reloadedReferral = await LabReferral.findById(referral._id);
    expect(reloadedReferral!.status).toBe('report_ready');
    expect(reloadedReferral!.reportUrl).toBe('/uploads/lab-reports/fake.pdf');

    const patientNotifications = await Notification.find({ userId: patientUser._id, type: 'lab_report_ready' });
    const doctorNotifications = await Notification.find({ userId: doctorUser._id, type: 'lab_report_ready' });
    expect(patientNotifications).toHaveLength(1);
    expect(doctorNotifications).toHaveLength(1);
  });

  it('rejects a lab updating a booking that is not its own', async () => {
    const { patientUser, labProfile } = await seedLabAndPrescription();
    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    });
    const otherLabUser = await User.create({ role: 'lab', email: `otherlab-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Other Lab' });

    await expect(updateBookingStatus(otherLabUser._id.toString(), booking._id.toString(), 'sample_collected')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- labBookings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/labBookings/labBookings.service.ts
import { LabBooking, ILabBooking, LabBookingStatus } from '../../models/LabBooking';
import { LabReferral } from '../../models/LabReferral';
import { LabProfile } from '../../models/LabProfile';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';
import { createNotification } from '../../lib/notifications';
import type { CreateLabBookingInput } from '@medlink/shared';

export async function createBooking(
  patientUserId: string,
  labId: string,
  input: CreateLabBookingInput,
  referralToken?: string
): Promise<ILabBooking> {
  const lab = await LabProfile.findOne({ _id: labId, verificationStatus: 'approved' });
  if (!lab) throw new AppError(404, 'Lab not found', 'LAB_NOT_FOUND');

  if (input.homeCollection && !lab.homeCollection) {
    throw new AppError(400, 'This lab does not offer home collection', 'HOME_COLLECTION_NOT_OFFERED');
  }

  const labTestsByCode = new Map(lab.tests.map((t) => [t.code, t]));
  const unavailable = input.testCodes.filter((code) => !labTestsByCode.has(code));
  if (unavailable.length > 0) {
    throw new AppError(400, `This lab does not offer: ${unavailable.join(', ')}`, 'TEST_NOT_OFFERED');
  }
  const totalPrice = input.testCodes.reduce((sum, code) => sum + labTestsByCode.get(code)!.price, 0);

  let referralId: string | undefined;
  if (referralToken) {
    const referral = await LabReferral.findOne({ token: referralToken, patientId: patientUserId });
    if (!referral) throw new AppError(404, 'Referral not found', 'REFERRAL_NOT_FOUND');
    referralId = referral._id.toString();
  }

  const booking = await LabBooking.create({
    referralId,
    patientId: patientUserId,
    labId: lab._id,
    testCodes: input.testCodes,
    totalPrice,
    scheduledAt: input.scheduledAt,
    homeCollection: input.homeCollection,
    status: 'booked',
  });

  if (referralId) {
    await LabReferral.findByIdAndUpdate(referralId, {
      $set: { status: 'booked' },
      $push: { timeline: { status: 'booked', at: new Date() } },
    });
  }

  await logAudit({
    actorId: patientUserId, actorRole: 'patient', action: 'lab_booking.created',
    entityType: 'LabBooking', entityId: booking._id.toString(),
    meta: { labId: lab._id.toString(), referralId },
  });

  return booking;
}

export async function updateBookingStatus(
  labUserId: string,
  bookingId: string,
  status: Extract<LabBookingStatus, 'sample_collected' | 'report_ready'>,
  reportPath?: string
): Promise<ILabBooking> {
  const lab = await LabProfile.findOne({ userId: labUserId });
  if (!lab) throw new AppError(404, 'Lab profile not found', 'PROFILE_NOT_FOUND');

  const booking = await LabBooking.findOne({ _id: bookingId, labId: lab._id });
  if (!booking) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');

  booking.status = status;
  if (status === 'report_ready' && reportPath) {
    booking.reportUrl = reportPath;
  }
  await booking.save();

  if (booking.referralId) {
    const update: Record<string, unknown> = { $set: { status }, $push: { timeline: { status, at: new Date() } } };
    if (status === 'report_ready' && reportPath) {
      (update.$set as Record<string, unknown>).reportUrl = reportPath;
    }
    await LabReferral.findByIdAndUpdate(booking.referralId, update);

    if (status === 'report_ready') {
      const referral = await LabReferral.findById(booking.referralId);
      if (referral) {
        const doctorProfile = await DoctorProfile.findById(referral.doctorId);
        await createNotification({
          userId: referral.patientId.toString(), type: 'lab_report_ready',
          title: 'Your lab report is ready', body: `${lab.labName} has uploaded your report.`,
          link: `/dashboard/patient/timeline`,
        });
        if (doctorProfile) {
          await createNotification({
            userId: doctorProfile.userId.toString(), type: 'lab_report_ready',
            title: 'A patient\'s lab report is ready', body: `${lab.labName} uploaded a report for a referral you sent.`,
            link: `/prescriptions/${referral.prescriptionId.toString()}`,
          });
        }
      }
    }
  }

  await logAudit({
    actorId: labUserId, actorRole: 'lab', action: 'lab_booking.status_updated',
    entityType: 'LabBooking', entityId: booking._id.toString(), meta: { status },
  });

  return booking;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- labBookings.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/labBookings/labBookings.service.ts apps/api/src/modules/labBookings/labBookings.test.ts
git commit -m "feat(api): lab booking creation (referral-linked + walk-in) and status pipeline with dual notification on report_ready"
```

---

### Task 6: Report upload (multer) + `getReportPath` (ownership-scoped)

**Files:**
- Create: `apps/api/src/modules/labBookings/labBookings.upload.ts`
- Modify: `apps/api/src/modules/labBookings/labBookings.service.ts`, `labBookings.test.ts`

**Interfaces:**
- Consumes: nothing new (multer, matching `apps/api/src/modules/doctors/upload.ts`'s pattern).
- Produces: `labReportUpload` (multer middleware), `getReportPath(bookingId: string, requestingUserId: string, requestingRole: string): Promise<string>` — consumed by Task 7's controller.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/labBookings/labBookings.test.ts (append)
import { getReportPath } from './labBookings.service';

describe('getReportPath', () => {
  it('allows the owning patient and the lab that issued the report to fetch the path', async () => {
    const { doctorUser, patientUser, labUser, labProfile, prescription } = await seedLabAndPrescription();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    }, referral.token);
    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'sample_collected');
    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'report_ready', '/uploads/lab-reports/fake.pdf');

    const asPatient = await getReportPath(booking._id.toString(), patientUser._id.toString(), 'patient');
    expect(asPatient).toContain('lab-reports');

    const asLab = await getReportPath(booking._id.toString(), labUser._id.toString(), 'lab');
    expect(asLab).toContain('lab-reports');
  });

  it('rejects a different patient fetching someone else\'s report', async () => {
    const { doctorUser, patientUser, labUser, labProfile, prescription } = await seedLabAndPrescription();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    }, referral.token);
    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'sample_collected');
    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'report_ready', '/uploads/lab-reports/fake.pdf');
    const otherPatient = await User.create({ role: 'patient', email: `other-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Other' });

    await expect(getReportPath(booking._id.toString(), otherPatient._id.toString(), 'patient')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- labBookings.test.ts`
Expected: FAIL — function not exported.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/labBookings/labBookings.upload.ts
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { AppError } from '../../lib/errors';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'lab-reports');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, _file, cb) => cb(null, `${req.params.id}.pdf`),
});

export const labReportUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new AppError(400, 'Report must be a PDF', 'BAD_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});
```

```ts
// apps/api/src/modules/labBookings/labBookings.service.ts (append)
import path from 'node:path';

export async function getReportPath(
  bookingId: string,
  requestingUserId: string,
  requestingRole: string
): Promise<string> {
  const booking = await LabBooking.findById(bookingId);
  if (!booking) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');

  let authorized = false;
  if (requestingRole === 'patient' && booking.patientId.toString() === requestingUserId) {
    authorized = true;
  } else if (requestingRole === 'lab') {
    const lab = await LabProfile.findOne({ userId: requestingUserId });
    if (lab && booking.labId.toString() === lab._id.toString()) authorized = true;
  }
  if (!authorized) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
  if (!booking.reportUrl) throw new AppError(404, 'Report not available', 'REPORT_NOT_AVAILABLE');

  return path.join(process.cwd(), booking.reportUrl.replace(/^\//, ''));
}
```

Note: `labReportUpload`'s `filename` callback names the file after the booking id from the route param, so `updateBookingStatus`'s call site (Task 7's controller) will construct the stored `reportUrl` as `/uploads/lab-reports/{bookingId}.pdf` deterministically, without needing the multer callback's result threaded back awkwardly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- labBookings.test.ts`
Expected: PASS (all tests, now 7)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/labBookings/labBookings.upload.ts apps/api/src/modules/labBookings/labBookings.service.ts apps/api/src/modules/labBookings/labBookings.test.ts
git commit -m "feat(api): lab report PDF upload middleware and ownership-scoped report path lookup"
```

---

### Task 7: Lab-facing list endpoints (`listReferralsForDoctor`, `listBookingsForLab`)

**Files:**
- Modify: `apps/api/src/modules/labReferrals/labReferrals.service.ts`, `apps/api/src/modules/labBookings/labBookings.service.ts`, both test files

**Interfaces:**
- Consumes: `LabReferral`, `LabBooking` models.
- Produces: `listReferralsForDoctor(doctorUserId: string, page: number, limit: number): Promise<{items, total, page, limit}>` (doctor's own sent referrals, with status timeline — "did my patient actually get the test?"), `listBookingsForLab(labUserId: string, page: number, limit: number): Promise<{items, total, page, limit}>` (lab's incoming bookings) — consumed by Task 8's routes.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/labReferrals/labReferrals.test.ts (append)
import { listReferralsForDoctor } from './labReferrals.service';

describe('listReferralsForDoctor', () => {
  it('returns only the requesting doctor\'s own referrals, paginated', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();
    await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);

    const result = await listReferralsForDoctor(doctorUser._id.toString(), 1, 20);
    expect(result.total).toBe(1);
    expect(result.items[0]!.suggestedTestCodes).toEqual(['CBC']);
  });
});
```

```ts
// apps/api/src/modules/labBookings/labBookings.test.ts (append)
import { listBookingsForLab } from './labBookings.service';

describe('listBookingsForLab', () => {
  it('returns only the requesting lab\'s own bookings, paginated', async () => {
    const { patientUser, labUser, labProfile } = await seedLabAndPrescription();
    await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    });

    const result = await listBookingsForLab(labUser._id.toString(), 1, 20);
    expect(result.total).toBe(1);
    expect(result.items[0]!.testCodes).toEqual(['CBC']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- labReferrals.test.ts labBookings.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/labReferrals/labReferrals.service.ts (append)
export async function listReferralsForDoctor(
  doctorUserId: string,
  page: number,
  limit: number
): Promise<{ items: ILabReferral[]; total: number; page: number; limit: number }> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const cappedLimit = Math.min(50, limit);
  const [items, total] = await Promise.all([
    LabReferral.find({ doctorId: doctorProfile._id }).sort({ _id: -1 }).skip((page - 1) * cappedLimit).limit(cappedLimit),
    LabReferral.countDocuments({ doctorId: doctorProfile._id }),
  ]);
  return { items, total, page, limit: cappedLimit };
}
```

```ts
// apps/api/src/modules/labBookings/labBookings.service.ts (append)
export async function listBookingsForLab(
  labUserId: string,
  page: number,
  limit: number
): Promise<{ items: ILabBooking[]; total: number; page: number; limit: number }> {
  const lab = await LabProfile.findOne({ userId: labUserId });
  if (!lab) throw new AppError(404, 'Lab profile not found', 'PROFILE_NOT_FOUND');

  const cappedLimit = Math.min(50, limit);
  const [items, total] = await Promise.all([
    LabBooking.find({ labId: lab._id }).sort({ scheduledAt: 1 }).skip((page - 1) * cappedLimit).limit(cappedLimit),
    LabBooking.countDocuments({ labId: lab._id }),
  ]);
  return { items, total, page, limit: cappedLimit };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- labReferrals.test.ts labBookings.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/labReferrals/labReferrals.service.ts apps/api/src/modules/labBookings/labBookings.service.ts apps/api/src/modules/labReferrals/labReferrals.test.ts apps/api/src/modules/labBookings/labBookings.test.ts
git commit -m "feat(api): paginated list endpoints for a doctor's sent referrals and a lab's incoming bookings"
```

---

### Task 8: Routes/controllers + mount in `app.ts`

**Files:**
- Create: `apps/api/src/modules/labReferrals/labReferrals.controller.ts`, `labReferrals.routes.ts`, `apps/api/src/modules/labBookings/labBookings.controller.ts`, `labBookings.routes.ts`
- Modify: `apps/api/src/app.ts`, both test files
- Modify: `apps/api/src/middleware/rateLimit.ts` (add a limiter for the public referral route, matching Phase 4's `rxVerifyLimiter` precedent)

**Interfaces:**
- Consumes: all service functions from Tasks 3-7.
- Produces: `POST /api/lab-referrals` (doctor-only), `GET /api/lab-referrals/me` (doctor-only, paginated), `GET /api/r/:token` (public, rate-limited), `POST /api/lab-bookings` (patient-only, optional `?referralToken=`), `GET /api/lab-bookings/me` (lab-only, paginated), `PATCH /api/lab-bookings/:id/status` (lab-only), `POST /api/lab-bookings/:id/report` (lab-only, multipart upload), `GET /api/lab-bookings/:id/report` (patient or lab, ownership-scoped stream) — consumed by Tasks 9-14's frontend.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/labReferrals/labReferrals.test.ts (append)
import { createApp } from '../../app';
import request from 'supertest';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
// add `beforeEach(async () => { await resetTestRedis(); });` alongside the file's existing
// beforeAll/afterEach/afterAll if not already present -- check before adding a duplicate.

describe('GET /api/r/:token', () => {
  it('is publicly reachable with no auth cookie', async () => {
    const app = createApp();
    const res = await request(app).get('/api/r/nonexistent-token');
    expect(res.status).toBe(404);
  });
});
```

```ts
// apps/api/src/modules/labBookings/labBookings.test.ts (append)
describe('POST /api/lab-bookings', () => {
  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post('/api/lab-bookings').send({ labId: 'x', testCodes: ['CBC'], scheduledAt: new Date().toISOString(), homeCollection: false });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- labReferrals.test.ts labBookings.test.ts`
Expected: FAIL — 404 on unmounted routes / no `createApp` import yet in these files.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/middleware/rateLimit.ts (append, alongside authLimiter/triageLimiter/rxVerifyLimiter)
export const referralLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SimpleRedisStore('rl:referral:'),
});
```

```ts
// apps/api/src/modules/labReferrals/labReferrals.controller.ts
import { Request, Response, NextFunction } from 'express';
import { createReferral, getReferralByToken, listReferralsForDoctor } from './labReferrals.service';

export async function createReferralHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const referral = await createReferral(req.user!.id, req.body.prescriptionId, req.body.labId, req.body.testCodes);
    res.status(201).json({ referral });
  } catch (err) {
    next(err);
  }
}

export async function getReferralByTokenHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await getReferralByToken(req.params.token as string);
    if (!result) {
      res.status(404).json({ error: 'Referral not found' });
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listReferralsForDoctorHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 20);
    const result = await listReferralsForDoctor(req.user!.id, page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/labReferrals/labReferrals.routes.ts
import { Router } from 'express';
import { CreateLabReferralInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { referralLookupLimiter } from '../../middleware/rateLimit';
import { createReferralHandler, listReferralsForDoctorHandler } from './labReferrals.controller';

export const labReferralsRouter = Router();
labReferralsRouter.use(requireAuth, requireRole('doctor'));
labReferralsRouter.post('/', validate(CreateLabReferralInput.extend({ prescriptionId: CreateLabReferralInput.shape.labId })), createReferralHandler);
labReferralsRouter.get('/me', listReferralsForDoctorHandler);
```

Note: `CreateLabReferralInput` (Task 1) only has `labId`/`testCodes` — the route body also needs `prescriptionId`. Rather than the awkward `.extend()` shown above (which just reuses the string-validation shape under a different key name), define the actual POST body validation inline or add a small dedicated schema. The cleanest fix: go back to `packages/shared/src/schemas/labReferral.ts` and adjust `CreateLabReferralInput` itself to include `prescriptionId: z.string().min(1)` as a required field from the start, then use it directly with `validate(CreateLabReferralInput)` here — do this adjustment now rather than working around it, and update Task 1's test/schema accordingly if you're implementing tasks in order (if Task 1 is already committed, add `prescriptionId` to the schema in this task's own commit instead, with a one-line note in the commit message).

```ts
// apps/api/src/modules/labReferrals/labReferrals.routes.ts (public route, registered separately, mounted at a DIFFERENT base path -- see app.ts below)
import { getReferralByTokenHandler } from './labReferrals.controller';
export const publicReferralRouter = Router();
publicReferralRouter.get('/:token', referralLookupLimiter, getReferralByTokenHandler);
```

```ts
// apps/api/src/modules/labBookings/labBookings.controller.ts
import { Request, Response, NextFunction } from 'express';
import { createBooking, listBookingsForLab, updateBookingStatus, getReportPath } from './labBookings.service';

export async function createBookingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const referralToken = typeof req.query.referralToken === 'string' ? req.query.referralToken : undefined;
    const booking = await createBooking(req.user!.id, req.body.labId, req.body, referralToken);
    res.status(201).json({ booking });
  } catch (err) {
    next(err);
  }
}

export async function listBookingsForLabHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 20);
    const result = await listBookingsForLab(req.user!.id, page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateBookingStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const booking = await updateBookingStatus(req.user!.id, req.params.id as string, req.body.status);
    res.status(200).json({ booking });
  } catch (err) {
    next(err);
  }
}

export async function uploadReportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'A PDF file is required' });
      return;
    }
    const reportPath = `/uploads/lab-reports/${req.params.id}.pdf`;
    const booking = await updateBookingStatus(req.user!.id, req.params.id as string, 'report_ready', reportPath);
    res.status(200).json({ booking });
  } catch (err) {
    next(err);
  }
}

export async function getReportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const diskPath = await getReportPath(req.params.id as string, req.user!.id, req.user!.role);
    res.sendFile(diskPath);
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/labBookings/labBookings.routes.ts
import { Router } from 'express';
import { CreateLabBookingInput, UpdateBookingStatusInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { labReportUpload } from './labBookings.upload';
import {
  createBookingHandler, listBookingsForLabHandler, updateBookingStatusHandler, uploadReportHandler, getReportHandler,
} from './labBookings.controller';

export const labBookingsRouter = Router();
labBookingsRouter.use(requireAuth);
labBookingsRouter.post('/', requireRole('patient'), validate(CreateLabBookingInput.extend({ labId: CreateLabBookingInput.shape.testCodes.element })), createBookingHandler);
labBookingsRouter.get('/me', requireRole('lab'), listBookingsForLabHandler);
labBookingsRouter.patch('/:id/status', requireRole('lab'), validate(UpdateBookingStatusInput), updateBookingStatusHandler);
labBookingsRouter.post('/:id/report', requireRole('lab'), labReportUpload.single('report'), uploadReportHandler);
labBookingsRouter.get('/:id/report', requireRole('patient', 'lab'), getReportHandler);
```

Same note as above applies: `CreateLabBookingInput` doesn't currently include `labId` (it's passed separately in the plan's earlier sketch). Add `labId: z.string().min(1)` to `CreateLabBookingInput` itself in `packages/shared/src/schemas/labReferral.ts` as part of this task (adjusting Task 1's schema/tests if not yet committed, or as a small follow-up commit here if it is), and use `validate(CreateLabBookingInput)` directly without the awkward `.extend()` workaround shown above.

```ts
// apps/api/src/app.ts (modify)
import { labReferralsRouter, publicReferralRouter } from './modules/labReferrals/labReferrals.routes';
import { labBookingsRouter } from './modules/labBookings/labBookings.routes';
// ...
app.use('/api/lab-referrals', labReferralsRouter);
app.use('/api/r', publicReferralRouter);
app.use('/api/lab-bookings', labBookingsRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- labReferrals.test.ts labBookings.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/labReferrals apps/api/src/modules/labBookings apps/api/src/app.ts apps/api/src/middleware/rateLimit.ts packages/shared/src/schemas/labReferral.ts
git commit -m "feat(api): mount lab referral and lab booking routes (create, list, status pipeline, report upload/download, public referral lookup)"
```

---

### Task 9: RTK Query slices (referrals + bookings)

**Files:**
- Create: `apps/web/src/store/labReferralsApi.ts`, `apps/web/src/store/labBookingsApi.ts`

**Interfaces:**
- Consumes: `baseApi`.
- Produces: `useCreateReferralMutation`, `useGetReferralByTokenQuery`, `useListMyReferralsQuery`, `useCreateBookingMutation`, `useListMyLabBookingsQuery`, `useUpdateBookingStatusMutation` — consumed by Tasks 10-14.

- [ ] **Step 1: Implement**

```ts
// apps/web/src/store/labReferralsApi.ts
import { baseApi } from './api';

export interface LabReferral {
  _id: string;
  prescriptionId: string;
  doctorId: string;
  patientId: string;
  labId: string;
  suggestedTestCodes: string[];
  token: string;
  status: 'sent' | 'opened' | 'booked' | 'sample_collected' | 'report_ready' | 'closed';
  reportUrl?: string;
  timeline: { status: string; at: string }[];
}
export interface LabTest {
  code: string;
  name: string;
  price: number;
  turnaroundHours: number;
  description?: string;
}
export interface PublicReferralView {
  referral: LabReferral;
  lab: { labName: string; city: string; homeCollection: boolean };
  tests: LabTest[];
  totalPrice: number;
}

export const labReferralsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createReferral: builder.mutation<{ referral: LabReferral }, { prescriptionId: string; labId: string; testCodes: string[] }>({
      query: (body) => ({ url: '/lab-referrals', method: 'POST', body }),
    }),
    getReferralByToken: builder.query<PublicReferralView, string>({
      query: (token) => `/r/${token}`,
    }),
    listMyReferrals: builder.query<{ items: LabReferral[]; total: number }, { page?: number; limit?: number } | void>({
      query: (params) => ({ url: '/lab-referrals/me', params: params ?? undefined }),
    }),
  }),
});

export const { useCreateReferralMutation, useGetReferralByTokenQuery, useListMyReferralsQuery } = labReferralsApi;
```

```ts
// apps/web/src/store/labBookingsApi.ts
import { baseApi } from './api';

export interface LabBooking {
  _id: string;
  referralId?: string;
  patientId: string;
  labId: string;
  testCodes: string[];
  totalPrice: number;
  scheduledAt: string;
  homeCollection: boolean;
  status: 'booked' | 'sample_collected' | 'report_ready' | 'cancelled';
  reportUrl?: string;
}

export const labBookingsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createBooking: builder.mutation<
      { booking: LabBooking },
      { labId: string; testCodes: string[]; scheduledAt: string; homeCollection: boolean; referralToken?: string }
    >({
      query: ({ referralToken, ...body }) => ({
        url: `/lab-bookings${referralToken ? `?referralToken=${referralToken}` : ''}`,
        method: 'POST',
        body,
      }),
    }),
    listMyLabBookings: builder.query<{ items: LabBooking[]; total: number }, { page?: number; limit?: number } | void>({
      query: (params) => ({ url: '/lab-bookings/me', params: params ?? undefined }),
    }),
    updateBookingStatus: builder.mutation<{ booking: LabBooking }, { id: string; status: 'sample_collected' | 'report_ready' }>({
      query: ({ id, status }) => ({ url: `/lab-bookings/${id}/status`, method: 'PATCH', body: { status } }),
    }),
  }),
});

export const { useCreateBookingMutation, useListMyLabBookingsQuery, useUpdateBookingStatusMutation } = labBookingsApi;
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/store/labReferralsApi.ts apps/web/src/store/labBookingsApi.ts
git commit -m "feat(web): RTK Query endpoints for lab referrals and lab bookings"
```

---

### Task 10: Doctor picks a lab after writing a prescription

**Files:**
- Create: `apps/web/src/app/prescriptions/[id]/refer/page.tsx`
- Modify: `apps/web/src/app/appointments/[id]/prescribe/page.tsx`

**Interfaces:**
- Consumes: `useCreateReferralMutation` (Task 9).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Implement the lab-selection page**

There's no "search labs by test code" endpoint yet — for this phase's scope, keep it simple: fetch each of the seeded labs' public profiles the doctor might plausibly use. Since there's no lab-search endpoint and building one is out of scope for this phase (Phase 6 owns "global search"), this page takes a `labId` as a query param passed in from a simple static list of known lab ids OR, more simply and within scope, just accepts a manually-entered lab ID with lookup via the existing `GET /api/labs/public/:id` endpoint (already built in Phase 1). Read `apps/web/src/app/labs/[id]/page.tsx` (Phase 1's public lab page) to see how a lab's public profile is already fetched client-side, and reuse that same pattern here:

```tsx
// apps/web/src/app/prescriptions/[id]/refer/page.tsx
'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateReferralMutation } from '@/store/labReferralsApi';
import { useListMyPrescriptionsQuery } from '@/store/prescriptionsApi';

export default function ReferToLabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: prescriptionId } = use(params);
  const router = useRouter();
  const [labId, setLabId] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const { data } = useListMyPrescriptionsQuery({ page: 1, limit: 50 });
  const prescription = data?.items.find((p) => p._id === prescriptionId);
  const [createReferral, { isLoading, error }] = useCreateReferralMutation();

  async function onSubmit() {
    if (!labId || selectedCodes.length === 0) return;
    try {
      await createReferral({ prescriptionId, labId, testCodes: selectedCodes }).unwrap();
      router.push('/dashboard/doctor');
    } catch {
      // error state below already reflects the failure
    }
  }

  return (
    <main className="max-w-xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Refer to a Lab</h1>
      <p className="text-sm text-gray-600">Recommended tests: {prescription?.recommendedTests.map((t) => t.testName).join(', ') || 'none'}</p>

      <div>
        <label className="block text-sm font-medium">Lab ID</label>
        <input className="border p-2 w-full" value={labId} onChange={(e) => setLabId(e.target.value)} placeholder="Paste the lab's profile id" />
      </div>

      <div>
        <label className="block text-sm font-medium">Test codes to refer (comma-separated, e.g. CBC,LFT)</label>
        <input
          className="border p-2 w-full"
          onChange={(e) => setSelectedCodes(e.target.value.split(',').map((c) => c.trim()).filter(Boolean))}
        />
      </div>

      <button className="bg-black text-white px-4 py-2" disabled={isLoading} onClick={onSubmit}>
        {isLoading ? 'Sending...' : 'Send Referral'}
      </button>
      {error ? <p className="text-sm text-red-600">Something went wrong — check the lab id and test codes.</p> : null}

      <button className="text-sm underline block" onClick={() => router.push('/dashboard/doctor')}>
        Skip (no lab referral)
      </button>
    </main>
  );
}
```

- [ ] **Step 2: Redirect to this page after prescription creation, only when there are recommended tests**

Read `apps/web/src/app/appointments/[id]/prescribe/page.tsx` in full first (from Phase 4). Modify its `onSubmit` success path:

```tsx
// apps/web/src/app/appointments/[id]/prescribe/page.tsx (modify the success branch of onSubmit)
      const result = await createPrescription({
        appointmentId,
        diagnosisNote,
        medicines,
        advice,
        followUpDate: followUpDate || undefined,
        recommendedTests,
      }).unwrap();

      if (recommendedTests.length > 0) {
        router.push(`/prescriptions/${result.prescription._id}/refer`);
      } else {
        router.push('/dashboard/doctor');
      }
```

- [ ] **Step 3: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/prescriptions/[id]/refer/page.tsx apps/web/src/app/appointments/[id]/prescribe/page.tsx
git commit -m "feat(web): doctor lab-referral page, reached automatically after prescribing recommended tests"
```

---

### Task 11: Public referral landing page + walk-in booking page

**Files:**
- Create: `apps/web/src/app/r/[token]/page.tsx`, `apps/web/src/app/labs/[id]/book/page.tsx`

**Interfaces:**
- Consumes: `useGetReferralByTokenQuery`, `useCreateBookingMutation` (Task 9).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Implement the referral landing page**

```tsx
// apps/web/src/app/r/[token]/page.tsx
'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGetReferralByTokenQuery } from '@/store/labReferralsApi';
import { useCreateBookingMutation } from '@/store/labBookingsApi';

export default function ReferralLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { data, isLoading, isError } = useGetReferralByTokenQuery(token);
  const [scheduledAt, setScheduledAt] = useState('');
  const [homeCollection, setHomeCollection] = useState(false);
  const [createBooking, { isLoading: isBooking, error }] = useCreateBookingMutation();

  if (isLoading) return <main className="max-w-xl mx-auto mt-12">Loading...</main>;
  if (isError || !data) return <main className="max-w-xl mx-auto mt-12">This referral link is invalid or expired.</main>;

  async function onBook() {
    if (!scheduledAt) return;
    try {
      await createBooking({
        labId: data!.referral.labId,
        testCodes: data!.tests.map((t) => t.code),
        scheduledAt,
        homeCollection,
        referralToken: token,
      }).unwrap();
      router.push('/dashboard/patient/timeline');
    } catch {
      // error state below already reflects the failure
    }
  }

  return (
    <main className="max-w-xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">{data.lab.labName}</h1>
      <p className="text-sm text-gray-600">{data.lab.city}</p>

      <div>
        <h2 className="font-semibold">Referred Tests</h2>
        <ul className="list-disc pl-6">
          {data.tests.map((t) => (
            <li key={t.code}>{t.name} — ₹{t.price}</li>
          ))}
        </ul>
        <p className="font-bold mt-2">Total: ₹{data.totalPrice}</p>
      </div>

      <div>
        <label className="block text-sm font-medium">Preferred date/time</label>
        <input type="datetime-local" className="border p-2" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
      </div>

      {data.lab.homeCollection ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={homeCollection} onChange={(e) => setHomeCollection(e.target.checked)} />
          Home collection
        </label>
      ) : null}

      <button className="bg-black text-white px-4 py-2" disabled={isBooking} onClick={onBook}>
        {isBooking ? 'Booking...' : 'Book Now'}
      </button>
      {error ? <p className="text-sm text-red-600">Something went wrong — please try again.</p> : null}
    </main>
  );
}
```

- [ ] **Step 2: Implement the walk-in booking page (no referral)**

```tsx
// apps/web/src/app/labs/[id]/book/page.tsx
'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateBookingMutation } from '@/store/labBookingsApi';

export default function WalkInBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: labId } = use(params);
  const router = useRouter();
  const [testCodesText, setTestCodesText] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [homeCollection, setHomeCollection] = useState(false);
  const [createBooking, { isLoading, error }] = useCreateBookingMutation();

  async function onBook() {
    const testCodes = testCodesText.split(',').map((c) => c.trim()).filter(Boolean);
    if (testCodes.length === 0 || !scheduledAt) return;
    try {
      await createBooking({ labId, testCodes, scheduledAt, homeCollection }).unwrap();
      router.push('/dashboard/patient/timeline');
    } catch {
      // error state below already reflects the failure
    }
  }

  return (
    <main className="max-w-xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Book a Test</h1>

      <div>
        <label className="block text-sm font-medium">Test codes (comma-separated, e.g. CBC,LFT)</label>
        <input className="border p-2 w-full" value={testCodesText} onChange={(e) => setTestCodesText(e.target.value)} />
      </div>

      <div>
        <label className="block text-sm font-medium">Preferred date/time</label>
        <input type="datetime-local" className="border p-2" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={homeCollection} onChange={(e) => setHomeCollection(e.target.checked)} />
        Home collection (if offered by this lab)
      </label>

      <button className="bg-black text-white px-4 py-2" disabled={isLoading} onClick={onBook}>
        {isLoading ? 'Booking...' : 'Book Now'}
      </button>
      {error ? <p className="text-sm text-red-600">Something went wrong — please check the test codes and try again.</p> : null}
    </main>
  );
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/r/[token]/page.tsx "apps/web/src/app/labs/[id]/book/page.tsx"
git commit -m "feat(web): public referral landing page and walk-in lab booking page"
```

---

### Task 12: Lab dashboard

**Files:**
- Create: `apps/web/src/app/dashboard/lab/page.tsx`

**Interfaces:**
- Consumes: `useListMyLabBookingsQuery`, `useUpdateBookingStatusMutation` (Task 9).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/app/dashboard/lab/page.tsx
'use client';

import { useState } from 'react';
import { useListMyLabBookingsQuery, useUpdateBookingStatusMutation } from '@/store/labBookingsApi';

export default function LabDashboardPage() {
  const { data, isLoading, refetch } = useListMyLabBookingsQuery();
  const [updateStatus] = useUpdateBookingStatusMutation();
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  async function markCollected(id: string) {
    await updateStatus({ id, status: 'sample_collected' }).unwrap();
    refetch();
  }

  async function onUploadReport(id: string, file: File) {
    setUploadingId(id);
    const formData = new FormData();
    formData.append('report', file);
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/lab-bookings/${id}/report`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    setUploadingId(null);
    refetch();
  }

  if (isLoading) return <main className="max-w-3xl mx-auto mt-12">Loading...</main>;

  return (
    <main className="max-w-3xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Lab Dashboard</h1>
      <ul className="space-y-2">
        {data?.items.map((booking) => (
          <li key={booking._id} className="border p-3 rounded space-y-2">
            <p>{new Date(booking.scheduledAt).toLocaleString()} — {booking.testCodes.join(', ')} — ₹{booking.totalPrice}</p>
            <p className="text-sm text-gray-600">Status: {booking.status}{booking.homeCollection ? ' (home collection)' : ''}</p>
            {booking.status === 'booked' ? (
              <button className="text-sm underline" onClick={() => markCollected(booking._id)}>
                Mark sample collected
              </button>
            ) : null}
            {booking.status === 'sample_collected' ? (
              <label className="text-sm underline cursor-pointer">
                {uploadingId === booking._id ? 'Uploading...' : 'Upload report (PDF)'}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onUploadReport(booking._id, file);
                  }}
                />
              </label>
            ) : null}
            {booking.status === 'report_ready' ? <p className="text-sm text-green-700">Report uploaded ✓</p> : null}
          </li>
        ))}
      </ul>
      {data?.items.length === 0 ? <p className="text-sm text-gray-600">No bookings yet.</p> : null}
    </main>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/lab/page.tsx
git commit -m "feat(web): lab dashboard with status pipeline actions and report upload"
```

---

### Task 13: Doctor-side referral status visibility + patient timeline update

**Files:**
- Modify: `apps/web/src/app/prescriptions/[id]/page.tsx`, `apps/web/src/app/dashboard/patient/timeline/page.tsx`

**Interfaces:**
- Consumes: `useListMyReferralsQuery` (Task 9, doctor-side — though the prescription detail page is patient-facing per Phase 4; this task only adds the referral status badge to the EXISTING patient-facing detail page, since CLAUDE.md's "referral status timeline visible to doctor" line item is satisfied by Task 12's lab dashboard plus this task's patient-facing referral badge being visible when a doctor views a patient's shared prescription is out of scope — a genuine doctor-facing referral list view is a reasonable follow-up but not built as a separate page in this plan; keep this task scoped to what's listed below).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Show referral status on the patient's prescription detail page, if any recommended test has one**

Read `apps/web/src/app/prescriptions/[id]/page.tsx` in full first (from Phase 4). This page only has `useListMyPrescriptionsQuery` — it doesn't yet know about referrals. Since `Prescription.recommendedTests[].labReferralId` exists but the current `Prescription` frontend type (in `apps/web/src/store/prescriptionsApi.ts`) doesn't expose it, widen that type first:

```ts
// apps/web/src/store/prescriptionsApi.ts (modify RecommendedTest interface)
export interface RecommendedTest {
  testName: string;
  labReferralId?: string;
}
```

Then in the detail page, for any recommended test with a `labReferralId`, show a simple status badge by looking it up via a new endpoint call. Since there's no "get one referral by id" endpoint (only by token, which the patient doesn't have stored client-side after the fact), keep this simple and DEFER a full status lookup — instead, just indicate which tests were referred at all:

```tsx
// apps/web/src/app/prescriptions/[id]/page.tsx (modify the medicines/recommendedTests rendering section)
      {prescription.recommendedTests.length > 0 ? (
        <div>
          <strong>Recommended Tests:</strong>
          <ul className="list-disc pl-6">
            {prescription.recommendedTests.map((t, i) => (
              <li key={i}>
                {t.testName}
                {t.labReferralId ? <span className="text-green-700 text-sm"> (referred to a lab)</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
```

- [ ] **Step 2: Include lab bookings in the patient's chronological timeline**

Read `apps/web/src/app/dashboard/patient/timeline/page.tsx` in full first (from Phase 4). Add `useListMyLabBookingsQuery` as a third data source:

```tsx
// apps/web/src/app/dashboard/patient/timeline/page.tsx (modify)
import { useListMyLabBookingsQuery } from '@/store/labBookingsApi';

// Inside the component, alongside the existing two queries:
  const { data: bookingsData, isLoading: bookingsLoading } = useListMyLabBookingsQuery({ page: 1, limit: 50 });

// Add bookingsLoading to the combined loading check, and add a third spread into `entries`:
    ...(bookingsData?.items.map((b) => ({
      kind: 'labBooking' as const,
      at: b.scheduledAt,
      label: `Lab test: ${b.testCodes.join(', ')} (${b.status})`,
      id: b._id,
    })) ?? []),
```

(Widen the `TimelineEntry` union type to include the new `'labBooking'` kind, matching the existing two variants' shape.)

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/store/prescriptionsApi.ts apps/web/src/app/prescriptions/[id]/page.tsx apps/web/src/app/dashboard/patient/timeline/page.tsx
git commit -m "feat(web): show referral indicator on prescription detail, include lab bookings in patient timeline"
```

---

### Task 14: Phase 5 seed data (3 referrals + bookings + dummy report PDF)

**Files:**
- Modify: `apps/api/src/seed/seed.ts`
- Create: `apps/api/src/seed/assets/report_sample.pdf` (generated by a small one-off script, not committed as a build artifact of the seed run itself — see below)
- Test: extend `apps/api/src/seed/seed.test.ts`

**Interfaces:**
- Consumes: `LabReferral`, `LabBooking` models, existing seeded prescriptions/labs (Phase 1, Phase 4).
- Produces: the 3-referral slice of CLAUDE.md §6.4, per the roadmap's phase-by-phase seeding table.

- [ ] **Step 1: Generate the dummy report PDF once**

CLAUDE.md §6.5 requires `seed/assets/report_sample.pdf`: a fake "HealthFirst Diagnostics" letterhead, a CBC table with normal-range values, and a "DUMMY REPORT — DEMO ONLY" watermark. Reuse `pdf-lib` (already a dependency from Phase 4) via a small standalone Node script run once, not as part of every `npm run seed` invocation:

```ts
// apps/api/src/seed/generateReportSample.ts
// One-off script: `npx tsx apps/api/src/seed/generateReportSample.ts` -- NOT run automatically
// by `npm run seed` (generating a PDF on every seed run is unnecessary; the file is committed
// once and reused).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  page.drawText('HealthFirst Diagnostics', { x: 50, y, size: 18, font: boldFont });
  y -= 30;
  page.drawText('Complete Blood Count (CBC) Report', { x: 50, y, size: 12, font });
  y -= 40;

  const rows = [
    ['Hemoglobin', '14.2 g/dL', '13.0 - 17.0'],
    ['WBC Count', '7,200 /uL', '4,000 - 11,000'],
    ['Platelet Count', '250,000 /uL', '150,000 - 450,000'],
    ['RBC Count', '5.1 M/uL', '4.5 - 5.9'],
  ];
  page.drawText('Test', { x: 50, y, size: 10, font: boldFont });
  page.drawText('Result', { x: 250, y, size: 10, font: boldFont });
  page.drawText('Normal Range', { x: 400, y, size: 10, font: boldFont });
  y -= 20;
  for (const [test, result, range] of rows) {
    page.drawText(test!, { x: 50, y, size: 10, font });
    page.drawText(result!, { x: 250, y, size: 10, font });
    page.drawText(range!, { x: 400, y, size: 10, font });
    y -= 20;
  }

  page.drawText('DUMMY REPORT -- DEMO ONLY', { x: 50, y: 30, size: 10, font, color: rgb(0.7, 0.1, 0.1) });

  const bytes = await pdfDoc.save();
  const outPath = path.join(__dirname, 'assets', 'report_sample.pdf');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(bytes));
  console.log(`Wrote ${outPath}`);
}

main();
```

Run it once: `cd apps/api && npx tsx src/seed/generateReportSample.ts`. Commit the resulting `apps/api/src/seed/assets/report_sample.pdf` binary file directly (small, static, generated once — same treatment as any other committed seed asset).

- [ ] **Step 2: Write the failing seed test**

```ts
// apps/api/src/seed/seed.test.ts (append)
import { LabReferral } from '../models/LabReferral';
import { LabBooking } from '../models/LabBooking';

describe('runSeed — Phase 5 slice', () => {
  it('seeds exactly 3 lab referrals in the documented statuses, plus lab bookings including one walk-in', async () => {
    await runSeed();
    const referrals = await LabReferral.find({});
    expect(referrals).toHaveLength(3);

    const statuses = referrals.map((r) => r.status).sort();
    expect(statuses).toEqual(['booked', 'report_ready', 'sent'].sort());

    const reportReadyReferral = referrals.find((r) => r.status === 'report_ready');
    expect(reportReadyReferral!.reportUrl).toBeTruthy();

    const bookings = await LabBooking.find({});
    expect(bookings.length).toBeGreaterThanOrEqual(3); // 2 progressed referrals + 1 walk-in
    const walkIns = bookings.filter((b) => !b.referralId);
    expect(walkIns.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- seed.test.ts`
Expected: FAIL — 0 referrals.

- [ ] **Step 4: Implement the seed block**

Read the existing seed.ts structure first (doctor/patient/lab variable names, per CLAUDE.md §6.4's exact spec: "Dr. Neha → HealthFirst (LFT + CBC) → status 'report_ready' with dummy PDF report uploaded", "Dr. Kavita → Ghaziabad Diagnostic (HBA1C + BLOODSUGAR) → status 'booked'", "Dr. Meera → City Path Labs (CBC) → status 'sent'"). Use the already-seeded doctor/lab/prescription variables (`neha`, `kavita`, `meera` doctor profiles from Phase 1; `healthfirst`, `ghaziabadDiagnostic`, `cityPathLabs` lab profiles from Phase 1; the Phase 4 prescriptions linked to their respective completed appointments) — read the actual current variable names in the file rather than assuming these exact identifiers are correct.

```ts
// apps/api/src/seed/seed.ts (add after the Phase 4 prescription-seeding block)
import fs from 'node:fs';
import path from 'node:path';
import { LabReferral } from '../models/LabReferral';
import { LabBooking } from '../models/LabBooking';

await LabReferral.deleteMany({});
await LabBooking.deleteMany({});

const reportSamplePath = path.join(__dirname, 'assets', 'report_sample.pdf');
const reportDestDir = path.join(process.cwd(), 'uploads', 'lab-reports');
fs.mkdirSync(reportDestDir, { recursive: true });

// Referral 1: Dr. Neha -> HealthFirst (LFT + CBC) -> report_ready, dummy PDF uploaded.
// Find the actual prescription/doctor/lab variables already in scope in this file --
// this is illustrative structure, not exact variable names.
const nehaReferral = await LabReferral.create({
  prescriptionId: /* the Neha-linked prescription's _id from the Phase 4 block */ undefined,
  doctorId: /* neha.profileId */ undefined,
  patientId: /* the linked patient's _id */ undefined,
  labId: /* healthfirst lab profile _id */ undefined,
  suggestedTestCodes: ['LFT', 'CBC'],
  token: nanoid(),
  status: 'report_ready',
  timeline: [
    { status: 'sent', at: daysAgo(5) },
    { status: 'opened', at: daysAgo(4) },
    { status: 'booked', at: daysAgo(4) },
    { status: 'sample_collected', at: daysAgo(3) },
    { status: 'report_ready', at: daysAgo(2) },
  ],
});
const reportDestPath = path.join(reportDestDir, `${nehaReferral._id.toString()}.pdf`);
fs.copyFileSync(reportSamplePath, reportDestPath);
nehaReferral.reportUrl = `/uploads/lab-reports/${nehaReferral._id.toString()}.pdf`;
await nehaReferral.save();
await LabBooking.create({
  referralId: nehaReferral._id, patientId: nehaReferral.patientId, labId: nehaReferral.labId,
  testCodes: ['LFT', 'CBC'], totalPrice: 900 /* real sum from the lab's actual seeded test prices */,
  scheduledAt: daysAgo(3), homeCollection: true, status: 'report_ready',
  reportUrl: nehaReferral.reportUrl,
});

// Referral 2: Dr. Kavita -> Ghaziabad Diagnostic (HBA1C + BLOODSUGAR) -> booked.
// ...same pattern, status 'booked', timeline through 'sent'/'opened'/'booked' only, a LabBooking with status 'booked'.

// Referral 3: Dr. Meera -> City Path Labs (CBC) -> sent (patient hasn't clicked yet).
// ...same pattern, status 'sent', timeline has only the 'sent' entry, NO LabBooking created for this one.

// Walk-in booking: a patient books a lab test directly, with no referral at all.
await LabBooking.create({
  patientId: /* any seeded patient */ undefined, labId: /* healthfirst */ undefined,
  testCodes: ['TSH'], totalPrice: 300, scheduledAt: daysFromNow(2), homeCollection: false, status: 'booked',
});
```

Fill in the real variable names by reading the actual current file (patient/doctor/lab references from Phases 1-4), matching each referral's doctor/lab/test-code combination and price exactly to CLAUDE.md §6.4's spec, and computing `totalPrice` from each lab's own actually-seeded test prices (don't hardcode a price that doesn't match the real seeded `LabProfile.tests` entries).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- seed.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/seed/seed.ts apps/api/src/seed/seed.test.ts apps/api/src/seed/generateReportSample.ts apps/api/src/seed/assets/report_sample.pdf
git commit -m "feat(api): seed Phase 5's 3 demo lab referrals, bookings, and a dummy report PDF"
```

---

## Phase 5 Definition of Done (from CLAUDE.md §2)

Doctor writes a prescription with recommended tests → picks a lab → patient
gets a notification with a link → opens `/r/{token}` → sees referred tests
pre-selected and priced → books (with home collection if offered) → the
lab's dashboard shows the booking → lab marks sample collected → lab uploads
the report → both patient and referring doctor are notified → the patient's
timeline reflects the whole journey. A patient can also book any lab
directly with no referral.

## Self-Review Notes

- **Spec coverage:** every Phase 5 CLAUDE.md §2 checklist item maps to a
  task: lab matching by test code + referral creation → Tasks 3, 10;
  referral link + notification → Task 3; public landing page with
  pre-selected/priced tests → Tasks 4, 11; lab dashboard + status pipeline →
  Tasks 5-7, 12; report upload → dual notification → Task 5; referral status
  timeline → Task 7 (list endpoint) + Task 12 (lab side) + Task 13 (patient
  side); walk-in booking → Tasks 5, 11.
- **Roadmap gap closed:** `LabBooking.status` typed as a real union+enum,
  matching every other status field in this codebase (Task 1).
- **Deliberate scope decisions:** the doctor's lab-selection page (Task 10)
  is a manual-lab-id-entry form rather than a "search labs by test/price/city"
  UI — CLAUDE.md's own checklist phrase ("system shows labs offering those
  tests, sorted by price/city") describes real search/filter functionality
  that doesn't exist yet anywhere in this app (Phase 6 owns "Global search:
  doctors by name/specialty/city; labs by test" as its own line item) —
  building that search infrastructure here would be scope creep into a later
  phase. This plan builds the REFERRAL mechanics completely and correctly;
  the lab-discovery UX is intentionally deferred. A CLAUDE.md-literal doctor
  UI would need Phase 6's search first.
  A real per-doctor "did my patient get the test" referral-status VIEW
  (beyond the list endpoint built in Task 7) is not built in this plan's
  frontend tasks — the backend endpoint exists and is tested; wiring a
  dedicated doctor-facing referral list page is a reasonable, small
  follow-up if a demo needs it, using `useListMyReferralsQuery` (already
  exported from Task 9's slice).
- **Type consistency check:** `CreateLabReferralInput`/`CreateLabBookingInput`
  (Task 1, Zod/shared — note the `prescriptionId`/`labId` field additions
  flagged inline in Task 8) match the service functions' actual parameter
  shapes; the frontend's `LabReferral`/`LabBooking` types (Task 9) mirror the
  real Mongoose model shapes field-for-field.
