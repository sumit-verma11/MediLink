# MedLink Visual Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved spec at `docs/superpowers/specs/2026-07-31-visual-reskin-design.md` — apply the "Clinical Trust" palette as shadcn CSS tokens (re-coloring every existing page for free), replace the `create-next-app` boilerplate landing page and unstyled auth forms with real content, and add two new background components (an animated heartbeat-line motif for the landing hero/auth panel, and a low-opacity tiled medical-icon texture behind every page).

**Architecture:** Pure `apps/web` frontend work, no backend changes. Two new presentational components in `components/ui/` (matching the existing `button.tsx`/`card.tsx`/`input.tsx` convention — one file per component, no barrel file). The landing page and both auth pages are rebuilt on the existing `Button`/`Input`/`Card` primitives instead of raw HTML elements. A new `app/(auth)/layout.tsx` gives both auth pages a shared two-panel visual layout via Next.js's native nested-layout feature, rather than duplicating panel markup in both page files.

**Tech Stack:** No new dependencies. `lucide-react` (already installed, v1.27.0) supplies every icon used. `@base-ui/react`'s `Button` is polymorphic via a `render={<Element />}` prop (confirmed in `node_modules/@base-ui/react/button/Button.d.ts` / `internals/types.d.ts`) — it does **not** support an `asChild` prop the way Radix-based button components do; every `Button`-wraps-a-`Link` usage in this plan uses `render`.

## Global Constraints

- No new npm dependencies. `lucide-react` already has every medical icon this plan needs (verified against `node_modules/lucide-react/dist/esm/icons`: `stethoscope`, `pill`, `syringe`, `heart-pulse`, `bandage`, `thermometer`, `cross`, `microscope`, `flask-conical`, `test-tube`, `clipboard-plus`, `tablets`, `calendar-check`, `shield-plus`, `user`, all present).
- Light-mode only. Every token change in this plan touches only `globals.css`'s `:root` block. The `.dark` block is never modified.
- Any layout/pattern that renders differently per index (rotation, icon choice, etc.) must be a **pure function of a stable index**, never `Math.random()` or `Date.now()` — this is a Next.js App Router project, so this content renders on the server first; a client-only random value would mismatch the server-rendered markup and throw a React hydration error.
- Every new or rebuilt form/content page must use the existing `Button`/`Input`/`Card` primitives from `apps/web/src/components/ui/` — never raw `<input>`/`<button>` elements. This is the gap the spec was written to close (today's `login`/`register` pages use raw elements and don't import these primitives at all).
- `apps/web` has no automated test runner configured (no vitest/jest in `apps/web/package.json`, no `*.test.*` files anywhere under `apps/web/src`). This plan's per-task verification is `npm run typecheck --workspace=apps/web` and `npm run build --workspace=apps/web` — a clean typecheck + build is this plan's pass/fail signal, consistent with the spec's own self-check section (§5), which explicitly calls for no new automated test given there's no branching business logic here.
- `React.ReactNode` / `React.FormEvent` etc. are used as bare type annotations with no explicit `import React from 'react'` throughout this codebase already (see `apps/web/src/app/layout.tsx`, the current `login/page.tsx`) — `@types/react` declares itself as a global UMD namespace, so this compiles today. Match this existing convention; do not add `import React from 'react'` lines.

---

### Task 1: Apply the Clinical Trust design tokens

**Files:**
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Produces: new light-mode CSS custom property values consumed by every existing page (all Phase 1-6 dashboards/forms already reference these shadcn tokens via Tailwind's `bg-background`, `text-foreground`, `bg-primary`, etc. utility classes).

- [ ] **Step 1: Replace the `:root` block's values**

In `apps/web/src/app/globals.css`, replace the entire `:root { ... }` block (lines 51-84 in the current file) with:

```css
:root {
  --background: #F7FAFC;
  --foreground: #1A202C;
  --card: #FFFFFF;
  --card-foreground: #1A202C;
  --popover: #FFFFFF;
  --popover-foreground: #1A202C;
  --primary: #0B4F6C;
  --primary-foreground: #FFFFFF;
  --secondary: #EDF2F7;
  --secondary-foreground: #1A202C;
  --muted: #EDF2F7;
  --muted-foreground: #64748B;
  --accent: #3A7CA5;
  --accent-foreground: #FFFFFF;
  --destructive: oklch(0.577 0.245 27.325);
  --border: #E2E8F0;
  --input: #E2E8F0;
  --ring: #3A7CA5;
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.4rem;
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

Leave the `@theme inline { ... }` block above it and the entire `.dark { ... }` block below it completely untouched — only the `:root` values change. `--destructive` and the `--chart-*`/`--sidebar-*` tokens keep their stock values (not covered by the approved mockups; nothing currently renders a chart or sidebar).

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(web): apply Clinical Trust palette as shadcn design tokens"
```

---

### Task 2: `<HeartbeatBackground />` component

**Files:**
- Create: `apps/web/src/components/ui/heartbeat-background.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `cn` (`apps/web/src/lib/utils.ts`).
- Produces: `export function HeartbeatBackground({ className }: { className?: string }): JSX.Element` — an absolutely-positioned decorative layer (gradient blob + one animated EKG-line SVG path). Callers must give it a `relative`-positioned parent, since it fills its parent via `absolute inset-0`.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/ui/heartbeat-background.tsx
import { cn } from "@/lib/utils"

export function HeartbeatBackground({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden="true"
    >
      <div
        className="absolute -top-8 -right-8 h-36 w-36 rounded-full opacity-35"
        style={{ background: "radial-gradient(circle, #3A7CA5 0%, transparent 70%)" }}
      />
      <svg
        className="absolute bottom-8 left-0 w-full"
        height="60"
        viewBox="0 0 400 60"
        preserveAspectRatio="none"
      >
        <path
          d="M0 30 H140 L155 10 L170 50 L185 30 H260 L272 18 L284 42 L296 30 H400"
          stroke="var(--primary)"
          strokeWidth={2.5}
          fill="none"
          className="heartbeat-path"
        />
      </svg>
    </div>
  )
}
```

The path data and gradient values are copied directly from the approved mockup (`.superpowers/brainstorm/39426-1785326675/content/background-treatment.html`, option C) — same visual, not a reinterpretation.

- [ ] **Step 2: Add the draw-in animation as a global utility**

Append to the end of `apps/web/src/app/globals.css` (after the existing `@layer base { ... }` block):

```css
.heartbeat-path {
  stroke-dasharray: 480;
  stroke-dashoffset: 480;
  animation: heartbeat-draw 1.6s ease-out forwards;
}

@keyframes heartbeat-draw {
  to {
    stroke-dashoffset: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .heartbeat-path {
    stroke-dashoffset: 0;
    animation: none;
  }
}
```

`480` is the approximate total length of the path's segments — the exact figure doesn't matter as long as it's greater than or equal to the true path length (a larger value just means the line is fully hidden at the very start of the animation, which is the desired initial state).

- [ ] **Step 3: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean. (The component isn't used by any page yet — this step only confirms it compiles standalone.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/heartbeat-background.tsx apps/web/src/app/globals.css
git commit -m "feat(web): add HeartbeatBackground component with reduced-motion guard"
```

---

### Task 3: `<MedicalIconField />` component + global mount + metadata fix

**Files:**
- Create: `apps/web/src/components/ui/medical-icon-field.tsx`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Produces: `export function MedicalIconField(): JSX.Element` — a fixed, full-viewport, `-z-10` layer of 480 cycled lucide-react medical icons at 5% opacity with deterministic per-cell rotation, laid out via flex-wrap. Takes no props — single global background, not a themeable/configurable component. Known ceiling (marked inline with a `ponytail:` comment): the fixed cell count comfortably covers viewports up to ~1440p; a much larger display can show blank space at the bottom of the page. See Task 7 Step 2 for the check.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/ui/medical-icon-field.tsx
import {
  Stethoscope,
  Pill,
  Syringe,
  HeartPulse,
  Bandage,
  Thermometer,
  Cross,
  Microscope,
  FlaskConical,
  TestTube,
  ClipboardPlus,
  Tablets,
} from "lucide-react"

const ICONS = [
  Stethoscope,
  Pill,
  Syringe,
  HeartPulse,
  Bandage,
  Thermometer,
  Cross,
  Microscope,
  FlaskConical,
  TestTube,
  ClipboardPlus,
  Tablets,
]

// ponytail: fixed cell count, generous for viewports up to ~1440p (covers
// roughly a 2560x1440 screen with margin). A much larger display (4K+) will
// show blank space at the bottom of the page instead of icons. Upgrade path
// if that's ever visible in practice: compute the count from
// window.innerWidth/innerHeight in a resize-aware effect, or switch to a
// native CSS `<pattern>`-tiled SVG background, which repeats infinitely
// regardless of viewport size.
const CELL_COUNT = 480
// Rotation must be a pure function of index, not Math.random() -- this renders
// on the server first, and a client-only random value would mismatch the
// server-rendered markup and throw a React hydration error.
const ROTATIONS = [0, 7, -7, 14, -14]

export function MedicalIconField() {
  return (
    <div
      className="fixed inset-0 -z-10 flex flex-wrap content-start overflow-hidden"
      aria-hidden="true"
    >
      {Array.from({ length: CELL_COUNT }).map((_, i) => {
        const Icon = ICONS[i % ICONS.length]
        const rotation = ROTATIONS[i % ROTATIONS.length]
        return (
          <div key={i} className="flex size-24 shrink-0 items-center justify-center">
            <Icon
              size={40}
              color="var(--primary)"
              style={{ opacity: 0.05, transform: `rotate(${rotation}deg)` }}
            />
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Mount it in the root layout and fix the stale metadata**

Read `apps/web/src/app/layout.tsx` first — it currently has `metadata = { title: "Create Next App", description: "Generated by create next app" }` and renders `<body className="min-h-full flex flex-col"><StoreProvider>{children}</StoreProvider></body>`.

Change it to:

```tsx
// apps/web/src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { StoreProvider } from "@/store/StoreProvider";
import { MedicalIconField } from "@/components/ui/medical-icon-field";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MedLink",
  description: "AI symptom triage, doctor matching, appointment booking, prescriptions, and lab referrals — one connected healthcare flow.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MedicalIconField />
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
```

Only the `metadata` object, the new import, and the `<MedicalIconField />` line change — everything else in this file (font setup, `StoreProvider`, `className` on `<html>`/`<body>`) stays exactly as-is.

- [ ] **Step 3: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/medical-icon-field.tsx apps/web/src/app/layout.tsx
git commit -m "feat(web): add global MedicalIconField background and fix stale app metadata"
```

---

### Task 4: Rebuild the landing page

**Files:**
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: `HeartbeatBackground` (Task 2); `Button` (`components/ui/button.tsx`); `Card`, `CardHeader`, `CardTitle`, `CardDescription` (`components/ui/card.tsx`); `Link` (`next/link`); `Stethoscope`, `FlaskConical`, `ShieldPlus`, `User`, `CalendarCheck`, `ClipboardPlus` (`lucide-react`).

- [ ] **Step 1: Replace `page.tsx` entirely**

```tsx
// apps/web/src/app/page.tsx
import Link from "next/link";
import {
  Stethoscope,
  FlaskConical,
  ShieldPlus,
  User,
  CalendarCheck,
  ClipboardPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { HeartbeatBackground } from "@/components/ui/heartbeat-background";

const ROLES = [
  { label: "Patient", description: "Describe your symptoms, get matched with a doctor, and book an appointment.", icon: User },
  { label: "Doctor", description: "Manage your schedule, confirm bookings, and write prescriptions.", icon: Stethoscope },
  { label: "Lab", description: "Receive referrals, manage bookings, and upload reports.", icon: FlaskConical },
  { label: "Admin", description: "Verify doctors and labs, and monitor platform activity.", icon: ShieldPlus },
];

const STEPS = [
  { label: "Triage", description: "Describe your symptoms to get matched with the right specialty.", icon: Stethoscope },
  { label: "Book", description: "Pick a doctor and a slot that works for you.", icon: CalendarCheck },
  { label: "Prescribe & Refer", description: "Your doctor prescribes medicines and refers lab tests if needed.", icon: ClipboardPlus },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative overflow-hidden px-6 py-24 text-center">
        <HeartbeatBackground />
        <div className="relative mx-auto max-w-2xl space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">MedLink</h1>
          <p className="text-lg text-muted-foreground">
            AI symptom triage, doctor matching, appointment booking, prescriptions, and
            lab referrals &mdash; one connected healthcare flow.
          </p>
          <p className="text-sm text-muted-foreground">This is guidance, not medical advice.</p>
          <Button size="lg" render={<Link href="/login">Get started</Link>} />
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map(({ label, description, icon: Icon }) => (
          <Link key={label} href="/login">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <Icon className="size-6 text-primary" />
                <CardTitle>{label}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

      <section className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-8 px-6 py-12 sm:grid-cols-3">
        {STEPS.map(({ label, description, icon: Icon }, i) => (
          <div key={label} className="space-y-2 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Icon className="size-6 text-primary" />
            </div>
            <h3 className="font-semibold">{i + 1}. {label}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        ))}
      </section>

      <footer className="border-t px-6 py-8 text-center text-sm text-muted-foreground">
        MedLink
      </footer>
    </main>
  );
}
```

Role cards link to `/login` for every role — role is determined by the logged-in account (Task 5's redirect fix), not encoded in the URL, so all four cards point to the same login page.

`Button`'s `render` prop (not `asChild`) is how `@base-ui/react`'s `Button` renders as a different element — confirmed in the Global Constraints section.

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean; confirm `/` still appears in the build's route list.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): replace create-next-app boilerplate with a real landing page"
```

---

### Task 5: Auth layout + login page rebuild + redirect-by-role fix

**Files:**
- Create: `apps/web/src/app/(auth)/layout.tsx`
- Modify: `apps/web/src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `HeartbeatBackground` (Task 2); `Button`, `Input`, `Card`/`CardHeader`/`CardTitle`/`CardContent` (`components/ui/`); `useLoginMutation` (`apps/web/src/store/authApi.ts`) — returns `Promise<{ user: { id: string; email: string; name: string; role: string } }>` on `.unwrap()`.
- Produces: shared two-panel auth layout used by both `login` and `register`.

- [ ] **Step 1: Write the shared auth layout**

```tsx
// apps/web/src/app/(auth)/layout.tsx
import { HeartbeatBackground } from "@/components/ui/heartbeat-background";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 grid-cols-1 md:grid-cols-2">
      <div className="flex items-center justify-center p-6">{children}</div>
      <div className="relative hidden items-center justify-center overflow-hidden bg-primary/5 p-6 md:flex">
        <HeartbeatBackground />
        <p className="relative max-w-xs text-center text-lg font-medium text-primary">
          Care, connected.
        </p>
      </div>
    </div>
  );
}
```

The visual panel is hidden below the `md` breakpoint (`hidden md:flex`) — single-column form-only layout on mobile, per the approved spec.

- [ ] **Step 2: Rebuild the login page, including the redirect-by-role fix**

```tsx
// apps/web/src/app/(auth)/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLoginMutation } from '@/store/authApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const DASHBOARD_PATH_BY_ROLE: Record<string, string> = {
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
    router.push(DASHBOARD_PATH_BY_ROLE[user.role] ?? '/');
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Log in</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            placeholder="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {error ? <p className="text-sm text-destructive">Login failed</p> : null}
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

This replaces both the raw-`<input>` markup AND the previous `router.push('/')` redirect. The redirect fix matters starting with this task: once Task 4 lands, `/` is a real marketing page — a bare `router.push('/')` after login would strand every logged-in user there instead of their dashboard.

- [ ] **Step 3: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(auth)/layout.tsx apps/web/src/app/(auth)/login/page.tsx
git commit -m "feat(web): rebuild login page on existing UI primitives, fix post-login redirect"
```

---

### Task 6: Rebuild the register page

**Files:**
- Modify: `apps/web/src/app/(auth)/register/page.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `Card`/`CardHeader`/`CardTitle`/`CardContent` (`components/ui/`); `useRegisterMutation` (`apps/web/src/store/authApi.ts`); the shared `(auth)/layout.tsx` from Task 5 (automatic via route-group nesting, no import needed).

- [ ] **Step 1: Rebuild the page**

```tsx
// apps/web/src/app/(auth)/register/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRegisterMutation } from '@/store/authApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

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
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Register</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none md:text-sm dark:bg-input/30"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as RegisterRole })}
          >
            <option value="patient">Patient</option>
            <option value="doctor">Doctor</option>
            <option value="lab">Lab</option>
          </select>
          {error ? <p className="text-sm text-destructive">Registration failed</p> : null}
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Registering…' : 'Register'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

The `<select>` stays a native element styled to match `Input`'s classes (`border-input`, `rounded-lg`, etc.) rather than building a new `Select` UI primitive for 3 static options — no dedicated select component exists in `components/ui/` and adding one isn't justified by this single use site. The role picker itself is unchanged (patient/doctor/lab; admin correctly stays excluded from self-registration).

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(auth)/register/page.tsx
git commit -m "feat(web): rebuild register page on existing UI primitives"
```

---

### Task 7: Manual QA pass

**Files:** none (verification-only task, no code changes)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev --workspace=apps/web`

- [ ] **Step 2: Visually confirm the new palette and both background components**

Open `http://localhost:3000/` in a browser:
- Confirm the page background, primary buttons, and role cards use the deep teal-blue (`#0B4F6C`) / light background (`#F7FAFC`) palette, not the old grayscale.
- Confirm the animated heartbeat line draws in once behind the hero on page load, and the gradient blob is visible top-right of the hero section.
- Confirm the `MedicalIconField` tiled icon texture is visible (faintly) across the whole page background. On a very tall or very wide window, check for a blank gap at the bottom/edge (the known, marked ceiling in Task 3) — if visible on your actual screen, bump `CELL_COUNT` up rather than treating it as a blocking bug.
- Open the browser console and confirm there is no React hydration-mismatch warning.

- [ ] **Step 3: Confirm the auth pages**

Open `/login` and `/register`: confirm both render inside the two-panel layout (form left, heartbeat panel right on desktop-width; form-only on a narrow/mobile-width window), and that the form fields are the styled `Input`/`Button`/`Card` components, not raw unstyled inputs.

- [ ] **Step 4: Confirm the redirect-by-role fix end-to-end**

Using a seeded demo account from CLAUDE.md §6.7 (e.g. `rahul.p@medlink.demo` / `Demo@123`), log in via `/login` and confirm the browser lands on `/dashboard/patient`, not back on `/`. If seed data / API aren't running locally, at minimum re-read `apps/web/src/app/(auth)/login/page.tsx` from Task 5 and confirm `DASHBOARD_PATH_BY_ROLE` covers all four roles and the fallback (`?? '/'`) only applies to an unrecognized role string.

- [ ] **Step 5: Spot-check one already-built dashboard page for automatic re-color**

Open `/dashboard/patient` (or any dashboard) and confirm it picked up the new palette automatically via the shared tokens, with no visibly broken layout, and that the `MedicalIconField` texture renders behind it too (confirming the global mount in Task 3 reaches pages outside `/`, `/login`, `/register`).

- [ ] **Step 6: Stop the dev server**

No commit for this task — it's a verification pass with no file changes.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-31-visual-reskin.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
