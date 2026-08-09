# MedLink Redesign — Phase 1: Foundation (Soft Care) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the "Soft Care" design tokens and typography app-wide, add a reusable `<BlobBackground />` component, and rebuild the landing page and both auth pages on top of it — per the approved spec at `docs/superpowers/specs/2026-08-09-medlink-redesign-phase1-foundation-design.md`.

**Architecture:** Pure `apps/web` frontend work, no backend changes. One new presentational component (`components/ui/blob-background.tsx`) consumed by three call sites (root layout, landing page, auth layout). The landing page and both auth pages are rebuilt on the existing `Button`/`Input`/`Card` primitives instead of raw HTML elements. A new `app/(auth)/layout.tsx` gives both auth pages a shared two-panel visual layout via Next.js's native nested-layout feature.

**Tech Stack:** No new dependencies. `lucide-react` (already installed, v1.27.0) supplies every icon. `next/font/google`'s `Manrope` (ships with Next.js, no new package) supplies the single geometric sans. `@base-ui/react`'s `Button` is polymorphic via a `render={<Element />}` prop (confirmed in `node_modules/@base-ui/react/button/Button.d.ts`) — it does **not** support an `asChild` prop; every `Button`-wraps-a-`Link` usage in this plan uses `render`.

## Global Constraints

- No new npm dependencies for anything in this plan.
- Light-mode only. Every token change touches only `globals.css`'s `:root` block. The `.dark` block is never modified.
- The `<BlobBackground />` component must use fixed, deterministic gradient positions/sizes — never `Math.random()` or per-render randomness. This is a Next.js App Router project; content renders on the server first, and a client-only random value would mismatch server-rendered markup and throw a React hydration error.
- Every new or rebuilt form/content page must use the existing `Button`/`Input`/`Card` primitives from `apps/web/src/components/ui/` — never raw `<input>`/`<button>` elements.
- `apps/web` has no automated test runner configured (no vitest/jest, no `*.test.*` files anywhere under `apps/web/src`). This plan's per-task verification is `npm run typecheck --workspace=apps/web` and `npm run build --workspace=apps/web`, run from the repo root (`/Volumes/Projects/MediLink`) — a clean typecheck + build is this plan's pass/fail signal for every code task, consistent with the approved spec's own self-check section.
- `React.ReactNode` / `React.FormEvent` etc. are used as bare type annotations with no explicit `import React from 'react'` throughout this codebase already (see current `apps/web/src/app/layout.tsx`, `login/page.tsx`) — match this existing convention; do not add `import React from 'react'` lines.
- Every task's commit uses `git add <specific files>` (never `-A` or `.`) scoped to that task's changes.

---

### Task 1: Apply the Soft Care design tokens

**Files:**
- Modify: `apps/web/src/app/globals.css:51-84` (the `:root` block)

**Interfaces:**
- Produces: new light-mode CSS custom property values consumed by every existing page (all Phase 1-6 dashboards/forms already reference these shadcn tokens via Tailwind's `bg-background`, `text-foreground`, `bg-primary`, etc. utility classes) and by every component this plan adds.

- [ ] **Step 1: Replace the `:root` block's values**

In `apps/web/src/app/globals.css`, replace lines 51-84 with:

```css
:root {
  --background: #F3F7F5;
  --foreground: #1B3A4B;
  --card: #FFFFFF;
  --card-foreground: #1B3A4B;
  --popover: #FFFFFF;
  --popover-foreground: #1B3A4B;
  --primary: #1B3A4B;
  --primary-foreground: #FFFFFF;
  --secondary: #DCEAE3;
  --secondary-foreground: #1B3A4B;
  --muted: #EAF2EE;
  --muted-foreground: #5C7A6D;
  --accent: #E8A896;
  --accent-foreground: #1B3A4B;
  --destructive: oklch(0.577 0.245 27.325);
  --border: #DCEAE3;
  --input: #DCEAE3;
  --ring: #1B3A4B;
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 1rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}
```

Leave the `@theme inline { ... }` block above it and the entire `.dark { ... }` block below it completely untouched — only the `:root` values change. `--destructive` and the `--chart-*`/`--sidebar-*` tokens keep their stock values (not covered by the approved design; nothing currently renders a chart or sidebar).

- [ ] **Step 2: Verify**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): apply Soft Care design tokens"
```

---

### Task 2: Switch typography to Manrope, fix page metadata

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Produces: the `--font-sans` CSS variable now resolves to Manrope (globals.css's `@theme inline` block already has `--font-sans: var(--font-sans);` and `html { @apply font-sans; }`, so this requires no CSS changes — only wiring the variable name in `layout.tsx`).

- [ ] **Step 1: Replace the Geist Sans import with Manrope, fix metadata**

Replace the full contents of `apps/web/src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Manrope, Geist_Mono } from "next/font/google";
import { StoreProvider } from "@/store/StoreProvider";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MedLink",
  description:
    "AI-guided symptom triage, doctor matching, appointment booking, prescriptions, and lab referrals in one platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
```

Note: `--font-geist-mono` / `Geist_Mono` is left in place unchanged — nothing in this plan touches monospace text, and the spec's typography goal is scoped to the sans font used app-wide.

- [ ] **Step 2: Verify**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(web): switch to Manrope, fix page metadata"
```

---

### Task 3: `<BlobBackground />` component

**Files:**
- Create: `apps/web/src/components/ui/blob-background.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils` (existing helper — `clsx` + `tailwind-merge`, see `apps/web/src/lib/utils.ts`).
- Produces: `BlobBackground` component, props `{ variant: "hero" | "ambient"; className?: string }` (both required except `className`). Consumed by Task 4 (root layout, `variant="ambient"`), Task 6 (landing page, `variant="hero"`), and Task 7 (auth layout, `variant="hero"`).

- [ ] **Step 1: Write the component**

```tsx
import { cn } from "@/lib/utils"

interface BlobBackgroundProps {
  variant: "hero" | "ambient"
  className?: string
}

function BlobBackground({ variant, className }: BlobBackgroundProps) {
  const isAmbient = variant === "ambient"

  return (
    <div
      aria-hidden="true"
      className={cn(
        "overflow-hidden",
        isAmbient
          ? "fixed inset-0 z-[-1] pointer-events-none opacity-[0.12]"
          : "absolute inset-0 opacity-50",
        className
      )}
    >
      <div
        className={cn(
          "absolute -right-10 -top-10 rounded-full bg-[#DCEAE3] blur-3xl",
          isAmbient ? "h-96 w-96" : "h-72 w-72"
        )}
      />
      <div
        className={cn(
          "absolute -bottom-10 -left-10 rounded-full bg-[#F3DCD3] blur-3xl",
          isAmbient ? "h-72 w-72" : "h-56 w-56"
        )}
      />
    </div>
  )
}

export { BlobBackground }
```

Both blobs use fixed Tailwind size/position utility classes chosen by the `variant` prop — no `Math.random()`, no per-render variation, so server and client render identical markup (no hydration mismatch risk).

- [ ] **Step 2: Verify**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean, no errors. (No visual consumer exists yet — this task only confirms the component compiles; Tasks 4/6/7 verify it renders correctly.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/blob-background.tsx
git commit -m "feat(web): add BlobBackground component"
```

---

### Task 4: Mount the ambient blob layer globally

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Consumes: `BlobBackground` from `@/components/ui/blob-background` (Task 3), `variant="ambient"`.

- [ ] **Step 1: Import and mount `<BlobBackground variant="ambient" />` behind `{children}`**

In `apps/web/src/app/layout.tsx`, add the import and mount the component as the first child of `<body>`, before `<StoreProvider>`:

```tsx
import type { Metadata } from "next";
import { Manrope, Geist_Mono } from "next/font/google";
import { StoreProvider } from "@/store/StoreProvider";
import { BlobBackground } from "@/components/ui/blob-background";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MedLink",
  description:
    "AI-guided symptom triage, doctor matching, appointment booking, prescriptions, and lab referrals in one platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BlobBackground variant="ambient" />
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
```

Because `variant="ambient"` renders `fixed inset-0 z-[-1] pointer-events-none opacity-[0.12]`, it sits behind and never intercepts clicks on any page's real content — every existing page (dashboards, forms, tables) gets it automatically with zero per-page changes.

- [ ] **Step 2: Verify**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(web): mount ambient BlobBackground in root layout"
```

---

### Task 5: Add an `accent` Button variant

**Files:**
- Modify: `apps/web/src/components/ui/button.tsx:7` (base class string) and `:9-21` (the `variants.variant` object in `buttonVariants`)

**Interfaces:**
- Produces: `<Button variant="accent">` — used by Task 6 (landing hero CTA), the only consumer in this plan.

- [ ] **Step 1: Add the `accent` variant**

In `apps/web/src/components/ui/button.tsx`, inside `buttonVariants`'s `variants.variant` object, add a new entry immediately after `default`:

```ts
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        accent: "bg-accent text-accent-foreground hover:bg-accent/80",
        outline:
```

(This inserts one line; every other line in the file is unchanged.)

- [ ] **Step 2: Tighten the base `transition-all` to a specific property list**

In the same file, `buttonVariants`'s base class string currently includes `transition-all`. Replace that one token with `transition-[background-color,border-color,box-shadow,transform]` — the button already animates background (hover), border/ring (focus-visible), and position (the existing `active:not-aria-[haspopup]:translate-y-px` press feedback); `transition-all` additionally covers layout-triggering properties (e.g. width/height/padding) that nothing here actually changes, which is unnecessary work for the browser on every state change.

- [ ] **Step 3: Verify**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/button.tsx
git commit -m "feat(web): add accent Button variant, tighten transition-all"
```

---

### Task 6: Rebuild the landing page

**Files:**
- Modify: `apps/web/src/app/page.tsx` (full replace)

**Interfaces:**
- Consumes: `Button` (Task 5's `accent` variant + existing `outline`), `Card`/`CardHeader`/`CardTitle`/`CardDescription` (existing), `BlobBackground` (Task 3, `variant="hero"`), `Link` from `next/link`, icons from `lucide-react` (`User`, `UserRound`, `FlaskConical`, `ShieldCheck`, `Stethoscope`, `CalendarCheck`, `ClipboardPlus` — all confirmed present in the installed `lucide-react` v1.27.0).

- [ ] **Step 1: Replace `apps/web/src/app/page.tsx`**

```tsx
import Link from "next/link";
import {
  User,
  UserRound,
  FlaskConical,
  ShieldCheck,
  Stethoscope,
  CalendarCheck,
  ClipboardPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BlobBackground } from "@/components/ui/blob-background";

const roleEntries = [
  {
    label: "Patient",
    description: "Get AI-guided triage, book appointments, and track your health timeline.",
    icon: User,
  },
  {
    label: "Doctor",
    description: "Manage availability, review referrals, and issue prescriptions.",
    icon: UserRound,
  },
  {
    label: "Lab",
    description: "Track referrals from booking through to report upload.",
    icon: FlaskConical,
  },
  {
    label: "Admin",
    description: "Verify doctor and lab credentials, monitor platform activity.",
    icon: ShieldCheck,
  },
];

const steps = [
  {
    label: "Triage",
    description: "Describe your symptoms — AI maps them to the right specialty.",
    icon: Stethoscope,
  },
  {
    label: "Book",
    description: "Pick a matched doctor and an open slot, confirmed instantly.",
    icon: CalendarCheck,
  },
  {
    label: "Prescribe & Refer",
    description: "Get a verifiable prescription, with lab referrals when needed.",
    icon: ClipboardPlus,
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="grid flex-1 items-center gap-10 px-6 py-20 md:grid-cols-2 md:px-16">
        <div className="flex flex-col items-start gap-6 text-left">
          <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
            Describe your symptoms. We&apos;ll find who can help.
          </h1>
          <p className="max-w-md text-lg leading-7 text-muted-foreground">
            AI symptom triage, doctor matching, appointment booking, prescriptions,
            and lab referrals — one calm flow, start to finish.
          </p>
          <p className="text-sm text-muted-foreground">
            This is guidance, not medical advice.
          </p>
          <div className="flex gap-3">
            <Button variant="accent" size="lg" render={<Link href="/register" />}>
              Get started
            </Button>
            <Button variant="outline" size="lg" render={<Link href="/login" />}>
              Sign in
            </Button>
          </div>
        </div>
        <div className="relative hidden h-80 overflow-hidden rounded-3xl bg-secondary md:block">
          <BlobBackground variant="hero" />
        </div>
      </section>

      <section className="grid gap-4 px-6 py-16 md:grid-cols-4 md:px-16">
        {roleEntries.map(({ label, description, icon: Icon }) => (
          <Link key={label} href="/login" className="block">
            <Card className="h-full p-6 transition-colors hover:bg-secondary/40">
              <CardHeader className="gap-3 px-0">
                <Icon className="size-6 text-primary" />
                <CardTitle>{label}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

      <section className="grid gap-8 px-6 py-16 md:grid-cols-3 md:px-16">
        {steps.map(({ label, description, icon: Icon }) => (
          <div key={label} className="flex flex-col items-start gap-3">
            <Icon className="size-8 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">{label}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground md:px-16">
        MedLink
      </footer>
    </div>
  );
}
```

Role-entry cards all link to `/login` (role is determined by the account, not the URL) — this is intentional per the spec, not a placeholder.

- [ ] **Step 2: Verify**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): rebuild landing page with Soft Care design"
```

---

### Task 7: Two-panel auth layout

**Files:**
- Create: `apps/web/src/app/(auth)/layout.tsx`

**Interfaces:**
- Consumes: `BlobBackground` (Task 3, `variant="hero"`).
- Produces: shared layout wrapping both `app/(auth)/login/page.tsx` and `app/(auth)/register/page.tsx` (Next.js route-group nested layout — applies automatically to both without either page importing it).

- [ ] **Step 1: Write the layout**

```tsx
import { BlobBackground } from "@/components/ui/blob-background";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="grid flex-1 md:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-16">{children}</div>
      <div className="relative hidden overflow-hidden bg-secondary md:block">
        <BlobBackground variant="hero" />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 px-10 text-center">
          <p className="text-xl font-semibold text-foreground">
            One calm flow, start to finish.
          </p>
          <p className="text-sm text-muted-foreground">
            Triage, booking, prescriptions, and lab referrals in one place.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(auth)/layout.tsx"
git commit -m "feat(web): add two-panel auth layout"
```

---

### Task 8: Rebuild the login page, fix the post-login redirect

**Files:**
- Modify: `apps/web/src/app/(auth)/login/page.tsx` (full replace)

**Interfaces:**
- Consumes: `Button`, `Input`, `Card`/`CardHeader`/`CardTitle`/`CardContent` (existing primitives), `useLoginMutation` from `@/store/authApi` (existing — returns `{ user: { id, email, name, role: string } }`, unchanged).
- Produces: role-based redirect after login, replacing the current `router.push('/')`.

- [ ] **Step 1: Replace `apps/web/src/app/(auth)/login/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLoginMutation } from '@/store/authApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const ROLE_REDIRECT: Record<string, string> = {
  patient: '/dashboard/patient',
  doctor: '/dashboard/doctor',
  lab: '/dashboard/lab',
  admin: '/dashboard/admin',
};

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [login, { isLoading, error }] = useLoginMutation();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { user } = await login(form).unwrap();
    router.push(ROLE_REDIRECT[user.role] ?? '/');
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <CardHeader className="px-0">
        <CardTitle className="text-xl">Login</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Button disabled={isLoading} className="w-full">
            Login
          </Button>
          {error ? <p className="text-sm text-destructive">Login failed</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
```

`ROLE_REDIRECT[user.role] ?? '/'` falls back to `/` only for an unrecognized role value, which cannot happen given the backend's `role` enum (`patient`/`doctor`/`lab`/`admin`) — this is defensive against a type-widened `string`, not dead code for a real case.

- [ ] **Step 2: Verify**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(auth)/login/page.tsx"
git commit -m "fix(web): rebuild login page on shared primitives, redirect by role"
```

---

### Task 9: Rebuild the register page

**Files:**
- Modify: `apps/web/src/app/(auth)/register/page.tsx` (full replace)

**Interfaces:**
- Consumes: `Button`, `Input`, `Card`/`CardHeader`/`CardTitle`/`CardContent` (existing primitives), `cn` from `@/lib/utils`, `useRegisterMutation` from `@/store/authApi` (existing, unchanged).

- [ ] **Step 1: Replace `apps/web/src/app/(auth)/register/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRegisterMutation } from '@/store/authApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type RegisterRole = 'patient' | 'doctor' | 'lab' | 'admin';

export default function RegisterPage() {
  const [form, setForm] = useState<{ email: string; password: string; name: string; phone: string; role: RegisterRole }>({
    email: '', password: '', name: '', phone: '', role: 'patient',
  });
  const [register, { isLoading, error }] = useRegisterMutation();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await register(form).unwrap();
    router.push('/login');
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <CardHeader className="px-0">
        <CardTitle className="text-xl">Register</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <select
            className={cn(
              "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            )}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as RegisterRole })}
          >
            <option value="patient">Patient</option>
            <option value="doctor">Doctor</option>
            <option value="lab">Lab</option>
          </select>
          <Button disabled={isLoading} className="w-full">
            Register
          </Button>
          {error ? <p className="text-sm text-destructive">Registration failed</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
```

The role `<select>` stays a native element styled to match `Input`'s exact classes (no `Select` primitive exists in `components/ui/` and adding one is out of scope for this plan — a single dropdown doesn't warrant a new reusable component). Admin stays excluded from the options list, unchanged from current behavior.

- [ ] **Step 2: Verify**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(auth)/register/page.tsx"
git commit -m "feat(web): rebuild register page on shared primitives"
```

---

### Task 10: Visual verification with Playwright

**Files:** none (verification only, no code changes)

**Interfaces:** none — this task consumes the finished output of Tasks 1-9.

- [ ] **Step 1: Start the dev server**

Run in the background: `npm run dev --workspace=apps/web`
Wait for the "Ready" log line, then note the local URL (default `http://localhost:3000`).

- [ ] **Step 2: Load and screenshot the landing page**

Using the Playwright MCP tool, navigate to `http://localhost:3000/` and take a screenshot.
Expected: sage/mint background, navy heading text in Manrope, split hero with the blob visual panel on the right (desktop viewport), rose "Get started" button, navy-outline "Sign in" button, four role-entry cards, three "how it works" steps, footer.
Read the browser console via the Playwright MCP tool's console-reading capability — expected: no React hydration warnings.

- [ ] **Step 3: Load and screenshot the login and register pages**

Navigate to `http://localhost:3000/login`, screenshot. Expected: two-panel layout, form on a `Card` using the styled `Input`/`Button` primitives on the left, blob visual panel with tagline on the right (desktop viewport).
Navigate to `http://localhost:3000/register`, screenshot. Expected: same two-panel layout, all five fields (name/email/phone/password/role) present and styled consistently.
Read the browser console for both — expected: no React hydration warnings.

- [ ] **Step 4: Spot-check an existing page for automatic re-color**

Navigate to `http://localhost:3000/search` (public, no auth required) and take a screenshot.
Expected: the page's existing layout is unchanged, but it now renders in the Soft Care palette (sage background, navy text) via the shared tokens, and the low-opacity ambient blob layer is visible behind the content with no layout breakage and no console hydration warning.

- [ ] **Step 5: Fix any issues found, or confirm clean**

If any screenshot or console check surfaces a problem (layout breakage, hydration warning, wrong color), fix it in the relevant file from Tasks 1-9, re-run `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`, re-verify with Playwright, and commit the fix separately (`fix(web): <what was wrong>`). If everything is clean, no commit is needed for this task — it's a verification pass, not a code change.

- [ ] **Step 6: Stop the dev server**

Stop the background `npm run dev` process.
