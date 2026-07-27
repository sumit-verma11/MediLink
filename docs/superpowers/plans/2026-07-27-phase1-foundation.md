# Phase 1 — Foundation (Auth, Roles, Profiles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four roles (patient, doctor, lab, admin) can register, log in, manage
role-specific profiles, and have an admin approve/reject doctor & lab
verification — deployable end-to-end, with an approved doctor's public page
live and a full demo dataset seeded.

**Architecture:** npm-workspaces monorepo (`apps/web` Next.js 14, `apps/api`
Express/TS, `packages/shared` Zod schemas). MongoDB via Mongoose is the
system of record; Redis (via ioredis) backs rate-limiting and JWT
refresh/blacklist state. Auth is stateless JWT in httpOnly cookies (15m
access / 7d refresh) with Redis-tracked rotation. RBAC middleware gates every
non-public route. `apps/ai` (FastAPI) is **not** scaffolded in this phase —
it first appears in Phase 3.

**Tech Stack:** Node 20, TypeScript 5 (strict), Express 4, Mongoose 8,
ioredis 5, Zod 3, jsonwebtoken 9, bcryptjs, pino/pino-http, helmet, cors,
express-rate-limit + rate-limit-redis, multer, Next.js 14 (App Router),
Tailwind, shadcn/ui, Redux Toolkit + RTK Query. Tests: Vitest + Supertest +
mongodb-memory-server + ioredis-mock.

## Global Constraints

- TypeScript strict everywhere; no `any` (CLAUDE.md §3).
- Zod schemas in `packages/shared` are the single source of truth for API contracts (§3).
- RBAC middleware applied to every route from day 1 (§2 Phase 1 checklist).
- Every cross-role action leaves an audit trail: who, what, when (§0.1.3).
- Every list endpoint: pagination + sort from day 1 (§3).
- All seed passwords: `Demo@123` (§6). Seed is idempotent: wipe collections, re-insert (§6).
- All entities pre-approved except one doctor (Dr. Karan Mehta) and one lab (Metro Scans & Labs), left `'pending'` (§6.2/§6.3).
- Conventional commits (§3).
- Files: local disk in dev for uploads (verification docs) (§0.3).
- Mongoose models for **all** entities listed in CLAUDE.md §1 are defined now, even though only User/PatientProfile/DoctorProfile/LabProfile/AuditLog/Notification get routes in this phase (§1: "define ALL in Phase 1, evolve carefully"). Appointment/TriageSession/Prescription/LabReferral/LabBooking seed data is deferred phase-by-phase per `2026-07-27-roadmap.md` — do not seed it here.

---

## File Structure

```
medlink/
├── package.json                        # npm workspaces root
├── tsconfig.base.json
├── docker-compose.yml
├── .github/workflows/ci.yml
├── .env.example
├── packages/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                # barrel export
│           └── schemas/
│               ├── user.ts             # UserRole, RegisterInput, LoginInput
│               ├── patient.ts          # PatientProfileInput
│               ├── doctor.ts           # DoctorProfileInput
│               ├── lab.ts              # LabProfileInput, LabTestInput
│               └── admin.ts            # VerificationDecisionInput
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── Dockerfile
│   │   ├── .env.example
│   │   ├── uploads/verification-docs/  # gitignored, created at runtime
│   │   └── src/
│   │       ├── app.ts                  # createApp(): Express app, no listen()
│   │       ├── server.ts               # connects DB, calls app.listen()
│   │       ├── lib/
│   │       │   ├── logger.ts           # pino instance
│   │       │   ├── db.ts               # connectDB/disconnectDB
│   │       │   ├── redis.ts            # getRedis()/setRedisClient() for test injection
│   │       │   └── errors.ts           # AppError class
│   │       ├── middleware/
│   │       │   ├── errorHandler.ts
│   │       │   ├── validate.ts         # validate(schema, 'body'|'query'|'params')
│   │       │   ├── auth.ts             # requireAuth, requireRole
│   │       │   └── rateLimit.ts        # authLimiter (redis-backed)
│   │       ├── models/
│   │       │   ├── User.ts
│   │       │   ├── PatientProfile.ts
│   │       │   ├── DoctorProfile.ts
│   │       │   ├── LabProfile.ts
│   │       │   ├── AvailabilityRule.ts
│   │       │   ├── Appointment.ts
│   │       │   ├── TriageSession.ts
│   │       │   ├── Prescription.ts
│   │       │   ├── LabReferral.ts
│   │       │   ├── LabBooking.ts
│   │       │   ├── AuditLog.ts
│   │       │   └── Notification.ts
│   │       ├── modules/
│   │       │   ├── auth/
│   │       │   │   ├── jwt.ts
│   │       │   │   ├── auth.service.ts
│   │       │   │   ├── auth.controller.ts
│   │       │   │   ├── auth.routes.ts
│   │       │   │   └── auth.test.ts
│   │       │   ├── patients/
│   │       │   │   ├── patients.controller.ts
│   │       │   │   ├── patients.routes.ts
│   │       │   │   └── patients.test.ts
│   │       │   ├── doctors/
│   │       │   │   ├── upload.ts       # multer config
│   │       │   │   ├── doctors.controller.ts
│   │       │   │   ├── doctors.routes.ts
│   │       │   │   └── doctors.test.ts
│   │       │   ├── labs/
│   │       │   │   ├── labs.controller.ts
│   │       │   │   ├── labs.routes.ts
│   │       │   │   └── labs.test.ts
│   │       │   ├── admin/
│   │       │   │   ├── admin.controller.ts
│   │       │   │   ├── admin.routes.ts
│   │       │   │   └── admin.test.ts
│   │       │   └── audit/
│   │       │       └── audit.service.ts
│   │       └── seed/
│   │           ├── seed.ts
│   │           └── data.ts             # accounts/doctors/labs constants from §6
│   └── web/
│       ├── package.json                # generated by create-next-app, then edited
│       ├── src/
│       │   ├── store/
│       │   │   ├── store.ts
│       │   │   ├── api.ts              # RTK Query baseApi
│       │   │   └── StoreProvider.tsx
│       │   └── app/
│       │       ├── layout.tsx          # wraps children in StoreProvider
│       │       ├── (auth)/
│       │       │   ├── register/page.tsx
│       │       │   └── login/page.tsx
│       │       ├── doctors/[id]/page.tsx   # SSR public doctor page
│       │       └── labs/[id]/page.tsx      # SSR public lab page
│       └── ...next.config.js, tailwind.config.ts, tsconfig.json (generated)
```

---

### Task 1: Monorepo scaffold + Docker Compose + CI skeleton

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.env.example`, `.gitignore`
- Create: `docker-compose.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile` (placeholder until Task 13 fills `apps/web`)
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: the `npm run lint|typecheck|test|build --workspaces` scripts every later task's CI step relies on; the `mongo`/`redis` service hostnames (`mongo:27017`, `redis:6379`) that `apps/api/.env` will reference.

- [ ] **Step 1: Create root workspace config**

```json
// package.json
{
  "name": "medlink",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:api": "npm run dev --workspace=apps/api",
    "dev:web": "npm run dev --workspace=apps/web",
    "build": "npm run build --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "seed": "npm run seed --workspace=apps/api"
  },
  "devDependencies": {
    "typescript": "^5.5.4"
  }
}
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  }
}
```

```
# .gitignore
node_modules/
dist/
.env
apps/api/uploads/
*.log
```

```
# .env.example
MONGO_URI=mongodb://localhost:27017/medlink
REDIS_URL=redis://localhost:6379
ACCESS_TOKEN_SECRET=change-me-access
REFRESH_TOKEN_SECRET=change-me-refresh
WEB_ORIGIN=http://localhost:3000
PORT=4000
```

- [ ] **Step 2: Verify workspace installs**

Run: `npm install`
Expected: completes with no errors, creates root `node_modules/` and `package-lock.json`. (No workspace packages exist yet — that's fine; `npm install` on an empty workspace glob succeeds.)

- [ ] **Step 3: Write Docker Compose**

```yaml
# docker-compose.yml
services:
  mongo:
    image: mongo:7
    ports: ["27017:27017"]
    volumes: ["mongo_data:/data/db"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  api:
    build: ./apps/api
    ports: ["4000:4000"]
    env_file: ./apps/api/.env
    environment:
      MONGO_URI: mongodb://mongo:27017/medlink
      REDIS_URL: redis://redis:6379
    depends_on: [mongo, redis]
  web:
    build: ./apps/web
    ports: ["3000:3000"]
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:4000
    depends_on: [api]

volumes:
  mongo_data:
```

```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm install
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=@medlink/shared
RUN npm run build --workspace=apps/api
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/server.js"]
```

```dockerfile
# apps/web/Dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY apps/web apps/web
RUN npm run build --workspace=apps/web
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "start"]
```

Note: both Dockerfiles reference `apps/api` and `apps/web` package.json files that don't exist until Tasks 2–15 create them — that's expected; `docker compose build` is not runnable until then. This step just gets the files in place.

- [ ] **Step 4: Write CI skeleton**

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
```

- [ ] **Step 5: Commit**

```bash
git init
git add package.json tsconfig.base.json .env.example .gitignore docker-compose.yml apps/api/Dockerfile apps/web/Dockerfile .github/workflows/ci.yml
git commit -m "chore: scaffold monorepo, docker compose, CI skeleton"
```

---

### Task 2: Shared Zod schemas (`packages/shared`)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/schemas/user.ts`, `patient.ts`, `doctor.ts`, `lab.ts`, `admin.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/schemas.test.ts`

**Interfaces:**
- Consumes: nothing (leaf package).
- Produces: `UserRole`, `RegisterInput`, `LoginInput` (Task 5/6), `PatientProfileInput` (Task 9), `DoctorProfileInput` (Task 10), `LabProfileInput`, `LabTestInput` (Task 11), `VerificationDecisionInput` (Task 12) — all as both Zod schemas and inferred TS types, imported as `import { X } from '@medlink/shared'`.

- [ ] **Step 1: Package config**

```json
// packages/shared/package.json
{
  "name": "@medlink/shared",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

```json
// packages/shared/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/shared/src/schemas/schemas.test.ts
import { describe, it, expect } from 'vitest';
import { RegisterInput, LoginInput } from './user';
import { VerificationDecisionInput } from './admin';

describe('RegisterInput', () => {
  it('rejects a password shorter than 8 chars', () => {
    const result = RegisterInput.safeParse({
      email: 'a@b.com', password: 'short', name: 'A', phone: '9999999999', role: 'patient',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid patient registration', () => {
    const result = RegisterInput.safeParse({
      email: 'a@b.com', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    expect(result.success).toBe(true);
  });
});

describe('LoginInput', () => {
  it('rejects an invalid email', () => {
    expect(LoginInput.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });
});

describe('VerificationDecisionInput', () => {
  it('requires a reason when rejecting', () => {
    const result = VerificationDecisionInput.safeParse({ decision: 'rejected' });
    expect(result.success).toBe(false);
  });

  it('allows approval with no reason', () => {
    const result = VerificationDecisionInput.safeParse({ decision: 'approved' });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm install && npm run test --workspace=@medlink/shared`
Expected: FAIL — `Cannot find module './user'` (files don't exist yet).

- [ ] **Step 4: Implement the schemas**

```ts
// packages/shared/src/schemas/user.ts
import { z } from 'zod';

export const UserRole = z.enum(['patient', 'doctor', 'lab', 'admin']);
export type UserRole = z.infer<typeof UserRole>;

export const RegisterInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().min(10),
  role: UserRole,
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;
```

```ts
// packages/shared/src/schemas/patient.ts
import { z } from 'zod';

export const PatientProfileInput = z.object({
  age: z.number().int().min(0).max(120).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  city: z.string().min(1).optional(),
});
export type PatientProfileInput = z.infer<typeof PatientProfileInput>;
```

```ts
// packages/shared/src/schemas/doctor.ts
import { z } from 'zod';

export const GeoInput = z.object({ lat: z.number(), lng: z.number() });

export const DoctorProfileInput = z.object({
  specialties: z.array(z.string().min(1)).min(1),
  qualifications: z.array(z.string().min(1)).min(1),
  regNo: z.string().min(1),
  experienceYears: z.number().int().min(0),
  bio: z.string().min(1),
  clinicName: z.string().min(1),
  clinicAddress: z.string().min(1),
  city: z.string().min(1),
  geo: GeoInput,
  consultationFee: z.number().min(0),
  languages: z.array(z.string().min(1)).min(1),
});
export type DoctorProfileInput = z.infer<typeof DoctorProfileInput>;
```

```ts
// packages/shared/src/schemas/lab.ts
import { z } from 'zod';
import { GeoInput } from './doctor';

export const LabProfileInput = z.object({
  labName: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  geo: GeoInput,
  timings: z.string().min(1),
  homeCollection: z.boolean(),
});
export type LabProfileInput = z.infer<typeof LabProfileInput>;

export const LabTestInput = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  price: z.number().min(0),
  turnaroundHours: z.number().int().min(1),
  description: z.string().optional(),
});
export type LabTestInput = z.infer<typeof LabTestInput>;
```

```ts
// packages/shared/src/schemas/admin.ts
import { z } from 'zod';

export const VerificationDecisionInput = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    reason: z.string().min(1).optional(),
  })
  .refine((data) => data.decision !== 'rejected' || !!data.reason, {
    message: 'reason is required when rejecting',
    path: ['reason'],
  });
export type VerificationDecisionInput = z.infer<typeof VerificationDecisionInput>;
```

```ts
// packages/shared/src/index.ts
export * from './schemas/user';
export * from './schemas/patient';
export * from './schemas/doctor';
export * from './schemas/lab';
export * from './schemas/admin';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=@medlink/shared`
Expected: PASS (6 tests)

- [ ] **Step 6: Build and commit**

Run: `npm run build --workspace=@medlink/shared`
Expected: emits `packages/shared/dist/*.js` and `.d.ts` with no errors.

```bash
git add packages/shared
git commit -m "feat(shared): add Zod schemas for auth, profiles, admin verification"
```

---

### Task 3: Mongoose models for all entities

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/.env.example`
- Create: `apps/api/src/models/{User,PatientProfile,DoctorProfile,LabProfile,AvailabilityRule,Appointment,TriageSession,Prescription,LabReferral,LabBooking,AuditLog,Notification}.ts`
- Test: `apps/api/src/models/models.test.ts`

**Interfaces:**
- Consumes: nothing new (imports `mongoose` directly).
- Produces: `User`, `PatientProfile`, `DoctorProfile`, `LabProfile`, `AuditLog`, `Notification` Mongoose models used by Tasks 5–15. `AvailabilityRule`, `Appointment`, `TriageSession`, `Prescription`, `LabReferral`, `LabBooking` are defined now but unused until Phases 2–5 (per roadmap).

- [ ] **Step 1: `apps/api` package config**

```json
// apps/api/package.json
{
  "name": "apps/api",
  "version": "0.1.0",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "seed": "tsx src/seed/seed.ts"
  },
  "dependencies": {
    "@medlink/shared": "*",
    "express": "^4.19.2",
    "mongoose": "^8.5.1",
    "ioredis": "^5.4.1",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "pino": "^9.3.2",
    "pino-http": "^10.2.0",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "cookie-parser": "^1.4.6",
    "express-rate-limit": "^7.4.0",
    "rate-limit-redis": "^4.2.0",
    "multer": "^1.4.5-lts.1",
    "nanoid": "^5.0.7",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "tsx": "^4.16.5",
    "vitest": "^2.0.5",
    "supertest": "^7.0.0",
    "mongodb-memory-server": "^10.0.0",
    "ioredis-mock": "^8.9.0",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/cookie-parser": "^1.4.7",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/multer": "^1.4.11",
    "@types/supertest": "^6.0.2",
    "@types/node": "^20.14.15"
  }
}
```

```json
// apps/api/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "types": ["node"] },
  "include": ["src"]
}
```

```ts
// apps/api/vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', testTimeout: 20000 } });
```

```
# apps/api/.env.example
MONGO_URI=mongodb://localhost:27017/medlink
REDIS_URL=redis://localhost:6379
ACCESS_TOKEN_SECRET=change-me-access
REFRESH_TOKEN_SECRET=change-me-refresh
WEB_ORIGIN=http://localhost:3000
PORT=4000
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/api/src/models/models.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from './User';
import { DoctorProfile } from './DoctorProfile';
import { Prescription } from './Prescription';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key].deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('User model', () => {
  it('requires email and rejects duplicates', async () => {
    await User.create({
      role: 'patient', email: 'a@b.com', phone: '9999999999',
      passwordHash: 'hash', name: 'A',
    });
    await expect(
      User.create({ role: 'patient', email: 'a@b.com', phone: '9999999999', passwordHash: 'hash', name: 'B' })
    ).rejects.toThrow();
  });
});

describe('DoctorProfile model', () => {
  it('defaults verificationStatus to pending', async () => {
    const user = await User.create({
      role: 'doctor', email: 'doc@b.com', phone: '9999999999', passwordHash: 'hash', name: 'Doc',
    });
    const profile = await DoctorProfile.create({
      userId: user._id, specialties: ['Dermatology'], qualifications: ['MBBS'],
      regNo: 'DMC/R/00001', experienceYears: 5, bio: 'bio', clinicName: 'Clinic',
      clinicAddress: 'Addr', city: 'Noida', geo: { lat: 1, lng: 1 },
      consultationFee: 500, languages: ['English'],
    });
    expect(profile.verificationStatus).toBe('pending');
  });
});

describe('Prescription model', () => {
  it('defaults immutable to true', async () => {
    const rx = await Prescription.create({
      appointmentId: new mongoose.Types.ObjectId(),
      doctorId: new mongoose.Types.ObjectId(),
      patientId: new mongoose.Types.ObjectId(),
      diagnosisNote: 'note',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 3 }],
      advice: 'rest',
    });
    expect(rx.immutable).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm install && npm run test --workspace=apps/api -- models.test.ts`
Expected: FAIL — `Cannot find module './User'`

- [ ] **Step 4: Implement the models**

```ts
// apps/api/src/models/User.ts
import { Schema, model, Types } from 'mongoose';

export type UserRole = 'patient' | 'doctor' | 'lab' | 'admin';

export interface IUser {
  _id: Types.ObjectId;
  role: UserRole;
  email: string;
  phone: string;
  passwordHash: string;
  name: string;
  avatarUrl?: string;
  isVerified: boolean;
  createdAt: Date;
}

const userSchema = new Schema<IUser>({
  role: { type: String, enum: ['patient', 'doctor', 'lab', 'admin'], required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  avatarUrl: String,
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export const User = model<IUser>('User', userSchema);
```

```ts
// apps/api/src/models/PatientProfile.ts
import { Schema, model, Types } from 'mongoose';

export interface IPatientProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  city?: string;
}

const patientProfileSchema = new Schema<IPatientProfile>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  age: Number,
  gender: { type: String, enum: ['male', 'female', 'other'] },
  city: String,
});

export const PatientProfile = model<IPatientProfile>('PatientProfile', patientProfileSchema);
```

```ts
// apps/api/src/models/DoctorProfile.ts
import { Schema, model, Types } from 'mongoose';

export interface IDoctorProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  specialties: string[];
  qualifications: string[];
  regNo: string;
  experienceYears: number;
  bio: string;
  clinicName: string;
  clinicAddress: string;
  city: string;
  geo: { lat: number; lng: number };
  consultationFee: number;
  languages: string[];
  verificationStatus: 'pending' | 'approved' | 'rejected';
  verificationDocs: string[];
  avgRating: number;
  ratingCount: number;
}

const doctorProfileSchema = new Schema<IDoctorProfile>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  specialties: { type: [String], required: true },
  qualifications: { type: [String], required: true },
  regNo: { type: String, required: true },
  experienceYears: { type: Number, required: true },
  bio: { type: String, required: true },
  clinicName: { type: String, required: true },
  clinicAddress: { type: String, required: true },
  city: { type: String, required: true },
  geo: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  consultationFee: { type: Number, required: true },
  languages: { type: [String], required: true },
  verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  verificationDocs: { type: [String], default: [] },
  avgRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
});

export const DoctorProfile = model<IDoctorProfile>('DoctorProfile', doctorProfileSchema);
```

```ts
// apps/api/src/models/LabProfile.ts
import { Schema, model, Types } from 'mongoose';

export interface ILabTest {
  code: string;
  name: string;
  price: number;
  turnaroundHours: number;
  description?: string;
}

export interface ILabProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  labName: string;
  address: string;
  city: string;
  geo: { lat: number; lng: number };
  timings: string;
  homeCollection: boolean;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  tests: ILabTest[];
}

const labTestSchema = new Schema<ILabTest>(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    turnaroundHours: { type: Number, required: true },
    description: String,
  },
  { _id: false }
);

const labProfileSchema = new Schema<ILabProfile>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  labName: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  geo: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  timings: { type: String, required: true },
  homeCollection: { type: Boolean, default: false },
  verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  tests: { type: [labTestSchema], default: [] },
});

export const LabProfile = model<ILabProfile>('LabProfile', labProfileSchema);
```

```ts
// apps/api/src/models/AvailabilityRule.ts
import { Schema, model, Types } from 'mongoose';

export interface IAvailabilityRule {
  _id: Types.ObjectId;
  doctorId: Types.ObjectId;
  dayOfWeek: number; // 0-6
  startTime: string; // "18:00"
  endTime: string;
  slotMinutes: number;
  validFrom: Date;
  validTo: Date;
}

const availabilityRuleSchema = new Schema<IAvailabilityRule>({
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },
  dayOfWeek: { type: Number, min: 0, max: 6, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  slotMinutes: { type: Number, required: true },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, required: true },
});

export const AvailabilityRule = model<IAvailabilityRule>('AvailabilityRule', availabilityRuleSchema);
```

```ts
// apps/api/src/models/Appointment.ts
import { Schema, model, Types } from 'mongoose';

export type AppointmentStatus = 'requested' | 'confirmed' | 'rejected' | 'completed' | 'cancelled' | 'no_show';

export interface IAppointment {
  _id: Types.ObjectId;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  slotStart: Date;
  slotEnd: Date;
  status: AppointmentStatus;
  symptomSummary?: string;
  triageSessionId?: Types.ObjectId;
  rejectionReason?: string;
  timeline: { status: AppointmentStatus; at: Date; by: Types.ObjectId }[];
}

const appointmentSchema = new Schema<IAppointment>({
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },
  slotStart: { type: Date, required: true },
  slotEnd: { type: Date, required: true },
  status: {
    type: String,
    enum: ['requested', 'confirmed', 'rejected', 'completed', 'cancelled', 'no_show'],
    default: 'requested',
  },
  symptomSummary: String,
  triageSessionId: { type: Schema.Types.ObjectId, ref: 'TriageSession' },
  rejectionReason: String,
  timeline: {
    type: [
      {
        status: { type: String, required: true },
        at: { type: Date, required: true },
        by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      },
    ],
    default: [],
  },
});

export const Appointment = model<IAppointment>('Appointment', appointmentSchema);
```

```ts
// apps/api/src/models/TriageSession.ts
import { Schema, model, Types } from 'mongoose';

export interface ITriageSession {
  _id: Types.ObjectId;
  patientId: Types.ObjectId;
  messages: { role: 'user' | 'assistant'; text: string; at: Date }[];
  extractedSymptoms: string[];
  suggestedSpecialties: { name: string; confidence: number }[];
  recommendedDoctorIds: Types.ObjectId[];
  disclaimerShownAt?: Date;
}

const triageSessionSchema = new Schema<ITriageSession>({
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  messages: {
    type: [
      {
        role: { type: String, enum: ['user', 'assistant'], required: true },
        text: { type: String, required: true },
        at: { type: Date, required: true },
      },
    ],
    default: [],
  },
  extractedSymptoms: { type: [String], default: [] },
  suggestedSpecialties: {
    type: [{ name: { type: String, required: true }, confidence: { type: Number, required: true } }],
    default: [],
  },
  recommendedDoctorIds: { type: [Schema.Types.ObjectId], ref: 'DoctorProfile', default: [] },
  disclaimerShownAt: Date,
});

export const TriageSession = model<ITriageSession>('TriageSession', triageSessionSchema);
```

```ts
// apps/api/src/models/Prescription.ts
import { Schema, model, Types } from 'mongoose';

export interface IMedicine {
  name: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions?: string;
}

export interface IPrescription {
  _id: Types.ObjectId;
  appointmentId: Types.ObjectId;
  doctorId: Types.ObjectId;
  patientId: Types.ObjectId;
  diagnosisNote: string;
  medicines: IMedicine[];
  advice: string;
  followUpDate?: Date;
  recommendedTests: { testName: string; labReferralId?: Types.ObjectId }[];
  pdfUrl?: string;
  createdAt: Date;
  immutable: boolean;
}

const prescriptionSchema = new Schema<IPrescription>({
  appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  diagnosisNote: { type: String, required: true },
  medicines: {
    type: [
      {
        name: { type: String, required: true },
        dosage: { type: String, required: true },
        frequency: { type: String, required: true },
        durationDays: { type: Number, required: true },
        instructions: String,
      },
    ],
    required: true,
  },
  advice: { type: String, required: true },
  followUpDate: Date,
  recommendedTests: {
    type: [{ testName: { type: String, required: true }, labReferralId: { type: Schema.Types.ObjectId, ref: 'LabReferral' } }],
    default: [],
  },
  pdfUrl: String,
  createdAt: { type: Date, default: Date.now },
  immutable: { type: Boolean, default: true },
});

export const Prescription = model<IPrescription>('Prescription', prescriptionSchema);
```

```ts
// apps/api/src/models/LabReferral.ts
import { Schema, model, Types } from 'mongoose';

export type LabReferralStatus = 'sent' | 'opened' | 'booked' | 'sample_collected' | 'report_ready' | 'closed';

export interface ILabReferral {
  _id: Types.ObjectId;
  prescriptionId: Types.ObjectId;
  doctorId: Types.ObjectId;
  patientId: Types.ObjectId;
  labId: Types.ObjectId;
  suggestedTestCodes: string[];
  token: string;
  status: LabReferralStatus;
  reportUrl?: string;
  timeline: { status: LabReferralStatus; at: Date }[];
}

const labReferralSchema = new Schema<ILabReferral>({
  prescriptionId: { type: Schema.Types.ObjectId, ref: 'Prescription', required: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'DoctorProfile', required: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  labId: { type: Schema.Types.ObjectId, ref: 'LabProfile', required: true },
  suggestedTestCodes: { type: [String], required: true },
  token: { type: String, required: true, unique: true },
  status: {
    type: String,
    enum: ['sent', 'opened', 'booked', 'sample_collected', 'report_ready', 'closed'],
    default: 'sent',
  },
  reportUrl: String,
  timeline: {
    type: [{ status: { type: String, required: true }, at: { type: Date, required: true } }],
    default: [],
  },
});

export const LabReferral = model<ILabReferral>('LabReferral', labReferralSchema);
```

```ts
// apps/api/src/models/LabBooking.ts
import { Schema, model, Types } from 'mongoose';

export interface ILabBooking {
  _id: Types.ObjectId;
  referralId?: Types.ObjectId;
  patientId: Types.ObjectId;
  labId: Types.ObjectId;
  testCodes: string[];
  totalPrice: number;
  scheduledAt: Date;
  homeCollection: boolean;
  status: string;
  reportUrl?: string;
}

const labBookingSchema = new Schema<ILabBooking>({
  referralId: { type: Schema.Types.ObjectId, ref: 'LabReferral' },
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  labId: { type: Schema.Types.ObjectId, ref: 'LabProfile', required: true },
  testCodes: { type: [String], required: true },
  totalPrice: { type: Number, required: true },
  scheduledAt: { type: Date, required: true },
  homeCollection: { type: Boolean, default: false },
  status: { type: String, default: 'booked' },
  reportUrl: String,
});

export const LabBooking = model<ILabBooking>('LabBooking', labBookingSchema);
```

```ts
// apps/api/src/models/AuditLog.ts
import { Schema, model, Types } from 'mongoose';

export interface IAuditLog {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: Types.ObjectId;
  meta?: Record<string, unknown>;
  at: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorRole: { type: String, required: true },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: Schema.Types.ObjectId, required: true },
  meta: { type: Schema.Types.Mixed },
  at: { type: Date, default: Date.now },
});

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
```

```ts
// apps/api/src/models/Notification.ts
import { Schema, model, Types } from 'mongoose';

export interface INotification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: string;
  title: string;
  body: string;
  link?: string;
  readAt?: Date;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  link: String,
  readAt: Date,
  createdAt: { type: Date, default: Date.now },
});

export const Notification = model<INotification>('Notification', notificationSchema);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- models.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/tsconfig.json apps/api/vitest.config.ts apps/api/.env.example apps/api/src/models
git commit -m "feat(api): define Mongoose models for all domain entities"
```

---

### Task 4: Express app skeleton (logger, db, redis, security middleware, error handler) + health check

**Files:**
- Create: `apps/api/src/lib/logger.ts`, `lib/db.ts`, `lib/redis.ts`, `lib/errors.ts`
- Create: `apps/api/src/middleware/errorHandler.ts`
- Create: `apps/api/src/app.ts`, `apps/api/src/server.ts`
- Test: `apps/api/src/app.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createApp()` (Express app factory, no `.listen()`) — every later task imports and extends this; `connectDB(uri)`/`disconnectDB()`; `getRedis()`/`setRedisClient(client)` — later tasks and tests call `setRedisClient(new RedisMock())` before exercising redis-backed code; `AppError` class (`new AppError(statusCode, message, code?)`) — used by every controller for error responses.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/app.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- app.test.ts`
Expected: FAIL — `Cannot find module './app'`

- [ ] **Step 3: Implement lib files**

```ts
// apps/api/src/lib/logger.ts
import pino from 'pino';

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
```

```ts
// apps/api/src/lib/db.ts
import mongoose from 'mongoose';

export async function connectDB(uri: string): Promise<void> {
  await mongoose.connect(uri);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
```

```ts
// apps/api/src/lib/redis.ts
import Redis from 'ioredis';

let client: Redis | undefined;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }
  return client;
}

export function setRedisClient(custom: Redis): void {
  client = custom;
}
```

```ts
// apps/api/src/lib/errors.ts
export class AppError extends Error {
  statusCode: number;
  code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
```

```ts
// apps/api/src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: { message: 'Validation failed', code: 'VALIDATION_ERROR', issues: err.issues } });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { message: err.message, code: err.code } });
    return;
  }
  logger.error(err, 'unhandled error');
  res.status(500).json({ error: { message: 'Internal server error' } });
}
```

- [ ] **Step 4: Implement `app.ts` and `server.ts`**

```ts
// apps/api/src/app.ts
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use(errorHandler);
  return app;
}
```

```ts
// apps/api/src/server.ts
import 'dotenv/config';
import { createApp } from './app';
import { connectDB } from './lib/db';
import { logger } from './lib/logger';

const PORT = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  await connectDB(process.env.MONGO_URI ?? 'mongodb://localhost:27017/medlink');
  const app = createApp();
  app.listen(PORT, () => logger.info(`api listening on ${PORT}`));
}

main().catch((err) => {
  logger.error(err, 'failed to start server');
  process.exit(1);
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- app.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib apps/api/src/middleware/errorHandler.ts apps/api/src/app.ts apps/api/src/server.ts apps/api/src/app.test.ts
git commit -m "feat(api): express app skeleton with logging, security middleware, error handler"
```

---

### Task 5: Auth — register + login

**Files:**
- Create: `apps/api/src/modules/auth/jwt.ts`, `auth.service.ts`, `auth.controller.ts`, `auth.routes.ts`
- Create: `apps/api/src/middleware/validate.ts`
- Modify: `apps/api/src/app.ts` (mount `/api/auth`)
- Test: `apps/api/src/modules/auth/auth.test.ts`

**Interfaces:**
- Consumes: `RegisterInput`, `LoginInput` from `@medlink/shared` (Task 2); `User` model (Task 3); `createApp()`, `AppError` (Task 4).
- Produces: `signAccessToken(userId, role)`, `signRefreshToken(userId)`, `verifyAccessToken(token)`, `verifyRefreshToken(token)` (Task 6 extends these); `POST /api/auth/register`, `POST /api/auth/login` setting `accessToken`/`refreshToken` httpOnly cookies; `validate(schema, 'body'|'query'|'params')` middleware factory reused by every later routes file.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/auth/auth.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import { createApp } from '../../app';
import { setRedisClient } from '../../lib/redis';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  setRedisClient(new RedisMock());
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key].deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('POST /api/auth/register', () => {
  it('creates a user and does not return the password', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/register').send({
      email: 'patient@medlink.demo', password: 'longenough1', name: 'Rahul', phone: '9999999999', role: 'patient',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('patient@medlink.demo');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects duplicate email with 409', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({
      email: 'dup@medlink.demo', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    const res = await request(app).post('/api/auth/register').send({
      email: 'dup@medlink.demo', password: 'longenough1', name: 'B', phone: '9999999999', role: 'patient',
    });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('sets accessToken and refreshToken cookies on success', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({
      email: 'login@medlink.demo', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'login@medlink.demo', password: 'longenough1' });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('accessToken='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('refreshToken='))).toBe(true);
  });

  it('rejects wrong password with 401', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({
      email: 'wrongpw@medlink.demo', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'wrongpw@medlink.demo', password: 'incorrect1' });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- auth.test.ts`
Expected: FAIL — 404s (no `/api/auth` routes mounted yet)

- [ ] **Step 3: Implement `validate` middleware**

```ts
// apps/api/src/middleware/validate.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (err) {
      next(err);
    }
  };
}
```

- [ ] **Step 4: Implement JWT utilities**

```ts
// apps/api/src/modules/auth/jwt.ts
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';

export interface AccessPayload {
  sub: string;
  role: string;
  jti: string;
}

export interface RefreshPayload {
  sub: string;
  jti: string;
}

function accessSecret(): string {
  return process.env.ACCESS_TOKEN_SECRET ?? 'dev-access-secret';
}

function refreshSecret(): string {
  return process.env.REFRESH_TOKEN_SECRET ?? 'dev-refresh-secret';
}

export function signAccessToken(userId: string, role: string): { token: string; jti: string } {
  const jti = nanoid();
  const token = jwt.sign({ sub: userId, role, jti }, accessSecret(), { expiresIn: '15m' });
  return { token, jti };
}

export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = nanoid();
  const token = jwt.sign({ sub: userId, jti }, refreshSecret(), { expiresIn: '7d' });
  return { token, jti };
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, accessSecret()) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, refreshSecret()) as RefreshPayload;
}
```

- [ ] **Step 5: Implement auth service, controller, routes**

```ts
// apps/api/src/modules/auth/auth.service.ts
import bcrypt from 'bcryptjs';
import { RegisterInput, LoginInput } from '@medlink/shared';
import { User } from '../../models/User';
import { AppError } from '../../lib/errors';
import { signAccessToken, signRefreshToken } from './jwt';
import { getRedis } from '../../lib/redis';

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

function refreshKey(userId: string, jti: string): string {
  return `refresh:${userId}:${jti}`;
}

export async function register(input: RegisterInput) {
  const existing = await User.findOne({ email: input.email });
  if (existing) throw new AppError(409, 'Email already registered', 'EMAIL_TAKEN');

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await User.create({
    email: input.email,
    passwordHash,
    name: input.name,
    phone: input.phone,
    role: input.role,
  });
  return user;
}

export async function login(input: LoginInput) {
  const user = await User.findOne({ email: input.email });
  if (!user) throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');

  const access = signAccessToken(user._id.toString(), user.role);
  const refresh = signRefreshToken(user._id.toString());
  await getRedis().set(refreshKey(user._id.toString(), refresh.jti), '1', 'EX', REFRESH_TTL_SECONDS);

  return { user, accessToken: access.token, refreshToken: refresh.token };
}
```

```ts
// apps/api/src/modules/auth/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { register, login } from './auth.service';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function registerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await register(req.body);
    res.status(201).json({ user: { id: user._id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user, accessToken, refreshToken } = await login(req.body);
    res.cookie('accessToken', accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(200).json({ user: { id: user._id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/auth/auth.routes.ts
import { Router } from 'express';
import { RegisterInput, LoginInput } from '@medlink/shared';
import { validate } from '../../middleware/validate';
import { registerHandler, loginHandler } from './auth.controller';

export const authRouter = Router();

authRouter.post('/register', validate(RegisterInput), registerHandler);
authRouter.post('/login', validate(LoginInput), loginHandler);
```

- [ ] **Step 6: Mount the router**

```ts
// apps/api/src/app.ts  (modify)
import { authRouter } from './modules/auth/auth.routes';
// ...inside createApp(), after app.get('/health', ...):
app.use('/api/auth', authRouter);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- auth.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/middleware/validate.ts apps/api/src/modules/auth apps/api/src/app.ts
git commit -m "feat(api): auth register/login with JWT httpOnly cookies"
```

---

### Task 6: Auth — refresh, logout, Redis blacklist, rate limiting

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`, `auth.controller.ts`, `auth.routes.ts`
- Create: `apps/api/src/middleware/rateLimit.ts`
- Test: modify `apps/api/src/modules/auth/auth.test.ts`

**Interfaces:**
- Consumes: `verifyRefreshToken`, `verifyAccessToken`, `getRedis()` (Task 5/4).
- Produces: `POST /api/auth/refresh`, `POST /api/auth/logout`; `authLimiter` middleware (redis-backed) mounted on `/api/auth/*`, reused nowhere else in this phase but the pattern is reused in later phases for other rate-sensitive routes.

- [ ] **Step 1: Write the failing tests (append to `auth.test.ts`)**

```ts
// apps/api/src/modules/auth/auth.test.ts (append)
describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and rejects reuse of the old one', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({
      email: 'refresh@medlink.demo', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'refresh@medlink.demo', password: 'longenough1' });
    const cookies = loginRes.headers['set-cookie'] as unknown as string[];

    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(refreshRes.status).toBe(200);
    const newCookies = refreshRes.headers['set-cookie'] as unknown as string[];
    expect(newCookies.some((c) => c.startsWith('refreshToken='))).toBe(true);

    // reusing the original (now-rotated-out) refresh cookie must fail
    const reuseRes = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(reuseRes.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('blacklists the access token so it can no longer authenticate', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({
      email: 'logout@medlink.demo', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'logout@medlink.demo', password: 'longenough1' });
    const cookies = loginRes.headers['set-cookie'] as unknown as string[];

    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', cookies);
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(refreshAfterLogout.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- auth.test.ts`
Expected: FAIL — 404 on `/api/auth/refresh` and `/api/auth/logout`

- [ ] **Step 3: Extend the auth service**

```ts
// apps/api/src/modules/auth/auth.service.ts (add)
import { verifyRefreshToken, verifyAccessToken } from './jwt';
import jwtLib from 'jsonwebtoken';

function blacklistKey(jti: string): string {
  return `blacklist:${jti}`;
}

export async function refresh(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const redis = getRedis();
  const key = refreshKey(payload.sub, payload.jti);
  const exists = await redis.get(key);
  if (!exists) throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  await redis.del(key);

  const user = await User.findById(payload.sub);
  if (!user) throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');

  const access = signAccessToken(user._id.toString(), user.role);
  const newRefresh = signRefreshToken(user._id.toString());
  await redis.set(refreshKey(user._id.toString(), newRefresh.jti), '1', 'EX', REFRESH_TTL_SECONDS);

  return { accessToken: access.token, refreshToken: newRefresh.token };
}

export async function logout(accessToken: string | undefined, refreshToken: string | undefined) {
  const redis = getRedis();

  if (accessToken) {
    try {
      const payload = verifyAccessToken(accessToken);
      const decoded = jwtLib.decode(accessToken) as { exp?: number };
      const ttl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 900;
      if (ttl > 0) await redis.set(blacklistKey(payload.jti), '1', 'EX', ttl);
    } catch {
      // token already invalid/expired — nothing to blacklist
    }
  }

  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await redis.del(refreshKey(payload.sub, payload.jti));
    } catch {
      // already invalid — nothing to revoke
    }
  }
}

export async function isAccessTokenBlacklisted(jti: string): Promise<boolean> {
  const value = await getRedis().get(blacklistKey(jti));
  return value !== null;
}
```

- [ ] **Step 4: Extend the controller and routes**

```ts
// apps/api/src/modules/auth/auth.controller.ts (add)
import { refresh, logout } from './auth.service';

export async function refreshHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies.refreshToken as string | undefined;
    if (!token) throw new (require('../../lib/errors').AppError)(401, 'No refresh token', 'NO_REFRESH_TOKEN');
    const { accessToken, refreshToken } = await refresh(token);
    res.cookie('accessToken', accessToken, { ...COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await logout(req.cookies.accessToken, req.cookies.refreshToken);
    res.clearCookie('accessToken', COOKIE_OPTS);
    res.clearCookie('refreshToken', COOKIE_OPTS);
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}
```

Note: the `require(...)` inline import above is a placeholder for readability in this plan — in the actual file, add `import { AppError } from '../../lib/errors';` to the top imports instead of using `require`.

```ts
// apps/api/src/modules/auth/auth.routes.ts (modify)
import { registerHandler, loginHandler, refreshHandler, logoutHandler } from './auth.controller';

authRouter.post('/refresh', refreshHandler);
authRouter.post('/logout', logoutHandler);
```

- [ ] **Step 5: Add Redis-backed rate limiting**

```ts
// apps/api/src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis } from '../lib/redis';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => getRedis().call(...args) as Promise<unknown> as never,
  }),
});
```

```ts
// apps/api/src/modules/auth/auth.routes.ts (modify)
import { authLimiter } from '../../middleware/rateLimit';

export const authRouter = Router();
authRouter.use(authLimiter);
// ...existing routes below
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- auth.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/auth apps/api/src/middleware/rateLimit.ts
git commit -m "feat(api): refresh rotation, logout blacklist, redis-backed auth rate limiting"
```

---

### Task 7: RBAC middleware (`requireAuth`, `requireRole`)

**Files:**
- Create: `apps/api/src/middleware/auth.ts`
- Test: `apps/api/src/middleware/auth.test.ts`

**Interfaces:**
- Consumes: `verifyAccessToken` (Task 5), `isAccessTokenBlacklisted` (Task 6).
- Produces: `requireAuth` (sets `req.user = { id, role }`), `requireRole(...roles)` — both imported by Tasks 9–12's route files.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/middleware/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import RedisMock from 'ioredis-mock';
import { setRedisClient } from '../lib/redis';
import { signAccessToken } from '../modules/auth/jwt';
import { requireAuth, requireRole } from './auth';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

beforeEach(() => {
  setRedisClient(new RedisMock());
});

function mockReqRes(cookies: Record<string, string>) {
  const req = { cookies } as unknown as Request & { user?: { id: string; role: string } };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  const next = vi.fn();
  return { req, res, next };
}

describe('requireAuth', () => {
  it('attaches req.user for a valid token', async () => {
    const { token } = signAccessToken('user-1', 'patient');
    const { req, res, next } = mockReqRes({ accessToken: token });
    await requireAuth(req, res, next);
    expect(req.user).toEqual({ id: 'user-1', role: 'patient' });
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next with an error when no cookie is present', async () => {
    const { req, res, next } = mockReqRes({});
    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});

describe('requireRole', () => {
  it('allows a matching role through', () => {
    const { req, res, next } = mockReqRes({});
    (req as any).user = { id: 'user-1', role: 'doctor' };
    requireRole('doctor')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a non-matching role with 403', () => {
    const { req, res, next } = mockReqRes({});
    (req as any).user = { id: 'user-1', role: 'patient' };
    requireRole('doctor')(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- middleware/auth.test.ts`
Expected: FAIL — `Cannot find module './auth'`

- [ ] **Step 3: Implement the middleware**

```ts
// apps/api/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../modules/auth/jwt';
import { isAccessTokenBlacklisted } from '../modules/auth/auth.service';
import { AppError } from '../lib/errors';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; role: string };
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.accessToken as string | undefined;
  if (!token) {
    next(new AppError(401, 'Not authenticated', 'NOT_AUTHENTICATED'));
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    if (await isAccessTokenBlacklisted(payload.jti)) {
      next(new AppError(401, 'Token revoked', 'TOKEN_REVOKED'));
      return;
    }
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token', 'INVALID_TOKEN'));
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError(403, 'Forbidden', 'FORBIDDEN'));
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- middleware/auth.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/middleware/auth.test.ts
git commit -m "feat(api): requireAuth/requireRole RBAC middleware"
```

---

### Task 8: AuditLog service wired into register

**Files:**
- Create: `apps/api/src/modules/audit/audit.service.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts` (call `logAudit` after user creation)
- Test: `apps/api/src/modules/audit/audit.test.ts`, modify `auth.test.ts`

**Interfaces:**
- Consumes: `AuditLog` model (Task 3).
- Produces: `logAudit({ actorId, actorRole, action, entityType, entityId, meta? })` — reused by Task 12 (verification decisions) and every later phase's audited actions.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/audit/audit.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { logAudit } from './audit.service';
import { AuditLog } from '../../models/AuditLog';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterEach(async () => {
  await AuditLog.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('logAudit', () => {
  it('persists an audit entry with a timestamp', async () => {
    const actorId = new mongoose.Types.ObjectId();
    const entityId = new mongoose.Types.ObjectId();
    await logAudit({ actorId: actorId.toString(), actorRole: 'patient', action: 'user.register', entityType: 'User', entityId: entityId.toString() });

    const entries = await AuditLog.find({});
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('user.register');
    expect(entries[0].at).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- audit.test.ts`
Expected: FAIL — `Cannot find module './audit.service'`

- [ ] **Step 3: Implement the service**

```ts
// apps/api/src/modules/audit/audit.service.ts
import { Types } from 'mongoose';
import { AuditLog } from '../../models/AuditLog';

export async function logAudit(params: {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await AuditLog.create({
    actorId: new Types.ObjectId(params.actorId),
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: new Types.ObjectId(params.entityId),
    meta: params.meta,
  });
}
```

- [ ] **Step 4: Wire into registration**

```ts
// apps/api/src/modules/auth/auth.service.ts (modify register())
import { logAudit } from '../audit/audit.service';

export async function register(input: RegisterInput) {
  const existing = await User.findOne({ email: input.email });
  if (existing) throw new AppError(409, 'Email already registered', 'EMAIL_TAKEN');

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await User.create({
    email: input.email,
    passwordHash,
    name: input.name,
    phone: input.phone,
    role: input.role,
  });

  await logAudit({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: 'user.register',
    entityType: 'User',
    entityId: user._id.toString(),
  });

  return user;
}
```

- [ ] **Step 5: Extend `auth.test.ts` to assert the audit trail**

```ts
// apps/api/src/modules/auth/auth.test.ts (append)
import { AuditLog } from '../../models/AuditLog';

describe('register auditing', () => {
  it('writes a user.register audit log entry', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({
      email: 'audited@medlink.demo', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    const entries = await AuditLog.find({ action: 'user.register' });
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test --workspace=apps/api -- audit.test.ts auth.test.ts`
Expected: PASS (all tests, including the new audit assertion)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/audit apps/api/src/modules/auth
git commit -m "feat(api): audit log service, wired into registration"
```

---

### Task 9: Patient profile CRUD

**Files:**
- Create: `apps/api/src/modules/patients/patients.controller.ts`, `patients.routes.ts`
- Modify: `apps/api/src/app.ts` (mount `/api/patients`)
- Test: `apps/api/src/modules/patients/patients.test.ts`

**Interfaces:**
- Consumes: `PatientProfileInput` (Task 2), `PatientProfile` model (Task 3), `requireAuth`/`requireRole` (Task 7).
- Produces: `GET /api/patients/me`, `PUT /api/patients/me` (upsert) — pattern reused identically in Tasks 10–11 for doctor/lab.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/patients/patients.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import { createApp } from '../../app';
import { setRedisClient } from '../../lib/redis';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  setRedisClient(new RedisMock());
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key].deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function registerAndLogin(app: any, role: string, email: string) {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

describe('PUT /api/patients/me', () => {
  it('upserts the patient profile for the authenticated patient', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'p1@medlink.demo');

    const res = await request(app).put('/api/patients/me').set('Cookie', cookies).send({ age: 30, gender: 'male', city: 'Noida' });
    expect(res.status).toBe(200);
    expect(res.body.profile.city).toBe('Noida');
  });

  it('rejects a doctor role with 403', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'd1@medlink.demo');
    const res = await request(app).put('/api/patients/me').set('Cookie', cookies).send({ city: 'Delhi' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/patients/me', () => {
  it('returns the current patient profile', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'p2@medlink.demo');
    await request(app).put('/api/patients/me').set('Cookie', cookies).send({ city: 'Ghaziabad' });

    const res = await request(app).get('/api/patients/me').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.profile.city).toBe('Ghaziabad');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- patients.test.ts`
Expected: FAIL — 404 (no routes mounted)

- [ ] **Step 3: Implement controller and routes**

```ts
// apps/api/src/modules/patients/patients.controller.ts
import { Request, Response, NextFunction } from 'express';
import { PatientProfile } from '../../models/PatientProfile';

export async function getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await PatientProfile.findOne({ userId: req.user!.id });
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function upsertMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await PatientProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/patients/patients.routes.ts
import { Router } from 'express';
import { PatientProfileInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getMyProfile, upsertMyProfile } from './patients.controller';

export const patientsRouter = Router();

patientsRouter.use(requireAuth, requireRole('patient'));
patientsRouter.get('/me', getMyProfile);
patientsRouter.put('/me', validate(PatientProfileInput), upsertMyProfile);
```

- [ ] **Step 4: Mount the router**

```ts
// apps/api/src/app.ts (modify)
import { patientsRouter } from './modules/patients/patients.routes';
// ...
app.use('/api/patients', patientsRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- patients.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/patients apps/api/src/app.ts
git commit -m "feat(api): patient profile CRUD"
```

---

### Task 10: Doctor profile CRUD + verification doc upload

**Files:**
- Create: `apps/api/src/modules/doctors/upload.ts`, `doctors.controller.ts`, `doctors.routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/modules/doctors/doctors.test.ts`

**Interfaces:**
- Consumes: `DoctorProfileInput` (Task 2), `DoctorProfile` model (Task 3), `requireAuth`/`requireRole` (Task 7).
- Produces: `GET /api/doctors/me`, `PUT /api/doctors/me`, `POST /api/doctors/me/verification-docs` (multipart, field `docs`) appending file paths to `verificationDocs`; `GET /api/doctors/public/:id` (used by Task 14's SSR page).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/doctors/doctors.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import path from 'node:path';
import { createApp } from '../../app';
import { setRedisClient } from '../../lib/redis';
import { DoctorProfile } from '../../models/DoctorProfile';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  setRedisClient(new RedisMock());
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key].deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function registerAndLogin(app: any, role: string, email: string) {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'Dr A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

const validProfile = {
  specialties: ['Dermatology'], qualifications: ['MBBS', 'MD'], regNo: 'DMC/R/00099',
  experienceYears: 9, bio: 'Experienced dermatologist.', clinicName: 'Skin Clinic',
  clinicAddress: '123 Main Rd', city: 'Noida', geo: { lat: 28.5, lng: 77.3 },
  consultationFee: 600, languages: ['English', 'Hindi'],
};

describe('PUT /api/doctors/me', () => {
  it('upserts the doctor profile, defaulting verificationStatus to pending', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc1@medlink.demo');
    const res = await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);
    expect(res.status).toBe(200);
    expect(res.body.profile.verificationStatus).toBe('pending');
  });
});

describe('GET /api/doctors/public/:id', () => {
  it('returns 404 for a profile that is not approved', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc2@medlink.demo');
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);
    const res = await request(app).get(`/api/doctors/public/${putRes.body.profile._id}`);
    expect(res.status).toBe(404);
  });

  it('returns the profile once approved', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc3@medlink.demo');
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);
    await DoctorProfile.findByIdAndUpdate(putRes.body.profile._id, { verificationStatus: 'approved' });

    const res = await request(app).get(`/api/doctors/public/${putRes.body.profile._id}`);
    expect(res.status).toBe(200);
    expect(res.body.profile.clinicName).toBe('Skin Clinic');
  });
});

describe('POST /api/doctors/me/verification-docs', () => {
  it('appends an uploaded file path to verificationDocs', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc4@medlink.demo');
    await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);

    const res = await request(app)
      .post('/api/doctors/me/verification-docs')
      .set('Cookie', cookies)
      .attach('docs', Buffer.from('%PDF-1.4 fake'), 'reg-cert.pdf');

    expect(res.status).toBe(200);
    expect(res.body.profile.verificationDocs.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- doctors.test.ts`
Expected: FAIL — 404s

- [ ] **Step 3: Implement multer upload config**

```ts
// apps/api/src/modules/doctors/upload.ts
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'verification-docs');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export const verificationDocsUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      cb(new Error('Unsupported file type'));
      return;
    }
    cb(null, true);
  },
});
```

- [ ] **Step 4: Implement controller and routes**

```ts
// apps/api/src/modules/doctors/doctors.controller.ts
import { Request, Response, NextFunction } from 'express';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';

export async function getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await DoctorProfile.findOne({ userId: req.user!.id });
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function upsertMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await DoctorProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $set: req.body, $setOnInsert: { verificationStatus: 'pending' } },
      { new: true, upsert: true }
    );
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function uploadVerificationDocs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[]) ?? [];
    const paths = files.map((f) => `/uploads/verification-docs/${f.filename}`);
    const profile = await DoctorProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $push: { verificationDocs: { $each: paths } } },
      { new: true }
    );
    if (!profile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function getPublicProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await DoctorProfile.findOne({ _id: req.params.id, verificationStatus: 'approved' });
    if (!profile) throw new AppError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/doctors/doctors.routes.ts
import { Router } from 'express';
import { DoctorProfileInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { verificationDocsUpload } from './upload';
import { getMyProfile, upsertMyProfile, uploadVerificationDocs, getPublicProfile } from './doctors.controller';

export const doctorsRouter = Router();

doctorsRouter.get('/public/:id', getPublicProfile);

doctorsRouter.use(requireAuth, requireRole('doctor'));
doctorsRouter.get('/me', getMyProfile);
doctorsRouter.put('/me', validate(DoctorProfileInput), upsertMyProfile);
doctorsRouter.post('/me/verification-docs', verificationDocsUpload.array('docs', 5), uploadVerificationDocs);
```

- [ ] **Step 5: Mount the router and serve uploads statically**

```ts
// apps/api/src/app.ts (modify)
import path from 'node:path';
import { doctorsRouter } from './modules/doctors/doctors.routes';
// ...
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/api/doctors', doctorsRouter);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- doctors.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/doctors apps/api/src/app.ts
git commit -m "feat(api): doctor profile CRUD, verification doc upload, public profile route"
```

---

### Task 11: Lab profile CRUD + test catalog CRUD

**Files:**
- Create: `apps/api/src/modules/labs/labs.controller.ts`, `labs.routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/modules/labs/labs.test.ts`

**Interfaces:**
- Consumes: `LabProfileInput`, `LabTestInput` (Task 2), `LabProfile` model (Task 3), `requireAuth`/`requireRole` (Task 7).
- Produces: `GET /api/labs/me`, `PUT /api/labs/me`, `POST /api/labs/me/tests` (add), `PATCH /api/labs/me/tests/:code` (edit price/fields), `DELETE /api/labs/me/tests/:code` (remove); `GET /api/labs/public/:id` (Task 14).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/labs/labs.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import { createApp } from '../../app';
import { setRedisClient } from '../../lib/redis';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  setRedisClient(new RedisMock());
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key].deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function registerAndLogin(app: any, role: string, email: string) {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'Lab A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

const validLab = {
  labName: 'HealthFirst Diagnostics', address: '1 Diag Rd', city: 'Noida',
  geo: { lat: 28.5, lng: 77.3 }, timings: '07:00-21:00', homeCollection: true,
};

describe('lab profile + test catalog CRUD', () => {
  it('upserts the lab profile', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'lab', 'lab1@medlink.demo');
    const res = await request(app).put('/api/labs/me').set('Cookie', cookies).send(validLab);
    expect(res.status).toBe(200);
    expect(res.body.profile.labName).toBe('HealthFirst Diagnostics');
  });

  it('adds, edits, and removes a test from the catalog', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'lab', 'lab2@medlink.demo');
    await request(app).put('/api/labs/me').set('Cookie', cookies).send(validLab);

    const addRes = await request(app).post('/api/labs/me/tests').set('Cookie', cookies).send({
      code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6,
    });
    expect(addRes.status).toBe(200);
    expect(addRes.body.profile.tests).toHaveLength(1);

    const editRes = await request(app).patch('/api/labs/me/tests/CBC').set('Cookie', cookies).send({ price: 275 });
    expect(editRes.status).toBe(200);
    expect(editRes.body.profile.tests[0].price).toBe(275);

    const deleteRes = await request(app).delete('/api/labs/me/tests/CBC').set('Cookie', cookies);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.profile.tests).toHaveLength(0);
  });
});

describe('GET /api/labs/public/:id', () => {
  it('hides an unapproved lab', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'lab', 'lab3@medlink.demo');
    const putRes = await request(app).put('/api/labs/me').set('Cookie', cookies).send(validLab);
    const res = await request(app).get(`/api/labs/public/${putRes.body.profile._id}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- labs.test.ts`
Expected: FAIL — 404s

- [ ] **Step 3: Implement controller and routes**

```ts
// apps/api/src/modules/labs/labs.controller.ts
import { Request, Response, NextFunction } from 'express';
import { LabProfile } from '../../models/LabProfile';
import { AppError } from '../../lib/errors';

export async function getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await LabProfile.findOne({ userId: req.user!.id });
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function upsertMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await LabProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $set: req.body, $setOnInsert: { verificationStatus: 'pending' } },
      { new: true, upsert: true }
    );
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function addTest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await LabProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $push: { tests: req.body } },
      { new: true }
    );
    if (!profile) throw new AppError(404, 'Lab profile not found', 'PROFILE_NOT_FOUND');
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function editTest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const setFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(req.body)) {
      setFields[`tests.$.${key}`] = value;
    }
    const profile = await LabProfile.findOneAndUpdate(
      { userId: req.user!.id, 'tests.code': req.params.code },
      { $set: setFields },
      { new: true }
    );
    if (!profile) throw new AppError(404, 'Test not found', 'TEST_NOT_FOUND');
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function removeTest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await LabProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $pull: { tests: { code: req.params.code } } },
      { new: true }
    );
    if (!profile) throw new AppError(404, 'Lab profile not found', 'PROFILE_NOT_FOUND');
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}

export async function getPublicProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await LabProfile.findOne({ _id: req.params.id, verificationStatus: 'approved' });
    if (!profile) throw new AppError(404, 'Lab not found', 'LAB_NOT_FOUND');
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/labs/labs.routes.ts
import { Router } from 'express';
import { LabProfileInput, LabTestInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getMyProfile, upsertMyProfile, addTest, editTest, removeTest, getPublicProfile } from './labs.controller';

export const labsRouter = Router();

labsRouter.get('/public/:id', getPublicProfile);

labsRouter.use(requireAuth, requireRole('lab'));
labsRouter.get('/me', getMyProfile);
labsRouter.put('/me', validate(LabProfileInput), upsertMyProfile);
labsRouter.post('/me/tests', validate(LabTestInput), addTest);
labsRouter.patch('/me/tests/:code', editTest);
labsRouter.delete('/me/tests/:code', removeTest);
```

- [ ] **Step 4: Mount the router**

```ts
// apps/api/src/app.ts (modify)
import { labsRouter } from './modules/labs/labs.routes';
// ...
app.use('/api/labs', labsRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- labs.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/labs apps/api/src/app.ts
git commit -m "feat(api): lab profile CRUD and test catalog CRUD"
```

---

### Task 12: Admin verification endpoints

**Files:**
- Create: `apps/api/src/modules/admin/admin.controller.ts`, `admin.routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/modules/admin/admin.test.ts`

**Interfaces:**
- Consumes: `VerificationDecisionInput` (Task 2), `DoctorProfile`/`LabProfile` models (Task 3), `requireAuth`/`requireRole` (Task 7), `logAudit` (Task 8).
- Produces: `GET /api/admin/verifications?role=doctor|lab&status=pending&page=&limit=`, `POST /api/admin/verifications/:role/:id/decision`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/modules/admin/admin.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import { createApp } from '../../app';
import { setRedisClient } from '../../lib/redis';
import { AuditLog } from '../../models/AuditLog';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  setRedisClient(new RedisMock());
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key].deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function registerAndLogin(app: any, role: string, email: string) {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

const validDoctor = {
  specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00001',
  experienceYears: 5, bio: 'bio', clinicName: 'Clinic', clinicAddress: 'Addr',
  city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'],
};

describe('GET /api/admin/verifications', () => {
  it('lists pending doctors only for an admin', async () => {
    const app = createApp();
    const docCookies = await registerAndLogin(app, 'doctor', 'pendingdoc@medlink.demo');
    await request(app).put('/api/doctors/me').set('Cookie', docCookies).send(validDoctor);
    const adminCookies = await registerAndLogin(app, 'admin', 'admin@medlink.demo');

    const res = await request(app).get('/api/admin/verifications?role=doctor&status=pending').set('Cookie', adminCookies);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.page).toBe(1);
  });

  it('rejects a non-admin with 403', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'notadmin@medlink.demo');
    const res = await request(app).get('/api/admin/verifications?role=doctor&status=pending').set('Cookie', cookies);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/verifications/:role/:id/decision', () => {
  it('approves a doctor and writes an audit log entry', async () => {
    const app = createApp();
    const docCookies = await registerAndLogin(app, 'doctor', 'approveme@medlink.demo');
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', docCookies).send(validDoctor);
    const adminCookies = await registerAndLogin(app, 'admin', 'admin2@medlink.demo');

    const res = await request(app)
      .post(`/api/admin/verifications/doctor/${putRes.body.profile._id}/decision`)
      .set('Cookie', adminCookies)
      .send({ decision: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.profile.verificationStatus).toBe('approved');

    const entries = await AuditLog.find({ action: 'verification.approved' });
    expect(entries).toHaveLength(1);
  });

  it('requires a reason when rejecting', async () => {
    const app = createApp();
    const docCookies = await registerAndLogin(app, 'doctor', 'rejectme@medlink.demo');
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', docCookies).send(validDoctor);
    const adminCookies = await registerAndLogin(app, 'admin', 'admin3@medlink.demo');

    const res = await request(app)
      .post(`/api/admin/verifications/doctor/${putRes.body.profile._id}/decision`)
      .set('Cookie', adminCookies)
      .send({ decision: 'rejected' });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- admin.test.ts`
Expected: FAIL — 404s

- [ ] **Step 3: Implement controller and routes**

```ts
// apps/api/src/modules/admin/admin.controller.ts
import { Request, Response, NextFunction } from 'express';
import { DoctorProfile } from '../../models/DoctorProfile';
import { LabProfile } from '../../models/LabProfile';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';

function modelForRole(role: string) {
  if (role === 'doctor') return DoctorProfile;
  if (role === 'lab') return LabProfile;
  throw new AppError(400, 'role must be doctor or lab', 'INVALID_ROLE');
}

export async function listVerifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = String(req.query.role ?? 'doctor');
    const status = String(req.query.status ?? 'pending');
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const Model = modelForRole(role);

    const [items, total] = await Promise.all([
      Model.find({ verificationStatus: status })
        .sort({ _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Model.countDocuments({ verificationStatus: status }),
    ]);

    res.status(200).json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
}

export async function decideVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role, id } = req.params;
    const { decision, reason } = req.body as { decision: 'approved' | 'rejected'; reason?: string };
    const Model = modelForRole(role);

    const profile = await Model.findByIdAndUpdate(id, { verificationStatus: decision }, { new: true });
    if (!profile) throw new AppError(404, 'Profile not found', 'PROFILE_NOT_FOUND');

    await logAudit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: `verification.${decision}`,
      entityType: role === 'doctor' ? 'DoctorProfile' : 'LabProfile',
      entityId: id,
      meta: reason ? { reason } : undefined,
    });

    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
}
```

```ts
// apps/api/src/modules/admin/admin.routes.ts
import { Router } from 'express';
import { VerificationDecisionInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { listVerifications, decideVerification } from './admin.controller';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));
adminRouter.get('/verifications', listVerifications);
adminRouter.post('/verifications/:role/:id/decision', validate(VerificationDecisionInput), decideVerification);
```

- [ ] **Step 4: Mount the router**

```ts
// apps/api/src/app.ts (modify)
import { adminRouter } from './modules/admin/admin.routes';
// ...
app.use('/api/admin', adminRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- admin.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full API test suite**

Run: `npm run test --workspace=apps/api`
Expected: PASS (all tests across all modules — this is the point where Phase 1's backend is feature-complete)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/admin apps/api/src/app.ts
git commit -m "feat(api): admin verification list + approve/reject with audit trail"
```

---

### Task 13: Next.js scaffold + Redux/RTK Query + register/login pages

**Files:**
- Create: `apps/web/` (generated), `apps/web/src/store/store.ts`, `api.ts`, `StoreProvider.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/(auth)/register/page.tsx`, `apps/web/src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: the API's `/api/auth/register` and `/api/auth/login` endpoints (Tasks 5–6).
- Produces: `baseApi` (RTK Query, `credentials: 'include'`) that Task 14 and every later phase's frontend work injects endpoints into via `baseApi.injectEndpoints`.

> **Scope note:** CLAUDE.md's own testing standards (§3) only require Vitest coverage for API services and pytest for the triage engine — frontend automated tests aren't part of Phase 1's bar. This task's "test" step is a production build plus a manual browser smoke check, not a unit test.

- [ ] **Step 1: Generate the Next.js app**

Run (from repo root):
```bash
npx --yes create-next-app@latest apps/web --typescript --tailwind --app --eslint --src-dir --import-alias "@/*" --use-npm --no-turbopack
```
Expected: `apps/web` populated with a working Next.js 14 App Router project.

- [ ] **Step 2: Add shadcn/ui**

```bash
cd apps/web && npx --yes shadcn@latest init -d && npx --yes shadcn@latest add button input card -y && cd ../..
```
Expected: `apps/web/components/ui/{button,input,card}.tsx` created, `apps/web/components.json` present.

- [ ] **Step 3: Add Redux Toolkit + RTK Query**

```bash
npm install --workspace=apps/web @reduxjs/toolkit react-redux
```

```ts
// apps/web/src/store/api.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api',
    credentials: 'include',
  }),
  tagTypes: ['PatientProfile', 'DoctorProfile', 'LabProfile', 'Verification'],
  endpoints: () => ({}),
});
```

```ts
// apps/web/src/store/store.ts
import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from './api';

export const store = configureStore({
  reducer: { [baseApi.reducerPath]: baseApi.reducer },
  middleware: (getDefault) => getDefault().concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

```tsx
// apps/web/src/store/StoreProvider.tsx
'use client';

import { Provider } from 'react-redux';
import { store } from './store';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
```

```tsx
// apps/web/src/app/layout.tsx (modify — wrap existing body children)
import { StoreProvider } from '@/store/StoreProvider';
// ...
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Add an auth API slice and register/login pages**

```ts
// apps/web/src/store/authApi.ts
import { baseApi } from './api';

interface RegisterRequest {
  email: string; password: string; name: string; phone: string;
  role: 'patient' | 'doctor' | 'lab' | 'admin';
}
interface LoginRequest {
  email: string; password: string;
}
interface AuthUser {
  id: string; email: string; name: string; role: string;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    register: builder.mutation<{ user: AuthUser }, RegisterRequest>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
    }),
    login: builder.mutation<{ user: AuthUser }, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
  }),
});

export const { useRegisterMutation, useLoginMutation } = authApi;
```

```tsx
// apps/web/src/app/(auth)/register/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRegisterMutation } from '@/store/authApi';

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '', role: 'patient' });
  const [register, { isLoading, error }] = useRegisterMutation();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await register(form as any).unwrap();
    router.push('/login');
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm mx-auto mt-16 space-y-4">
      <h1 className="text-xl font-semibold">Register</h1>
      <input className="border p-2 w-full" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input className="border p-2 w-full" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input className="border p-2 w-full" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <input className="border p-2 w-full" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <select className="border p-2 w-full" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
        <option value="patient">Patient</option>
        <option value="doctor">Doctor</option>
        <option value="lab">Lab</option>
      </select>
      <button className="bg-black text-white px-4 py-2 w-full" disabled={isLoading}>Register</button>
      {error ? <p className="text-red-600">Registration failed</p> : null}
    </form>
  );
}
```

```tsx
// apps/web/src/app/(auth)/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLoginMutation } from '@/store/authApi';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [login, { isLoading, error }] = useLoginMutation();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await login(form).unwrap();
    router.push('/');
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm mx-auto mt-16 space-y-4">
      <h1 className="text-xl font-semibold">Login</h1>
      <input className="border p-2 w-full" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input className="border p-2 w-full" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <button className="bg-black text-white px-4 py-2 w-full" disabled={isLoading}>Login</button>
      {error ? <p className="text-red-600">Login failed</p> : null}
    </form>
  );
}
```

- [ ] **Step 5: Add `NEXT_PUBLIC_API_URL` and verify the build**

```
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

Run: `npm run build --workspace=apps/web`
Expected: build succeeds with no type errors.

- [ ] **Step 6: Manual smoke check**

Start both servers (`npm run dev:api` and `npm run dev:web`), open `http://localhost:3000/register`, register one account of each role, then log in at `/login` and confirm the `accessToken`/`refreshToken` cookies are set (check DevTools → Application → Cookies).

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): scaffold Next.js app with Redux Toolkit, RTK Query, register/login pages"
```

---

### Task 14: SSR public pages `/doctors/[id]` and `/labs/[id]`

**Files:**
- Create: `apps/web/src/app/doctors/[id]/page.tsx`, `apps/web/src/app/labs/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/doctors/public/:id`, `GET /api/labs/public/:id` (Tasks 10–11).
- Produces: nothing consumed by later Phase 1 tasks; Phase 2 will link into these pages from doctor search/matching.

- [ ] **Step 1: Implement the doctor SSR page**

```tsx
// apps/web/src/app/doctors/[id]/page.tsx
import { notFound } from 'next/navigation';

interface DoctorProfile {
  _id: string;
  specialties: string[];
  qualifications: string[];
  bio: string;
  clinicName: string;
  clinicAddress: string;
  city: string;
  consultationFee: number;
  languages: string[];
  avgRating: number;
  ratingCount: number;
}

async function getDoctor(id: string): Promise<DoctorProfile | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/doctors/public/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load doctor');
  const data = await res.json();
  return data.profile;
}

export default async function DoctorPublicPage({ params }: { params: { id: string } }) {
  const doctor = await getDoctor(params.id);
  if (!doctor) notFound();

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-2">
      <h1 className="text-2xl font-bold">{doctor.clinicName}</h1>
      <p className="text-gray-600">{doctor.specialties.join(', ')} · {doctor.city}</p>
      <p>{doctor.bio}</p>
      <p>Qualifications: {doctor.qualifications.join(', ')}</p>
      <p>Languages: {doctor.languages.join(', ')}</p>
      <p>Consultation fee: ₹{doctor.consultationFee}</p>
      <p>Rating: {doctor.avgRating.toFixed(1)} ({doctor.ratingCount} reviews)</p>
    </main>
  );
}
```

- [ ] **Step 2: Implement the lab SSR page**

```tsx
// apps/web/src/app/labs/[id]/page.tsx
import { notFound } from 'next/navigation';

interface LabTest {
  code: string;
  name: string;
  price: number;
  turnaroundHours: number;
}

interface LabProfile {
  _id: string;
  labName: string;
  address: string;
  city: string;
  timings: string;
  homeCollection: boolean;
  tests: LabTest[];
}

async function getLab(id: string): Promise<LabProfile | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/labs/public/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load lab');
  const data = await res.json();
  return data.profile;
}

export default async function LabPublicPage({ params }: { params: { id: string } }) {
  const lab = await getLab(params.id);
  if (!lab) notFound();

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-2">
      <h1 className="text-2xl font-bold">{lab.labName}</h1>
      <p className="text-gray-600">{lab.address}, {lab.city}</p>
      <p>Timings: {lab.timings}</p>
      <p>Home collection: {lab.homeCollection ? 'Available' : 'Not available'}</p>
      <table className="w-full mt-4 border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-1">Test</th>
            <th className="py-1">Price</th>
            <th className="py-1">TAT</th>
          </tr>
        </thead>
        <tbody>
          {lab.tests.map((t) => (
            <tr key={t.code} className="border-b">
              <td className="py-1">{t.name}</td>
              <td className="py-1">₹{t.price}</td>
              <td className="py-1">{t.turnaroundHours}h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build --workspace=apps/web`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke check**

With both servers running and at least one approved doctor/lab in the database (seed script from Task 15, or manually flip `verificationStatus` to `'approved'` for a test-created profile), visit `http://localhost:3000/doctors/<id>` and `/labs/<id>` and confirm the data renders; visit an unapproved or nonexistent id and confirm Next.js's 404 page shows.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/doctors apps/web/src/app/labs
git commit -m "feat(web): SSR public doctor and lab profile pages"
```

---

### Task 15: Seed script (idempotent, Phase-1 scope of the §6 dataset)

**Files:**
- Create: `apps/api/src/seed/data.ts`, `apps/api/src/seed/seed.ts`
- Test: `apps/api/src/seed/seed.test.ts`

**Interfaces:**
- Consumes: `User`, `PatientProfile`, `DoctorProfile`, `LabProfile`, `Notification` models (Task 3).
- Produces: `npm run seed` — the data later phases' seed additions (per `2026-07-27-roadmap.md`) will append to, keyed on the same accounts.

> **Scope note (see Global Constraints):** this seed covers CLAUDE.md §6.1–§6.3 (accounts, doctor profiles, lab profiles + catalogs) plus the notification bell-priming from §6.4. Appointments, prescriptions, triage sessions, lab referrals/bookings, and ratings are added by Phases 2–6's own seed tasks once those models have real API-driven shapes to match, per the roadmap doc.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/seed/seed.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runSeed } from './seed';
import { User } from '../models/User';
import { DoctorProfile } from '../models/DoctorProfile';
import { LabProfile } from '../models/LabProfile';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('runSeed', () => {
  it('is idempotent and creates the expected demo accounts', async () => {
    await runSeed();
    await runSeed(); // run twice to prove idempotency

    const admin = await User.findOne({ email: 'admin@medlink.demo' });
    expect(admin).not.toBeNull();

    const doctors = await User.find({ role: 'doctor' });
    expect(doctors).toHaveLength(12);

    const approvedDoctors = await DoctorProfile.countDocuments({ verificationStatus: 'approved' });
    expect(approvedDoctors).toBe(11);
    const pendingDoctors = await DoctorProfile.countDocuments({ verificationStatus: 'pending' });
    expect(pendingDoctors).toBe(1);

    const labs = await User.find({ role: 'lab' });
    expect(labs).toHaveLength(4);
    const pendingLabs = await LabProfile.countDocuments({ verificationStatus: 'pending' });
    expect(pendingLabs).toBe(1);

    const patients = await User.find({ role: 'patient' });
    expect(patients).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- seed.test.ts`
Expected: FAIL — `Cannot find module './seed'`

- [ ] **Step 3: Implement seed data constants**

```ts
// apps/api/src/seed/data.ts
export const PATIENTS = [
  { email: 'rahul.p@medlink.demo', name: 'Rahul Sharma', phone: '9810000001', age: 34, gender: 'male' as const, city: 'Noida' },
  { email: 'priya.p@medlink.demo', name: 'Priya Singh', phone: '9810000002', age: 28, gender: 'female' as const, city: 'Delhi' },
  { email: 'amit.p@medlink.demo', name: 'Amit Kumar', phone: '9810000003', age: 45, gender: 'male' as const, city: 'Ghaziabad' },
  { email: 'sneha.p@medlink.demo', name: 'Sneha Gupta', phone: '9810000004', age: 8, gender: 'female' as const, city: 'Noida' },
  { email: 'vikram.p@medlink.demo', name: 'Vikram Rathore', phone: '9810000005', age: 62, gender: 'male' as const, city: 'Delhi' },
  { email: 'anita.p@medlink.demo', name: 'Anita Verma', phone: '9810000006', age: 51, gender: 'female' as const, city: 'Ghaziabad' },
];

export const DOCTORS = [
  { email: 'meera.d@medlink.demo', name: 'Dr. Meera Sharma', specialties: ['Dermatology'], city: 'Noida', fee: 600, exp: 9, status: 'approved' as const },
  { email: 'arjun.d@medlink.demo', name: 'Dr. Arjun Khanna', specialties: ['Dermatology'], city: 'Delhi', fee: 900, exp: 14, status: 'approved' as const },
  { email: 'kavita.d@medlink.demo', name: 'Dr. Kavita Rao', specialties: ['General Physician'], city: 'Noida', fee: 400, exp: 7, status: 'approved' as const },
  { email: 'sanjay.d@medlink.demo', name: 'Dr. Sanjay Gupta', specialties: ['General Physician'], city: 'Ghaziabad', fee: 350, exp: 20, status: 'approved' as const },
  { email: 'neha.d@medlink.demo', name: 'Dr. Neha Verma', specialties: ['Gastroenterology'], city: 'Delhi', fee: 1000, exp: 11, status: 'approved' as const },
  { email: 'rohit.d@medlink.demo', name: 'Dr. Rohit Malhotra', specialties: ['Cardiology'], city: 'Delhi', fee: 1200, exp: 16, status: 'approved' as const },
  { email: 'anjali.d@medlink.demo', name: 'Dr. Anjali Singh', specialties: ['Gynecology'], city: 'Noida', fee: 700, exp: 10, status: 'approved' as const },
  { email: 'farhan.d@medlink.demo', name: 'Dr. Farhan Ali', specialties: ['Orthopedics'], city: 'Noida', fee: 800, exp: 12, status: 'approved' as const },
  { email: 'pooja.d@medlink.demo', name: 'Dr. Pooja Iyer', specialties: ['Pediatrics'], city: 'Delhi', fee: 600, exp: 8, status: 'approved' as const },
  { email: 'vivek.d@medlink.demo', name: 'Dr. Vivek Joshi', specialties: ['ENT'], city: 'Ghaziabad', fee: 500, exp: 9, status: 'approved' as const },
  { email: 'ritu.d@medlink.demo', name: 'Dr. Ritu Bansal', specialties: ['Psychiatry'], city: 'Delhi', fee: 1100, exp: 13, status: 'approved' as const },
  { email: 'karan.d@medlink.demo', name: 'Dr. Karan Mehta', specialties: ['Ophthalmology'], city: 'Noida', fee: 650, exp: 6, status: 'pending' as const },
];

export const LABS = [
  {
    email: 'healthfirst.l@medlink.demo', name: 'HealthFirst Diagnostics', city: 'Noida', homeCollection: true, status: 'approved' as const,
    tests: [
      { code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6 },
      { code: 'LFT', name: 'Liver Function Test', price: 450, turnaroundHours: 12 },
      { code: 'KFT', name: 'Kidney Function Test', price: 450, turnaroundHours: 12 },
      { code: 'TSH', name: 'Thyroid Profile (TSH)', price: 300, turnaroundHours: 12 },
      { code: 'HBA1C', name: 'HbA1c (Diabetes)', price: 400, turnaroundHours: 12 },
      { code: 'LIPID', name: 'Lipid Profile', price: 500, turnaroundHours: 12 },
      { code: 'VITD', name: 'Vitamin D', price: 900, turnaroundHours: 24 },
      { code: 'URINE', name: 'Urine Routine', price: 150, turnaroundHours: 6 },
    ],
  },
  {
    email: 'citypath.l@medlink.demo', name: 'City Path Labs', city: 'Delhi', homeCollection: true, status: 'approved' as const,
    tests: [
      { code: 'CBC', name: 'Complete Blood Count', price: 285, turnaroundHours: 6 },
      { code: 'LFT', name: 'Liver Function Test', price: 500, turnaroundHours: 12 },
      { code: 'XRAYC', name: 'Chest X-Ray', price: 350, turnaroundHours: 24 },
      { code: 'ECG', name: 'ECG', price: 250, turnaroundHours: 6 },
      { code: 'USGABD', name: 'Ultrasound Abdomen', price: 1200, turnaroundHours: 24 },
    ],
  },
  {
    email: 'ghaziabaddiag.l@medlink.demo', name: 'Ghaziabad Diagnostic Centre', city: 'Ghaziabad', homeCollection: false, status: 'approved' as const,
    tests: [
      { code: 'CBC', name: 'Complete Blood Count', price: 180, turnaroundHours: 6 },
      { code: 'TSH', name: 'Thyroid Profile (TSH)', price: 220, turnaroundHours: 12 },
      { code: 'HBA1C', name: 'HbA1c (Diabetes)', price: 300, turnaroundHours: 12 },
      { code: 'LIPID', name: 'Lipid Profile', price: 380, turnaroundHours: 12 },
      { code: 'URINE', name: 'Urine Routine', price: 100, turnaroundHours: 6 },
      { code: 'BLOODSUGAR', name: 'Blood Sugar (FBS/PPBS)', price: 120, turnaroundHours: 6 },
    ],
  },
  {
    email: 'metroscans.l@medlink.demo', name: 'Metro Scans & Labs', city: 'Delhi', homeCollection: false, status: 'pending' as const,
    tests: [
      { code: 'MRIKNEE', name: 'MRI Knee', price: 4500, turnaroundHours: 48 },
      { code: 'CTHEAD', name: 'CT Head', price: 3200, turnaroundHours: 24 },
      { code: 'USGABD', name: 'Ultrasound Abdomen', price: 1100, turnaroundHours: 24 },
    ],
  },
];
```

- [ ] **Step 4: Implement the seed runner**

```ts
// apps/api/src/seed/seed.ts
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../lib/db';
import { User } from '../models/User';
import { PatientProfile } from '../models/PatientProfile';
import { DoctorProfile } from '../models/DoctorProfile';
import { LabProfile } from '../models/LabProfile';
import { Notification } from '../models/Notification';
import { PATIENTS, DOCTORS, LABS } from './data';

const DEMO_PASSWORD = 'Demo@123';

async function hashed(): Promise<string> {
  return bcrypt.hash(DEMO_PASSWORD, 10);
}

export async function runSeed(): Promise<void> {
  await User.deleteMany({});
  await PatientProfile.deleteMany({});
  await DoctorProfile.deleteMany({});
  await LabProfile.deleteMany({});
  await Notification.deleteMany({});

  const passwordHash = await hashed();

  const admin = await User.create({
    role: 'admin', email: 'admin@medlink.demo', phone: '9800000000', passwordHash, name: 'Admin',
    avatarUrl: 'https://i.pravatar.cc/150?u=admin@medlink.demo', isVerified: true,
  });

  for (const p of PATIENTS) {
    const user = await User.create({
      role: 'patient', email: p.email, phone: p.phone, passwordHash, name: p.name,
      avatarUrl: `https://i.pravatar.cc/150?u=${p.email}`, isVerified: true,
    });
    await PatientProfile.create({ userId: user._id, age: p.age, gender: p.gender, city: p.city });
    await Notification.create({
      userId: user._id, type: 'welcome', title: 'Welcome to MedLink',
      body: 'Your account is ready.', createdAt: new Date(),
    });
  }

  for (const d of DOCTORS) {
    const user = await User.create({
      role: 'doctor', email: d.email, phone: '9800000001', passwordHash, name: d.name,
      avatarUrl: `https://i.pravatar.cc/150?u=${d.email}`, isVerified: true,
    });
    await DoctorProfile.create({
      userId: user._id, specialties: d.specialties, qualifications: ['MBBS'],
      regNo: `DMC/R/${String(Math.floor(10000 + Math.random() * 89999))}`,
      experienceYears: d.exp, bio: `${d.name} is an experienced ${d.specialties[0]} practitioner.`,
      clinicName: `${d.name.replace('Dr. ', '')} Clinic`, clinicAddress: `${d.city} Main Road`,
      city: d.city, geo: { lat: 28.5, lng: 77.3 }, consultationFee: d.fee,
      languages: ['English', 'Hindi'], verificationStatus: d.status,
      avgRating: d.status === 'approved' ? Number((3.9 + Math.random() * 0.9).toFixed(1)) : 0,
      ratingCount: d.status === 'approved' ? Math.floor(12 + Math.random() * 148) : 0,
    });
    await Notification.create({
      userId: user._id, type: 'welcome', title: 'Welcome to MedLink',
      body: 'Your profile is set up.', createdAt: new Date(),
    });
  }

  for (const l of LABS) {
    const user = await User.create({
      role: 'lab', email: l.email, phone: '9800000002', passwordHash, name: l.name,
      avatarUrl: `https://i.pravatar.cc/150?u=${l.email}`, isVerified: true,
    });
    await LabProfile.create({
      userId: user._id, labName: l.name, address: `${l.city} Diagnostic Rd`, city: l.city,
      geo: { lat: 28.5, lng: 77.3 }, timings: '07:00-21:00', homeCollection: l.homeCollection,
      verificationStatus: l.status, tests: l.tests,
    });
    await Notification.create({
      userId: user._id, type: 'welcome', title: 'Welcome to MedLink',
      body: 'Your lab profile is set up.', createdAt: new Date(),
    });
  }

  await Notification.create({
    userId: admin._id, type: 'admin', title: 'Pending verifications',
    body: '2 verification requests are awaiting your review.', createdAt: new Date(),
  });
}

if (require.main === module) {
  connectDB(process.env.MONGO_URI ?? 'mongodb://localhost:27017/medlink')
    .then(runSeed)
    .then(disconnectDB)
    .then(() => {
      console.log('Seed complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- seed.test.ts`
Expected: PASS

- [ ] **Step 6: Run against local Docker Mongo and verify manually**

```bash
docker compose up -d mongo redis
npm run seed --workspace=apps/api
```
Expected: script exits 0, prints "Seed complete."; connect via `mongosh` (or Compass) and confirm 1 admin + 6 patients + 12 doctors + 4 labs exist, with exactly 1 doctor and 1 lab `pending`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/seed
git commit -m "feat(api): idempotent seed script for accounts, doctor/lab profiles, catalogs"
```

---

## Phase 1 Definition of Done (from CLAUDE.md §2)

After Task 15, verify manually in the browser: register/login as each of the
four roles, log in as `admin@medlink.demo` / `Demo@123`, approve
Dr. Karan Mehta's pending verification via the `/api/admin/verifications`
endpoints (Postman/curl is fine — an admin UI isn't built until Phase 6), then
load `http://localhost:3000/doctors/<his-id>` and confirm the page now
renders instead of 404ing.

## Self-Review Notes

- **Spec coverage:** every Phase 1 checklist item in CLAUDE.md §2 maps to a task above (monorepo/Docker/CI → Task 1; Express skeleton → Task 4; auth → Tasks 5–6; RBAC → Task 7; patient/doctor/lab CRUD → Tasks 9–11; admin verification → Task 12; SSR pages → Task 14; audit log → Task 8; seed → Task 15). Redis rate-limiting and refresh rotation (both explicitly called out in §2) are in Task 6.
- **Deliberate deviations, both documented inline and in the roadmap:** (1) full §6 seed dataset is spread across phases rather than loaded all at once in Phase 1, since Appointment/Prescription/TriageSession/LabReferral/LabBooking have no API-driven shape yet; (2) the `Rating` collection referenced by §6.4/Phase 6 isn't in CLAUDE.md §1's model list, so it isn't created here — it's called out as "first defined in Phase 6" in the roadmap.
- **Type consistency check:** `req.user: { id: string; role: string }` set by `requireAuth` (Task 7) is used identically by Tasks 9–12's controllers (`req.user!.id`, `req.user!.role`). `AppError(statusCode, message, code?)` signature (Task 4) is used consistently through Tasks 5–12. Redis key helpers (`refreshKey`, `blacklistKey`) are only defined in `auth.service.ts` and not duplicated elsewhere.
