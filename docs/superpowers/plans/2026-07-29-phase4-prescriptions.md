# Phase 4 — Prescriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A doctor closes a confirmed appointment by writing a prescription
(diagnosis, medicines, advice, follow-up date, recommended tests), which
generates an immutable, letterhead-branded PDF with a QR-code verification
link; the appointment auto-transitions to `completed`; the patient sees the
prescription in a chronological health timeline and can download the PDF;
amending a prescription creates a new, linked version rather than editing
the original.

**Architecture:** Pure Node/Express/Mongoose work — no new service. A new
`apps/api/src/modules/prescriptions/` module owns the write path
(doctor-only, appointment-scoped), PDF generation (`pdf-lib` + `qrcode`,
written to local disk under `apps/api/uploads/prescriptions/`, matching the
existing verification-docs upload pattern), and three read surfaces: an
authenticated, ownership-scoped PDF stream; a patient prescription
list/timeline; and a public, privacy-scoped verification lookup (no
diagnosis/medicine content) for the QR code's target URL.

**Tech Stack:** Existing stack only, plus two new npm dependencies in
`apps/api`: `pdf-lib` (PDF generation, per CLAUDE.md §0.3) and `qrcode`
(pure-JS QR PNG generation, no native deps).

## Global Constraints

- TypeScript strict everywhere; no `any`.
- Zod schemas in `packages/shared` are the single source of truth for the
  new API contracts (`CreatePrescriptionInput`).
- **Prescriptions are immutable — no edit endpoint exists.** "Amend" creates
  a new document (`version: n+1`) linked back via `supersededBy` on the
  original. This is CLAUDE.md §1's "legal-grade" modeling decision; it must
  never become editable, even for convenience.
- **Doctor is the only actor who can create a prescription** (CLAUDE.md
  §0.1.2). A prescription can only be created for an appointment with
  `status: 'confirmed'`, and only by the doctor that appointment belongs to.
- Creating a prescription auto-transitions its appointment to `'completed'`
  (CLAUDE.md §2 Phase 4) via the existing `appendTimelineEntry` atomic
  status-guard pattern from Phase 2 — never a bare `$set`.
- Every cross-role action leaves an audit trail (CLAUDE.md §0.1.3): log on
  create and on amend.
- The public verification endpoint (behind the PDF's QR code) must never
  leak diagnosis, medicines, or advice — it's a "yes, this is a real
  prescription issued by Dr. X, reg no Y, on date Z" check, not a medical
  record viewer. This is a deliberate privacy scoping decision for this
  plan: the URL may end up on a shared/found piece of paper.
- Every list endpoint: pagination + sort from day 1 (CLAUDE.md §3), matching
  the existing `apps/api/src/modules/appointments/appointments.controller.ts`
  pattern (`page`/`limit`/`total` in the response, capped `limit`).
- File uploads/generated files follow the existing `apps/api/src/modules/doctors/upload.ts`
  pattern: `fs.mkdirSync(dir, { recursive: true })` at module load, disk
  storage under `apps/api/uploads/`, never committed (already gitignored).

---

## File Structure

```
packages/shared/src/schemas/
└── prescription.ts             # NEW: CreatePrescriptionInput, AmendPrescriptionInput

packages/shared/src/
└── genericMedicines.ts         # NEW: static seeded generic-drug name list (autocomplete source)

apps/api/src/models/
└── Prescription.ts             # MODIFY: add version/supersededBy fields (closes a roadmap-flagged gap)

apps/api/src/modules/prescriptions/
├── prescriptions.service.ts     # createPrescription, amendPrescription, getPrescriptionPdfPath, getPublicVerification
├── prescriptions.pdf.ts         # generatePrescriptionPdf(...) -> Buffer (pdf-lib + qrcode)
├── prescriptions.controller.ts
├── prescriptions.routes.ts
├── prescriptions.pdf.test.ts
└── prescriptions.test.ts

apps/api/src/app.ts               # MODIFY: mount prescriptionsRouter

apps/web/src/store/
└── prescriptionsApi.ts          # RTK Query: create, amend, list-mine, get-one

apps/web/src/app/
├── appointments/[id]/prescribe/page.tsx   # doctor-only composer, only for confirmed appointments
├── prescriptions/[id]/page.tsx            # patient prescription detail + PDF download + amend history
├── dashboard/patient/timeline/page.tsx    # chronological health timeline (appointments + prescriptions)
└── rx/verify/[id]/page.tsx                # public verification page (no auth, no PHI)

apps/web/src/app/dashboard/doctor/page.tsx  # MODIFY: add "Write prescription" link on confirmed appointments

apps/api/src/seed/seed.ts          # MODIFY: add Phase 4's 6 seeded prescriptions
```

---

### Task 1: `Prescription` versioning fields + shared Zod schemas

**Files:**
- Modify: `apps/api/src/models/Prescription.ts`
- Create: `packages/shared/src/schemas/prescription.ts`, `packages/shared/src/genericMedicines.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/models/models.test.ts` (append), `packages/shared/src/schemas/schemas.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `IPrescription.version: number`, `IPrescription.supersededBy?: Types.ObjectId` — consumed by Task 3 (amend flow); `CreatePrescriptionInput`, `AmendPrescriptionInput` — consumed by Task 5's routes; `GENERIC_MEDICINES: readonly string[]` — consumed by Task 10's frontend composer.

This closes a gap flagged by the roadmap doc (`docs/superpowers/plans/2026-07-27-roadmap.md`): `Prescription.immutable` was a plain boolean with no actual versioning/linkage field, so CLAUDE.md's "amend creates v2 linked to v1" rule had nothing to link with.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/models/models.test.ts (append)
import { Prescription } from './Prescription';

describe('Prescription model', () => {
  it('defaults version to 1 and supersededBy to undefined', async () => {
    const rx = await Prescription.create({
      appointmentId: new mongoose.Types.ObjectId(),
      doctorId: new mongoose.Types.ObjectId(),
      patientId: new mongoose.Types.ObjectId(),
      diagnosisNote: 'Note',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest',
    });
    expect(rx.version).toBe(1);
    expect(rx.supersededBy).toBeUndefined();
    expect(rx.immutable).toBe(true);
  });

  it('persists a supersededBy link and an incremented version', async () => {
    const original = await Prescription.create({
      appointmentId: new mongoose.Types.ObjectId(),
      doctorId: new mongoose.Types.ObjectId(),
      patientId: new mongoose.Types.ObjectId(),
      diagnosisNote: 'Note v1',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest',
    });
    const amended = await Prescription.create({
      appointmentId: original.appointmentId,
      doctorId: original.doctorId,
      patientId: original.patientId,
      diagnosisNote: 'Note v2, corrected dosage',
      medicines: [{ name: 'Paracetamol', dosage: '650mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest',
      version: 2,
    });
    original.supersededBy = amended._id;
    await original.save();

    const reloaded = await Prescription.findById(original._id);
    expect(reloaded!.supersededBy!.toString()).toBe(amended._id.toString());
    expect(amended.version).toBe(2);
  });
});
```

```ts
// packages/shared/src/schemas/schemas.test.ts (append)
import { CreatePrescriptionInput, AmendPrescriptionInput } from './prescription';

describe('CreatePrescriptionInput', () => {
  it('requires at least one medicine and a diagnosis note', () => {
    expect(
      CreatePrescriptionInput.safeParse({ appointmentId: 'a', diagnosisNote: '', medicines: [], advice: 'Rest' }).success
    ).toBe(false);
  });
  it('accepts a valid payload', () => {
    const result = CreatePrescriptionInput.safeParse({
      appointmentId: 'a1',
      diagnosisNote: 'Viral fever',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest and fluids',
    });
    expect(result.success).toBe(true);
  });
});

describe('AmendPrescriptionInput', () => {
  it('requires the same shape as create, minus appointmentId', () => {
    const result = AmendPrescriptionInput.safeParse({
      diagnosisNote: 'Viral fever, revised',
      medicines: [{ name: 'Paracetamol', dosage: '650mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest and fluids',
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- models.test.ts` and `npm run test --workspace=@medlink/shared`
Expected: FAIL — `version`/`supersededBy` undefined where expected 1/linked; `CreatePrescriptionInput` module not found.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/models/Prescription.ts (modify — add to interface and schema)
export interface IPrescription {
  // ...existing fields...
  version: number;
  supersededBy?: Types.ObjectId;
}

// ...inside prescriptionSchema, add:
  version: { type: Number, default: 1 },
  supersededBy: { type: Schema.Types.ObjectId, ref: 'Prescription' },
```

```ts
// packages/shared/src/schemas/prescription.ts
import { z } from 'zod';

const MedicineInput = z.object({
  name: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  durationDays: z.coerce.number().int().positive(),
  instructions: z.string().optional(),
});

const RecommendedTestInput = z.object({
  testName: z.string().min(1),
});

export const CreatePrescriptionInput = z.object({
  appointmentId: z.string().min(1),
  diagnosisNote: z.string().min(1),
  medicines: z.array(MedicineInput).min(1),
  advice: z.string().min(1),
  followUpDate: z.coerce.date().optional(),
  recommendedTests: z.array(RecommendedTestInput).optional(),
});
export type CreatePrescriptionInput = z.infer<typeof CreatePrescriptionInput>;

export const AmendPrescriptionInput = CreatePrescriptionInput.omit({ appointmentId: true });
export type AmendPrescriptionInput = z.infer<typeof AmendPrescriptionInput>;
```

```ts
// packages/shared/src/genericMedicines.ts
// Seeded autocomplete source for the prescription composer's medicine name
// field. Static reference data -- no admin-editable requirement in CLAUDE.md,
// so a plain constant is sufficient (YAGNI: no backend endpoint needed).
export const GENERIC_MEDICINES: readonly string[] = [
  'Paracetamol',
  'Ibuprofen',
  'Cetirizine',
  'Levocetirizine',
  'Amoxicillin',
  'Azithromycin',
  'Pantoprazole',
  'Omeprazole',
  'Domperidone',
  'Ondansetron',
  'Metronidazole',
  'Ciprofloxacin',
  'Amlodipine',
  'Atenolol',
  'Losartan',
  'Metformin',
  'Glimepiride',
  'Atorvastatin',
  'Salbutamol',
  'Montelukast',
  'Hydrocortisone Cream',
  'Betamethasone Cream',
  'Clotrimazole Cream',
  'Diclofenac',
  'Aceclofenac',
  'Vitamin D3',
  'Vitamin B12',
  'Calcium Carbonate',
  'Iron + Folic Acid',
  'ORS Sachets',
  'Loperamide',
  'Ranitidine',
  'Sertraline',
  'Escitalopram',
  'Alprazolam',
  'Thyroxine',
  'Insulin (Regular)',
  'Insulin (NPH)',
  'Amoxiclav',
  'Doxycycline',
  'Prednisolone',
];
```

```ts
// packages/shared/src/index.ts (add lines)
export * from './schemas/prescription';
export * from './genericMedicines';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- models.test.ts` and `npm run test --workspace=@medlink/shared`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/models/Prescription.ts packages/shared/src/schemas/prescription.ts packages/shared/src/genericMedicines.ts packages/shared/src/index.ts apps/api/src/models/models.test.ts packages/shared/src/schemas/schemas.test.ts
git commit -m "feat(api,shared): add Prescription versioning fields and prescription Zod schemas"
```

---

### Task 2: Install `pdf-lib` and `qrcode`

**Files:**
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the `pdf-lib` and `qrcode` (+ `@types/qrcode`) packages available to Task 4's PDF generator.

- [ ] **Step 1: Install**

```bash
cd apps/api && npm install pdf-lib qrcode && npm install -D @types/qrcode
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck --workspace=apps/api` (should still pass — nothing imports these yet).

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json package-lock.json
git commit -m "chore(api): add pdf-lib and qrcode dependencies for prescription PDFs"
```

---

### Task 3: `createPrescription` service (doctor-only, confirmed-appointment-only, auto-completes the appointment)

**Files:**
- Create: `apps/api/src/modules/prescriptions/prescriptions.service.ts`, `prescriptions.test.ts`

**Interfaces:**
- Consumes: `Prescription` model (Task 1), `Appointment`/`appendTimelineEntry` (Phase 2's `appointments.service.ts`), `DoctorProfile`, `emitAppointmentUpdate` (`lib/socket.ts`), `logAudit` (`modules/audit/audit.service.ts`), `AppError`.
- Produces: `createPrescription(doctorUserId: string, input: CreatePrescriptionInput): Promise<IPrescription>` — consumed by Task 5's controller.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/prescriptions/prescriptions.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPrescription } from './prescriptions.service';
import { Appointment } from '../../models/Appointment';
import { DoctorProfile } from '../../models/DoctorProfile';
import { User } from '../../models/User';
import { Prescription } from '../../models/Prescription';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Prescription.init();
  await Appointment.init();
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function seedConfirmedAppointment() {
  const doctorUser = await User.create({ role: 'doctor', email: `doc-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Test' });
  const patientUser = await User.create({ role: 'patient', email: `pat-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Patient Test' });
  const doctorProfile = await DoctorProfile.create({
    userId: doctorUser._id, specialties: ['General Physician'], qualifications: ['MBBS'], regNo: 'DMC/R/12345',
    experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
    consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
  });
  const appointment = await Appointment.create({
    patientId: patientUser._id, doctorId: doctorProfile._id,
    slotStart: new Date(Date.now() - 60 * 60 * 1000), slotEnd: new Date(Date.now() - 30 * 60 * 1000),
    status: 'confirmed', timeline: [{ status: 'confirmed', at: new Date(), by: doctorUser._id }],
  });
  return { doctorUser, patientUser, doctorProfile, appointment };
}

describe('createPrescription', () => {
  it('creates a prescription and auto-completes the appointment', async () => {
    const { doctorUser, patientUser, appointment } = await seedConfirmedAppointment();

    const prescription = await createPrescription(doctorUser._id.toString(), {
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'Viral fever',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest and fluids',
    });

    expect(prescription.diagnosisNote).toBe('Viral fever');
    expect(prescription.patientId.toString()).toBe(patientUser._id.toString());
    expect(prescription.version).toBe(1);

    const updatedAppointment = await Appointment.findById(appointment._id);
    expect(updatedAppointment!.status).toBe('completed');
  });

  it('rejects a doctor who does not own the appointment', async () => {
    const { appointment } = await seedConfirmedAppointment();
    const otherDoctorUser = await User.create({ role: 'doctor', email: `other-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Other' });
    await DoctorProfile.create({
      userId: otherDoctorUser._id, specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: 'DMC/R/54321',
      experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
      consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
    });

    await expect(
      createPrescription(otherDoctorUser._id.toString(), {
        appointmentId: appointment._id.toString(),
        diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
      })
    ).rejects.toThrow();
  });

  it('rejects an appointment that is not confirmed', async () => {
    const { doctorUser, appointment } = await seedConfirmedAppointment();
    appointment.status = 'requested';
    await appointment.save();

    await expect(
      createPrescription(doctorUser._id.toString(), {
        appointmentId: appointment._id.toString(),
        diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- prescriptions.test.ts`
Expected: FAIL — `Cannot find module './prescriptions.service'`

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/prescriptions/prescriptions.service.ts
import { Types } from 'mongoose';
import { Prescription, IPrescription } from '../../models/Prescription';
import { Appointment } from '../../models/Appointment';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';
import { emitAppointmentUpdate } from '../../lib/socket';
import { appendTimelineEntry } from '../appointments/appointments.service';
import type { CreatePrescriptionInput, AmendPrescriptionInput } from '@medlink/shared';

export async function createPrescription(
  doctorUserId: string,
  input: CreatePrescriptionInput
): Promise<IPrescription> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const appointment = await Appointment.findOne({ _id: input.appointmentId, doctorId: doctorProfile._id });
  if (!appointment) throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
  if (appointment.status !== 'confirmed') {
    throw new AppError(409, 'Prescriptions can only be written for confirmed appointments', 'INVALID_APPOINTMENT_STATUS');
  }

  const prescription = await Prescription.create({
    appointmentId: appointment._id,
    doctorId: doctorProfile._id,
    patientId: appointment.patientId,
    diagnosisNote: input.diagnosisNote,
    medicines: input.medicines,
    advice: input.advice,
    followUpDate: input.followUpDate,
    recommendedTests: input.recommendedTests ?? [],
  });

  // Auto-transition the appointment to 'completed', reusing Phase 2's atomic
  // status-guard helper (single findOneAndUpdate with the guard folded into
  // the filter) rather than a bare save/$set.
  const updatedAppointment = await appendTimelineEntry(appointment._id.toString(), 'completed', doctorUserId, {}, {
    doctorId: doctorProfile._id,
    status: 'confirmed',
  });
  if (updatedAppointment) {
    emitAppointmentUpdate(doctorUserId, updatedAppointment);
    emitAppointmentUpdate(updatedAppointment.patientId.toString(), updatedAppointment);
  }

  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'prescription.created',
    entityType: 'Prescription', entityId: prescription._id.toString(),
    meta: { appointmentId: appointment._id.toString() },
  });

  return prescription;
}

export async function amendPrescription(
  doctorUserId: string,
  prescriptionId: string,
  input: AmendPrescriptionInput
): Promise<IPrescription> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const original = await Prescription.findOne({ _id: prescriptionId, doctorId: doctorProfile._id });
  if (!original) throw new AppError(404, 'Prescription not found', 'PRESCRIPTION_NOT_FOUND');
  if (original.supersededBy) {
    throw new AppError(409, 'This prescription has already been amended', 'ALREADY_AMENDED');
  }

  const amended = await Prescription.create({
    appointmentId: original.appointmentId,
    doctorId: original.doctorId,
    patientId: original.patientId,
    diagnosisNote: input.diagnosisNote,
    medicines: input.medicines,
    advice: input.advice,
    followUpDate: input.followUpDate,
    recommendedTests: input.recommendedTests ?? [],
    version: original.version + 1,
  });

  original.supersededBy = amended._id;
  await original.save();

  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'prescription.amended',
    entityType: 'Prescription', entityId: amended._id.toString(),
    meta: { supersedes: original._id.toString() },
  });

  return amended;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- prescriptions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/prescriptions/prescriptions.service.ts apps/api/src/modules/prescriptions/prescriptions.test.ts
git commit -m "feat(api): createPrescription service (doctor-only, confirmed-only, auto-completes appointment)"
```

---

### Task 4: `amendPrescription` tests

**Files:**
- Modify: `apps/api/src/modules/prescriptions/prescriptions.test.ts`

**Interfaces:**
- Consumes: `amendPrescription` (Task 3, already implemented — this task is purely the TDD test coverage for it, since Task 3's implementation step included both functions for interface cohesion, but the plan tests them as separate steps to keep each task's own test-first cycle honest).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/prescriptions/prescriptions.test.ts (append)
import { amendPrescription } from './prescriptions.service';

describe('amendPrescription', () => {
  it('creates a linked v2 and marks the original as superseded, without editing it', async () => {
    const { doctorUser, appointment } = await seedConfirmedAppointment();
    const original = await createPrescription(doctorUser._id.toString(), {
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'Viral fever',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest',
    });

    const amended = await amendPrescription(doctorUser._id.toString(), original._id.toString(), {
      diagnosisNote: 'Viral fever, corrected dosage',
      medicines: [{ name: 'Paracetamol', dosage: '650mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest and fluids',
    });

    expect(amended.version).toBe(2);
    expect(amended.diagnosisNote).toBe('Viral fever, corrected dosage');

    const reloadedOriginal = await Prescription.findById(original._id);
    expect(reloadedOriginal!.diagnosisNote).toBe('Viral fever'); // untouched
    expect(reloadedOriginal!.supersededBy!.toString()).toBe(amended._id.toString());
  });

  it('rejects amending a prescription that has already been amended', async () => {
    const { doctorUser, appointment } = await seedConfirmedAppointment();
    const original = await createPrescription(doctorUser._id.toString(), {
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'v1', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    });
    await amendPrescription(doctorUser._id.toString(), original._id.toString(), {
      diagnosisNote: 'v2', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    });

    await expect(
      amendPrescription(doctorUser._id.toString(), original._id.toString(), {
        diagnosisNote: 'v3', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
      })
    ).rejects.toThrow();
  });

  it('rejects a doctor amending a prescription they did not write', async () => {
    const { doctorUser, appointment } = await seedConfirmedAppointment();
    const original = await createPrescription(doctorUser._id.toString(), {
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'v1', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    });
    const otherDoctorUser = await User.create({ role: 'doctor', email: `other2-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Other2' });
    await DoctorProfile.create({
      userId: otherDoctorUser._id, specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: 'DMC/R/99999',
      experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
      consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
    });

    await expect(
      amendPrescription(otherDoctorUser._id.toString(), original._id.toString(), {
        diagnosisNote: 'v2', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- prescriptions.test.ts`
Expected: These 3 new tests FAIL only if `amendPrescription` doesn't exist yet — since Task 3 already implemented it, run this step immediately after Task 3's Step 3 in practice; if executed strictly in isolation, temporarily comment out the `amendPrescription` export to observe red, per TDD discipline, then restore it.

- [ ] **Step 3: Confirm implementation (already written in Task 3)**

No new implementation code — `amendPrescription` was written in Task 3 alongside `createPrescription` because both share the same doctor-ownership/prescription-model concerns and splitting the implementation across two commits would leave Task 3 half-finished. This task's contribution is the dedicated test coverage proving the amend contract in isolation.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- prescriptions.test.ts`
Expected: PASS (6 tests total: 3 from Task 3 + 3 from this task)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/prescriptions/prescriptions.test.ts
git commit -m "test(api): amendPrescription coverage (linked v2, already-amended guard, ownership guard)"
```

---

### Task 5: PDF generation (`pdf-lib` + `qrcode`)

**Files:**
- Create: `apps/api/src/modules/prescriptions/prescriptions.pdf.ts`, `prescriptions.pdf.test.ts`

**Interfaces:**
- Consumes: `IPrescription`, `IDoctorProfile`, `IUser` (doctor + patient names).
- Produces: `generatePrescriptionPdf(params: { prescription: IPrescription; doctorProfile: IDoctorProfile; doctorUser: IUser; patientUser: IUser; verifyBaseUrl: string }): Promise<Buffer>` — consumed by Task 6's service integration.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/prescriptions/prescriptions.pdf.test.ts
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { Types } from 'mongoose';
import { generatePrescriptionPdf } from './prescriptions.pdf';

function fakeIds() {
  return { _id: new Types.ObjectId() };
}

describe('generatePrescriptionPdf', () => {
  it('produces a valid, parseable single-page PDF', async () => {
    const prescription = {
      ...fakeIds(),
      diagnosisNote: 'Viral fever',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5, instructions: 'After food' }],
      advice: 'Rest and fluids',
      recommendedTests: [],
      version: 1,
      createdAt: new Date('2026-01-01'),
    } as never;
    const doctorProfile = {
      clinicName: 'HealthFirst Clinic',
      clinicAddress: 'Sector 62, Noida',
      regNo: 'DMC/R/12345',
    } as never;
    const doctorUser = { name: 'Dr. Meera Sharma' } as never;
    const patientUser = { name: 'Rahul Sharma' } as never;

    const buffer = await generatePrescriptionPdf({
      prescription,
      doctorProfile,
      doctorUser,
      patientUser,
      verifyBaseUrl: 'http://localhost:3000',
    });

    expect(buffer.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- prescriptions.pdf.test.ts`
Expected: FAIL — `Cannot find module './prescriptions.pdf'`

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/prescriptions/prescriptions.pdf.ts
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import type { IPrescription } from '../../models/Prescription';
import type { IDoctorProfile } from '../../models/DoctorProfile';
import type { IUser } from '../../models/User';

export async function generatePrescriptionPdf(params: {
  prescription: IPrescription;
  doctorProfile: IDoctorProfile;
  doctorUser: IUser;
  patientUser: IUser;
  verifyBaseUrl: string;
}): Promise<Buffer> {
  const { prescription, doctorProfile, doctorUser, patientUser, verifyBaseUrl } = params;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let y = 800;
  const left = 50;
  const lineHeight = 18;

  const drawText = (text: string, opts: { bold?: boolean; italic?: boolean; size?: number } = {}) => {
    page.drawText(text, {
      x: left,
      y,
      size: opts.size ?? 11,
      font: opts.bold ? boldFont : opts.italic ? italicFont : font,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;
  };

  // Letterhead
  drawText(doctorProfile.clinicName, { bold: true, size: 16 });
  drawText(doctorProfile.clinicAddress, { size: 10 });
  drawText(`Dr. ${doctorUser.name} — Reg. No: ${doctorProfile.regNo}`, { size: 10 });
  y -= 10;
  page.drawLine({ start: { x: left, y: y + 10 }, end: { x: 545, y: y + 10 }, thickness: 1, color: rgb(0, 0, 0) });
  y -= 10;

  drawText(`Patient: ${patientUser.name}`, { bold: true });
  drawText(`Date: ${prescription.createdAt.toDateString()}`);
  if (prescription.version > 1) {
    drawText(`Version ${prescription.version} (amended)`, { italic: true, size: 9 });
  }
  y -= 10;

  drawText('Diagnosis', { bold: true });
  drawText(prescription.diagnosisNote);
  y -= 5;

  drawText('Medicines', { bold: true });
  for (const med of prescription.medicines) {
    const instructions = med.instructions ? ` (${med.instructions})` : '';
    drawText(`- ${med.name} ${med.dosage}, ${med.frequency}, ${med.durationDays} days${instructions}`, { size: 10 });
  }
  y -= 5;

  drawText('Advice', { bold: true });
  drawText(prescription.advice);

  if (prescription.recommendedTests.length > 0) {
    y -= 5;
    drawText('Recommended Tests', { bold: true });
    for (const test of prescription.recommendedTests) {
      drawText(`- ${test.testName}`, { size: 10 });
    }
  }

  if (prescription.followUpDate) {
    y -= 5;
    drawText(`Follow-up: ${prescription.followUpDate.toDateString()}`);
  }

  // Signature (rendered as italic text -- no image-generation pipeline needed
  // for a demo-scale artifact; a real product would use an uploaded image).
  y -= 30;
  drawText(`Digitally signed by Dr. ${doctorUser.name}`, { italic: true, size: 10 });

  // QR code linking to the public, privacy-scoped verification page.
  const verifyUrl = `${verifyBaseUrl}/rx/verify/${prescription._id.toString()}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 120 });
  const qrImageBytes = Buffer.from(qrDataUrl.split(',')[1] ?? '', 'base64');
  const qrImage = await pdfDoc.embedPng(qrImageBytes);
  page.drawImage(qrImage, { x: 445, y: 60, width: 100, height: 100 });
  page.drawText('Scan to verify', { x: 460, y: 48, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
  page.drawText('DUMMY PRESCRIPTION — DEMO ONLY', { x: left, y: 30, size: 8, font, color: rgb(0.6, 0.6, 0.6) });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- prescriptions.pdf.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Lint/typecheck**

Run: `npm run typecheck --workspace=apps/api`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/prescriptions/prescriptions.pdf.ts apps/api/src/modules/prescriptions/prescriptions.pdf.test.ts
git commit -m "feat(api): prescription PDF generation with letterhead, signature line, and verification QR code"
```

---

### Task 6: Wire PDF generation into `createPrescription`/`amendPrescription`, persist to disk

**Files:**
- Modify: `apps/api/src/modules/prescriptions/prescriptions.service.ts`, `prescriptions.test.ts`

**Interfaces:**
- Consumes: `generatePrescriptionPdf` (Task 5).
- Produces: `createPrescription`/`amendPrescription` now populate `Prescription.pdfUrl` — consumed by Task 8's PDF-download route.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/prescriptions/prescriptions.test.ts (append, inside the createPrescription describe block or as a new one)
import fs from 'node:fs';

describe('createPrescription PDF generation', () => {
  it('generates a PDF file on disk and stores its path as pdfUrl', async () => {
    const { doctorUser, appointment } = await seedConfirmedAppointment();

    const prescription = await createPrescription(doctorUser._id.toString(), {
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'Viral fever',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest',
    });

    expect(prescription.pdfUrl).toBeTruthy();
    const diskPath = prescription.pdfUrl!.replace('/uploads/', '');
    const fullPath = `${process.cwd()}/uploads/${diskPath}`;
    expect(fs.existsSync(fullPath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- prescriptions.test.ts`
Expected: FAIL — `prescription.pdfUrl` is undefined.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/prescriptions/prescriptions.service.ts (modify)
import fs from 'node:fs';
import path from 'node:path';
import { User } from '../../models/User';
import { generatePrescriptionPdf } from './prescriptions.pdf';

const PDF_DIR = path.join(process.cwd(), 'uploads', 'prescriptions');
fs.mkdirSync(PDF_DIR, { recursive: true });

async function generateAndSavePdf(prescription: IPrescription, doctorProfile: IDoctorProfile): Promise<string> {
  const [doctorUser, patientUser] = await Promise.all([
    User.findById(doctorProfile.userId),
    User.findById(prescription.patientId),
  ]);
  const buffer = await generatePrescriptionPdf({
    prescription,
    doctorProfile,
    doctorUser: doctorUser!,
    patientUser: patientUser!,
    verifyBaseUrl: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  });
  const filename = `${prescription._id.toString()}.pdf`;
  fs.writeFileSync(path.join(PDF_DIR, filename), buffer);
  return `/uploads/prescriptions/${filename}`;
}

// Inside createPrescription, after `const prescription = await Prescription.create({...})`:
prescription.pdfUrl = await generateAndSavePdf(prescription, doctorProfile);
await prescription.save();

// Inside amendPrescription, after `const amended = await Prescription.create({...})`:
amended.pdfUrl = await generateAndSavePdf(amended, doctorProfile);
await amended.save();
```

(`IDoctorProfile` needs importing at the top of the file alongside the existing `DoctorProfile` model import — `import { DoctorProfile, IDoctorProfile } from '../../models/DoctorProfile';`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- prescriptions.test.ts`
Expected: PASS (all prescriptions.test.ts tests, now 7)

- [ ] **Step 5: Run the full suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/prescriptions/prescriptions.service.ts apps/api/src/modules/prescriptions/prescriptions.test.ts
git commit -m "feat(api): persist generated prescription PDFs to disk and store pdfUrl"
```

---

### Task 7: Public verification lookup (privacy-scoped)

**Files:**
- Modify: `apps/api/src/modules/prescriptions/prescriptions.service.ts`, `prescriptions.test.ts`

**Interfaces:**
- Consumes: `Prescription`, `DoctorProfile`, `User` models.
- Produces: `getPublicVerification(prescriptionId: string): Promise<{ doctorName: string; regNo: string; clinicName: string; issuedAt: Date; version: number; isLatestVersion: boolean } | null>` — consumed by Task 9's public route and the frontend `/rx/verify/[id]` page.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/prescriptions/prescriptions.test.ts (append)
import { getPublicVerification } from './prescriptions.service';

describe('getPublicVerification', () => {
  it('returns non-PHI verification info for a real prescription', async () => {
    const { doctorUser, appointment } = await seedConfirmedAppointment();
    const prescription = await createPrescription(doctorUser._id.toString(), {
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'Secret diagnosis, must not leak',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest',
    });

    const verification = await getPublicVerification(prescription._id.toString());

    expect(verification).not.toBeNull();
    expect(verification!.doctorName).toBe(doctorUser.name);
    expect(verification!.isLatestVersion).toBe(true);
    expect(JSON.stringify(verification)).not.toContain('Secret diagnosis');
  });

  it('returns null for a nonexistent prescription id', async () => {
    const verification = await getPublicVerification(new mongoose.Types.ObjectId().toString());
    expect(verification).toBeNull();
  });

  it('reports isLatestVersion: false for a superseded prescription', async () => {
    const { doctorUser, appointment } = await seedConfirmedAppointment();
    const original = await createPrescription(doctorUser._id.toString(), {
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'v1', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    });
    await amendPrescription(doctorUser._id.toString(), original._id.toString(), {
      diagnosisNote: 'v2', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    });

    const verification = await getPublicVerification(original._id.toString());
    expect(verification!.isLatestVersion).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- prescriptions.test.ts`
Expected: FAIL — `getPublicVerification` not exported.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/prescriptions/prescriptions.service.ts (append)
export async function getPublicVerification(prescriptionId: string): Promise<{
  doctorName: string;
  regNo: string;
  clinicName: string;
  issuedAt: Date;
  version: number;
  isLatestVersion: boolean;
} | null> {
  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) return null;

  const doctorProfile = await DoctorProfile.findById(prescription.doctorId);
  if (!doctorProfile) return null;
  const doctorUser = await User.findById(doctorProfile.userId);
  if (!doctorUser) return null;

  return {
    doctorName: doctorUser.name,
    regNo: doctorProfile.regNo,
    clinicName: doctorProfile.clinicName,
    issuedAt: prescription.createdAt,
    version: prescription.version,
    isLatestVersion: !prescription.supersededBy,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- prescriptions.test.ts`
Expected: PASS (all tests, now 10)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/prescriptions/prescriptions.service.ts apps/api/src/modules/prescriptions/prescriptions.test.ts
git commit -m "feat(api): privacy-scoped public prescription verification lookup"
```

---

### Task 8: Patient prescription list (paginated) + ownership-scoped PDF stream

**Files:**
- Modify: `apps/api/src/modules/prescriptions/prescriptions.service.ts`, `prescriptions.test.ts`

**Interfaces:**
- Consumes: `Prescription` model.
- Produces: `listMyPrescriptions(patientUserId: string, page: number, limit: number): Promise<{ items: IPrescription[]; total: number; page: number; limit: number }>`, `getPrescriptionPdfPath(prescriptionId: string, requestingUserId: string, requestingRole: string): Promise<string>` (returns an absolute disk path, throwing 404 if not found/not authorized) — consumed by Task 9's routes.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/prescriptions/prescriptions.test.ts (append)
import { listMyPrescriptions, getPrescriptionPdfPath } from './prescriptions.service';

describe('listMyPrescriptions', () => {
  it('returns only the requesting patient\'s prescriptions, paginated', async () => {
    const { doctorUser, patientUser, appointment } = await seedConfirmedAppointment();
    await createPrescription(doctorUser._id.toString(), {
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    });

    const result = await listMyPrescriptions(patientUser._id.toString(), 1, 20);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.patientId.toString()).toBe(patientUser._id.toString());
  });
});

describe('getPrescriptionPdfPath', () => {
  it('allows the owning patient to fetch the PDF path', async () => {
    const { doctorUser, patientUser, appointment } = await seedConfirmedAppointment();
    const prescription = await createPrescription(doctorUser._id.toString(), {
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    });

    const diskPath = await getPrescriptionPdfPath(prescription._id.toString(), patientUser._id.toString(), 'patient');
    expect(diskPath).toContain(prescription._id.toString());
  });

  it('allows the issuing doctor to fetch the PDF path', async () => {
    const { doctorUser, appointment } = await seedConfirmedAppointment();
    const prescription = await createPrescription(doctorUser._id.toString(), {
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    });

    const diskPath = await getPrescriptionPdfPath(prescription._id.toString(), doctorUser._id.toString(), 'doctor');
    expect(diskPath).toContain(prescription._id.toString());
  });

  it('rejects a different patient fetching someone else\'s PDF', async () => {
    const { doctorUser, appointment } = await seedConfirmedAppointment();
    const prescription = await createPrescription(doctorUser._id.toString(), {
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    });
    const otherPatient = await User.create({ role: 'patient', email: `other-pat-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Other Patient' });

    await expect(
      getPrescriptionPdfPath(prescription._id.toString(), otherPatient._id.toString(), 'patient')
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- prescriptions.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/prescriptions/prescriptions.service.ts (append)
export async function listMyPrescriptions(
  patientUserId: string,
  page: number,
  limit: number
): Promise<{ items: IPrescription[]; total: number; page: number; limit: number }> {
  const cappedLimit = Math.min(50, limit);
  const [items, total] = await Promise.all([
    Prescription.find({ patientId: patientUserId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * cappedLimit)
      .limit(cappedLimit),
    Prescription.countDocuments({ patientId: patientUserId }),
  ]);
  return { items, total, page, limit: cappedLimit };
}

export async function getPrescriptionPdfPath(
  prescriptionId: string,
  requestingUserId: string,
  requestingRole: string
): Promise<string> {
  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) throw new AppError(404, 'Prescription not found', 'PRESCRIPTION_NOT_FOUND');

  let authorized = false;
  if (requestingRole === 'patient' && prescription.patientId.toString() === requestingUserId) {
    authorized = true;
  } else if (requestingRole === 'doctor') {
    const doctorProfile = await DoctorProfile.findOne({ userId: requestingUserId });
    if (doctorProfile && prescription.doctorId.toString() === doctorProfile._id.toString()) {
      authorized = true;
    }
  }
  if (!authorized) throw new AppError(404, 'Prescription not found', 'PRESCRIPTION_NOT_FOUND');
  if (!prescription.pdfUrl) throw new AppError(404, 'Prescription PDF not available', 'PDF_NOT_AVAILABLE');

  return path.join(process.cwd(), prescription.pdfUrl.replace(/^\//, ''));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- prescriptions.test.ts`
Expected: PASS (all tests, now 14)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/prescriptions/prescriptions.service.ts apps/api/src/modules/prescriptions/prescriptions.test.ts
git commit -m "feat(api): paginated patient prescription list and ownership-scoped PDF path lookup"
```

---

### Task 9: Routes/controller + mount in `app.ts`

**Files:**
- Create: `apps/api/src/modules/prescriptions/prescriptions.controller.ts`, `prescriptions.routes.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/modules/prescriptions/prescriptions.test.ts`

**Interfaces:**
- Consumes: `createPrescription`, `amendPrescription`, `listMyPrescriptions`, `getPrescriptionPdfPath`, `getPublicVerification` (Tasks 3-8).
- Produces: `POST /api/prescriptions` (doctor-only), `POST /api/prescriptions/:id/amend` (doctor-only), `GET /api/prescriptions/me` (patient-only, paginated), `GET /api/prescriptions/:id/pdf` (authenticated, ownership-scoped stream), `GET /api/prescriptions/verify/:id` (public, no auth) — consumed by Task 10-13's frontend.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/prescriptions/prescriptions.test.ts (append)
import { createApp } from '../../app';
import request from 'supertest';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
// (add `beforeEach(async () => { await resetTestRedis(); });` near the top of the file
// alongside the existing beforeAll/afterEach/afterAll if not already present from a
// shared setup — check the file's current top-level hooks before adding a duplicate.)

async function registerLoginAndProfile(app: Express, role: 'doctor' | 'patient', email: string) {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'Test User', phone: '9999999999', role });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  const cookies = loginRes.headers['set-cookie'] as unknown as string[];
  return cookies;
}

describe('POST /api/prescriptions', () => {
  it('lets a doctor create a prescription for their own confirmed appointment', async () => {
    const app = createApp();
    const doctorEmail = `doc-http-${Date.now()}@medlink.demo`;
    const doctorCookies = await registerLoginAndProfile(app, 'doctor', doctorEmail);
    // Fetch the doctor's own profile id to seed a matching confirmed appointment directly via the model layer
    const doctorUserDoc = await User.findOne({ email: doctorEmail });
    const doctorProfile = await DoctorProfile.create({
      userId: doctorUserDoc!._id, specialties: ['General Physician'], qualifications: ['MBBS'], regNo: 'DMC/R/11111',
      experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
      consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
    });
    const patientUserDoc = await User.create({ role: 'patient', email: `pat-http-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'HTTP Patient' });
    const appointment = await Appointment.create({
      patientId: patientUserDoc._id, doctorId: doctorProfile._id,
      slotStart: new Date(Date.now() - 60 * 60 * 1000), slotEnd: new Date(Date.now() - 30 * 60 * 1000),
      status: 'confirmed', timeline: [{ status: 'confirmed', at: new Date(), by: doctorUserDoc!._id }],
    });

    const res = await request(app).post('/api/prescriptions').set('Cookie', doctorCookies).send({
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'Viral fever',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest',
    });

    expect(res.status).toBe(201);
    expect(res.body.prescription.diagnosisNote).toBe('Viral fever');
  });

  it('rejects a patient trying to create a prescription', async () => {
    const app = createApp();
    const patientCookies = await registerLoginAndProfile(app, 'patient', `pat-reject-${Date.now()}@medlink.demo`);
    const res = await request(app).post('/api/prescriptions').set('Cookie', patientCookies).send({
      appointmentId: new mongoose.Types.ObjectId().toString(), diagnosisNote: 'x',
      medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/prescriptions/verify/:id', () => {
  it('is publicly accessible with no auth cookie', async () => {
    const app = createApp();
    const res = await request(app).get(`/api/prescriptions/verify/${new mongoose.Types.ObjectId().toString()}`);
    expect(res.status).toBe(404); // nonexistent id, but reached the handler without a 401
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- prescriptions.test.ts`
Expected: FAIL — 404s on unmounted routes.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/prescriptions/prescriptions.controller.ts
import { Request, Response, NextFunction } from 'express';
import {
  createPrescription,
  amendPrescription,
  listMyPrescriptions,
  getPrescriptionPdfPath,
  getPublicVerification,
} from './prescriptions.service';
import { AppError } from '../../lib/errors';

export async function createPrescriptionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prescription = await createPrescription(req.user!.id, req.body);
    res.status(201).json({ prescription });
  } catch (err) {
    next(err);
  }
}

export async function amendPrescriptionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const prescription = await amendPrescription(req.user!.id, req.params.id as string, req.body);
    res.status(201).json({ prescription });
  } catch (err) {
    next(err);
  }
}

export async function listMyPrescriptionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 20);
    const result = await listMyPrescriptions(req.user!.id, page, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getPrescriptionPdfHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const diskPath = await getPrescriptionPdfPath(req.params.id as string, req.user!.id, req.user!.role);
    res.sendFile(diskPath);
  } catch (err) {
    next(err);
  }
}

export async function getPublicVerificationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const verification = await getPublicVerification(req.params.id as string);
    if (!verification) throw new AppError(404, 'Prescription not found', 'PRESCRIPTION_NOT_FOUND');
    res.status(200).json({ verification });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/prescriptions/prescriptions.routes.ts
import { Router } from 'express';
import { CreatePrescriptionInput, AmendPrescriptionInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createPrescriptionHandler,
  amendPrescriptionHandler,
  listMyPrescriptionsHandler,
  getPrescriptionPdfHandler,
  getPublicVerificationHandler,
} from './prescriptions.controller';

export const prescriptionsRouter = Router();

// Public verification lookup -- no auth, no PHI. Must be registered before
// the router-wide requireAuth below.
prescriptionsRouter.get('/verify/:id', getPublicVerificationHandler);

prescriptionsRouter.use(requireAuth);
prescriptionsRouter.post('/', requireRole('doctor'), validate(CreatePrescriptionInput), createPrescriptionHandler);
prescriptionsRouter.post('/:id/amend', requireRole('doctor'), validate(AmendPrescriptionInput), amendPrescriptionHandler);
prescriptionsRouter.get('/me', requireRole('patient'), listMyPrescriptionsHandler);
prescriptionsRouter.get('/:id/pdf', requireRole('patient', 'doctor'), getPrescriptionPdfHandler);
```

```ts
// apps/api/src/app.ts (modify)
import { prescriptionsRouter } from './modules/prescriptions/prescriptions.routes';
// ...
app.use('/api/prescriptions', prescriptionsRouter);
```

Note: `requireRole('patient', 'doctor')` on `/:id/pdf` allows both roles through the middleware gate; `getPrescriptionPdfPath`'s own ownership check (Task 8) is what actually enforces that a given patient/doctor may only fetch their own prescription's PDF, not any prescription belonging to either role generically.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- prescriptions.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/prescriptions/prescriptions.controller.ts apps/api/src/modules/prescriptions/prescriptions.routes.ts apps/api/src/app.ts apps/api/src/modules/prescriptions/prescriptions.test.ts
git commit -m "feat(api): mount prescription routes (create, amend, list-mine, pdf, public verify)"
```

---

### Task 10: RTK Query prescriptions API slice

**Files:**
- Create: `apps/web/src/store/prescriptionsApi.ts`

**Interfaces:**
- Consumes: `baseApi`.
- Produces: `useCreatePrescriptionMutation`, `useAmendPrescriptionMutation`, `useListMyPrescriptionsQuery`, `useGetPublicVerificationQuery` — consumed by Tasks 11-13.

- [ ] **Step 1: Implement**

```ts
// apps/web/src/store/prescriptionsApi.ts
import { baseApi } from './api';

export interface Medicine {
  name: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions?: string;
}
export interface RecommendedTest {
  testName: string;
}
export interface Prescription {
  _id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  diagnosisNote: string;
  medicines: Medicine[];
  advice: string;
  followUpDate?: string;
  recommendedTests: RecommendedTest[];
  pdfUrl?: string;
  createdAt: string;
  version: number;
  supersededBy?: string;
}

export interface CreatePrescriptionBody {
  appointmentId: string;
  diagnosisNote: string;
  medicines: Medicine[];
  advice: string;
  followUpDate?: string;
  recommendedTests?: RecommendedTest[];
}
export type AmendPrescriptionBody = Omit<CreatePrescriptionBody, 'appointmentId'>;

export interface PublicVerification {
  doctorName: string;
  regNo: string;
  clinicName: string;
  issuedAt: string;
  version: number;
  isLatestVersion: boolean;
}

export const prescriptionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createPrescription: builder.mutation<{ prescription: Prescription }, CreatePrescriptionBody>({
      query: (body) => ({ url: '/prescriptions', method: 'POST', body }),
      invalidatesTags: ['MyAppointments'],
    }),
    amendPrescription: builder.mutation<{ prescription: Prescription }, { id: string; body: AmendPrescriptionBody }>({
      query: ({ id, body }) => ({ url: `/prescriptions/${id}/amend`, method: 'POST', body }),
    }),
    listMyPrescriptions: builder.query<{ items: Prescription[]; total: number; page: number; limit: number }, { page?: number; limit?: number } | void>({
      query: (params) => ({ url: '/prescriptions/me', params: params ?? undefined }),
    }),
    getPublicVerification: builder.query<{ verification: PublicVerification }, string>({
      query: (id) => `/prescriptions/verify/${id}`,
    }),
  }),
});

export const {
  useCreatePrescriptionMutation,
  useAmendPrescriptionMutation,
  useListMyPrescriptionsQuery,
  useGetPublicVerificationQuery,
} = prescriptionsApi;
```

Check `apps/web/src/store/appointmentsApi.ts` for the exact tag name used for the appointments list cache (referenced above as `'MyAppointments'`) and match it exactly — this plan's placeholder name may not match the real tag string already defined in that file's `providesTags`.

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/store/prescriptionsApi.ts
git commit -m "feat(web): RTK Query endpoints for prescriptions"
```

---

### Task 11: Prescription composer page (doctor-only)

**Files:**
- Create: `apps/web/src/app/appointments/[id]/prescribe/page.tsx`
- Modify: `apps/web/src/app/dashboard/doctor/page.tsx`

**Interfaces:**
- Consumes: `useCreatePrescriptionMutation` (Task 10), `GENERIC_MEDICINES` (Task 1, from `@medlink/shared`).
- Produces: nothing consumed elsewhere in this plan.

- [ ] **Step 1: Implement the composer page**

```tsx
// apps/web/src/app/appointments/[id]/prescribe/page.tsx
'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GENERIC_MEDICINES } from '@medlink/shared';
import { useCreatePrescriptionMutation, type Medicine } from '@/store/prescriptionsApi';

export default function PrescribePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: appointmentId } = use(params);
  const router = useRouter();
  const [diagnosisNote, setDiagnosisNote] = useState('');
  const [advice, setAdvice] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [recommendedTestsText, setRecommendedTestsText] = useState('');
  const [medicines, setMedicines] = useState<Medicine[]>([
    { name: '', dosage: '', frequency: '', durationDays: 5, instructions: '' },
  ]);
  const [createPrescription, { isLoading, error }] = useCreatePrescriptionMutation();

  function updateMedicine(index: number, field: keyof Medicine, value: string) {
    setMedicines((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: field === 'durationDays' ? Number(value) : value } : m))
    );
  }

  function addMedicineRow() {
    setMedicines((prev) => [...prev, { name: '', dosage: '', frequency: '', durationDays: 5, instructions: '' }]);
  }

  async function onSubmit() {
    const recommendedTests = recommendedTestsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((testName) => ({ testName }));

    try {
      await createPrescription({
        appointmentId,
        diagnosisNote,
        medicines,
        advice,
        followUpDate: followUpDate || undefined,
        recommendedTests,
      }).unwrap();
      router.push('/dashboard/doctor');
    } catch {
      // error state below already reflects the failure
    }
  }

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Write Prescription</h1>

      <div>
        <label className="block text-sm font-medium">Diagnosis</label>
        <textarea className="border p-2 w-full" value={diagnosisNote} onChange={(e) => setDiagnosisNote(e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Medicines</label>
        {medicines.map((med, i) => (
          <div key={i} className="grid grid-cols-4 gap-2">
            <input
              className="border p-2"
              list="medicine-options"
              placeholder="Name"
              value={med.name}
              onChange={(e) => updateMedicine(i, 'name', e.target.value)}
            />
            <input className="border p-2" placeholder="Dosage" value={med.dosage} onChange={(e) => updateMedicine(i, 'dosage', e.target.value)} />
            <input className="border p-2" placeholder="Frequency" value={med.frequency} onChange={(e) => updateMedicine(i, 'frequency', e.target.value)} />
            <input
              className="border p-2"
              type="number"
              placeholder="Days"
              value={med.durationDays}
              onChange={(e) => updateMedicine(i, 'durationDays', e.target.value)}
            />
          </div>
        ))}
        <datalist id="medicine-options">
          {GENERIC_MEDICINES.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button type="button" className="text-sm underline" onClick={addMedicineRow}>
          + Add medicine
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium">Advice</label>
        <textarea className="border p-2 w-full" value={advice} onChange={(e) => setAdvice(e.target.value)} />
      </div>

      <div>
        <label className="block text-sm font-medium">Follow-up date (optional)</label>
        <input type="date" className="border p-2" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
      </div>

      <div>
        <label className="block text-sm font-medium">Recommended tests (comma-separated, optional)</label>
        <input className="border p-2 w-full" value={recommendedTestsText} onChange={(e) => setRecommendedTestsText(e.target.value)} />
      </div>

      <button className="bg-black text-white px-4 py-2" disabled={isLoading} onClick={onSubmit}>
        {isLoading ? 'Saving...' : 'Save Prescription'}
      </button>
      {error ? <p className="text-sm text-red-600">Something went wrong — please try again.</p> : null}
    </main>
  );
}
```

- [ ] **Step 2: Add a "Write prescription" link on confirmed appointments in the doctor dashboard**

Read `apps/web/src/app/dashboard/doctor/page.tsx` in full first. Add a conditional link inside each appointment card, only for `status === 'confirmed'`:

```tsx
// apps/web/src/app/dashboard/doctor/page.tsx (modify — add inside the appointment card's action area)
{appt.status === 'confirmed' ? (
  <Link href={`/appointments/${appt._id}/prescribe`} className="text-sm underline">
    Write prescription
  </Link>
) : null}
```

(Add `import Link from 'next/link';` at the top if not already imported.)

- [ ] **Step 3: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/appointments/[id]/prescribe/page.tsx apps/web/src/app/dashboard/doctor/page.tsx
git commit -m "feat(web): prescription composer page, linked from confirmed appointments on the doctor dashboard"
```

---

### Task 12: Patient prescription list + detail + PDF download + amend history

**Files:**
- Create: `apps/web/src/app/prescriptions/[id]/page.tsx`

**Interfaces:**
- Consumes: `useListMyPrescriptionsQuery`, `useAmendPrescriptionMutation` (Task 10).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/app/prescriptions/[id]/page.tsx
'use client';

import { use } from 'react';
import { useListMyPrescriptionsQuery } from '@/store/prescriptionsApi';

export default function PrescriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // There is no single-prescription GET endpoint (only /me, a list) --
  // find it client-side from the patient's own list, which is small enough
  // (a handful of prescriptions per patient in this project's scale) that a
  // dedicated single-item endpoint isn't justified yet (YAGNI).
  const { data, isLoading } = useListMyPrescriptionsQuery({ page: 1, limit: 50 });
  const prescription = data?.items.find((p) => p._id === id);

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading...</main>;
  if (!prescription) return <main className="max-w-2xl mx-auto mt-12">Prescription not found.</main>;

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Prescription</h1>
      {prescription.supersededBy ? (
        <p className="text-sm text-amber-700">This prescription has been amended — a newer version exists.</p>
      ) : null}
      <p><strong>Diagnosis:</strong> {prescription.diagnosisNote}</p>
      <div>
        <strong>Medicines:</strong>
        <ul className="list-disc pl-6">
          {prescription.medicines.map((m, i) => (
            <li key={i}>{m.name} {m.dosage}, {m.frequency}, {m.durationDays} days{m.instructions ? ` (${m.instructions})` : ''}</li>
          ))}
        </ul>
      </div>
      <p><strong>Advice:</strong> {prescription.advice}</p>
      {prescription.followUpDate ? <p><strong>Follow-up:</strong> {new Date(prescription.followUpDate).toDateString()}</p> : null}
      {prescription.pdfUrl ? (
        <a
          className="inline-block bg-black text-white px-4 py-2"
          href={`${process.env.NEXT_PUBLIC_API_URL}/prescriptions/${prescription._id}/pdf`}
          target="_blank"
          rel="noreferrer"
        >
          Download PDF
        </a>
      ) : null}
    </main>
  );
}
```

Check `apps/web/src/store/api.ts` (or wherever `baseApi` is configured) for the exact env var name used for the browser-reachable API base URL (referenced above as `NEXT_PUBLIC_API_URL`) — match it exactly to the established convention from Phase 1.

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/prescriptions/[id]/page.tsx
git commit -m "feat(web): patient prescription detail page with PDF download and amend indicator"
```

---

### Task 13: Patient health timeline (chronological)

**Files:**
- Create: `apps/web/src/app/dashboard/patient/timeline/page.tsx`

**Interfaces:**
- Consumes: `useListMyAppointmentsQuery` (Phase 2's `appointmentsApi.ts`), `useListMyPrescriptionsQuery` (Task 10).
- Produces: nothing consumed elsewhere in this plan (Phase 5 will later add lab referrals to this same timeline).

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/app/dashboard/patient/timeline/page.tsx
'use client';

import Link from 'next/link';
import { useListMyAppointmentsQuery } from '@/store/appointmentsApi';
import { useListMyPrescriptionsQuery } from '@/store/prescriptionsApi';

type TimelineEntry =
  | { kind: 'appointment'; at: string; label: string; id: string }
  | { kind: 'prescription'; at: string; label: string; id: string };

export default function PatientTimelinePage() {
  const { data: appointmentsData, isLoading: appointmentsLoading } = useListMyAppointmentsQuery({ page: 1, limit: 50 });
  const { data: prescriptionsData, isLoading: prescriptionsLoading } = useListMyPrescriptionsQuery({ page: 1, limit: 50 });

  if (appointmentsLoading || prescriptionsLoading) {
    return <main className="max-w-2xl mx-auto mt-12">Loading...</main>;
  }

  const entries: TimelineEntry[] = [
    ...(appointmentsData?.items.map((a) => ({
      kind: 'appointment' as const,
      at: a.slotStart,
      label: `Appointment (${a.status})`,
      id: a._id,
    })) ?? []),
    ...(prescriptionsData?.items.map((p) => ({
      kind: 'prescription' as const,
      at: p.createdAt,
      label: 'Prescription issued',
      id: p._id,
    })) ?? []),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Health Timeline</h1>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={`${entry.kind}-${entry.id}`} className="border p-3 rounded flex justify-between items-center">
            <span>{new Date(entry.at).toLocaleDateString()} — {entry.label}</span>
            {entry.kind === 'prescription' ? (
              <Link href={`/prescriptions/${entry.id}`} className="text-sm underline">
                View
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      {entries.length === 0 ? <p className="text-sm text-gray-600">No history yet.</p> : null}
    </main>
  );
}
```

Check `apps/web/src/store/appointmentsApi.ts` for the exact shape `useListMyAppointmentsQuery` returns (field names for the appointment list items — this plan assumes `_id`, `slotStart`, `status`, matching Phase 2/3's established `Appointment` type in that file) before assuming this compiles as-is; adjust field names to match reality if they differ.

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/patient/timeline/page.tsx
git commit -m "feat(web): chronological patient health timeline (appointments + prescriptions)"
```

---

### Task 14: Public prescription verification page

**Files:**
- Create: `apps/web/src/app/rx/verify/[id]/page.tsx`

**Interfaces:**
- Consumes: `useGetPublicVerificationQuery` (Task 10).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Implement**

```tsx
// apps/web/src/app/rx/verify/[id]/page.tsx
'use client';

import { use } from 'react';
import { useGetPublicVerificationQuery } from '@/store/prescriptionsApi';

export default function VerifyPrescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, isError } = useGetPublicVerificationQuery(id);

  if (isLoading) return <main className="max-w-md mx-auto mt-12">Checking...</main>;
  if (isError || !data) {
    return (
      <main className="max-w-md mx-auto mt-12">
        <p className="text-red-600">This prescription could not be verified.</p>
      </main>
    );
  }

  const { verification } = data;

  return (
    <main className="max-w-md mx-auto mt-12 space-y-3 border p-6 rounded">
      <h1 className="text-xl font-bold text-green-700">✓ Valid Prescription</h1>
      <p><strong>Issued by:</strong> Dr. {verification.doctorName}</p>
      <p><strong>Registration No:</strong> {verification.regNo}</p>
      <p><strong>Clinic:</strong> {verification.clinicName}</p>
      <p><strong>Issued on:</strong> {new Date(verification.issuedAt).toDateString()}</p>
      {!verification.isLatestVersion ? (
        <p className="text-amber-700 text-sm">Note: this prescription has since been amended by the doctor.</p>
      ) : null}
      <p className="text-xs text-gray-500">
        This page confirms the prescription's authenticity only. Diagnosis and medication details are not shown here for patient privacy.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/rx/verify/[id]/page.tsx
git commit -m "feat(web): public, privacy-scoped prescription verification page"
```

---

### Task 15: Phase 4 seed data (6 prescriptions)

**Files:**
- Modify: `apps/api/src/seed/seed.ts`
- Test: extend `apps/api/src/seed/seed.test.ts`

**Interfaces:**
- Consumes: `Prescription` model, existing seeded completed appointments (Phase 2).
- Produces: the 6-prescription slice of CLAUDE.md §6.4, per the roadmap's phase-by-phase seeding table.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/seed/seed.test.ts (append)
import { Prescription } from '../models/Prescription';

describe('runSeed — Phase 4 slice', () => {
  it('seeds exactly 6 prescriptions, at least 3 with recommendedTests, all linked to completed appointments', async () => {
    await runSeed();
    const prescriptions = await Prescription.find({});
    expect(prescriptions).toHaveLength(6);

    const withTests = prescriptions.filter((p) => p.recommendedTests.length > 0);
    expect(withTests.length).toBeGreaterThanOrEqual(3);

    for (const rx of prescriptions) {
      const appointment = await Appointment.findById(rx.appointmentId);
      expect(appointment).not.toBeNull();
      expect(appointment!.status).toBe('completed');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- seed.test.ts`
Expected: FAIL — 0 prescriptions.

- [ ] **Step 3: Implement**

Read the existing appointment-seeding block in `apps/api/src/seed/seed.ts` first to find the exact local variable names for the 6 already-seeded **completed** appointments (per CLAUDE.md §6.4 and Phase 2's seed slice: "6 completed... each with prescription"). Attach one prescription per completed appointment, using each appointment's own `doctorId`/`patientId` so the prescription's references line up with the real seeded relationship (not a different doctor/patient pairing):

```ts
// apps/api/src/seed/seed.ts (add after the appointment-seeding block, before or after Phase 3's TriageSession block)
await Prescription.deleteMany({});

const completedAppointments = await Appointment.find({ status: 'completed' }).sort({ slotStart: -1 }).limit(6);

const medicineSets = [
  [{ name: 'Cetirizine', dosage: '10mg', frequency: 'OD', durationDays: 5, instructions: 'At night' }],
  [{ name: 'Pantoprazole', dosage: '40mg', frequency: 'OD', durationDays: 14, instructions: 'Before breakfast' }],
  [{ name: 'Paracetamol', dosage: '500mg', frequency: 'SOS', durationDays: 3 }],
  [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', durationDays: 7, instructions: 'After food' }],
  [{ name: 'Ibuprofen', dosage: '400mg', frequency: 'BD', durationDays: 5 }],
  [{ name: 'Montelukast', dosage: '10mg', frequency: 'OD', durationDays: 30, instructions: 'At night' }],
];
const diagnosisNotes = [
  'Allergic dermatitis',
  'Acid reflux (GERD)',
  'Viral fever',
  'Bacterial throat infection',
  'Mild sprain',
  'Seasonal allergic rhinitis',
];
const adviceNotes = [
  'Avoid known allergens. Follow up if rash persists.',
  'Avoid spicy food, elevate head while sleeping.',
  'Rest, plenty of fluids.',
  'Complete the full course even if symptoms improve.',
  'Ice pack for 15 minutes, avoid strain.',
  'Avoid dust exposure, use a humidifier at night.',
];
const recommendedTestSets: { testName: string }[][] = [
  [],
  [{ testName: 'Complete Blood Count' }],
  [],
  [{ testName: 'Complete Blood Count' }, { testName: 'Throat Swab Culture' }],
  [],
  [{ testName: 'Allergy Panel' }],
];

for (let i = 0; i < completedAppointments.length; i++) {
  const appointment = completedAppointments[i]!;
  await Prescription.create({
    appointmentId: appointment._id,
    doctorId: appointment.doctorId,
    patientId: appointment.patientId,
    diagnosisNote: diagnosisNotes[i % diagnosisNotes.length],
    medicines: medicineSets[i % medicineSets.length],
    advice: adviceNotes[i % adviceNotes.length],
    recommendedTests: recommendedTestSets[i % recommendedTestSets.length],
    createdAt: appointment.slotStart,
  });
}
```

Note: this seed block deliberately does NOT call `generateAndSavePdf` from `prescriptions.service.ts` (that would require the full `pdf-lib`/`qrcode` machinery and doctor/patient user lookups running during every `npm run seed` invocation, which is slow and not something CLAUDE.md's seed spec requires — §6.4 only asks for realistic prescription *data*, and §6.5's dummy-file spec is scoped to the lab report PDF, not prescription PDFs). Seeded prescriptions will simply have no `pdfUrl` — this is acceptable for demo seed data and does not affect any test in this plan (Task 6's PDF-generation test exercises the real `createPrescription` code path directly, not the seed script).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- seed.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/seed/seed.ts apps/api/src/seed/seed.test.ts
git commit -m "feat(api): seed Phase 4's 6 demo prescriptions"
```

---

## Phase 4 Definition of Done (from CLAUDE.md §2)

Doctor writes a prescription for a confirmed appointment → the appointment
auto-completes → a downloadable, letterhead-branded, QR-verified PDF exists
→ the patient sees it in their health timeline and can download it →
amending creates a new linked version without touching the original →
scanning the QR code (or visiting `/rx/verify/{id}`) confirms authenticity
without exposing diagnosis or medicines.

## Self-Review Notes

- **Spec coverage:** every Phase 4 CLAUDE.md §2 checklist item maps to a
  task: prescription composer (doctor-only, confirmed-only) → Tasks 3, 11;
  medicine autocomplete from a seeded generic list → Tasks 1, 11; PDF
  generation with letterhead/reg no/QR → Tasks 5-6; immutability/amend-creates-v2
  → Tasks 1, 3-4, 12; patient prescription list + PDF download + health
  timeline → Tasks 8, 10, 12-13; appointment auto-completes on prescription
  creation → Task 3.
- **Roadmap gap closed:** `Prescription`'s versioning fields (`version`,
  `supersededBy`) — flagged by Phase 1's review, deferred to this phase,
  addressed in Task 1 and exercised throughout Tasks 3-4, 7, 12, 14.
- **Deliberate scope decisions, made directly rather than following
  CLAUDE.md/the seed spec completely literally:**
  - The prescription "signature" is rendered as italic text naming the
    doctor, not a generated cursive-font PNG image (CLAUDE.md §6.5's more
    literal spec) — this avoids building an image-generation/font-bundling
    pipeline for a demo-scale artifact with no material difference in the
    "legal-grade artifact" interview story; a real product would use an
    uploaded signature image, and that upload mechanism already exists as a
    precedent (`apps/api/src/modules/doctors/upload.ts`) if ever needed.
  - The public `/rx/verify/{id}` page intentionally does NOT show diagnosis,
    medicines, or advice — only doctor/clinic/date/version — since the QR
    code's target URL could end up on a shared or found piece of paper. This
    is a privacy-scoping decision beyond what CLAUDE.md's one-line spec
    ("QR code linking to verification URL") specifies, made in the spirit of
    CLAUDE.md §0.4's "designed with DPDP Act principles in mind."
  - Seeded prescriptions (Task 15) do not generate real PDF files (no
    `pdfUrl`) — only the real `createPrescription`/`amendPrescription` code
    paths (Tasks 3, 6) do that, and are covered by their own tests. Running
    full PDF generation for every seed invocation would be slow and isn't
    required by CLAUDE.md §6's seed spec, which only describes prescription
    *data*, not seeded PDF files (unlike §6.5's lab-report PDF, which IS
    explicitly required — that remains Phase 5's responsibility).
- **Type consistency check:** `CreatePrescriptionInput`/`AmendPrescriptionInput`
  (Task 1, Zod/shared) match `createPrescription`/`amendPrescription`'s
  (Task 3) parameter shapes field-for-field, and the frontend's
  `CreatePrescriptionBody`/`AmendPrescriptionBody` (Task 10) mirror them
  exactly — if a field is ever added to one, add it to all three.
