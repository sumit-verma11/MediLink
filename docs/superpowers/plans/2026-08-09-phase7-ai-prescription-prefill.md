# Phase 7 — "AI Suggests, Doctor Approves" Prescription Pre-fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the prescription composer for a confirmed appointment, a doctor
can click "Get AI Suggestions" to see specialty-keyed medicine/advice
suggestions (sourced from the patient's triage specialty, falling back to
the doctor's own specialty), each insertable one row at a time into the
real, already-editable form state. Nothing is ever pre-filled automatically,
and the read-only suggestion endpoint is structurally incapable of writing
to the `Prescription` collection — proven by a dedicated regression test.

Design reference:
`docs/superpowers/specs/2026-08-09-phase7-ai-prescription-prefill-design.md`.

**Architecture:** Extends the existing `apps/api`
`modules/prescriptions/` module with one new read-only route/handler/service
function — no new module, no new collection, no schema changes to
`Prescription`. One new leaf file in `packages/shared`
(`prescriptionSuggestions.ts`) holds the curated specialty → suggestion
lookup table, the same "static curated data" spirit as
`packages/shared/src/genericMedicines.ts` and `apps/ai/specialty_map.json`.
The new service function (`getPrescriptionSuggestions`) reuses
`createPrescription`'s exact ownership/status gate
(`DoctorProfile.findOne({userId})` → `Appointment.findOne({_id, doctorId})`
→ require `status === 'confirmed'`) but **only reads** — it never imports or
touches the `Prescription` model at all. `apps/web` gets a small,
button-triggered suggestion panel on the existing composer page
(`apps/appointments/[id]/prescribe/page.tsx`) that holds suggestions in
local state, entirely separate from the real `medicines`/`advice` form
state that Phase 4's unmodified `useCreatePrescriptionMutation` submits.
`apps/ai` is untouched.

**Tech Stack:** Same as the rest of the touched modules — Node 20,
TypeScript 5 (strict), Express 4, Mongoose 8, Zod 3 for the shared package;
Next.js 14 (App Router), Redux Toolkit Query for the web addition. No new
npm dependencies anywhere. Backend tests: Vitest + Supertest +
mongodb-memory-server, matching every existing `apps/api` module. Frontend:
build verification only (`npm run build --workspace=apps/web`) — no
automated frontend tests exist anywhere in this repo (confirmed: zero
`*.test.*` under `apps/web`), and Phase 4's own composer work shipped on
this same precedent.

## Global Constraints

- **Non-negotiable safety constraint (CLAUDE.md §0.1):** the suggestion
  endpoint and its underlying service function must never read or write the
  `Prescription` collection, and must be structurally incapable of causing
  a prescription to be created without the doctor's own explicit
  submit action. A dedicated regression test (Task 3) asserts
  `Prescription.countDocuments({})` stays `0` across repeated calls to the
  endpoint.
- No changes to `Prescription`'s schema, `CreatePrescriptionInput`, or
  `AmendPrescriptionInput` — this feature is additive and read-only on top
  of all of it (design spec Non-goals).
- No changes anywhere under `apps/ai` (design spec Design Decision 4).
- No new npm dependencies (design spec Non-goals; matches the rest of
  Phase 7's ₹0 tech choices).
- `MedicineSuggestion.name` values are drawn only from
  `GENERIC_MEDICINES` (`packages/shared/src/genericMedicines.ts`) so an
  inserted row is always recognized by the composer's existing autocomplete
  (design spec, Data shapes section).
- Route registration for `GET /api/prescriptions/suggest/:appointmentId` is
  gated by one boolean env var, `AI_PRESCRIPTION_SUGGESTIONS_ENABLED`
  (default enabled — only skip registration when explicitly set to
  `'false'`), read once in `prescriptions.routes.ts` — no new flag
  infrastructure (design spec Open Questions).
- Suggestions are inserted whole-row-at-a-time (no per-field insert) —
  matches the `medicines` array's existing row shape (design spec Open
  Questions).
- Every successful call writes exactly one `AuditLog` row via the existing
  `logAudit()`, action `prescription.ai_suggestion_viewed` (CLAUDE.md
  §0.1.3; design spec Design Decision 6).
- TypeScript strict everywhere; no `any` (CLAUDE.md §3).
- Conventional commits, one commit per task (CLAUDE.md §3).

---

## File Structure (new/changed files only)

```
medlink/
├── .env.example                              # + AI_PRESCRIPTION_SUGGESTIONS_ENABLED (Task 3)
├── apps/
│   ├── api/
│   │   ├── .env.example                      # + AI_PRESCRIPTION_SUGGESTIONS_ENABLED (Task 3)
│   │   └── src/modules/prescriptions/
│   │       ├── prescriptions.service.ts       # + getPrescriptionSuggestions() (Task 2)
│   │       ├── prescriptions.controller.ts    # + getPrescriptionSuggestionsHandler (Task 3)
│   │       ├── prescriptions.routes.ts        # + GET /suggest/:appointmentId, env-flag gate (Task 3)
│   │       └── prescriptions.suggest.test.ts  # service tests (Task 2) + route/regression tests (Task 3)
│   └── web/src/
│       ├── components/ui/
│       │   └── ai-suggestion-badge.tsx        # new component (Task 4)
│       ├── store/
│       │   └── prescriptionsApi.ts            # + getPrescriptionSuggestions query (Task 4)
│       └── app/appointments/[id]/prescribe/
│           └── page.tsx                       # suggestion panel + Insert actions (Task 5)
└── packages/shared/src/
    ├── prescriptionSuggestions.ts             # SPECIALTY_PRESCRIPTION_SUGGESTIONS map + types (Task 1)
    ├── prescriptionSuggestions.test.ts         # (Task 1)
    └── index.ts                               # + export * from './prescriptionSuggestions' (Task 1)
```

---

### Task 1: Shared curated specialty → prescription-suggestion map

**Files:**
- Create: `packages/shared/src/prescriptionSuggestions.ts`
- Create: `packages/shared/src/prescriptionSuggestions.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `GENERIC_MEDICINES` (existing, `packages/shared/src/genericMedicines.ts`) — only to validate the map's own data in this task's test, not a runtime dependency.
- Produces: `MedicineSuggestion`, `SpecialtySuggestionEntry` (TS interfaces), `SPECIALTY_PRESCRIPTION_SUGGESTIONS: Record<string, SpecialtySuggestionEntry>` — consumed by Task 2's `getPrescriptionSuggestions` service function.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/prescriptionSuggestions.test.ts
import { describe, it, expect } from 'vitest';
import { SPECIALTY_PRESCRIPTION_SUGGESTIONS } from './prescriptionSuggestions';
import { GENERIC_MEDICINES } from './genericMedicines';

// The 10 specialties actually seeded for demo doctors (apps/api/src/seed/data.ts) --
// the minimum set that must resolve a suggestion so every seeded doctor's
// composer has something to show, per the design spec's Data shapes section.
const SEEDED_SPECIALTIES = [
  'Dermatology', 'General Physician', 'Gastroenterology', 'Cardiology',
  'Gynecology', 'Orthopedics', 'Pediatrics', 'ENT', 'Psychiatry', 'Ophthalmology',
];

describe('SPECIALTY_PRESCRIPTION_SUGGESTIONS', () => {
  it('covers every specialty seeded for demo doctors', () => {
    for (const specialty of SEEDED_SPECIALTIES) {
      expect(SPECIALTY_PRESCRIPTION_SUGGESTIONS[specialty]).toBeDefined();
    }
  });

  it('gives every entry 1-3 medicines and a non-empty advice string', () => {
    for (const entry of Object.values(SPECIALTY_PRESCRIPTION_SUGGESTIONS)) {
      expect(entry.medicines.length).toBeGreaterThanOrEqual(1);
      expect(entry.medicines.length).toBeLessThanOrEqual(3);
      expect(entry.advice.length).toBeGreaterThan(0);
    }
  });

  it('only suggests medicine names that exist in GENERIC_MEDICINES', () => {
    for (const entry of Object.values(SPECIALTY_PRESCRIPTION_SUGGESTIONS)) {
      for (const medicine of entry.medicines) {
        expect(GENERIC_MEDICINES).toContain(medicine.name);
      }
    }
  });

  it('gives every medicine a dosage, frequency, and positive durationDays', () => {
    for (const entry of Object.values(SPECIALTY_PRESCRIPTION_SUGGESTIONS)) {
      for (const medicine of entry.medicines) {
        expect(medicine.dosage.length).toBeGreaterThan(0);
        expect(medicine.frequency.length).toBeGreaterThan(0);
        expect(medicine.durationDays).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@medlink/shared`
Expected: FAIL — `Cannot find module './prescriptionSuggestions'`

- [ ] **Step 3: Implement the map**

```ts
// packages/shared/src/prescriptionSuggestions.ts
// Curated, rule-based specialty -> suggested-medicines/advice lookup. This is
// NOT a trained model and makes no symptom-level claim -- same spirit as
// apps/ai/specialty_map.json (curated specialty<->symptom phrases) and
// genericMedicines.ts (curated static drug list). See design spec Design
// Decision 1 for why specialty (not free-text symptom matching) is the
// signal, and Non-goals for why this stays specialty-level.

export interface MedicineSuggestion {
  name: string; // must be one of GENERIC_MEDICINES
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions?: string;
}

export interface SpecialtySuggestionEntry {
  medicines: MedicineSuggestion[]; // 1-3 entries
  advice: string;
}

export const SPECIALTY_PRESCRIPTION_SUGGESTIONS: Record<string, SpecialtySuggestionEntry> = {
  Dermatology: {
    medicines: [
      { name: 'Cetirizine', dosage: '10mg', frequency: 'OD', durationDays: 5, instructions: 'After food' },
      { name: 'Hydrocortisone Cream', dosage: 'Apply thin layer', frequency: 'BD', durationDays: 7 },
    ],
    advice: 'Avoid known allergens; keep affected area clean and dry.',
  },
  'General Physician': {
    medicines: [
      { name: 'Paracetamol', dosage: '500mg', frequency: 'TDS', durationDays: 3, instructions: 'After food' },
    ],
    advice: 'Rest, stay hydrated, and monitor temperature; follow up if symptoms persist beyond 3 days.',
  },
  Gastroenterology: {
    medicines: [
      { name: 'Pantoprazole', dosage: '40mg', frequency: 'OD', durationDays: 14, instructions: 'Before breakfast' },
      { name: 'Domperidone', dosage: '10mg', frequency: 'BD', durationDays: 5, instructions: 'Before food' },
    ],
    advice: 'Avoid spicy/oily food and large meals close to bedtime.',
  },
  Cardiology: {
    medicines: [
      { name: 'Amlodipine', dosage: '5mg', frequency: 'OD', durationDays: 30 },
      { name: 'Atorvastatin', dosage: '10mg', frequency: 'OD', durationDays: 30, instructions: 'At night' },
    ],
    advice: 'Low-salt, low-fat diet; monitor blood pressure regularly.',
  },
  Gynecology: {
    medicines: [
      { name: 'Iron + Folic Acid', dosage: '1 tablet', frequency: 'OD', durationDays: 30 },
    ],
    advice: 'Maintain a balanced diet; follow up as advised for routine monitoring.',
  },
  Orthopedics: {
    medicines: [
      { name: 'Diclofenac', dosage: '50mg', frequency: 'BD', durationDays: 5, instructions: 'After food' },
      { name: 'Calcium Carbonate', dosage: '500mg', frequency: 'OD', durationDays: 30 },
    ],
    advice: 'Rest the affected area; apply ice for the first 48 hours if swelling is present.',
  },
  Pediatrics: {
    medicines: [
      { name: 'Paracetamol', dosage: '250mg', frequency: 'TDS', durationDays: 3, instructions: 'After food' },
      { name: 'ORS Sachets', dosage: '1 sachet in 200ml water', frequency: 'As needed', durationDays: 3 },
    ],
    advice: 'Ensure adequate fluid intake; seek urgent care if fever exceeds 3 days.',
  },
  ENT: {
    medicines: [
      { name: 'Levocetirizine', dosage: '5mg', frequency: 'OD', durationDays: 5, instructions: 'At night' },
      { name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', durationDays: 5, instructions: 'After food' },
    ],
    advice: 'Steam inhalation twice daily; avoid cold beverages.',
  },
  Psychiatry: {
    medicines: [
      { name: 'Sertraline', dosage: '50mg', frequency: 'OD', durationDays: 30, instructions: 'Morning' },
    ],
    advice: 'Maintain a regular sleep schedule; follow up in 2-4 weeks to review response.',
  },
  Ophthalmology: {
    medicines: [
      { name: 'Betamethasone Cream', dosage: 'Apply thin layer', frequency: 'BD', durationDays: 5 },
    ],
    advice: 'Avoid rubbing the eyes; maintain good hand hygiene.',
  },
};
```

```ts
// packages/shared/src/index.ts (add one line, alongside the existing barrel exports)
export * from './prescriptionSuggestions';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=@medlink/shared`
Expected: PASS (4 new tests, plus all existing shared-package tests still green)

- [ ] **Step 5: Build and commit**

Run: `npm run build --workspace=@medlink/shared`
Expected: emits updated `dist/*.js`/`.d.ts` with no errors.

```bash
git add packages/shared/src/prescriptionSuggestions.ts packages/shared/src/prescriptionSuggestions.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add curated specialty-to-prescription-suggestion map"
```

---

### Task 2: Backend service — `getPrescriptionSuggestions` (read-only, reuses ownership gate)

**Files:**
- Modify: `apps/api/src/modules/prescriptions/prescriptions.service.ts`
- Create: `apps/api/src/modules/prescriptions/prescriptions.suggest.test.ts`

**Interfaces:**
- Consumes: `SPECIALTY_PRESCRIPTION_SUGGESTIONS` (Task 1, `@medlink/shared`); `DoctorProfile`, `Appointment`, `TriageSession` models (existing); `AppError` (existing, `lib/errors.ts`); `logAudit` (existing, `modules/audit/audit.service.ts`).
- Produces: `getPrescriptionSuggestions(doctorUserId: string, appointmentId: string): Promise<PrescriptionSuggestionResponse>` — consumed by Task 3's controller. **Never imports the `Prescription` model.**

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/prescriptions/prescriptions.suggest.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../../models/User';
import { DoctorProfile } from '../../models/DoctorProfile';
import { Appointment } from '../../models/Appointment';
import { TriageSession } from '../../models/TriageSession';
import { Prescription } from '../../models/Prescription';
import { AuditLog } from '../../models/AuditLog';
import { getPrescriptionSuggestions } from './prescriptions.service';

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

async function makeDoctor(specialty: string) {
  const user = await User.create({ role: 'doctor', email: `d${Date.now()}${Math.random()}@x.com`, phone: '9999999999', passwordHash: 'h', name: 'Doc' });
  const profile = await DoctorProfile.create({
    userId: user._id, specialties: [specialty], qualifications: ['MBBS'], regNo: `X/${Date.now()}`,
    experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida',
    geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'],
  });
  return { user, profile };
}

async function makePatient() {
  return User.create({ role: 'patient', email: `p${Date.now()}${Math.random()}@x.com`, phone: '9999999999', passwordHash: 'h', name: 'Pat' });
}

describe('getPrescriptionSuggestions', () => {
  it('resolves via the linked triage session when one exists', async () => {
    const { user: docUser, profile: docProfile } = await makeDoctor('Cardiology'); // doctor's own specialty differs on purpose
    const patient = await makePatient();
    const triage = await TriageSession.create({
      patientId: patient._id, suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.9 }],
    });
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile._id, slotStart: new Date(), slotEnd: new Date(),
      status: 'confirmed', triageSessionId: triage._id,
    });

    const result = await getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString());
    expect(result.source).toBe('triage');
    expect(result.specialty).toBe('Dermatology');
    expect(result.medicines.length).toBeGreaterThan(0);
    expect(result.adviceSuggestion.length).toBeGreaterThan(0);
  });

  it('falls back to the doctor\'s own specialty when the appointment has no linked triage session', async () => {
    const { user: docUser, profile: docProfile } = await makeDoctor('Cardiology');
    const patient = await makePatient();
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile._id, slotStart: new Date(), slotEnd: new Date(), status: 'confirmed',
    });

    const result = await getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString());
    expect(result.source).toBe('doctor-specialty');
    expect(result.specialty).toBe('Cardiology');
  });

  it('rejects a doctor who does not own the appointment with APPOINTMENT_NOT_FOUND', async () => {
    const { profile: ownerProfile } = await makeDoctor('Cardiology');
    const { user: otherDocUser } = await makeDoctor('Dermatology');
    const patient = await makePatient();
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: ownerProfile._id, slotStart: new Date(), slotEnd: new Date(), status: 'confirmed',
    });

    await expect(getPrescriptionSuggestions(otherDocUser._id.toString(), appt._id.toString()))
      .rejects.toMatchObject({ statusCode: 404, code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('rejects an appointment that is not confirmed with INVALID_APPOINTMENT_STATUS', async () => {
    const { user: docUser, profile: docProfile } = await makeDoctor('Cardiology');
    const patient = await makePatient();
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile._id, slotStart: new Date(), slotEnd: new Date(), status: 'requested',
    });

    await expect(getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString()))
      .rejects.toMatchObject({ statusCode: 409, code: 'INVALID_APPOINTMENT_STATUS' });
  });

  it('writes exactly one prescription.ai_suggestion_viewed AuditLog row per call', async () => {
    const { user: docUser, profile: docProfile } = await makeDoctor('Cardiology');
    const patient = await makePatient();
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile._id, slotStart: new Date(), slotEnd: new Date(), status: 'confirmed',
    });

    await getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString());
    const logs = await AuditLog.find({ action: 'prescription.ai_suggestion_viewed' });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.entityType).toBe('Appointment');
  });

  // The non-negotiable safety property (CLAUDE.md §0.1): calling this
  // service function -- including repeatedly -- must never create a
  // Prescription document. See design spec Design Decision 5.
  it('never writes to the Prescription collection, even when called repeatedly', async () => {
    const { user: docUser, profile: docProfile } = await makeDoctor('Cardiology');
    const patient = await makePatient();
    const triage = await TriageSession.create({
      patientId: patient._id, suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.9 }],
    });
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile._id, slotStart: new Date(), slotEnd: new Date(),
      status: 'confirmed', triageSessionId: triage._id,
    });

    await getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString());
    await getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString());
    await getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString());

    expect(await Prescription.countDocuments({})).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- prescriptions.suggest.test.ts`
Expected: FAIL — `getPrescriptionSuggestions` is not exported from `./prescriptions.service`

- [ ] **Step 3: Implement the service function**

Add to `apps/api/src/modules/prescriptions/prescriptions.service.ts` (alongside
the existing imports, add `TriageSession` and `SPECIALTY_PRESCRIPTION_SUGGESTIONS`
— deliberately **not** importing anything new from the `Prescription` model,
which is already imported for the other functions in this file but must
never be read or written by this one):

```ts
import { TriageSession } from '../../models/TriageSession';
import { SPECIALTY_PRESCRIPTION_SUGGESTIONS } from '@medlink/shared';

export interface PrescriptionSuggestionResponse {
  source: 'triage' | 'doctor-specialty' | 'none';
  specialty?: string;
  medicines: { name: string; dosage: string; frequency: string; durationDays: number; instructions?: string }[];
  adviceSuggestion: string;
  disclaimer: string;
}

const NO_SUGGESTION_DISCLAIMER =
  'No AI suggestion is available for this appointment. Nothing here is saved automatically.';

// Read-only. Mirrors createPrescription's exact ownership + status gate
// (DoctorProfile -> Appointment{_id, doctorId} -> status === 'confirmed')
// but MUST NOT import, read, or write the Prescription model -- see
// CLAUDE.md §0.1 and design spec Design Decision 2/5. This function's only
// side effect is one logAudit() call.
export async function getPrescriptionSuggestions(
  doctorUserId: string,
  appointmentId: string
): Promise<PrescriptionSuggestionResponse> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const appointment = await Appointment.findOne({ _id: appointmentId, doctorId: doctorProfile._id });
  if (!appointment) throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
  if (appointment.status !== 'confirmed') {
    throw new AppError(409, 'Suggestions are only available for confirmed appointments', 'INVALID_APPOINTMENT_STATUS');
  }

  let source: PrescriptionSuggestionResponse['source'] = 'none';
  let specialty: string | undefined;

  if (appointment.triageSessionId) {
    const triageSession = await TriageSession.findById(appointment.triageSessionId);
    const top = triageSession?.suggestedSpecialties?.[0];
    if (top) {
      source = 'triage';
      specialty = top.name;
    }
  }
  if (!specialty && doctorProfile.specialties[0]) {
    source = 'doctor-specialty';
    specialty = doctorProfile.specialties[0];
  }

  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'prescription.ai_suggestion_viewed',
    entityType: 'Appointment', entityId: appointment._id.toString(),
    meta: { source, specialty },
  });

  const entry = specialty ? SPECIALTY_PRESCRIPTION_SUGGESTIONS[specialty] : undefined;
  if (!entry) {
    return { source: 'none', medicines: [], adviceSuggestion: '', disclaimer: NO_SUGGESTION_DISCLAIMER };
  }

  return {
    source,
    specialty,
    medicines: entry.medicines,
    adviceSuggestion: entry.advice,
    disclaimer: `AI-generated suggestion based on ${specialty}. Review, edit, and approve before saving — nothing here is saved automatically.`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- prescriptions.suggest.test.ts`
Expected: PASS (6 tests, including the zero-Prescription-writes regression test)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/prescriptions/prescriptions.service.ts apps/api/src/modules/prescriptions/prescriptions.suggest.test.ts
git commit -m "feat(api): add read-only getPrescriptionSuggestions, never touches Prescription collection"
```

---

### Task 3: Route, controller, env-flag gate, and the HTTP-level non-mutation regression test

**Files:**
- Modify: `apps/api/src/modules/prescriptions/prescriptions.controller.ts`
- Modify: `apps/api/src/modules/prescriptions/prescriptions.routes.ts`
- Modify: `apps/api/src/modules/prescriptions/prescriptions.suggest.test.ts` (append HTTP-level tests)
- Modify: `.env.example`, `apps/api/.env.example` (document `AI_PRESCRIPTION_SUGGESTIONS_ENABLED`)

**Interfaces:**
- Consumes: `getPrescriptionSuggestions` (Task 2); `requireAuth`, `requireRole` (existing, `middleware/auth.ts`); `AppError` (existing).
- Produces: `GET /api/prescriptions/suggest/:appointmentId` (doctor-only) — the feature's public HTTP surface. Consumed by Task 4's RTK Query endpoint.

- [ ] **Step 1: Implement the controller handler**

Add to `apps/api/src/modules/prescriptions/prescriptions.controller.ts`:

```ts
import { getPrescriptionSuggestions } from './prescriptions.service';
// (add to the existing import from './prescriptions.service' rather than a new line, if preferred)

export async function getPrescriptionSuggestionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const suggestions = await getPrescriptionSuggestions(req.user!.id, req.params.appointmentId as string);
    res.status(200).json(suggestions);
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 2: Wire the route behind the env-flag gate**

Add to `apps/api/src/modules/prescriptions/prescriptions.routes.ts`, after
the router's existing `requireAuth` mount and alongside the other
`requireRole`-gated routes:

```ts
import { getPrescriptionSuggestionsHandler } from './prescriptions.controller';

// ... after prescriptionsRouter.use(requireAuth); and the existing routes ...

// Feature-flagged per design spec Open Questions: no flag-infrastructure
// exists in this repo, so a single env var read once at route-registration
// time is the proportionate choice for one optional route. Unset or any
// value other than the literal string 'false' means enabled -- this keeps
// local dev and CI on by default without requiring a new .env entry.
if (process.env.AI_PRESCRIPTION_SUGGESTIONS_ENABLED !== 'false') {
  prescriptionsRouter.get('/suggest/:appointmentId', requireRole('doctor'), getPrescriptionSuggestionsHandler);
}
```

Add to both `.env.example` and `apps/api/.env.example` (alongside the
existing `AI_SERVICE_URL`/`SMTP_*` lines):

```
AI_PRESCRIPTION_SUGGESTIONS_ENABLED=true
```

- [ ] **Step 3: Write the failing HTTP-level tests**

Append to `apps/api/src/modules/prescriptions/prescriptions.suggest.test.ts`
(add `request`/`createApp`/`AuditLog` imports at the top alongside the
existing ones, plus a `registerAndLogin` helper matching the shape already
used in `prescriptions.test.ts`):

```ts
import request from 'supertest';
import { createApp } from '../../app';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

async function registerAndLogin(app: ReturnType<typeof createApp>, role: string, email: string) {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return { cookies: res.headers['set-cookie'] as unknown as string[], body: res.body };
}

describe('GET /api/prescriptions/suggest/:appointmentId', () => {
  it('401s with no session', async () => {
    const app = createApp();
    const res = await request(app).get(`/api/prescriptions/suggest/${new mongoose.Types.ObjectId()}`);
    expect(res.status).toBe(401);
  });

  it('403s for a patient (doctor-only route)', async () => {
    const app = createApp();
    const { cookies } = await registerAndLogin(app, 'patient', 'pat-suggest@medlink.demo');
    const res = await request(app).get(`/api/prescriptions/suggest/${new mongoose.Types.ObjectId()}`).set('Cookie', cookies);
    expect(res.status).toBe(403);
  });

  it('200s with the suggestion shape for a doctor on their own confirmed appointment', async () => {
    const app = createApp();
    const { cookies, body } = await registerAndLogin(app, 'doctor', 'doc-suggest@medlink.demo');
    await DoctorProfile.create({
      userId: body.user.id, specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: 'X/S1',
      experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida',
      geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'],
    });
    const docProfile = await DoctorProfile.findOne({ userId: body.user.id });
    const patient = await makePatient();
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile!._id, slotStart: new Date(), slotEnd: new Date(), status: 'confirmed',
    });

    const res = await request(app).get(`/api/prescriptions/suggest/${appt._id}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('source');
    expect(res.body).toHaveProperty('medicines');
    expect(res.body).toHaveProperty('disclaimer');
  });

  // The non-negotiable safety property, re-verified at the full HTTP layer
  // (not just the service unit test in Task 2): repeated calls through the
  // real route/controller/service stack must never create a Prescription.
  it('never creates a Prescription document, even across repeated HTTP calls', async () => {
    const app = createApp();
    const { cookies, body } = await registerAndLogin(app, 'doctor', 'doc-suggest2@medlink.demo');
    await DoctorProfile.create({
      userId: body.user.id, specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: 'X/S2',
      experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida',
      geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'],
    });
    const docProfile = await DoctorProfile.findOne({ userId: body.user.id });
    const patient = await makePatient();
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile!._id, slotStart: new Date(), slotEnd: new Date(), status: 'confirmed',
    });

    await request(app).get(`/api/prescriptions/suggest/${appt._id}`).set('Cookie', cookies);
    await request(app).get(`/api/prescriptions/suggest/${appt._id}`).set('Cookie', cookies);
    await request(app).get(`/api/prescriptions/suggest/${appt._id}`).set('Cookie', cookies);

    expect(await Prescription.countDocuments({})).toBe(0);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail, then pass**

Run: `npm run test --workspace=apps/api -- prescriptions.suggest.test.ts`
Expected first: FAIL (route not mounted / 404s instead of expected status codes).
After Steps 1-2 are in place, re-run: PASS (10 tests total in this file — 6
from Task 2 plus 4 new HTTP-level tests, including the repeated-call
non-mutation regression test).

Run: `npm run test --workspace=apps/api`
Expected: full suite PASS — confirms the new route/env-flag addition didn't
regress `prescriptions.test.ts` or `app.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/prescriptions/prescriptions.controller.ts apps/api/src/modules/prescriptions/prescriptions.routes.ts apps/api/src/modules/prescriptions/prescriptions.suggest.test.ts .env.example apps/api/.env.example
git commit -m "feat(api): mount GET /api/prescriptions/suggest/:appointmentId behind AI_PRESCRIPTION_SUGGESTIONS_ENABLED"
```

---

### Task 4: Frontend — RTK Query endpoint + `AiSuggestionBadge` component

**Files:**
- Modify: `apps/web/src/store/prescriptionsApi.ts`
- Create: `apps/web/src/components/ui/ai-suggestion-badge.tsx`

**Interfaces:**
- Consumes: `GET /api/prescriptions/suggest/:appointmentId` (Task 3); the existing `baseApi` (`apps/web/src/store/api.ts`); `cn` utility (existing, `apps/web/src/lib/utils.ts`, same one `StatusBadge` uses).
- Produces: `PrescriptionSuggestionResponse` type, `useLazyGetPrescriptionSuggestionsQuery` hook — consumed by Task 5's composer page. `AiSuggestionBadge` component — consumed by Task 5.

- [ ] **Step 1: Add the RTK Query endpoint**

Add to `apps/web/src/store/prescriptionsApi.ts` (alongside the existing
`Medicine`/`Prescription` types and endpoints):

```ts
export interface PrescriptionSuggestionResponse {
  source: 'triage' | 'doctor-specialty' | 'none';
  specialty?: string;
  medicines: Medicine[];
  adviceSuggestion: string;
  disclaimer: string;
}
```

Add to the `endpoints: (builder) => ({ ... })` object:

```ts
    getPrescriptionSuggestions: builder.query<PrescriptionSuggestionResponse, string>({
      query: (appointmentId) => `/prescriptions/suggest/${appointmentId}`,
    }),
```

Export the lazy hook — lazy, not the eager `useQuery` form, because Design
Decision 3 requires this to be button-triggered, never auto-fetched on
mount:

```ts
export const {
  useCreatePrescriptionMutation,
  useAmendPrescriptionMutation,
  useListMyPrescriptionsQuery,
  useGetPublicVerificationQuery,
  useLazyGetPrescriptionSuggestionsQuery,
} = prescriptionsApi;
```

- [ ] **Step 2: Implement `AiSuggestionBadge`**

```tsx
// apps/web/src/components/ui/ai-suggestion-badge.tsx
// Sibling to StatusBadge (apps/web/src/components/ui/status-badge.tsx), not
// a repurposing of it -- StatusBadge's palette is keyed by appointment/
// referral/prescription status strings; this badge always means one thing
// ("this row came from the AI suggestion panel, not the doctor typing"), so
// it gets its own fixed --accent styling rather than a lookup table.
import { cn } from '@/lib/utils';

export function AiSuggestionBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[--accent]/10 text-[--accent]',
        className
      )}
    >
      AI
    </span>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck --workspace=apps/web`
Expected: no errors — confirms the new endpoint's types and the badge
component compile cleanly against the existing `baseApi`/`cn` setup.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/store/prescriptionsApi.ts apps/web/src/components/ui/ai-suggestion-badge.tsx
git commit -m "feat(web): add lazy prescription-suggestions query and AiSuggestionBadge component"
```

---

### Task 5: Frontend — suggestion panel on the prescription composer

**Files:**
- Modify: `apps/web/src/app/appointments/[id]/prescribe/page.tsx`

**Interfaces:**
- Consumes: `useLazyGetPrescriptionSuggestionsQuery` (Task 4); `AiSuggestionBadge` (Task 4); the page's own existing local state (`medicines`, `advice`, `setMedicines`, `setAdvice`) — unchanged, still the exact state `useCreatePrescriptionMutation` submits.
- Produces: nothing consumed elsewhere — this is the feature's terminal, user-facing task.

- [ ] **Step 1: Add the suggestion trigger and local state**

In `apps/web/src/app/appointments/[id]/prescribe/page.tsx`, add alongside
the existing `useState`/`useCreatePrescriptionMutation` hooks:

```tsx
import { useLazyGetPrescriptionSuggestionsQuery } from '@/store/prescriptionsApi';
import { AiSuggestionBadge } from '@/components/ui/ai-suggestion-badge';

// ... inside the component, alongside the existing hooks ...
const [fetchSuggestions, { data: suggestions, isFetching: isLoadingSuggestions }] = useLazyGetPrescriptionSuggestionsQuery();
```

Note: `suggestions` from the lazy query is its own, separate piece of
state — it is never written into `medicines`/`advice` except via the
explicit Insert actions in Step 2. This is the code-level enforcement of
"doctor approves," not just a UI convention (design spec Design Decision 2).

- [ ] **Step 2: Render the panel and wire Insert actions**

Add a "Get AI Suggestions" button (not auto-fired on mount) above the
existing medicines table, and the panel itself, rendered only once
`suggestions` has data:

```tsx
<button
  type="button"
  className="text-sm underline text-[--accent]"
  onClick={() => fetchSuggestions(appointmentId)}
  disabled={isLoadingSuggestions}
>
  {isLoadingSuggestions ? 'Loading suggestions…' : 'Get AI Suggestions'}
</button>

{suggestions && suggestions.source !== 'none' && (
  <div className="border border-[--accent]/30 bg-[--accent]/5 rounded p-3 space-y-2">
    {suggestions.medicines.map((med, i) => (
      <div key={i} className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2">
          <AiSuggestionBadge />
          {med.name} — {med.dosage}, {med.frequency}, {med.durationDays}d
          {med.instructions ? ` (${med.instructions})` : ''}
        </span>
        <button
          type="button"
          className="text-xs underline"
          onClick={() => setMedicines((prev) => [...prev, { ...med }])}
        >
          Insert
        </button>
      </div>
    ))}
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2">
        <AiSuggestionBadge />
        {suggestions.adviceSuggestion}
      </span>
      <button
        type="button"
        className="text-xs underline"
        onClick={() => setAdvice(suggestions.adviceSuggestion)}
      >
        Insert advice
      </button>
    </div>
    <p className="text-xs text-muted-foreground">{suggestions.disclaimer}</p>
  </div>
)}

{suggestions && suggestions.source === 'none' && (
  <p className="text-xs text-muted-foreground">{suggestions.disclaimer}</p>
)}
```

Each row's Insert button appends that one suggestion into the existing
`medicines` array via the page's own `setMedicines` — the identical state
Phase 4's Save button has always submitted. No suggestion is pre-checked or
auto-inserted; the panel only renders after the doctor clicks "Get AI
Suggestions," and each row only reaches form state after its own Insert
click (design spec Design Decision 3).

- [ ] **Step 3: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: builds with no errors — matches Phase 4's own precedent for this
page (no automated frontend test suite exists in this repo).

Manual check: log in as a seeded doctor (e.g. `meera.d@medlink.demo`,
`Demo@123`), open the composer for one of their confirmed appointments,
confirm the panel does **not** appear until "Get AI Suggestions" is
clicked, confirm clicking Insert on one medicine row adds exactly one row
to the medicines table without touching any other field, and confirm
"Insert advice" only changes the advice textarea when clicked.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/appointments/\[id\]/prescribe/page.tsx
git commit -m "feat(web): add AI suggestion panel with per-row Insert to the prescription composer"
```
