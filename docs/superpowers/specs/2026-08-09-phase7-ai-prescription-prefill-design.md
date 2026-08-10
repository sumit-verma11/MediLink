# Phase 7 — "AI Suggests, Doctor Approves" Prescription Pre-fill — Design Spec

## Context

CLAUDE.md §0.1 lays down two non-negotiable product principles this feature
lives inside: "AI never diagnoses. AI never prescribes" (rule 1) and "Doctor
is the only actor who can create a prescription. AI may pre-fill *nothing*
in v1" (rule 2), followed immediately by "(Phase 7 may add 'AI suggests,
doctor approves' behind a flag.)" — this spec is that flag being exercised.
The roadmap (`docs/superpowers/plans/2026-07-27-roadmap.md` §Phase 7) lists
it as one of five optional, unsequenced post-launch differentiators, picked
opportunistically, not required for the core demo.

Relevant existing architecture, confirmed by reading the actual code before
writing this spec:

- **`Prescription` model** (`apps/api/src/models/Prescription.ts`) already
  has the versioning fields the roadmap flagged as possibly missing —
  `version: number` (default 1) and `supersededBy?: Types.ObjectId` were
  added in Phase 4. `immutable: true` (default) stands unchanged. This
  feature must not touch this schema at all.
- **Prescription composer** (`apps/web/src/app/appointments/[id]/prescribe/page.tsx`)
  is a plain client component: local `useState` for `diagnosisNote`,
  `medicines: Medicine[]`, `advice`, `followUpDate`, `recommendedTestsText`,
  submitted via `useCreatePrescriptionMutation` from
  `apps/web/src/store/prescriptionsApi.ts` to `POST /api/prescriptions`.
  Medicine name has a `<datalist>` autocomplete already sourced from
  `GENERIC_MEDICINES` (`packages/shared/src/genericMedicines.ts`, a 40-name
  static list — no backend catalog endpoint exists, by design, per Phase 4's
  own YAGNI note in that file).
- **`prescriptions` module** (`apps/api/src/modules/prescriptions/`):
  `prescriptions.service.ts` (`createPrescription`, `amendPrescription`,
  `listMyPrescriptions`, `getPrescriptionPdfPath`, `getPublicVerification`),
  `prescriptions.controller.ts`, `prescriptions.routes.ts`. `createPrescription`
  already establishes the exact ownership pattern this feature reuses: look
  up the caller's `DoctorProfile`, then `Appointment.findOne({ _id, doctorId })`,
  then require `status === 'confirmed'`, throwing `AppError` with codes
  `PROFILE_NOT_FOUND` / `APPOINTMENT_NOT_FOUND` / `INVALID_APPOINTMENT_STATUS`.
- **Triage data available per-appointment**: `Appointment.triageSessionId`
  (optional — patient-supplied, ownership-checked at booking time) links to
  `TriageSession` (`apps/api/src/models/TriageSession.ts`), which stores
  `extractedSymptoms: string[]` and `suggestedSpecialties: [{name, confidence}]`
  — already computed by Phase 3's FastAPI `/triage` embedding matcher and
  persisted; nothing needs recomputing here. `DoctorProfile.specialties: string[]`
  is the fallback signal when an appointment has no linked triage session.
- **`apps/ai` (FastAPI)** (`apps/ai/app/routes/triage.py`,
  `apps/ai/app/embeddings.py`, `apps/ai/specialty_map.json`): owns
  sentence-transformer embedding matching of free-text symptoms → specialty.
  It has no notion of medicines/dosages at all — extending it would mean
  inventing a second embedding domain (symptom text → drug) with no seed
  data, no fixture set, and no real training signal, which is exactly the
  kind of fake-ML the parent task warned against.
- **Node → FastAPI call pattern** (`apps/api/src/modules/triage/aiClient.ts`):
  circuit breaker (5-failure threshold, 30s open), 3s timeout, Redis
  response cache — real, working infrastructure, but built for a genuine
  cross-service embedding call. Reusing it here would mean adding a second
  HTTP hop for a lookup that needs none of that machinery.
- **No frontend test infrastructure exists** anywhere under `apps/web`
  (confirmed: zero `*.test.*` files, no test script in `apps/web/package.json`).
  Phase 4's own frontend tasks (`apps/web/src/app/appointments/[id]/prescribe/page.tsx`
  et al.) shipped with "Verify the build" (`npm run build --workspace=apps/web`)
  as their only verification step, not automated tests. This spec's frontend
  work follows that same established precedent rather than introducing new
  test tooling for one optional feature.

## Goals

1. A doctor opening the composer for a confirmed appointment can see
   AI-suggested medicines/dosages/advice, sourced from the patient's triage
   specialty (or the doctor's own specialty as a fallback), clearly flagged
   as AI-generated.
2. Nothing suggested is ever pre-filled into the real, submitted form state
   without an explicit doctor action per item — no suggestion is
   pre-checked, auto-inserted, or silently becomes part of the saved
   prescription.
3. The `Prescription` collection is provably untouched by the suggestion
   feature itself — only the doctor's own explicit submit (Phase 4's
   existing, unmodified `POST /api/prescriptions`) ever writes one.
4. A regression test asserts exactly that: calling the suggestion endpoint
   never creates a `Prescription` document.

## Non-goals

- **No real ML model or training pipeline.** This is a rule-based, curated
  specialty → medicine lookup table, the same spirit as
  `apps/ai/specialty_map.json` (curated specialty ↔ symptom phrases) and
  `packages/shared/src/genericMedicines.ts` (curated static drug list) — not
  a claim of a trained prescribing model.
- **No symptom-level drug matching** (e.g. "itchy rash for 2 weeks" →
  a specific antihistamine dosage tier). Specialty-level granularity only,
  for the reasons in Design Decision 1. A future iteration could layer
  keyword rules from `TriageSession.extractedSymptoms` on top of the
  specialty map; not built now (YAGNI — the curated map already gives every
  suggested row a "why," specialty, without inventing a second dataset).
- **No changes to `Prescription`'s schema**, to `CreatePrescriptionInput`/
  `AmendPrescriptionInput`, or to the Phase 4 immutability/versioning model.
  This feature is additive and read-only on top of all of it.
- **No changes to `apps/ai`.** See Design Decision 4.
- **No new feature-flag infrastructure.** See Open Questions.

## Design Decisions

### 1. Signal source: triage specialty, with a doctor-specialty fallback

**Primary signal:** `TriageSession.suggestedSpecialties[0].name` — the
highest-confidence specialty from the linked triage session, reached via
`Appointment.triageSessionId`. This is already a real, human-curated,
per-patient signal computed in Phase 3; reusing it costs nothing new.

**Fallback signal:** `DoctorProfile.specialties[0]` — the doctor's own
primary specialty, used when the appointment has no linked triage session
(a walk-in booking, or one made through the manual specialty picker per
Phase 3's graceful-degradation path). Still a reasonable default: a doctor's
own specialty predicts what they typically prescribe.

**No signal:** if neither resolves (defensive only — `DoctorProfile.specialties`
is a required field, so this should not occur in practice), the endpoint
returns `source: 'none'` with an empty `medicines` array rather than
erroring — a doctor with no suggestions available is not a broken doctor.

Both signals key into one new curated static map,
`SPECIALTY_PRESCRIPTION_SUGGESTIONS` (packages/shared), rather than any
free-text/NLP matching. Rationale: no real symptom-to-drug ML exists (or
should exist) in this project's scope; specialty is the most specific
signal this codebase actually computes and trusts elsewhere (it already
drives doctor search/matching in Phase 3), so reusing it — rather than
inventing new free-text matching — is both the honest and the buildable
choice.

### 2. The doctor-approval gate (the load-bearing decision)

- A new **read-only** endpoint, `GET /api/prescriptions/suggest/:appointmentId`
  (doctor-only), backed by a new service function that reads `DoctorProfile`,
  `Appointment`, and `TriageSession` — **it never reads or writes the
  `Prescription` collection.** There is no code path from this endpoint into
  a saved prescription.
- The composer page calls this endpoint once (button-triggered, not
  auto-fired on mount — see Design Decision 3) and holds the response in its
  own local React state, entirely separate from the real form state
  (`medicines`, `diagnosisNote`, `advice`) that Phase 4's
  `useCreatePrescriptionMutation` submits.
- Each suggested medicine row renders its own **"Insert"** action. Clicking
  it copies that one row's `{name, dosage, frequency, durationDays, instructions}`
  into the real, already-editable `medicines` array — the exact same array
  Phase 4's form has always used. An "Insert advice" action does the same
  for the single `adviceSuggestion` string into the `advice` field.
- Once inserted, a row is indistinguishable from a manually-typed one: the
  composer has no "locked" or "AI-sourced" flag on form state. The doctor
  can freely edit any inserted value before submitting, identical to typing
  it from scratch. Provenance is a **display-only** property of the
  suggestion panel — it never travels with the value into submitted state,
  and therefore never into the `Prescription` document.
- Net effect: the *only* way anything from this feature reaches a saved
  `Prescription` is a doctor clicking Insert (or typing the same thing
  themselves) and then clicking the existing Save button — the identical,
  unmodified code path from Phase 4. This is what makes "doctor approves"
  true at the code level, not merely implied by the UI.
- The suggestion endpoint reuses `createPrescription`'s exact ownership and
  status gate (doctor owns the appointment via `DoctorProfile`, appointment
  `status === 'confirmed'`) even though it performs no write — this keeps
  the surfaced signal (triage specialty resolution) unreachable for
  appointments the composer itself couldn't act on anyway, and avoids a new
  authorization rule to reason about.

### 3. UI treatment: unmistakably AI, inert until acted on

- A distinct panel above the medicines table, revealed only after the
  doctor clicks a **"Get AI Suggestions"** button (not auto-fetched on page
  load) — an explicit pull, not a push, reinforcing that nothing happens
  without doctor action.
- The panel uses the `--accent` (dusty-rose) design token reserved
  elsewhere in this codebase for exactly this kind of one-per-screen
  emphasis (per `docs/superpowers/specs/2026-08-09-medlink-redesign-phase1-foundation-design.md`
  §1) — visually distinct from the rest of the form's navy/sage chrome, not
  styled like a normal form section.
- Each suggested row carries a small "AI" badge, a new component
  (`apps/web/src/components/ui/ai-suggestion-badge.tsx`) following the
  existing `StatusBadge` pattern (`apps/web/src/components/ui/status-badge.tsx`)
  — a sibling, not a repurposing of `StatusBadge`'s status-keyed palette.
- A one-line disclaimer directly under the panel, mirroring CLAUDE.md's
  triage-chat disclaimer precedent ("This is guidance, not medical
  advice."): *"AI-generated suggestion based on [specialty]. Review, edit,
  and approve before saving — nothing here is saved automatically."*
- No suggested row is ever pre-checked or pre-populated into the real form
  on load; the panel is fully inert until both (a) the doctor requests it
  and (b) the doctor clicks Insert on a specific row.

### 4. Endpoint location: `apps/api`, not `apps/ai`

The endpoint lives in the existing `prescriptions` module in `apps/api`
(Node/Express), not as a new FastAPI route. Reasoning:

- The signal consumed (`TriageSession.suggestedSpecialties`) is already
  computed by `apps/ai`'s embedding matcher during the Phase 3 `/triage`
  call and persisted to Mongo — there is no new embedding/NLP work here,
  only a specialty-keyed static-map lookup, which is a data problem, not a
  machine-learning problem.
- A new FastAPI endpoint would require a new Node→FastAPI HTTP hop, and
  either duplicating `aiClient.ts`'s circuit-breaker/timeout/cache plumbing
  for a second endpoint or building a second, thinner client — real
  incidental complexity for what is, functionally, a
  `Record<string, {medicines, advice}>` lookup.
- This is an explicitly optional, small-scoped differentiator; per the
  scoping brief's own instinct, the smaller footprint — one new file in an
  already-existing Node module, reusing existing auth/ownership/audit
  patterns verbatim — is preferred over standing up new cross-service
  surface area.

### 5. Test coverage for the approval gate

A dedicated test (in `apps/api/src/modules/prescriptions/prescriptions.suggest.test.ts`)
seeds a confirmed appointment with a linked triage session, calls the
suggestion service/endpoint (including calling it more than once), and then
asserts `await Prescription.countDocuments({})` is `0` — proving the call
performed zero writes to the collection whose immutability is the product's
core legal-grade guarantee (CLAUDE.md §1's "never edited, only superseded").
This is the specific test called out as non-negotiable by the feature
scoping: an AI suggestion must be structurally incapable of silently
becoming the prescription of record.

### 6. Audit trail

CLAUDE.md §0.1.3 requires every cross-role action to leave an audit trail.
A doctor viewing their own AI suggestions isn't cross-role, but the request
does read a patient's triage data, so the service call writes
`logAudit({ action: 'prescription.ai_suggestion_viewed', entityType: 'Appointment', entityId: appointmentId, meta: { source, specialty } })`
on every successful call — consistent with the existing
`prescription.created` / `prescription.amended` entries from Phase 4, and
gives a paper trail answering "did AI influence this prescription?" without
adding any field to `Prescription` itself.

## API surface

```
GET /api/prescriptions/suggest/:appointmentId   (doctor-only, ownership-scoped)

200 OK
{
  "source": "triage" | "doctor-specialty" | "none",
  "specialty": "Dermatology",           // omitted when source is "none"
  "medicines": [
    { "name": "Cetirizine", "dosage": "10mg", "frequency": "OD", "durationDays": 5, "instructions": "After food" }
  ],
  "adviceSuggestion": "Avoid known allergens; keep affected area clean and dry.",
  "disclaimer": "AI-generated suggestion based on Dermatology. Review, edit, and approve before saving — nothing here is saved automatically."
}
```

Error responses mirror `createPrescription` exactly: `404 PROFILE_NOT_FOUND`,
`404 APPOINTMENT_NOT_FOUND` (includes doctor-doesn't-own-appointment, same
existing pattern of not distinguishing "not found" from "not yours"),
`409 INVALID_APPOINTMENT_STATUS`.

## Data shapes (`packages/shared/src/prescriptionSuggestions.ts`)

```ts
export interface MedicineSuggestion {
  name: string;           // must be one of GENERIC_MEDICINES
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions?: string;
}

export interface SpecialtySuggestionEntry {
  medicines: MedicineSuggestion[];   // 1-3 entries
  advice: string;
}

export const SPECIALTY_PRESCRIPTION_SUGGESTIONS: Record<string, SpecialtySuggestionEntry>;
```

Covers, at minimum, the 12 specialties seeded in CLAUDE.md §6.2 (Dermatology,
General Physician, Gastroenterology, Cardiology, Gynecology, Orthopedics,
Pediatrics, ENT, Psychiatry, Ophthalmology, plus any others already present
in `apps/ai/specialty_map.json`, so the demo's seeded doctors always resolve
a suggestion). `MedicineSuggestion.name` values are drawn only from
`GENERIC_MEDICINES` so an inserted row is always a name the composer's
existing autocomplete already recognizes — no catalog drift between the two
lists.

## Open questions

- **Feature flag.** The roadmap's own wording is "(feature-flagged)," but no
  flag infrastructure (LaunchDarkly, GrowthBook, or even a lightweight
  in-house helper) exists anywhere in this repo today — every environment
  toggle found (`AI_SERVICE_URL`, `WEB_ORIGIN`, etc.) is a plain
  `process.env` read at the call site, no central flag registry. Proposed
  default: gate the route registration behind one boolean env var
  (`AI_PRESCRIPTION_SUGGESTIONS_ENABLED`, default `true` in dev), read once
  where `prescriptionsRouter` is mounted — proportionate to a single
  optional route, not a reason to build real flag infrastructure. Confirm
  this reading of "flagged" is acceptable before implementation, or drop the
  env var entirely if the roadmap's parenthetical was aspirational rather
  than a hard requirement.
- **Per-field vs. per-row Insert.** This spec picks whole-row-at-a-time
  (Design Decision 2), matching the medicines array's existing row shape.
  Per-field insert (e.g. accepting a suggested dosage but not the name)
  would need a bigger form-state refactor for marginal demo benefit — not
  pursued here.
