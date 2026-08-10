# Phase 7 — FHIR-lite Export Endpoint (Design Spec)

## Context

CLAUDE.md §2 "Phase 7 (optional, post-launch differentiators)" already names this
feature and pins down its headline shape:

> **FHIR Interop (lite):** `GET /fhir/Patient/{id}/$everything-lite` — serialize
> patient timeline as a FHIR R4 Bundle JSON: Patient, Appointment[],
> MedicationRequest[] (from prescriptions), ServiceRequest[] (lab referrals),
> DiagnosticReport[] (lab reports). Validate output shape against R4 spec
> manually (no FHIR server). Add a README "FHIR Mapping" table.

This spec resolves everything CLAUDE.md left implicit — auth model, response
shape, audit requirement, and test strategy — against the actual Phase 1–6
code (models, RBAC middleware, existing read-scoped routes) rather than
speculating. It is `apps/api`-only. No web UI is required; a download button
on the patient's existing health-timeline page is a trivial follow-up, not
part of this scope.

Per CLAUDE.md §0.4, this project makes no HIPAA/compliance claims — "FHIR
R4 export for interoperability" is a portfolio/interview artifact, not a
production interoperability integration. That framing is why every fidelity
trade-off below is resolved toward "smallest thing that's honestly labeled
lite," not toward chasing full R4 conformance.

## Goals

1. One read-only endpoint that serializes a patient's MedLink data into a
   FHIR R4-*shaped* JSON Bundle, either for their whole history or scoped to
   one appointment.
2. Reuse this repo's existing auth/RBAC/audit/rate-limit patterns exactly —
   no new middleware concepts.
3. A mapping precise enough that someone who knows FHIR can look at the
   output and immediately recognize R4 resource shapes (`resourceType`,
   `status`, the right field names) — without pretending to be a conformant
   FHIR server.
4. Manual-fixture test coverage that would fail if a mapping regressed
   (wrong status value, missing required field), matching this repo's
   Vitest + Supertest + mongodb-memory-server convention (Phase 1 plan's
   Tech Stack section).

## Non-goals

- **Not a FHIR server.** No `$everything` operation semantics beyond the
  literal one path this spec defines, no `_include`/`_revinclude`, no
  FHIR search parameters, no content negotiation (`application/fhir+json`
  is out of scope — plain `application/json`, same as every other endpoint
  in this API).
- **No automated FHIR schema validator dependency.** CLAUDE.md says
  "validate manually" — adding a FHIR R4 validation library (e.g.
  `fhir.js`, a JSON Schema against the full R4 StructureDefinitions) for a
  five-resource-type lite export is exactly the kind of dependency this
  codebase's "why two backends" cost-consciousness argues against. Manual
  fixture assertions (required fields present, enums in range) are the
  right-sized check.
- **No `Practitioner`/`Organization`/`Encounter` resources.** See Design
  §1 — deliberately flattened into display strings on the resources that
  reference them.
- **No web UI beyond, at most, a download link/button** wired to the new
  endpoint on an existing patient page. Building that page is not blocked
  by this spec but is not included in its task plan.
- **No async export job / background worker.** See Design §3.
- **Labs cannot call this endpoint.** A lab's relationship to a patient is
  a specific `LabBooking`/`LabReferral`, not the broad clinical
  relationship a treating doctor has — exporting a patient's full FHIR
  bundle to a lab has no product justification and CLAUDE.md never asks
  for it. Out of scope; not even stubbed.

## Design decisions (summary)

| Decision | Choice | Why (1–2 sentences) |
|---|---|---|
| Resource types | `Patient` (1), `Appointment[]`, `MedicationRequest[]`, `ServiceRequest[]`, `DiagnosticReport[]` | Exactly the set CLAUDE.md §2 names — no more, no less. |
| Cross-references | Inline display strings, not FHIR `Reference`s to separate resources | A real FHIR bundle would emit `Practitioner`/`Encounter` resources and reference them; for a lite export that's pure ceremony with zero consumers in this codebase — embedding `"performer": {"display": "Dr. Meera Sharma"}` is legible and honest about being lite. |
| Auth model | Patient → own data only; doctor → only patients they have a real `Appointment` with; admin → any patient | Mirrors the exact ownership check already used in `prescriptions.service.ts`'s `getPrescriptionPdfPath`, generalized from "this one prescription's doctorId" to "any appointment between this doctor and this patient." |
| Response format | Single synchronous `GET` returning one JSON `Bundle` | Per-patient document counts are bounded by CLAUDE.md §6's own seed scale (≈15 appointments, 6 prescriptions, 3 referrals for the *entire* demo dataset) — a handful of indexed `find({patientId})` queries, not a streaming or pagination problem. |
| Audit logging | Every successful export call is audited, regardless of caller role | CLAUDE.md §0.1.3: "every cross-role action leaves an audit trail." A full clinical-history export is sensitive enough that even a patient exporting their own record is worth a log entry — same precedent as `verification` decisions and prescription creation, which are audited even though they're each individually a "normal" action for that role. |
| Test coverage | Vitest unit tests on the pure mapping/bundle-builder (fixture-driven, asserts required FHIR fields per resource type) + Supertest integration tests on the route (auth matrix + encounter-scoping) | Matches Phase 1's Tech Stack section exactly; no new test tooling. |

## Design

### 1. Resource mapping ("lite" fidelity)

All resource `id` fields are the underlying MedLink Mongo document's
`_id.toString()`. `Patient.id` is the `User._id` (the same id every other
`patientId` field in this codebase already refers to — Appointment,
Prescription, LabReferral, LabBooking, Rating all point at `User._id`, not
`PatientProfile._id`; this export follows that existing convention rather
than inventing a new one).

**`Patient`** (built from `User` + `PatientProfile`, one per export):

```json
{
  "resourceType": "Patient",
  "id": "<User._id>",
  "name": [{ "text": "<User.name>" }],
  "gender": "<PatientProfile.gender, mapped 1:1 (male/female/other — 'other' is a valid FHIR AdministrativeGender code)>",
  "_ageYears": "<PatientProfile.age, if set>"
}
```

MedLink stores `age` (an integer), never a date of birth. Standard FHIR
`Patient.birthDate` requires an actual date. Fabricating one by subtracting
`age` years from "now" would produce a birthDate that's wrong by up to 364
days and silently look authoritative — worse than omitting it. **Decision:**
omit `birthDate` entirely; emit age under a clearly non-standard
`_ageYears` key instead, and call this out explicitly in the README mapping
table as a known lite-export limitation. Honest > fake-conformant.

**`Appointment[]`** (one per `Appointment` doc, CLAUDE.md's own resource
name choice — not `Encounter`, see below):

```json
{
  "resourceType": "Appointment",
  "id": "<Appointment._id>",
  "status": "<mapped, see table>",
  "start": "<slotStart, ISO 8601>",
  "end": "<slotEnd, ISO 8601>",
  "reasonCode": [{ "text": "<symptomSummary>" }],
  "cancelationReason": { "text": "<rejectionReason>" },
  "participant": [
    { "actor": { "display": "Dr. <DoctorProfile→User.name> (<clinicName>)" }, "status": "accepted" },
    { "actor": { "display": "<User.name>" }, "status": "accepted" }
  ]
}
```

`reasonCode`/`cancelationReason` are omitted when the underlying field is
unset (not emitted as `null`). Status mapping — chosen to match CLAUDE.md
§2's own wording verbatim ("appointment statuses≈FHIR
(booked/fulfilled/cancelled/noshow)"), which is why this uses FHIR's
**`Appointment`** resource and its real `status` enum
(`proposed|pending|booked|arrived|fulfilled|cancelled|noshow|entered-in-error|checked-in|waitlist`)
rather than `Encounter` (whose status enum has no `booked`/`noshow` at all
and would force a mapping CLAUDE.md never asked for):

| MedLink `Appointment.status` | FHIR `Appointment.status` |
|---|---|
| `requested` | `pending` |
| `confirmed` | `booked` |
| `completed` | `fulfilled` |
| `cancelled` | `cancelled` |
| `rejected` | `cancelled` |
| `no_show` | `noshow` |

**`MedicationRequest[]`** — one per `medicines[]` line item per
`Prescription` doc (a real FHIR MedicationRequest is one resource per
ordered medication, not one per prescription note, so `flatMap`ping
`medicines` is the more faithful — and no harder — choice):

```json
{
  "resourceType": "MedicationRequest",
  "id": "<Prescription._id>-<medicine index>",
  "status": "<'stopped' if Prescription.supersededBy is set, else 'active'>",
  "intent": "order",
  "medicationCodeableConcept": { "text": "<medicine.name>" },
  "dosageInstruction": [{ "text": "<dosage> <frequency> for <durationDays> days<, instructions if set>" }],
  "authoredOn": "<Prescription.createdAt, ISO 8601>",
  "requester": { "display": "Dr. <doctor User.name>" },
  "reasonCode": [{ "text": "<Prescription.diagnosisNote>" }]
}
```

Every version of an amended prescription is included (not just the latest),
each as its own set of `MedicationRequest`s — an amended-away version's
medicines get `status: "stopped"`, the current version's get `"active"`.
This gives the bundle an honest history instead of silently dropping
superseded data, and costs nothing extra: `Prescription.appointmentId` is
preserved unchanged across `amend` (verified in
`prescriptions.service.ts`'s `amendPrescription`), so no special-casing is
needed to find every version.

**`ServiceRequest[]`** — one per `LabReferral` doc:

```json
{
  "resourceType": "ServiceRequest",
  "id": "<LabReferral._id>",
  "status": "<mapped, see table>",
  "intent": "order",
  "code": { "text": "<suggestedTestCodes.join(', ')>" },
  "authoredOn": "<timeline[0].at, ISO 8601>",
  "requester": { "display": "Dr. <doctor User.name>" },
  "performer": [{ "display": "<LabProfile.labName>" }]
}
```

| MedLink `LabReferral.status` | FHIR `ServiceRequest.status` |
|---|---|
| `sent`, `opened`, `booked`, `sample_collected` | `active` |
| `report_ready`, `closed` | `completed` |

**`DiagnosticReport[]`** — one per `LabBooking` doc **that has a
`reportUrl`** (bookings without a report yet contribute nothing — there is
no meaningful "preliminary" DiagnosticReport to emit, and inventing an empty
placeholder resource would violate FHIR's own guidance that a
DiagnosticReport represents a *finalized* result). Generated directly from
`LabBooking`, independent of whether a `LabReferral` exists — this also
naturally covers walk-in bookings (CLAUDE.md §6.4's "1 walk-in booking (no
referral)"), which have no `ServiceRequest` to attach to:

```json
{
  "resourceType": "DiagnosticReport",
  "id": "<LabBooking._id>",
  "status": "final",
  "code": { "text": "<testCodes.join(', ')>" },
  "effectiveDateTime": "<scheduledAt, ISO 8601>",
  "presentedForm": [{ "url": "<reportUrl>" }]
}
```

### 2. Authorization model

New service function `canExportPatient(requester: {id, role}, patientId): Promise<boolean>`:

- `role === 'patient'` → authorized iff `requester.id === patientId`.
- `role === 'doctor'` → look up the caller's `DoctorProfile` by `userId`,
  then `Appointment.exists({ doctorId: doctorProfile._id, patientId })`.
  A single `Appointment` existence check is sufficient as the relationship
  signal: every `Prescription` and `LabReferral` in this system already
  originates from a specific `Appointment` between a doctor and patient
  (Phase 2–5), so "has this doctor and patient ever had an appointment" is
  a strict superset of "does this doctor have a prescription/referral for
  this patient" — checking `Appointment` alone avoids querying three
  collections to answer one yes/no question.
- `role === 'admin'` → always authorized (matches the existing admin
  verification-decision route, which has no per-entity ownership check).
- Anything else (`role === 'lab'`, or no session) → unauthorized. `lab` is
  rejected by `requireRole('patient','doctor','admin')` at the router level
  before this function ever runs.

Failure mode: unauthorized → `403 FORBIDDEN` (same `AppError` shape as every
other route). A `patientId` that doesn't resolve to a `User` with
`role: 'patient'` at all → `404 PATIENT_NOT_FOUND` (checked before the
authorization branch, so a doctor probing random ids gets a 404, not a 403
that would confirm the id belongs to *some* patient).

### 3. Endpoint, response format, and why synchronous GET is enough

```
GET /api/fhir/Patient/:patientId/$everything-lite
GET /api/fhir/Patient/:patientId/$everything-lite?encounterId=<appointmentId>
```

Route path matches CLAUDE.md §2's exact string (`$everything-lite`, echoing
FHIR's real `$everything` operation naming convention) under this repo's
existing `/api` prefix convention. Express 4's router (path-to-regexp
0.1.x) treats `$` as a literal path character — no escaping needed, but
Task 4's first verification step confirms this against the real router
rather than assuming it.

**Single JSON `Bundle`, not one response per resource type:** a FHIR
`Bundle` of `type: "collection"` wrapping every resource in one `entry[]`
array is both the more FHIR-idiomatic shape for a `$everything` response
*and* the simpler one to generate and consume — splitting into five
separate endpoint calls would multiply auth checks, audit-log writes, and
client round-trips for no benefit at this data volume.

```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "timestamp": "<export time, ISO 8601>",
  "entry": [
    { "resource": { "resourceType": "Patient", ... } },
    { "resource": { "resourceType": "Appointment", ... } },
    ...
  ]
}
```

**Why a synchronous `GET`, not a background job:** CLAUDE.md §6.4's own
seed spec caps the *entire demo dataset* at ~15 appointments, 6
prescriptions, 3 referrals total across all patients — a single patient's
real export is a handful of indexed `find({patientId: ...})` queries
(`Appointment`, `Prescription`, `LabReferral`, `LabBooking`), run in
parallel via `Promise.all`, well under any reasonable request timeout. This
platform has no bulk-tenant/population-health use case (CLAUDE.md §0.4:
"no multi-clinic/hospital tenancy") where per-patient history could grow
unboundedly — the volume that would justify a job queue never occurs here.

**On CLAUDE.md §3's "every list endpoint: pagination + sort" rule:** this
endpoint deliberately does not paginate. It is not a list endpoint in that
sense — it's a single bounded-size aggregate scoped to one already-identified
patient, the same category as the admin analytics endpoint
(`GET /api/admin/analytics`, also unpaginated for the same reason: its
result size is bounded by the aggregation, not by an ever-growing
collection scan).

**`encounterId` scoping:** when present, the query param is validated as a
non-empty string (an `AppError(400)` is raised downstream if it isn't a
valid `Appointment` id belonging to `patientId` — Zod alone can't check
DB membership). The bundle-builder then scopes:
- `Appointment[]` → just that one appointment.
- `MedicationRequest[]` → all `Prescription` versions with that
  `appointmentId` (see §1 on why `appointmentId` is stable across amends).
- `ServiceRequest[]` → `LabReferral`s whose `prescriptionId` is one of the
  above prescriptions' ids.
- `DiagnosticReport[]` → `LabBooking`s whose `referralId` is one of the
  above referrals' ids (walk-in bookings are correctly excluded when
  encounter-scoped — they don't belong to any encounter).

### 4. Audit logging

Every successful export (regardless of caller role) writes one `AuditLog`
entry via the existing `logAudit()` helper:

```ts
await logAudit({
  actorId: requester.id,
  actorRole: requester.role,
  action: 'fhir_export',
  entityType: 'Patient',
  entityId: patientId,
  meta: { encounterId, resourceCounts: { appointments, medicationRequests, serviceRequests, diagnosticReports } },
});
```
`resourceCounts` gives a reviewer a way to spot an anomalously large export
without opening the payload — cheap to compute since the bundle-builder
already has every array's length.

### 5. Testing strategy

Two layers, matching this repo's existing module test structure
(`*.service.ts` unit tests + a route-level `*.test.ts` Supertest suite):

1. **Bundle-builder unit tests** (`fhirExport.service.test.ts`,
   mongodb-memory-server, no HTTP): seed one of each source document,
   build the bundle, and assert — per resource type — that the required
   FHIR fields are present and every `status` value is one of the
   documented enum values from §1's mapping tables. This *is* the "validate
   output shape against R4 spec manually" CLAUDE.md asks for: hand-written
   assertions against the R4 fields this spec defines, not a generic
   schema validator.
2. **Route integration tests** (`fhirExport.test.ts`, Supertest): the full
   auth matrix — patient exports own data (200), patient exports another
   patient's data (403), doctor with a real appointment (200), doctor with
   no relationship to that patient (403), admin exporting any patient (200
   + asserts exactly one new `AuditLog` row), lab role (403, blocked at the
   router), no session (401), unknown/non-patient id (404),
   `encounterId` scoping (200, bundle contains only that appointment's
   resources), `encounterId` for an appointment belonging to a different
   patient (400).

## Open questions

None — CLAUDE.md §2 already fixed the endpoint shape and resource-type
list; every remaining choice (auth model, response format, audit, mapping
fidelity, tests) is resolved above against this repo's existing patterns.
