# MedLink Dashboard Redesign — Card Layout + Lottie Animations

## Context

The visual reskin (PR #7, merged; PR #8, follow-up fixes) deliberately left the
4 role dashboards (`apps/web/src/app/dashboard/{patient,doctor,lab,admin}/page.tsx`)
untouched beyond automatic token re-coloring — they only get the new palette
for free via shared CSS variables. Looking at the actual rendered result, the
user found this insufficient: "lots of space but small text and text field...
add some color to it, looking colorless." Confirmed by reading all 4 files:
every one of them renders plain `border p-3 rounded` divs with default text
sizing, raw `<button>`/`<a>` elements, and zero use of the `Card` component
or the new `--primary`/`--accent` teal tokens anywhere.

This spec covers a real content/layout redesign of those 4 pages — a
different, larger scope than the reskin's original "tokens only" boundary,
explicitly requested as a follow-up.

## Goals

1. Rebuild every list row on all 4 dashboards as a `Card` (matching the
   landing page's role-card style) with larger text and colored status
   badges, replacing plain bordered divs and raw status text.
2. Add a themed, animated (Lottie) header illustration to each of the 4
   dashboards.
3. Add a shared animated empty-state illustration everywhere a list can be
   empty, replacing bare "No X yet." text (and adding that fallback message
   to two spots that are currently missing it entirely — the doctor
   dashboard's pending-requests and confirmed-appointments sections).
4. Replace every raw `<button>`/`<a>` action (Confirm, Reject, Cancel,
   Approve, Mark collected, Write prescription, Rate, role-filter toggle)
   with the existing `Button` component.

## Non-goals

- No change to any data-fetching logic, RTK Query hooks, sockets, or
  business logic on any of the 4 pages — this is presentation-only.
- No change to the file-upload flow on the lab dashboard (the native
  `<input type="file">` behavior stays exactly as-is, only its visual
  container changes).
- No new illustrations beyond the 5 already sourced (4 header animations +
  1 shared empty-state animation) — every empty list across all 4
  dashboards reuses the same `empty-state.json`, not a unique animation per
  context.

## Design

### 1. New dependency

Add `lottie-react` (thin wrapper around `lottie-web`, MIT-licensed) — the
only new npm dependency in this pass. All 5 animation files are already
committed at `apps/web/public/animations/{doctor,patient,lab,admin}-header.json`
and `apps/web/public/animations/empty-state.json`, sourced from LottieFiles'
free tier and copied in directly (no watermarks, no attribution required
per LottieFiles' Simple License).

### 2. Two new shared components (`components/ui/`)

- **`<DashboardAnimation path="/animations/x.json" size={96} />`** — thin
  wrapper around `lottie-react`'s `<Lottie path={path} loop autoplay
  style={{ height: size, width: size }} />`. Fetches the JSON at runtime
  from `/public/animations/`, not bundled into the JS bundle.
- **`<EmptyState message="No appointments yet." />`** — renders
  `<DashboardAnimation path="/animations/empty-state.json" size={120} />`
  above the message text, centered, vertical padding. Always uses the one
  shared empty-state animation — no per-context variants.
- **`<StatusBadge status="confirmed" />`** — one small reusable primitive
  (same `class-variance-authority` pattern as the existing `Button`),
  mapping a status string to a colored pill. Since this project has several
  different status enums across models (`Appointment.status`,
  `LabBooking.status`, `LabReferral.status`), the mapping is a plain lookup
  object keyed by every status string actually used across all 4
  dashboards, grouped into 4 semantic color buckets, with a neutral
  fallback for anything unrecognized (so an unmapped future status never
  crashes or renders unstyled):

  | Bucket | Statuses | Style |
  |---|---|---|
  | Pending / action-needed | `requested`, `sent` | amber |
  | Active / in-progress | `confirmed`, `opened`, `booked`, `sample_collected`, `approved` | teal (`--primary`) |
  | Done / success | `completed`, `report_ready`, `closed` | green |
  | Negative | `rejected`, `cancelled`, `no_show` | red |
  | *(fallback)* | anything else | neutral gray |

  Display label is the status string with underscores replaced by spaces
  and the first letter capitalized (`sample_collected` → "Sample
  collected") — no per-status custom label table.

### 3. Per-dashboard changes

Every page keeps its exact current data-fetching hooks and handlers.
Only the JSX changes:

- **Header (all 4 pages):** the bare `<h1>` becomes a flex row: the page's
  themed `<DashboardAnimation path="/animations/{role}-header.json"
  size={96} />` beside the existing `<h1>` and the existing
  Notifications/other links (unchanged text/logic).
- **Patient (`dashboard/patient/page.tsx`):** each appointment row becomes a
  `Card`; date/time at `text-lg`; `<StatusBadge status={appt.status} />`
  replacing `Status: {appt.status}` text; Cancel becomes
  `<Button variant="destructive" size="sm">`; the Rate link becomes
  `<Button variant="outline" size="sm" render={<Link .../>}>`. Empty list
  → `<EmptyState message="No appointments yet." />` (this page already had
  no empty-state message at all — the gap that started this whole
  redesign request — now fixed).
- **Doctor (`dashboard/doctor/page.tsx`):** both the "Pending requests" and
  "Confirmed appointments" sections get the same Card/StatusBadge/Button
  treatment; Confirm becomes `<Button size="sm">` (default/primary
  variant), Reject becomes `<Button variant="destructive" size="sm">`
  (consistent with Admin's Reject below — declining/rejecting is always
  the destructive variant across every dashboard), "Write prescription"
  becomes `<Button variant="outline" size="sm" render={<Link .../>}>`.
  Both sections currently have **no empty-state
  message at all** (confirmed by reading the file) — add
  `<EmptyState message="No pending requests." />` and `<EmptyState
  message="No confirmed appointments." />` respectively.
- **Lab (`dashboard/lab/page.tsx`):** referral rows and booking rows both
  become Cards with `<StatusBadge>`; "Mark sample collected" becomes
  `<Button size="sm">`; the file-upload `<label>`/`<input type="file">`
  pair is visually wrapped in the Card but functionally untouched. The
  existing "No incoming referrals yet." and "No bookings yet." plain-text
  messages become `<EmptyState>` calls (these two already exist as
  messages — just upgrading their presentation, not adding new logic).
- **Admin (`dashboard/admin/page.tsx`):** the Doctors/Labs role-filter
  toggle becomes two `<Button variant={role === 'doctor' ? 'default' :
  'outline'} size="sm">` (same click handlers). Verification rows become
  Cards; Approve/Reject become `<Button size="sm">` /
  `<Button variant="destructive" size="sm">`. The existing "No pending
  {role}s." message becomes `<EmptyState>`. The Analytics section is
  wrapped in one `Card` with a `CardHeader`/`CardTitle` ("Analytics") for
  visual consistency; its internal stat lines stay plain text — no
  per-stat badges or charts, that's out of scope.

### 4. Testing

Same approach as the rest of this reskin: `typecheck` + `build` per task.
Given this touches real interactive flows (confirm/reject, cancel, mark-
collected/upload, approve/reject), the final task is a logged-in headless-
browser walkthrough (the Playwright script already used earlier this
session) exercising each dashboard with a seeded account, screenshotted —
not just a static render check.
