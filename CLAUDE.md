# CLAUDE.md — MedLink (Healthcare Ecosystem Platform)

> Role-based healthcare platform: Patient ↔ Doctor ↔ Path Lab ↔ Admin.
> AI symptom triage → doctor matching → appointment booking → prescription → lab referral → report upload.
> Built by Sumit Verma. This file is the single source of truth for Claude Code. Follow phases strictly. Do not skip ahead.

---

## 0. CTO-Level Decisions (read before writing any code)

### 0.1 Product principles (non-negotiable)
1. **AI never diagnoses. AI never prescribes.** The symptom engine only maps symptoms → specialty/department and ranks doctors. Every AI output carries the disclaimer: "This is guidance, not medical advice."
2. **Doctor is the only actor who can create a prescription.** AI may pre-fill *nothing* in v1. (Phase 7 may add "AI suggests, doctor approves" behind a flag.)
3. **Every cross-role action leaves an audit trail** (who, what, when). Healthcare = trust. Cheap to build now, impossible to retrofit.
4. **Ship phases, not features.** Each phase ends with a deployable, demo-able increment.

### 0.2 Architecture — polyglot microservices (2 services + 1 frontend)

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Next.js 14 │ ──► │  Node.js/Express API │ ──► │  MongoDB (primary)  │
│  (frontend) │     │  auth, bookings,     │     │  Redis (slots,      │
│             │     │  profiles, rx, labs  │     │  cache, queues)     │
│             │ ──► │──────────────────────│     └─────────────────────┘
│             │     │  FastAPI (Python)    │
│             │     │  symptom triage +    │
│             │     │  doctor matching     │
└─────────────┘     └──────────────────────┘
```

**Why two backends (interview answer, memorize this):**
- Node/Express owns *transactional* domain: auth, CRUD, bookings, files. I/O-bound → Node excels.
- FastAPI owns the *intelligence* domain: embeddings, symptom→specialty mapping, ranking. Python's ML ecosystem (sentence-transformers, scikit-learn, pandas) is the industry standard.
- Services communicate over HTTP internally; FastAPI is never exposed publicly — Node proxies it. Single auth boundary.

### 0.3 Tech stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui | SSR for doctor/lab public profiles (SEO), your core stack |
| State | Redux Toolkit + RTK Query | Resume-verified, cache invalidation built in |
| API | Node 20, Express, TypeScript, Zod validation | Core stack |
| AI service | FastAPI, Python 3.12, sentence-transformers (all-MiniLM-L6-v2, runs local, free), rapidfuzz | Real Python work, zero API cost |
| DB | MongoDB + Mongoose | Core stack; document model fits profiles/prescriptions well |
| Cache/locks | Redis | Slot locking, session blacklist, triage cache |
| Files | Local disk in dev; Cloudinary free tier for prod (report PDFs, avatars) | ₹0 |
| Auth | JWT (access 15m + refresh 7d, httpOnly cookies), RBAC middleware | Resume-verified |
| Realtime | Socket.io (appointment status, report-ready) | One lib, both services can emit via Redis pub/sub |
| Notifications | Nodemailer (Gmail SMTP free) + optional Telegram bot | ₹0 |
| PDF | pdf-lib (Node) for prescription generation | Free, no headless browser |
| Infra | Docker Compose (4 containers: web, api, ai, redis) + MongoDB Atlas free tier | ₹0 |
| CI/CD | GitHub Actions: lint → typecheck → test → build images | Resume-verified |
| Hosting | Vercel (frontend) + Render/Railway free tier (api, ai) | ₹0 |

### 0.4 Non-goals for v1 (say no like a CTO)
- No payments (fake "pay at clinic" flag). Razorpay is Phase 8+ if ever.
- No video consults. No chat between patient and doctor (only structured flows).
- No multi-clinic/hospital tenancy. One doctor = one profile.
- No mobile app. Responsive web only.
- No real medical records compliance claims (mention "designed with DPDP Act principles in mind" — encryption at rest via Atlas, audit logs, consent flags — but never claim HIPAA compliance).

### 0.5 Repo layout (monorepo)

```
medlink/
├── apps/
│   ├── web/          # Next.js 14
│   ├── api/          # Express + TS
│   └── ai/           # FastAPI
├── packages/
│   └── shared/       # zod schemas + TS types shared web↔api
├── docker-compose.yml
├── .github/workflows/ci.yml
└── CLAUDE.md         # this file
```

---

## 1. Data Model (Mongoose — define ALL in Phase 1, evolve carefully)

```
User          { _id, role: 'patient'|'doctor'|'lab'|'admin', email, phone, passwordHash,
                name, avatarUrl, isVerified, createdAt }

DoctorProfile { userId → User, specialties: [String], qualifications: [String],
                regNo, experienceYears, bio, clinicName, clinicAddress, city, geo: {lat,lng},
                consultationFee, languages: [String], verificationStatus: 'pending'|'approved'|'rejected',
                verificationDocs: [url], avgRating, ratingCount }

AvailabilityRule { doctorId, dayOfWeek: 0-6, startTime, endTime, slotMinutes, validFrom, validTo }

Appointment   { patientId, doctorId, slotStart, slotEnd,
                status: 'requested'|'confirmed'|'rejected'|'completed'|'cancelled'|'no_show',
                symptomSummary, triageSessionId?, rejectionReason?, timeline: [{status, at, by}] }

TriageSession { patientId, messages: [{role, text, at}],
                extractedSymptoms: [String], suggestedSpecialties: [{name, confidence}],
                recommendedDoctorIds: [ObjectId], disclaimerShownAt }

Prescription  { appointmentId, doctorId, patientId, diagnosisNote,
                medicines: [{name, dosage, frequency, durationDays, instructions}],
                advice, followUpDate?, recommendedTests: [{testName, labReferralId?}],
                pdfUrl, createdAt, immutable: true }   # never edited; new version = new doc

LabProfile    { userId → User, labName, address, city, geo, timings, homeCollection: Boolean,
                verificationStatus, tests: [{code, name, price, turnaroundHours, description}] }

LabReferral   { prescriptionId, doctorId, patientId, labId,
                suggestedTestCodes: [String], token (nanoid, unguessable),
                status: 'sent'|'opened'|'booked'|'sample_collected'|'report_ready'|'closed',
                reportUrl?, timeline: [{status, at}] }

LabBooking    { referralId?, patientId, labId, testCodes: [String], totalPrice,
                scheduledAt, homeCollection, status, reportUrl? }

AuditLog      { actorId, actorRole, action, entityType, entityId, meta, at }

Notification  { userId, type, title, body, link, readAt?, createdAt }
```

**Key modeling decisions:**
- `Prescription.immutable` — prescriptions are never edited, only superseded. Legal-grade thinking; great interview point.
- `LabReferral.token` — the "direct link" feature. URL: `/r/{token}`. Unguessable, single-patient, expires in 30 days.
- `Appointment.timeline` — embedded status history = free audit trail on the hottest entity.

---

## 2. Phases

### Phase 1 — Foundation: Auth, Roles, Profiles (Week 1, days 1–4)
**Goal: 4 roles can register, log in, and manage profiles. Deployable.**

- [ ] Monorepo scaffold (npm workspaces), Docker Compose (mongo, redis, api, web), CI skeleton
- [ ] Express: error middleware, Zod request validation, pino logging, helmet, rate-limit (Redis)
- [ ] Auth: register/login/refresh/logout, JWT httpOnly cookies, bcrypt, refresh-token rotation, Redis blacklist on logout
- [ ] RBAC middleware: `requireRole('doctor')` etc. Applied to every route from day 1
- [ ] Patient profile CRUD (basic: name, age, gender, city)
- [ ] Doctor profile CRUD + verification doc upload (status starts 'pending')
- [ ] Lab profile CRUD + test catalog CRUD (add/edit/remove tests with price)
- [ ] Admin: list pending doctor/lab verifications, approve/reject with reason
- [ ] Public pages (SSR): `/doctors/[id]`, `/labs/[id]` — only if approved
- [ ] AuditLog write on: registration, verification decisions, profile edits
- [ ] Seed script: full dummy dataset per **Section 6 (Seed Data Spec)** — run via `npm run seed`, idempotent (drops & re-inserts)

**Definition of done:** demo = register as each role, admin approves a doctor, doctor's public page goes live.

### Phase 2 — Availability & Booking Engine (Week 1 day 5 – Week 2 day 3)
**Goal: race-condition-proof appointment booking. The hardest pure-engineering phase.**

- [ ] Doctor sets weekly AvailabilityRules (e.g., Mon/Wed 18:00–21:00, 15-min slots)
- [ ] Slot generation service: rules → concrete slots for next 14 days, minus booked/blocked
- [ ] **Slot locking:** on "Book" click → Redis `SET slot:{doctorId}:{slotStart} patientId NX EX 300` (5-min hold) → confirm within hold or release. Prevents double-booking. *This is your concurrency interview story.*
- [ ] Booking flow: patient requests → status 'requested' → doctor confirms/rejects (with reason) → notifications both ways
- [ ] Doctor dashboard: today's queue, pending requests, calendar view
- [ ] Patient dashboard: upcoming/past appointments, cancel (cutoff: 2h before)
- [ ] Doctor can block dates (leave) — regenerates slots
- [ ] Socket.io: live status updates on both dashboards
- [ ] Email notifications: requested, confirmed, rejected, reminder (node-cron, 24h before)
- [ ] Tests: slot generation edge cases, double-booking race (two parallel requests → exactly one wins)

**Definition of done:** two browsers race for the same slot; one wins, one gets a clean error.

### Phase 3 — AI Triage & Doctor Matching (Week 2 days 4–7)
**Goal: the headline feature. FastAPI earns its place.**

- [ ] FastAPI service scaffold: uvicorn, pydantic v2, internal-only (Docker network), health endpoint
- [ ] Curate `specialty_map.json`: ~40 specialties × seed symptom phrases (source from public symptom-specialty references; commit the dataset)
- [ ] Embedding engine: sentence-transformers all-MiniLM-L6-v2 (local). Pre-compute specialty embeddings at startup; cache in memory
- [ ] `/triage` endpoint: patient free-text → extract symptom spans → cosine similarity → top-3 specialties with confidence scores
- [ ] Red-flag rules layer (BEFORE embeddings): keyword list (chest pain, breathlessness, suicidal thoughts, severe bleeding, sudden vision loss...) → immediate "seek emergency care / call 112" response, skip matching
- [ ] Chat UI in Next.js: conversational multi-turn (asks 1–2 clarifying questions max: duration? severity?), then shows specialties + top doctors (filter: city, fee, rating, next available slot)
- [ ] "Book with Dr. X" deep-links into Phase 2 flow with `triageSessionId` attached; doctor sees symptom summary on the request card
- [ ] Node → FastAPI proxy route with timeout + circuit breaker (if AI down, fall back to manual specialty picker — *graceful degradation, interview gold*)
- [ ] Cache triage results in Redis (hash of normalized input, 1h TTL)
- [ ] Disclaimer on every AI message; log `disclaimerShownAt`

**Definition of done:** "I have itchy red patches on my elbow for 2 weeks" → Dermatology (0.87) → 3 bookable dermatologists. "Crushing chest pain" → emergency banner, no matching.

### Phase 4 — Prescriptions (Week 3 days 1–3)
**Goal: doctor closes the appointment with a legal-grade artifact.**

- [ ] Prescription composer (doctor-only, only for 'confirmed' appointments): diagnosis note, medicines table (autocomplete from a seeded generic-drug list), advice, follow-up date, recommended tests
- [ ] PDF generation (pdf-lib): clinic letterhead from doctor profile, reg no, signature image, QR code linking to verification URL `/rx/verify/{id}`
- [ ] Immutability: no edit endpoint exists. "Amend" creates v2 linked to v1
- [ ] Patient: prescriptions list + PDF download + health timeline (appointments, prescriptions, referrals — chronological)
- [ ] Appointment auto-moves to 'completed' on prescription creation

### Phase 5 — Lab Referral Flow (Week 3 days 4–7)
**Goal: the rare feature nobody else has. Doctor → lab deep-link → patient books test.**

- [ ] In prescription composer: doctor picks recommended tests → system shows labs offering those tests (match by test name/code, sorted by price/city) → doctor selects lab → LabReferral created with nanoid token
- [ ] Referral link `/r/{token}` embedded in prescription PDF + sent via notification
- [ ] Patient opens link → lab's page with referred tests pre-selected, prices totaled → books (choose home collection if offered, pick date)
- [ ] Lab dashboard: incoming referrals + bookings, status pipeline: booked → sample_collected → report_ready (upload PDF)
- [ ] Report upload → notify patient AND referring doctor (closes the loop) → appears in patient timeline
- [ ] Referral status timeline visible to doctor ("did my patient actually get the test?") — *doctors love this in real life; mention it in demo*
- [ ] Walk-in flow: patient can also book any lab directly without referral

### Phase 6 — Polish, Admin, Deploy (Week 4)
- [ ] Ratings: patient rates doctor after 'completed' (1–5 + optional text); recompute avgRating
- [ ] Admin analytics: registrations, appointments/day, top specialties, triage→booking conversion
- [ ] Notification center (bell icon) + mark-read
- [ ] Global search: doctors by name/specialty/city; labs by test
- [ ] Empty states, loading skeletons, mobile responsiveness pass
- [ ] Security pass: rate limits per route, NoSQL injection review, file upload validation (type/size), CORS lockdown
- [ ] Seed demo data → deploy: Vercel + Render + Atlas + Upstash Redis (all free)
- [ ] README with architecture diagram, screenshots, demo credentials for all 4 roles, 2-min Loom
- [ ] GitHub Actions: on PR → lint, typecheck, test; on main → build & push Docker images

### Phase 7 (optional, post-launch differentiators)
- **FHIR Interop (lite):** `GET /fhir/Patient/{id}/$everything-lite` — serialize patient timeline as a FHIR R4 Bundle JSON: Patient, Appointment[], MedicationRequest[] (from prescriptions), ServiceRequest[] (lab referrals), DiagnosticReport[] (lab reports). Validate output shape against R4 spec manually (no FHIR server). Add a README "FHIR Mapping" table: DoctorProfile≈Practitioner, LabReferral≈ServiceRequest, Prescription.medicines≈MedicationRequest.dosageInstruction, appointment statuses≈FHIR (booked/fulfilled/cancelled/noshow). Interview line: "custom data model for velocity, FHIR R4 export for interoperability."
- "AI suggests, doctor approves" prescription pre-fill (feature-flagged)
- Telegram bot notifications
- Hindi language toggle for triage chat (multilingual MiniLM model)
- Doctor earnings/appointment analytics

---

## 3. Engineering Standards

- TypeScript strict everywhere; no `any`. Python: ruff + mypy.
- Zod schemas in `packages/shared` — single source of truth for API contracts; FastAPI mirrors with pydantic.
- Conventional commits. PR-sized commits per checklist item.
- Tests: Vitest (api services + booking race), pytest (triage engine: red-flags, top-k accuracy on a 50-case fixture set). Target: booking + triage covered, not 100% everything.
- Env via `.env.example` kept current. Secrets never committed.
- Every list endpoint: pagination + sort from day 1.

## 4. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Triage accuracy embarrassing in demo | Fixture test set of 50 symptom→specialty cases; tune seed phrases until ≥90% top-3 hit |
| Scope creep kills the project | Phases are law. Nothing from Phase 5 starts before Phase 4 demo works |
| Free-tier cold starts (Render) | Cron ping every 10 min; mention trade-off in README |
| "Is this legal?" interview question | Disclaimers, no-diagnosis principle, immutable prescriptions, audit logs — rehearse the answer |
| Model download size in Docker | Bake model into AI image at build time (layer-cached) |

## 5. Demo Script (what you show in interviews, 3 minutes)
1. Patient types symptoms in chat → specialties + doctors appear (show red-flag case too)
2. Book slot → doctor's dashboard pings live → confirm
3. Doctor writes prescription → picks tests → selects lab → PDF with QR + referral link
4. Patient clicks `/r/{token}` → tests pre-selected → books
5. Lab uploads report → doctor + patient both notified → patient timeline shows the full journey
6. Close on the architecture diagram: "two services, here's why."

---

## 6. Seed Data Spec (dummy data — REQUIRED, this is a portfolio project)

> Implement as `apps/api/src/seed/seed.ts`, run with `npm run seed`. Idempotent: wipe collections, re-insert. All passwords: `Demo@123`. All entities pre-approved (verificationStatus: 'approved') except one doctor and one lab left 'pending' so the admin demo has something to approve. Use realistic Indian names, Delhi-NCR addresses, real-looking but fake reg numbers. Avatars: `https://i.pravatar.cc/150?u={email}` (free).

### 6.1 Accounts

| Role | Email | Notes |
|---|---|---|
| Admin | admin@medlink.demo | |
| Patients (6) | rahul.p@medlink.demo, priya.p@medlink.demo, amit.p@medlink.demo, sneha.p@medlink.demo, vikram.p@medlink.demo, anita.p@medlink.demo | Ages 8–62 spread (one child → parent-managed note), mixed gender, cities: Noida, Delhi, Ghaziabad |

### 6.2 Doctors (12 — cover every triage demo path)

| Name | Specialty | City | Fee ₹ | Exp | Availability |
|---|---|---|---|---|---|
| Dr. Meera Sharma | Dermatology | Noida | 600 | 9y | Mon/Wed/Fri 18:00–21:00, 15-min |
| Dr. Arjun Khanna | Dermatology | Delhi | 900 | 14y | Tue/Thu 10:00–13:00, 20-min |
| Dr. Kavita Rao | General Physician | Noida | 400 | 7y | Daily 09:00–12:00, 10-min |
| Dr. Sanjay Gupta | General Physician | Ghaziabad | 350 | 20y | Mon–Sat 17:00–20:00, 15-min |
| Dr. Neha Verma | Gastroenterology | Delhi | 1000 | 11y | Mon/Thu 11:00–14:00, 20-min |
| Dr. Rohit Malhotra | Cardiology | Delhi | 1200 | 16y | Tue/Fri 09:00–12:00, 20-min |
| Dr. Anjali Singh | Gynecology | Noida | 700 | 10y | Mon/Wed/Sat 16:00–19:00, 15-min |
| Dr. Farhan Ali | Orthopedics | Noida | 800 | 12y | Tue/Thu/Sat 18:00–21:00, 15-min |
| Dr. Pooja Iyer | Pediatrics | Delhi | 600 | 8y | Daily 10:00–13:00, 15-min |
| Dr. Vivek Joshi | ENT | Ghaziabad | 500 | 9y | Mon/Wed/Fri 11:00–13:00, 15-min |
| Dr. Ritu Bansal | Psychiatry | Delhi | 1100 | 13y | Tue/Thu 15:00–18:00, 30-min |
| Dr. Karan Mehta | Ophthalmology | Noida | 650 | 6y | **verificationStatus: 'pending'** (admin demo) |

Each approved doctor: bio (2–3 sentences), qualifications (MBBS + MD/MS/DNB as fits), regNo format `DMC/R/{5 digits}`, 2–3 languages, avgRating 3.9–4.8 with ratingCount 12–160.

### 6.3 Path Labs (4)

**HealthFirst Diagnostics — Noida** (homeCollection: true)
| Code | Test | ₹ | TAT |
|---|---|---|---|
| CBC | Complete Blood Count | 250 | 6h |
| LFT | Liver Function Test | 450 | 12h |
| KFT | Kidney Function Test | 450 | 12h |
| TSH | Thyroid Profile (TSH) | 300 | 12h |
| HBA1C | HbA1c (Diabetes) | 400 | 12h |
| LIPID | Lipid Profile | 500 | 12h |
| VITD | Vitamin D | 900 | 24h |
| URINE | Urine Routine | 150 | 6h |

**City Path Labs — Delhi** (homeCollection: true) — same 8 tests, prices +10–15%, plus: XRAYC (Chest X-Ray, ₹350), ECG (₹250), USGABD (Ultrasound Abdomen, ₹1200)

**Ghaziabad Diagnostic Centre** (homeCollection: false) — CBC, TSH, HBA1C, LIPID, URINE at lowest prices (budget option), plus BLOODSUGAR (FBS/PPBS, ₹120)

**Metro Scans & Labs — Delhi** — **verificationStatus: 'pending'** (admin demo); imaging-heavy catalog: MRI Knee ₹4500, CT Head ₹3200, USGABD ₹1100

Lab timings: 07:00–21:00. Each has address + geo coords in its city.

### 6.4 Relational demo data (the part that makes dashboards look alive)

- **Appointments (~15):**
  - 6 completed (past 2 weeks, spread across doctors) — each with prescription
  - 3 confirmed (next 3 days)
  - 2 requested (pending on Dr. Meera + Dr. Kavita dashboards — demo confirm/reject live)
  - 1 rejected (reason: "Please book with a pediatrician for a child patient")
  - 1 cancelled by patient, 1 no_show, 1 completed-without-prescription
- **TriageSessions (4):** rash→Dermatology, acidity→Gastro, knee pain→Ortho, chest pain→red-flag emergency case (no booking). Link 2 of them to the completed appointments via triageSessionId.
- **Prescriptions (6):** realistic generic medicines (e.g., Cetirizine 10mg OD 5 days; Pantoprazole 40mg OD before breakfast 14 days; Paracetamol 500mg SOS). 3 of them include recommendedTests.
- **LabReferrals (3):**
  - Dr. Neha → HealthFirst (LFT + CBC) → status 'report_ready' with dummy PDF report uploaded
  - Dr. Kavita → Ghaziabad Diagnostic (HBA1C + BLOODSUGAR) → status 'booked'
  - Dr. Meera → City Path Labs (CBC) → status 'sent' (patient hasn't clicked — demo the click live)
- **LabBookings:** the 2 progressed referrals above + 1 walk-in booking (no referral) at HealthFirst
- **Ratings (8):** spread across doctors, texts like "Very patient, explained everything clearly"
- **Notifications:** seed 3–5 unread per demo account so bells aren't empty
- **AuditLogs:** written naturally by seed actions

### 6.5 Dummy files
- `seed/assets/report_sample.pdf` — generate once with pdf-lib: fake letterhead "HealthFirst Diagnostics", CBC table with values in normal range, "DUMMY REPORT — DEMO ONLY" watermark
- Doctor signature: simple PNG generated from name in cursive font (or a squiggle SVG→PNG), one per doctor
- Never use real patient/report data from anywhere

### 6.6 Triage fixture set (for pytest, per Section 3)
`apps/ai/tests/fixtures/triage_cases.json` — 50 cases: `{"input": "itchy red patches on elbow 2 weeks", "expected_specialty": "Dermatology"}`. Include 5 red-flag cases expecting `"emergency": true`. Cover all 12 seeded specialties ≥3 cases each.

### 6.7 README demo credentials block (copy into README)
```
Admin:   admin@medlink.demo / Demo@123
Doctor:  meera.d@medlink.demo / Demo@123   (Dermatology — has pending requests)
Patient: rahul.p@medlink.demo / Demo@123   (has full health timeline)
Lab:     healthfirst.l@medlink.demo / Demo@123 (has referrals in pipeline)
```
