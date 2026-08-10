# Phase 7 — FHIR-lite Export Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One authenticated, audited, read-only endpoint —
`GET /api/fhir/Patient/:patientId/$everything-lite` — that serializes a
patient's Appointments, Prescriptions, LabReferrals, and LabBookings into a
FHIR R4-shaped JSON `Bundle` (`Patient`, `Appointment[]`,
`MedicationRequest[]`, `ServiceRequest[]`, `DiagnosticReport[]`), scoped
either to the patient's whole history or to one `encounterId` (appointment).
Backend-only, `apps/api`.

**Architecture:** New module `apps/api/src/modules/fhirExport/` following
the existing `modules/<name>/{name}.service.ts, name.controller.ts,
name.routes.ts}` layout (see `modules/admin`, `modules/prescriptions`). A
pure bundle-builder service reads directly from the existing `Appointment`,
`Prescription`, `LabReferral`, `LabBooking`, `User`, `PatientProfile`,
`DoctorProfile`, `LabProfile` Mongoose models (all already defined —
Phase 1 Task 3 / Phases 2–5) — no schema changes. A thin authorization
service reuses the ownership-check pattern already established in
`prescriptions.service.ts`'s `getPrescriptionPdfPath`. The route is gated by
the existing `requireAuth`/`requireRole` middleware and the existing
`apiLimiter`, and writes one `AuditLog` entry per call via the existing
`logAudit()` helper. Full design rationale:
`docs/superpowers/specs/2026-08-09-phase7-fhir-export-design.md`.

**Tech Stack:** Same as the rest of `apps/api` — Node 20, TypeScript 5
(strict), Express 4, Mongoose 8, Zod 3. No new npm dependencies. Tests:
Vitest + Supertest + mongodb-memory-server (matches every existing
`apps/api` module).

## Global Constraints

- TypeScript strict everywhere; no `any` (CLAUDE.md §3).
- The `encounterId` query param is validated as a non-empty string via a new
  Zod schema in `packages/shared` (CLAUDE.md §3: Zod schemas there are the
  single source of truth for API contracts) — DB-membership checks
  (does this appointment belong to this patient?) happen in the service
  layer, not in the schema.
- RBAC: `requireAuth` + `requireRole('patient', 'doctor', 'admin')` at the
  router level (labs are rejected before any handler code runs); the
  per-patient ownership check happens inside the service (design spec §2).
- Every successful export writes exactly one `AuditLog` row via the
  existing `logAudit()` (CLAUDE.md §0.1.3 — cross-role action audit trail;
  design spec §4).
- This endpoint is intentionally **not paginated** — see design spec §3 for
  why it's exempt from CLAUDE.md §3's normal "every list endpoint:
  pagination + sort" rule.
- Conventional commits, one commit per task step group (CLAUDE.md §3).
- No new npm dependencies — no FHIR validation library (design spec's
  Non-goals).

---

## File Structure (new/changed files only)

```
medlink/
├── packages/shared/src/schemas/
│   └── fhirExport.ts                       # FhirExportQuery Zod schema (Task 1)
├── packages/shared/src/index.ts            # + export * from './schemas/fhirExport' (Task 1)
└── apps/api/src/
    ├── modules/fhirExport/
    │   ├── fhirExport.mapper.ts            # pure MedLink-doc → FHIR-lite-JSON functions (Task 2)
    │   ├── fhirExport.mapper.test.ts       # fixture-driven shape assertions (Task 2)
    │   ├── fhirExport.service.ts           # canExportPatient() + buildFhirBundle() orchestrator (Task 2, 3)
    │   ├── fhirExport.service.test.ts       # authorization unit tests (Task 3)
    │   ├── fhirExport.controller.ts        # HTTP glue (Task 4)
    │   ├── fhirExport.routes.ts            # GET /Patient/:patientId/$everything-lite (Task 4)
    │   └── fhirExport.test.ts              # Supertest route/auth-matrix integration tests (Task 4)
    └── app.ts                              # + mount fhirExportRouter at /api/fhir (Task 4)
```

---

### Task 1: Shared Zod schema for the export query param

**Files:**
- Create: `packages/shared/src/schemas/fhirExport.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/schemas.test.ts` (append to the existing file — same file every other shared schema is tested in, per Task 2 of the Phase 1 plan)

**Interfaces:**
- Consumes: nothing (leaf schema, same as the rest of `packages/shared`).
- Produces: `FhirExportQuery` (Zod schema + inferred TS type) — consumed by Task 4's route via the existing `validate(schema, 'query')` middleware.

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/schemas/schemas.test.ts`:

```ts
import { FhirExportQuery } from './fhirExport';

describe('FhirExportQuery', () => {
  it('allows an empty query (whole-patient export)', () => {
    expect(FhirExportQuery.safeParse({}).success).toBe(true);
  });

  it('accepts a non-empty encounterId', () => {
    const result = FhirExportQuery.safeParse({ encounterId: '507f1f77bcf86cd799439011' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty-string encounterId', () => {
    expect(FhirExportQuery.safeParse({ encounterId: '' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@medlink/shared`
Expected: FAIL — `Cannot find module './fhirExport'`

- [ ] **Step 3: Implement the schema**

```ts
// packages/shared/src/schemas/fhirExport.ts
import { z } from 'zod';

// Only a shape check here -- whether `encounterId` actually names an
// Appointment belonging to the requested patient is a DB-membership check,
// resolved in apps/api's fhirExport.service.ts, not something Zod alone
// can express.
export const FhirExportQuery = z.object({
  encounterId: z.string().min(1).optional(),
});
export type FhirExportQuery = z.infer<typeof FhirExportQuery>;
```

```ts
// packages/shared/src/index.ts (add one line, alongside the existing barrel exports)
export * from './schemas/fhirExport';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=@medlink/shared`
Expected: PASS (3 new tests, plus all existing schema tests still green)

- [ ] **Step 5: Build and commit**

Run: `npm run build --workspace=@medlink/shared`
Expected: emits updated `dist/*.js`/`.d.ts` with no errors.

```bash
git add packages/shared/src/schemas/fhirExport.ts packages/shared/src/index.ts packages/shared/src/schemas/schemas.test.ts
git commit -m "feat(shared): add FhirExportQuery schema for FHIR-lite export endpoint"
```

---

### Task 2: FHIR-lite bundle mapper (pure, no HTTP, no auth)

**Files:**
- Create: `apps/api/src/modules/fhirExport/fhirExport.mapper.ts`
- Test: `apps/api/src/modules/fhirExport/fhirExport.mapper.test.ts`

**Interfaces:**
- Consumes: `IAppointment`, `IPrescription`, `ILabReferral`, `ILabBooking`,
  `IUser`, `IPatientProfile`, `IDoctorProfile`, `ILabProfile` (Mongoose
  document interfaces, already defined in `apps/api/src/models/`).
- Produces: `mapPatient`, `mapAppointment`, `mapMedicationRequests` (one
  `Prescription` → `MedicationRequest[]`), `mapServiceRequest`,
  `mapDiagnosticReport` — pure functions, each taking a Mongoose doc (plus
  whatever joined doctor/lab display data it needs) and returning a plain
  FHIR-lite-shaped object. Consumed by Task 3's `buildFhirBundle`
  orchestrator.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/fhirExport/fhirExport.mapper.test.ts
import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import {
  mapPatient,
  mapAppointment,
  mapMedicationRequests,
  mapServiceRequest,
  mapDiagnosticReport,
} from './fhirExport.mapper';

describe('mapPatient', () => {
  it('emits resourceType Patient with _ageYears instead of a fabricated birthDate', () => {
    const result = mapPatient(
      { _id: new Types.ObjectId(), name: 'Rahul Sharma' } as any,
      { age: 34, gender: 'male' } as any
    );
    expect(result.resourceType).toBe('Patient');
    expect(result.name).toEqual([{ text: 'Rahul Sharma' }]);
    expect(result.gender).toBe('male');
    expect((result as any).birthDate).toBeUndefined();
    expect((result as any)._ageYears).toBe(34);
  });
});

describe('mapAppointment', () => {
  it.each([
    ['requested', 'pending'],
    ['confirmed', 'booked'],
    ['completed', 'fulfilled'],
    ['cancelled', 'cancelled'],
    ['rejected', 'cancelled'],
    ['no_show', 'noshow'],
  ])('maps MedLink status %s to FHIR status %s', (medlinkStatus, fhirStatus) => {
    const appt = {
      _id: new Types.ObjectId(),
      status: medlinkStatus,
      slotStart: new Date('2026-01-01T10:00:00Z'),
      slotEnd: new Date('2026-01-01T10:15:00Z'),
    } as any;
    const result = mapAppointment(appt, { doctorDisplay: 'Dr. A', patientDisplay: 'P' });
    expect(result.resourceType).toBe('Appointment');
    expect(result.status).toBe(fhirStatus);
  });
});

describe('mapMedicationRequests', () => {
  it('emits one MedicationRequest per medicine, status stopped when superseded', () => {
    const rx = {
      _id: new Types.ObjectId(),
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 3 }],
      supersededBy: new Types.ObjectId(),
      createdAt: new Date(),
      diagnosisNote: 'Fever',
    } as any;
    const [result] = mapMedicationRequests(rx, { doctorDisplay: 'Dr. A' });
    expect(result.resourceType).toBe('MedicationRequest');
    expect(result.status).toBe('stopped');
    expect(result.medicationCodeableConcept).toEqual({ text: 'Paracetamol' });
  });
});

describe('mapServiceRequest', () => {
  it.each([
    ['sent', 'active'],
    ['opened', 'active'],
    ['booked', 'active'],
    ['sample_collected', 'active'],
    ['report_ready', 'completed'],
    ['closed', 'completed'],
  ])('maps LabReferral status %s to ServiceRequest status %s', (medlinkStatus, fhirStatus) => {
    const referral = {
      _id: new Types.ObjectId(),
      status: medlinkStatus,
      suggestedTestCodes: ['CBC'],
      timeline: [{ status: 'sent', at: new Date() }],
    } as any;
    const result = mapServiceRequest(referral, { doctorDisplay: 'Dr. A', labDisplay: 'HealthFirst' });
    expect(result.resourceType).toBe('ServiceRequest');
    expect(result.status).toBe(fhirStatus);
  });
});

describe('mapDiagnosticReport', () => {
  it('is final status with a presentedForm url', () => {
    const booking = {
      _id: new Types.ObjectId(),
      testCodes: ['CBC', 'LFT'],
      scheduledAt: new Date(),
      reportUrl: '/uploads/report.pdf',
    } as any;
    const result = mapDiagnosticReport(booking);
    expect(result.resourceType).toBe('DiagnosticReport');
    expect(result.status).toBe('final');
    expect(result.presentedForm).toEqual([{ url: '/uploads/report.pdf' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- fhirExport.mapper.test.ts`
Expected: FAIL — `Cannot find module './fhirExport.mapper'`

- [ ] **Step 3: Implement the mapper**

Implement `apps/api/src/modules/fhirExport/fhirExport.mapper.ts` per design
spec §1's field-by-field tables:
- `mapPatient(user, patientProfile)` — `resourceType: 'Patient'`, `id`,
  `name: [{text}]`, `gender` passthrough (omit if unset), `_ageYears` from
  `patientProfile?.age` (omit if unset). No `birthDate`.
- `mapAppointment(appointment, {doctorDisplay, patientDisplay})` —
  `resourceType: 'Appointment'`, `id`, `status` via the six-way status map
  in the table above, `start`/`end` from `slotStart`/`slotEnd` as ISO
  strings, `reasonCode: [{text: symptomSummary}]` only if set,
  `cancelationReason: {text: rejectionReason}` only if set, `participant`
  array with both display strings.
- `mapMedicationRequests(prescription, {doctorDisplay})` — returns an
  array, one entry per `prescription.medicines[i]`: `id:
  "<prescriptionId>-<i>"`, `status: prescription.supersededBy ? 'stopped' :
  'active'`, `medicationCodeableConcept: {text: medicine.name}`,
  `dosageInstruction: [{text: "<dosage> <frequency> for <durationDays> days<, instructions>"}]`,
  `authoredOn`, `requester: {display: doctorDisplay}`,
  `reasonCode: [{text: diagnosisNote}]`.
- `mapServiceRequest(labReferral, {doctorDisplay, labDisplay})` —
  `resourceType: 'ServiceRequest'`, `id`, `status` via the two-way status
  map, `code: {text: suggestedTestCodes.join(', ')}`,
  `authoredOn: timeline[0].at`, `requester`, `performer: [{display: labDisplay}]`.
- `mapDiagnosticReport(labBooking)` — `resourceType: 'DiagnosticReport'`,
  `id`, `status: 'final'`, `code: {text: testCodes.join(', ')}`,
  `effectiveDateTime: scheduledAt`, `presentedForm: [{url: reportUrl}]`.
  (Callers only invoke this for bookings that have a `reportUrl` — see
  Task 3.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- fhirExport.mapper.test.ts`
Expected: PASS (all cases, including every `it.each` status-mapping row)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/fhirExport/fhirExport.mapper.ts apps/api/src/modules/fhirExport/fhirExport.mapper.test.ts
git commit -m "feat(api): add pure FHIR-lite resource mapper for patient export"
```

---

### Task 3: Authorization + bundle-builder orchestration

**Files:**
- Create: `apps/api/src/modules/fhirExport/fhirExport.service.ts`
- Test: `apps/api/src/modules/fhirExport/fhirExport.service.test.ts`

**Interfaces:**
- Consumes: `mapPatient`/`mapAppointment`/`mapMedicationRequests`/
  `mapServiceRequest`/`mapDiagnosticReport` (Task 2); `User`,
  `PatientProfile`, `DoctorProfile`, `LabProfile`, `Appointment`,
  `Prescription`, `LabReferral`, `LabBooking` models; `logAudit` (existing,
  `modules/audit/audit.service.ts`); `AppError` (existing, `lib/errors.ts`).
- Produces: `canExportPatient(requester, patientId): Promise<boolean>` and
  `buildFhirBundle(patientId, {encounterId?}): Promise<Bundle>` — both
  consumed by Task 4's controller. `buildFhirBundle` itself does **not**
  audit-log or authorize — that's the controller's job (Task 4), keeping
  this function a pure "given a patientId, produce a bundle" query, easy to
  unit test without an HTTP layer or a fake logged-in user.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/fhirExport/fhirExport.service.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../../models/User';
import { PatientProfile } from '../../models/PatientProfile';
import { DoctorProfile } from '../../models/DoctorProfile';
import { Appointment } from '../../models/Appointment';
import { canExportPatient, buildFhirBundle } from './fhirExport.service';

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

async function makePatient() {
  const user = await User.create({ role: 'patient', email: `p${Date.now()}@x.com`, phone: '9999999999', passwordHash: 'h', name: 'Pat' });
  await PatientProfile.create({ userId: user._id, age: 30, gender: 'female' });
  return user;
}

describe('canExportPatient', () => {
  it('authorizes a patient exporting their own data', async () => {
    const patient = await makePatient();
    expect(await canExportPatient({ id: patient._id.toString(), role: 'patient' }, patient._id.toString())).toBe(true);
  });

  it('rejects a patient exporting someone else\'s data', async () => {
    const patientA = await makePatient();
    const patientB = await makePatient();
    expect(await canExportPatient({ id: patientA._id.toString(), role: 'patient' }, patientB._id.toString())).toBe(false);
  });

  it('authorizes a doctor who has an appointment with the patient', async () => {
    const patient = await makePatient();
    const docUser = await User.create({ role: 'doctor', email: `d${Date.now()}@x.com`, phone: '9999999999', passwordHash: 'h', name: 'Doc' });
    const docProfile = await DoctorProfile.create({
      userId: docUser._id, specialties: ['GP'], qualifications: ['MBBS'], regNo: 'X/1', experienceYears: 1,
      bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 100, languages: ['English'],
    });
    await Appointment.create({ patientId: patient._id, doctorId: docProfile._id, slotStart: new Date(), slotEnd: new Date(), status: 'completed' });
    expect(await canExportPatient({ id: docUser._id.toString(), role: 'doctor' }, patient._id.toString())).toBe(true);
  });

  it('rejects a doctor with no appointment history for the patient', async () => {
    const patient = await makePatient();
    const docUser = await User.create({ role: 'doctor', email: `d2${Date.now()}@x.com`, phone: '9999999999', passwordHash: 'h', name: 'Doc2' });
    await DoctorProfile.create({
      userId: docUser._id, specialties: ['GP'], qualifications: ['MBBS'], regNo: 'X/2', experienceYears: 1,
      bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 100, languages: ['English'],
    });
    expect(await canExportPatient({ id: docUser._id.toString(), role: 'doctor' }, patient._id.toString())).toBe(false);
  });

  it('always authorizes admin', async () => {
    const patient = await makePatient();
    expect(await canExportPatient({ id: new mongoose.Types.ObjectId().toString(), role: 'admin' }, patient._id.toString())).toBe(true);
  });
});

describe('buildFhirBundle', () => {
  it('returns a Bundle with a Patient entry for a patient with no history yet', async () => {
    const patient = await makePatient();
    const bundle = await buildFhirBundle(patient._id.toString(), {});
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry.some((e) => e.resource.resourceType === 'Patient')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- fhirExport.service.test.ts`
Expected: FAIL — `Cannot find module './fhirExport.service'`

- [ ] **Step 3: Implement the service**

Implement `apps/api/src/modules/fhirExport/fhirExport.service.ts`:

```ts
export async function canExportPatient(
  requester: { id: string; role: string },
  patientId: string
): Promise<boolean> {
  if (requester.role === 'admin') return true;
  if (requester.role === 'patient') return requester.id === patientId;
  if (requester.role === 'doctor') {
    const doctorProfile = await DoctorProfile.findOne({ userId: requester.id });
    if (!doctorProfile) return false;
    return Appointment.exists({ doctorId: doctorProfile._id, patientId }).then(Boolean);
  }
  return false;
}
```

`buildFhirBundle(patientId, {encounterId})`:
1. Load `User` + `PatientProfile` for `patientId`; throw
   `AppError(404, 'Patient not found', 'PATIENT_NOT_FOUND')` if the user
   doesn't exist or isn't `role: 'patient'`.
2. If `encounterId` is given: load that `Appointment`, throw
   `AppError(400, 'encounterId does not belong to this patient', 'ENCOUNTER_MISMATCH')`
   if it doesn't exist or its `patientId` doesn't match; scope every
   subsequent query to it (design spec §3's four bullet points — filter
   `Prescription` by `appointmentId`, `LabReferral` by
   `prescriptionId: {$in: prescriptionIds}`, `LabBooking` by
   `referralId: {$in: referralIds}`). Otherwise, query
   `Appointment`/`Prescription`/`LabReferral`/`LabBooking` directly by
   `patientId` (all four models already carry that field).
3. For each `Appointment`/`Prescription`/`LabReferral`, resolve the
   `doctorDisplay` string via one batched `DoctorProfile.find({_id: {$in: [...]}}).populate('userId', 'name')`-style lookup (or per-id lookups — Task 4's integration tests will catch an N+1 that breaks under load, but at this data volume correctness matters far more than micro-optimizing query count). Resolve `labDisplay` similarly from `LabProfile`.
4. Call the Task 2 mapper functions, `flatMap` the `MedicationRequest`
   arrays, filter `LabBooking`s to those with a `reportUrl` before mapping
   to `DiagnosticReport`.
5. Return `{ resourceType: 'Bundle', type: 'collection', timestamp: new Date().toISOString(), entry: [...] }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- fhirExport.service.test.ts`
Expected: PASS (5 authorization cases + 1 bundle-shape case)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/fhirExport/fhirExport.service.ts apps/api/src/modules/fhirExport/fhirExport.service.test.ts
git commit -m "feat(api): add FHIR export authorization + bundle-builder orchestration"
```

---

### Task 4: Route, controller, audit logging, and the full auth-matrix integration test

**Files:**
- Create: `apps/api/src/modules/fhirExport/fhirExport.controller.ts`, `fhirExport.routes.ts`
- Create: `apps/api/src/modules/fhirExport/fhirExport.test.ts`
- Modify: `apps/api/src/app.ts` (mount the new router)

**Interfaces:**
- Consumes: `canExportPatient`, `buildFhirBundle` (Task 3);
  `FhirExportQuery` (Task 1); `requireAuth`, `requireRole` (existing,
  `middleware/auth.ts`); `validate` (existing, `middleware/validate.ts`);
  `apiLimiter` (existing, `middleware/rateLimit.ts`); `logAudit` (existing).
- Produces: `GET /api/fhir/Patient/:patientId/$everything-lite` — the
  feature's public surface; nothing downstream consumes this module.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/fhirExport/fhirExport.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../app';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
import { AuditLog } from '../../models/AuditLog';
import { DoctorProfile } from '../../models/DoctorProfile';
import { Appointment } from '../../models/Appointment';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
beforeEach(async () => { await resetTestRedis(); });
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
  return { cookies: res.headers['set-cookie'] as unknown as string[], body: res.body };
}

describe('GET /api/fhir/Patient/:patientId/$everything-lite', () => {
  it('401s with no session', async () => {
    const app = createApp();
    const res = await request(app).get(`/api/fhir/Patient/${new mongoose.Types.ObjectId()}/$everything-lite`);
    expect(res.status).toBe(401);
  });

  it('200s for a patient exporting their own data', async () => {
    const app = createApp();
    const { cookies, body } = await registerAndLogin(app, 'patient', 'self@medlink.demo');
    const res = await request(app).get(`/api/fhir/Patient/${body.user.id}/$everything-lite`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('403s for a patient exporting someone else\'s data', async () => {
    const app = createApp();
    await registerAndLogin(app, 'patient', 'other@medlink.demo');
    const { cookies: selfCookies } = await registerAndLogin(app, 'patient', 'self2@medlink.demo');
    const other = await registerAndLogin(app, 'patient', 'other2@medlink.demo');
    const res = await request(app).get(`/api/fhir/Patient/${other.body.user.id}/$everything-lite`).set('Cookie', selfCookies);
    expect(res.status).toBe(403);
  });

  it('403s for a lab account (blocked at the router)', async () => {
    const app = createApp();
    const { cookies: labCookies } = await registerAndLogin(app, 'lab', 'lab@medlink.demo');
    const res = await request(app).get(`/api/fhir/Patient/${new mongoose.Types.ObjectId()}/$everything-lite`).set('Cookie', labCookies);
    expect(res.status).toBe(403);
  });

  it('200s and writes an AuditLog row for admin exporting any patient', async () => {
    const app = createApp();
    const patient = await registerAndLogin(app, 'patient', 'p3@medlink.demo');
    const admin = await registerAndLogin(app, 'admin', 'admin3@medlink.demo');
    const res = await request(app).get(`/api/fhir/Patient/${patient.body.user.id}/$everything-lite`).set('Cookie', admin.cookies);
    expect(res.status).toBe(200);
    const logs = await AuditLog.find({ action: 'fhir_export' });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.actorRole).toBe('admin');
  });

  it('404s for a patientId that is not a patient user', async () => {
    const app = createApp();
    const admin = await registerAndLogin(app, 'admin', 'admin4@medlink.demo');
    const res = await request(app).get(`/api/fhir/Patient/${new mongoose.Types.ObjectId()}/$everything-lite`).set('Cookie', admin.cookies);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- fhirExport.test.ts`
Expected: FAIL — router not mounted / module doesn't exist (404s or import errors, not the expected status codes)

- [ ] **Step 3: Implement controller, routes, and mount**

```ts
// apps/api/src/modules/fhirExport/fhirExport.controller.ts
import { Request, Response, NextFunction } from 'express';
import { canExportPatient, buildFhirBundle } from './fhirExport.service';
import { logAudit } from '../audit/audit.service';
import { AppError } from '../../lib/errors';

export async function getFhirExportHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { patientId } = req.params as { patientId: string };
    const { encounterId } = req.query as { encounterId?: string };

    const authorized = await canExportPatient({ id: req.user!.id, role: req.user!.role }, patientId);
    if (!authorized) throw new AppError(403, 'Not authorized to export this patient\'s data', 'FORBIDDEN');

    const bundle = await buildFhirBundle(patientId, { encounterId });

    const counts = bundle.entry.reduce<Record<string, number>>((acc, e) => {
      acc[e.resource.resourceType] = (acc[e.resource.resourceType] ?? 0) + 1;
      return acc;
    }, {});
    await logAudit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'fhir_export',
      entityType: 'Patient',
      entityId: patientId,
      meta: { encounterId, resourceCounts: counts },
    });

    res.status(200).json(bundle);
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/fhirExport/fhirExport.routes.ts
import { Router } from 'express';
import { FhirExportQuery } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { apiLimiter } from '../../middleware/rateLimit';
import { getFhirExportHandler } from './fhirExport.controller';

export const fhirExportRouter = Router();

fhirExportRouter.use(apiLimiter);
fhirExportRouter.use(requireAuth, requireRole('patient', 'doctor', 'admin'));
fhirExportRouter.get(
  '/Patient/:patientId/$everything-lite',
  validate(FhirExportQuery, 'query'),
  getFhirExportHandler
);
```

Order matters in `buildFhirBundle`'s 404-before-403 note from the design
spec: `canExportPatient` runs first in the controller above, which for a
`patient`/`doctor` caller returns `false` (not a DB lookup failure) before
ever reaching the "does this patientId exist" check inside
`buildFhirBundle` — re-check against the design spec's stated ordering
during implementation; if `canExportPatient`'s doctor branch would 403
before a nonexistent-patient 404 is ever reached, that's an acceptable
simplification (a 403 leaks no more than a 404 would here), but note the
deviation in the PR description if so.

```ts
// apps/api/src/app.ts -- add alongside the other app.use(...) route mounts
import { fhirExportRouter } from './modules/fhirExport/fhirExport.routes';
// ...
app.use('/api/fhir', fhirExportRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- fhirExport.test.ts`
Expected: PASS (6 cases). Also run the full API suite to confirm nothing
else regressed: `npm run test --workspace=apps/api`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/fhirExport/fhirExport.controller.ts apps/api/src/modules/fhirExport/fhirExport.routes.ts apps/api/src/modules/fhirExport/fhirExport.test.ts apps/api/src/app.ts
git commit -m "feat(api): mount audited FHIR-lite export endpoint at GET /api/fhir/Patient/:id/\$everything-lite"
```

---

### Task 5: README "FHIR Mapping" table

**Files:**
- Modify: `README.md` (repo root, or `apps/api/README.md` if that's where
  this repo documents individual-service internals by the time this task
  starts — check which exists first; CLAUDE.md §6.7 implies a root
  `README.md` is the canonical place demo/interview-facing documentation
  already lives)

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by other tasks — this is the CLAUDE.md §2-mandated
  "README 'FHIR Mapping' table" deliverable, standalone.

- [ ] **Step 1: Write the table**

Add a new `## FHIR-lite Export` section documenting:
1. The endpoint (`GET /api/fhir/Patient/:patientId/$everything-lite`,
   optional `?encounterId=`) and who can call it (patient/own data,
   treating doctor, admin).
2. The mapping table, copied from the design spec §1 (MedLink model/field
   → FHIR resourceType/field), including the `DoctorProfile≈Practitioner`-style
   row CLAUDE.md §2 explicitly asks for — as an inline display string, not
   a separate resource, per this plan's Task 2 (state that explicitly so a
   reader doesn't expect a `Practitioner` resourceType in the output).
3. The interview one-liner CLAUDE.md §2 already wrote: "custom data model
   for velocity, FHIR R4 export for interoperability."
4. One labeled limitation callout: `Patient._ageYears` instead of
   `birthDate` (design spec §1's rationale, one sentence).

- [ ] **Step 2: Verify**

Read the rendered section back; confirm every resourceType named in the
table (`Patient`, `Appointment`, `MedicationRequest`, `ServiceRequest`,
`DiagnosticReport`) matches exactly what Task 2's mapper emits — no drift
between docs and code.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add FHIR-lite export mapping table"
```
