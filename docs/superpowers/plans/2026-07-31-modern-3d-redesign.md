# Modern 3D Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved spec at `docs/superpowers/specs/2026-07-31-modern-3d-redesign-design.md` — replace the cartoon-style Lottie illustrations (just shipped in PR #9) with large 3D Fluent Emoji icons + a CSS float animation, add a Card/Button depth system, and apply both consistently across all 4 dashboards plus the landing/auth pages.

**Architecture:** One new component `FloatingIcon3D` (static `<img>` + CSS glow badge + float animation) replaces `DashboardAnimation` everywhere. `EmptyState`'s signature changes to take an `icon` prop (each page now supplies its own icon per the spec's assignment table, instead of one shared hardcoded animation). `lottie-react` and all 5 old animation JSON files are deleted — nothing else in the codebase uses them.

**Tech Stack:** No new npm dependency. 9 static PNGs fetched once via `curl` from Microsoft's Fluent Emoji 3D set (MIT-licensed, `github.com/microsoft/fluentui-emoji`), committed to `apps/web/public/icons-3d/`.

## Global Constraints

- No new npm dependency. `lottie-react` is removed, not replaced with another animation library.
- Every `Button` that renders as a `Link` (via the `render` prop) must include `nativeButton={false}` — Base UI's `Button` defaults `nativeButton` to `true` and warns at runtime otherwise. This plan does not add any new `Button`-wraps-`Link` instances, but do not regress the existing ones in `patient/page.tsx` and `doctor/page.tsx` while editing those files.
- No changes to any RTK Query hook, socket subscription, mutation handler body, or business logic — presentation-only, same discipline as both prior visual plans.
- `apps/web` has no automated test runner — per-task verification is `npm run typecheck --workspace=apps/web` and `npm run build --workspace=apps/web`.
- `FloatingIcon3D` has no hooks (`useEffect`/`useState`) — do not add `'use client'` to it, matching the existing `button.tsx`/`card.tsx` convention (no directive unless the component itself needs one). The pages that use it already have `'use client'` from their own data-fetching hooks.
- The final QA task must NOT run `next build` in the same directory a `next dev` server is using — that corrupted the shared `.next` folder once already this session. Use a separate throwaway build/port instead.

---

### Task 1: Fetch 3D icon assets + `<FloatingIcon3D />` component + delete Lottie

**Files:**
- Create: `apps/web/public/icons-3d/{pill,stethoscope,test-tube,bar-chart,bell,calendar,microscope,shield,heart}.png` (9 files)
- Create: `apps/web/src/components/ui/floating-icon-3d.tsx`
- Modify: `apps/web/package.json` (remove `lottie-react`)
- Delete: `apps/web/src/components/ui/dashboard-animation.tsx`
- Delete: `apps/web/public/animations/*.json` (5 files)

**Interfaces:**
- Produces: `export function FloatingIcon3D({ src, size = 160, alt }: { src: string; size?: number; alt: string }): JSX.Element` — renders a circular gradient-glow badge of `size`×`size` px containing the icon at ~65% of that size, with a slow CSS float bob (`.icon-3d-float` class, defined in Task 3 — until Task 3 lands, the class simply has no matching rule, which is harmless).

- [ ] **Step 1: Fetch the 9 icons**

```bash
mkdir -p apps/web/public/icons-3d
curl -sL -o apps/web/public/icons-3d/pill.png "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Pill/3D/pill_3d.png"
curl -sL -o apps/web/public/icons-3d/stethoscope.png "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Stethoscope/3D/stethoscope_3d.png"
curl -sL -o apps/web/public/icons-3d/test-tube.png "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Test%20tube/3D/test_tube_3d.png"
curl -sL -o apps/web/public/icons-3d/bar-chart.png "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Bar%20chart/3D/bar_chart_3d.png"
curl -sL -o apps/web/public/icons-3d/bell.png "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Bell/3D/bell_3d.png"
curl -sL -o apps/web/public/icons-3d/calendar.png "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Calendar/3D/calendar_3d.png"
curl -sL -o apps/web/public/icons-3d/microscope.png "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Microscope/3D/microscope_3d.png"
curl -sL -o apps/web/public/icons-3d/shield.png "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Shield/3D/shield_3d.png"
curl -sL -o apps/web/public/icons-3d/heart.png "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Red%20heart/3D/red_heart_3d.png"
```

- [ ] **Step 2: Verify all 9 downloaded as real PNGs**

Run: `for f in apps/web/public/icons-3d/*.png; do file "$f"; done`
Expected: 9 lines, each reporting `PNG image data` (not `HTML document` — a bad URL would silently save an HTML error page instead of failing the `curl`).

- [ ] **Step 3: Write the component**

```tsx
// apps/web/src/components/ui/floating-icon-3d.tsx
export function FloatingIcon3D({ src, size = 160, alt }: { src: string; size?: number; alt: string }) {
  return (
    <div
      className="icon-3d-float relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5"
      style={{ height: size, width: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={size * 0.65} height={size * 0.65} />
    </div>
  );
}
```

- [ ] **Step 4: Delete the old Lottie plumbing**

```bash
rm apps/web/src/components/ui/dashboard-animation.tsx
rm apps/web/public/animations/*.json
npm uninstall lottie-react --workspace=apps/web
```

- [ ] **Step 5: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: FAILS — `empty-state.tsx` still imports the now-deleted `dashboard-animation.tsx`, and the 4 dashboard pages still import it too. This is expected at this point in the plan; Task 2 fixes `empty-state.tsx`, Tasks 4-7 fix the dashboard pages. Confirm the failure is specifically "Cannot find module '@/components/ui/dashboard-animation'" and nothing else — that isolates the deletion as clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/public/icons-3d apps/web/src/components/ui/floating-icon-3d.tsx apps/web/package.json apps/web/package-lock.json
git rm apps/web/src/components/ui/dashboard-animation.tsx apps/web/public/animations/*.json
git commit -m "feat(web): add FloatingIcon3D component, remove lottie-react"
```

---

### Task 2: Update `<EmptyState />` to take an `icon` prop

**Files:**
- Modify: `apps/web/src/components/ui/empty-state.tsx`

**Interfaces:**
- Consumes: `FloatingIcon3D` (Task 1).
- Produces: `export function EmptyState({ icon, message }: { icon: string; message: string }): JSX.Element` — breaking change from the old `{ message }`-only signature. Every call site (Tasks 4-7) must be updated to pass `icon`.

- [ ] **Step 1: Rewrite the component**

```tsx
// apps/web/src/components/ui/empty-state.tsx
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';

export function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <FloatingIcon3D src={icon} size={96} alt="" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
```

`alt=""` is deliberate: this icon is decorative next to the message text, which already conveys the meaning — an empty `alt` tells screen readers to skip it rather than announce a redundant description.

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: still fails, same reason as Task 1 Step 5 (dashboard pages not yet updated) — confirm the error no longer mentions `empty-state.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/empty-state.tsx
git commit -m "feat(web): EmptyState takes an icon prop instead of a hardcoded animation"
```

---

### Task 3: Depth system — Card hover, Button shadow, `.glass-panel`, float keyframes

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/ui/card.tsx`
- Modify: `apps/web/src/components/ui/button.tsx`

- [ ] **Step 1: Add the float keyframes and glass-panel utility to globals.css**

Add after the existing `@media (prefers-reduced-motion: reduce)` block (the one guarding `.heartbeat-path`, currently ending around line 149):

```css
@keyframes icon-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

.icon-3d-float {
  animation: icon-float 4s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .icon-3d-float {
    animation: none;
  }
}

.glass-panel {
  backdrop-filter: blur(12px);
  background-color: color-mix(in oklch, var(--card) 70%, transparent);
  border: 1px solid color-mix(in oklch, var(--foreground) 10%, transparent);
}
```

- [ ] **Step 2: Add hover lift to Card**

In `card.tsx`, find the `Card` function's className string (starts `"group/card flex flex-col gap-(--card-spacing)..."`). Add `transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10` to it:

```tsx
className={cn(
  "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
  className
)}
```

- [ ] **Step 3: Add shadow polish to Button**

In `button.tsx`, the shared `buttonVariants` base string starts `"group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none..."`. Add `shadow-sm hover:shadow-md` right after `transition-all`:

```tsx
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all shadow-sm hover:shadow-md outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  // ...variants object unchanged
```

Only the base string's first line changes — the `variants`/`size`/`defaultVariants` object below it is untouched.

- [ ] **Step 4: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: still fails on the same "Cannot find module '@/components/ui/dashboard-animation'" errors from the 4 not-yet-updated dashboard pages — confirm no *new* error appeared from this task's CSS/className edits (a Tailwind class typo won't fail typecheck/build, so also eyeball the diff for a stray unclosed string).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/components/ui/card.tsx apps/web/src/components/ui/button.tsx
git commit -m "feat(web): add Card/Button depth effects and glass-panel utility"
```

---

### Task 4: Patient dashboard — swap header + empty-state icon

**Files:**
- Modify: `apps/web/src/app/dashboard/patient/page.tsx`

**Interfaces:**
- Consumes: `FloatingIcon3D` (Task 1), `EmptyState` with new `icon` prop (Task 2).

- [ ] **Step 1: Replace the import and the two call sites**

Replace the import line:

```tsx
import { DashboardAnimation } from '@/components/ui/dashboard-animation';
```

with:

```tsx
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';
```

Replace the header animation call (inside `<div className="shrink-0">`):

```tsx
<DashboardAnimation path="/animations/patient-header.json" size={96} />
```

with:

```tsx
<FloatingIcon3D src="/icons-3d/pill.png" size={160} alt="" />
```

(The size grows from 96 to 160 — part of the "make it large and visible" feedback. The wrapping `<div className="shrink-0">` stays as-is; `FloatingIcon3D` is already `shrink-0` internally too, which is redundant but harmless.)

Replace the empty-state call:

```tsx
{data?.items.length === 0 ? <EmptyState message="No appointments yet." /> : null}
```

with:

```tsx
{data?.items.length === 0 ? <EmptyState icon="/icons-3d/calendar.png" message="No appointments yet." /> : null}
```

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: still fails — doctor/lab/admin pages not yet updated. Confirm `patient/page.tsx` no longer appears in the error output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/patient/page.tsx
git commit -m "feat(web): patient dashboard uses FloatingIcon3D"
```

---

### Task 5: Doctor dashboard — swap header + two empty-state icons

**Files:**
- Modify: `apps/web/src/app/dashboard/doctor/page.tsx`

**Interfaces:**
- Consumes: `FloatingIcon3D` (Task 1), `EmptyState` with new `icon` prop (Task 2).

- [ ] **Step 1: Replace the import and the three call sites**

Replace the import:

```tsx
import { DashboardAnimation } from '@/components/ui/dashboard-animation';
```

with:

```tsx
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';
```

Replace the header:

```tsx
<DashboardAnimation path="/animations/doctor-header.json" size={96} />
```

with:

```tsx
<FloatingIcon3D src="/icons-3d/stethoscope.png" size={160} alt="" />
```

Replace the "Pending requests" empty state:

```tsx
{data?.items.length === 0 ? <EmptyState message="No pending requests." /> : null}
```

with:

```tsx
{data?.items.length === 0 ? <EmptyState icon="/icons-3d/bell.png" message="No pending requests." /> : null}
```

Replace the "Confirmed appointments" empty state:

```tsx
{confirmedData?.items.length === 0 ? <EmptyState message="No confirmed appointments." /> : null}
```

with:

```tsx
{confirmedData?.items.length === 0 ? <EmptyState icon="/icons-3d/calendar.png" message="No confirmed appointments." /> : null}
```

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: still fails — lab/admin pages not yet updated. Confirm `doctor/page.tsx` no longer appears in the error output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/doctor/page.tsx
git commit -m "feat(web): doctor dashboard uses FloatingIcon3D"
```

---

### Task 6: Lab dashboard — swap header + two empty-state icons

**Files:**
- Modify: `apps/web/src/app/dashboard/lab/page.tsx`

**Interfaces:**
- Consumes: `FloatingIcon3D` (Task 1), `EmptyState` with new `icon` prop (Task 2).

- [ ] **Step 1: Replace the import and the three call sites**

Replace the import:

```tsx
import { DashboardAnimation } from '@/components/ui/dashboard-animation';
```

with:

```tsx
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';
```

Replace the header:

```tsx
<DashboardAnimation path="/animations/lab-header.json" size={96} />
```

with:

```tsx
<FloatingIcon3D src="/icons-3d/test-tube.png" size={160} alt="" />
```

Replace the referrals empty state:

```tsx
{referralsData?.items.length === 0 ? <EmptyState message="No incoming referrals yet." /> : null}
```

with:

```tsx
{referralsData?.items.length === 0 ? <EmptyState icon="/icons-3d/microscope.png" message="No incoming referrals yet." /> : null}
```

Replace the bookings empty state (reusing the test-tube icon already fetched in Task 1 — this list is lab bookings, the same domain as the header, so no 10th icon is needed):

```tsx
{data?.items.length === 0 ? <EmptyState message="No bookings yet." /> : null}
```

with:

```tsx
{data?.items.length === 0 ? <EmptyState icon="/icons-3d/test-tube.png" message="No bookings yet." /> : null}
```

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: still fails — admin page not yet updated. Confirm `lab/page.tsx` no longer appears in the error output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/lab/page.tsx
git commit -m "feat(web): lab dashboard uses FloatingIcon3D"
```

---

### Task 7: Admin dashboard — swap header + empty-state icon

**Files:**
- Modify: `apps/web/src/app/dashboard/admin/page.tsx`

**Interfaces:**
- Consumes: `FloatingIcon3D` (Task 1), `EmptyState` with new `icon` prop (Task 2).

- [ ] **Step 1: Replace the import and the two call sites**

Replace the import:

```tsx
import { DashboardAnimation } from '@/components/ui/dashboard-animation';
```

with:

```tsx
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';
```

Replace the header:

```tsx
<DashboardAnimation path="/animations/admin-header.json" size={96} />
```

with:

```tsx
<FloatingIcon3D src="/icons-3d/bar-chart.png" size={160} alt="" />
```

Replace the verifications empty state:

```tsx
{verifications?.items.length === 0 ? <EmptyState message={`No pending ${role}s.`} /> : null}
```

with:

```tsx
{verifications?.items.length === 0 ? <EmptyState icon="/icons-3d/shield.png" message={`No pending ${role}s.`} /> : null}
```

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both PASS — this was the last of the 4 dashboard pages referencing the deleted `dashboard-animation.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/admin/page.tsx
git commit -m "feat(web): admin dashboard uses FloatingIcon3D"
```

---

### Task 8: Landing page hero — add the 3D heart icon

**Files:**
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: `FloatingIcon3D` (Task 1).

- [ ] **Step 1: Import and place the icon in the hero section**

Add the import alongside the existing `HeartbeatBackground` import:

```tsx
import { FloatingIcon3D } from "@/components/ui/floating-icon-3d";
```

In the hero `<section>`, the current structure is:

```tsx
<section className="relative overflow-hidden px-6 py-24 text-center">
  <HeartbeatBackground />
  <div className="relative mx-auto max-w-2xl space-y-4">
    <h1 className="text-4xl font-bold tracking-tight text-foreground">MedLink</h1>
```

Add the icon directly above the `<h1>`, inside the same `relative` wrapper div, so it sits above `HeartbeatBackground` in the stacking order but before the heading in reading order:

```tsx
<section className="relative overflow-hidden px-6 py-24 text-center">
  <HeartbeatBackground />
  <div className="relative mx-auto max-w-2xl space-y-4">
    <div className="mx-auto flex justify-center">
      <FloatingIcon3D src="/icons-3d/heart.png" size={140} alt="" />
    </div>
    <h1 className="text-4xl font-bold tracking-tight text-foreground">MedLink</h1>
```

(Only the two new lines — the wrapping `<div className="mx-auto flex justify-center">...</div>` — are added; the `<h1>` and everything after it in that block is unchanged.)

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): add 3D heart icon to landing page hero"
```

---

### Task 9: Auth pages — 3D icon + glass panel on the side panel

**Files:**
- Modify: `apps/web/src/app/(auth)/layout.tsx`

**Interfaces:**
- Consumes: `FloatingIcon3D` (Task 1), `.glass-panel` utility (Task 3).

- [ ] **Step 1: Replace the file**

The current file is:

```tsx
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

Replace it with:

```tsx
import { HeartbeatBackground } from "@/components/ui/heartbeat-background";
import { FloatingIcon3D } from "@/components/ui/floating-icon-3d";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 grid-cols-1 md:grid-cols-2">
      <div className="flex items-center justify-center p-6">{children}</div>
      <div className="glass-panel relative hidden items-center justify-center overflow-hidden bg-primary/5 p-6 md:flex">
        <HeartbeatBackground />
        <div className="relative flex flex-col items-center gap-4">
          <FloatingIcon3D src="/icons-3d/stethoscope.png" size={140} alt="" />
          <p className="max-w-xs text-center text-lg font-medium text-primary">
            Care, connected.
          </p>
        </div>
      </div>
    </div>
  );
}
```

(`.glass-panel` adds on top of `bg-primary/5`, not replacing it — `color-mix` on `--card` layers over the existing tint. The `<p>` moves inside a new wrapping `<div>` alongside the icon, dropping its own `relative` since the wrapper now carries it.)

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(auth)/layout.tsx"
git commit -m "feat(web): add 3D icon and glass panel to auth side panel"
```

---

### Task 10: Manual QA pass (separate build, does not touch the live dev server)

**Files:** none (verification-only task, no code changes)

- [ ] **Step 1: Build and serve on a separate port**

From `apps/web`, run a standalone build bound to port 3001 — this must NOT be run in a directory where a `next dev` server is currently running, to avoid repeating the `.next` corruption from earlier this session:

```bash
npm run build --workspace=apps/web
PORT=3001 npm run start --workspace=apps/web &
```

Confirm it's up: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001` (expect `200`).

If a `next dev` server is already running on port 3000 for this worktree, leave it alone — this task's `build`/`start` run against port 3001 independently and do not share a running dev process's `.next` folder mid-flight.

- [ ] **Step 2: Confirm the backend is reachable**

`docker compose up -d mongo redis api ai` (if not already running), then `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/doctors` (expect `200`).

- [ ] **Step 3: Drive each dashboard with a headless browser at desktop and mobile widths**

Reuse the throwaway-Playwright pattern from earlier this session (a scratch-dir `npm install playwright` + a small `.mjs` script), pointed at `http://localhost:3001` instead of 3000. For each of the 4 seeded demo accounts (`rahul.p@medlink.demo`, `meera.d@medlink.demo`, `healthfirst.l@medlink.demo`, `admin@medlink.demo`, all password `Demo@123`):

1. Log in, wait for navigation to `/dashboard/{role}`.
2. Screenshot at desktop width (1280×800) and mobile width (390×844).
3. Confirm `page.on('console', ...)` / `page.on('pageerror', ...)` collected zero errors/warnings.

- [ ] **Step 4: Visually confirm, per dashboard**

- Each header shows a large (160px) 3D icon with a visible float bob and a soft gradient glow behind it — not the old small (96px) cartoon animation.
- Any empty list shows its assigned 3D icon (per Task 4-7's assignments) above the message, not blank space.
- Hovering a Card visibly lifts (subtle translateY + shadow) — check via `page.hover()` + a screenshot, or note it as a code-level confirmation if the QA script doesn't simulate hover.
- Landing page hero shows the heart icon above "MedLink"; login/register side panel shows the stethoscope icon and a visibly blurred/translucent panel background.

- [ ] **Step 5: Stop the standalone server and the stack**

```bash
kill %1  # the backgrounded `next start` from Step 1
docker compose down  # or leave running if continuing to iterate
```

No commit for this task — verification-only.
