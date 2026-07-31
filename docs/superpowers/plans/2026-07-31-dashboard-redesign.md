# MedLink Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved spec at `docs/superpowers/specs/2026-07-31-dashboard-redesign-design.md` — rebuild all 4 role dashboards (patient/doctor/lab/admin) as Card-based layouts with colored status badges, animated headers, and existing `Button` components, replacing today's plain-text/raw-element pages.

**Architecture:** Three new small shared components in `components/ui/` (`DashboardAnimation`, `EmptyState`, `StatusBadge`), consumed by all 4 dashboard pages. No data-fetching, RTK Query, or socket logic changes on any page — this is presentation-only, same discipline as the prior visual-reskin plan.

**Tech Stack:** One new dependency, `lottie-react` (v2.4.1, MIT-licensed, confirmed React 19-compatible via its `peerDependencies`: `"react": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"`). Its `Lottie` component takes a parsed `animationData` object, not a URL/path — there is no built-in path-fetching prop, confirmed against the package's own `.d.ts` — so `DashboardAnimation` fetches and parses the JSON itself with `useEffect`/`fetch`.

## Global Constraints

- No new npm dependency beyond `lottie-react` — everything else (Card, Button, existing RTK Query hooks) is already in the codebase.
- **Every `Button` that renders as a `Link` (via the `render` prop) must include `nativeButton={false}`.** Base UI's `Button` defaults `nativeButton` to `true` and emits a runtime console warning if the rendered element isn't a real `<button>`. This exact bug was found and fixed once already this session (landing page CTA) — do not reintroduce it on any of the two new `Button`-wraps-`Link` instances this plan adds (patient dashboard's "Rate this appointment", doctor dashboard's "Write prescription").
- No changes to any RTK Query hook, socket subscription, mutation handler body, or business logic on any of the 4 dashboard pages in this plan — only JSX/presentation changes. If a handler function's *body* would need to change to implement something in this plan, stop and report it — that's out of scope.
- `apps/web` has no automated test runner — per-task verification is `npm run typecheck --workspace=apps/web` and `npm run build --workspace=apps/web`.
- All 5 Lottie animation JSON files already exist and are committed at `apps/web/public/animations/{doctor,patient,lab,admin}-header.json` and `apps/web/public/animations/empty-state.json` — verify their presence, do not recreate or re-source them.
- `StatusBadge` must render a safe, styled fallback (neutral gray) for any status string not in its lookup table — never throw or render unstyled for an unrecognized value, since this project has several independent status enums (`Appointment.status`, `LabBooking.status`, `LabReferral.status`) sharing one component.
- Match the existing `components/ui/*.tsx` file convention: no `'use client'` directive unless the component itself uses a hook (per the existing `button.tsx`/`card.tsx`, which have none).

---

### Task 1: Add `lottie-react` + `<DashboardAnimation />` component

**Files:**
- Modify: `apps/web/package.json` (add dependency)
- Create: `apps/web/src/components/ui/dashboard-animation.tsx`

**Interfaces:**
- Produces: `export function DashboardAnimation({ path, size = 96 }: { path: string; size?: number }): JSX.Element` — fetches the Lottie JSON at `path` client-side, renders it via `lottie-react`'s `<Lottie animationData={...} loop autoplay>` at `size`×`size` pixels. Renders an empty placeholder `<div>` of the same dimensions while the fetch is in flight (avoids layout shift).

- [ ] **Step 1: Add the dependency**

```bash
npm install lottie-react@2.4.1 --workspace=apps/web
```

- [ ] **Step 2: Write the component**

```tsx
// apps/web/src/components/ui/dashboard-animation.tsx
'use client';

import Lottie from 'lottie-react';
import { useEffect, useState } from 'react';

export function DashboardAnimation({ path, size = 96 }: { path: string; size?: number }) {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(path)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setAnimationData(data);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!animationData) {
    return <div style={{ height: size, width: size }} />;
  }

  return <Lottie animationData={animationData} loop autoplay style={{ height: size, width: size }} />;
}
```

This component has a `useEffect`/`useState`, so it needs `'use client'` (unlike `button.tsx`/`card.tsx`, which have neither hooks nor the directive).

- [ ] **Step 3: Verify the 5 animation files exist and are valid**

Run: `for f in apps/web/public/animations/*.json; do python3 -c "import json; json.load(open('$f'))" && echo "$f OK"; done`
Expected: 5 lines, each ending "OK" (`admin-header.json`, `doctor-header.json`, `empty-state.json`, `lab-header.json`, `patient-header.json`). These files already exist from the design spec commit — do not create or modify them.

- [ ] **Step 4: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean. (No page consumes `DashboardAnimation` yet — this only confirms it compiles standalone and `lottie-react` resolves.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/components/ui/dashboard-animation.tsx
git commit -m "feat(web): add lottie-react and DashboardAnimation component"
```

---

### Task 2: `<EmptyState />` component

**Files:**
- Create: `apps/web/src/components/ui/empty-state.tsx`

**Interfaces:**
- Consumes: `DashboardAnimation` (Task 1).
- Produces: `export function EmptyState({ message }: { message: string }): JSX.Element` — always renders the one shared `/animations/empty-state.json` at 120px, centered, above the message text. No per-context animation variants.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/ui/empty-state.tsx
import { DashboardAnimation } from '@/components/ui/dashboard-animation';

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <DashboardAnimation path="/animations/empty-state.json" size={120} />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/empty-state.tsx
git commit -m "feat(web): add EmptyState component"
```

---

### Task 3: `<StatusBadge />` component

**Files:**
- Create: `apps/web/src/components/ui/status-badge.tsx`

**Interfaces:**
- Produces: `export function StatusBadge({ status }: { status: string }): JSX.Element` — renders a colored pill. Status → color-bucket mapping is a plain lookup object (not `class-variance-authority`, since the "unrecognized status → neutral fallback" requirement doesn't map onto `cva`'s closed-variant model), with a fallback for any unmapped string.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/ui/status-badge.tsx
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  sent: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-primary/10 text-primary',
  opened: 'bg-primary/10 text-primary',
  booked: 'bg-primary/10 text-primary',
  sample_collected: 'bg-primary/10 text-primary',
  approved: 'bg-primary/10 text-primary',
  completed: 'bg-green-100 text-green-800',
  report_ready: 'bg-green-100 text-green-800',
  closed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-red-100 text-red-800',
  no_show: 'bg-red-100 text-red-800',
};

function formatStatusLabel(status: string): string {
  const spaced = status.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', style)}>
      {formatStatusLabel(status)}
    </span>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/status-badge.tsx
git commit -m "feat(web): add StatusBadge component"
```

---

### Task 4: Rebuild the patient dashboard

**Files:**
- Modify: `apps/web/src/app/dashboard/patient/page.tsx`

**Interfaces:**
- Consumes: `DashboardAnimation` (Task 1), `EmptyState` (Task 2), `StatusBadge` (Task 3), `Card`/`CardContent` (`components/ui/card.tsx`), `Button` (`components/ui/button.tsx`).

- [ ] **Step 1: Replace the page**

This page currently has **no empty-state message at all** when the appointment list is empty — that gap is what started this whole redesign request. Fix it here.

```tsx
// apps/web/src/app/dashboard/patient/page.tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useListMyAppointmentsQuery, useCancelAppointmentMutation } from '@/store/appointmentsApi';
import { useListMyNotificationsQuery } from '@/store/notificationsApi';
import { getSocket } from '@/lib/socket';
import { DashboardAnimation } from '@/components/ui/dashboard-animation';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function PatientDashboard() {
  const { data, isLoading, refetch } = useListMyAppointmentsQuery();
  const [cancelAppointment] = useCancelAppointmentMutation();
  const { data: notifData } = useListMyNotificationsQuery();

  useEffect(() => {
    // Live status updates when the doctor confirms/rejects. The server derives this
    // socket's room from the auth cookie; the interval is a fallback for a dropped
    // connection, mirroring the doctor dashboard.
    const socket = getSocket();
    socket.on('appointment:updated', () => refetch());
    const interval = setInterval(refetch, 10000);
    return () => {
      socket.off('appointment:updated');
      clearInterval(interval);
    };
  }, [refetch]);

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading…</main>;

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DashboardAnimation path="/animations/patient-header.json" size={96} />
          <h1 className="text-2xl font-bold">My appointments</h1>
        </div>
        <Link href="/notifications" className="text-sm underline">
          Notifications{notifData && notifData.unreadCount > 0 ? ` (${notifData.unreadCount} unread)` : ''}
        </Link>
      </div>
      {data?.items.length === 0 ? <EmptyState message="No appointments yet." /> : null}
      {data?.items.map((appt) => (
        <Card key={appt._id}>
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <p className="text-lg">{new Date(appt.slotStart).toLocaleString()}</p>
              <StatusBadge status={appt.status} />
            </div>
            <div className="flex items-center gap-2">
              {appt.status === 'confirmed' || appt.status === 'requested' ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    // A rejected cancel (e.g. inside the 2-hour cutoff) must not become an
                    // unhandled rejection; refetch either way so the list reflects reality.
                    try {
                      await cancelAppointment(appt._id).unwrap();
                    } catch {
                      /* error state is already tracked by the mutation hook */
                    }
                    refetch();
                  }}
                >
                  Cancel
                </Button>
              ) : null}
              {appt.status === 'completed' && !appt.rated ? (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/appointments/${appt._id}/rate`} />}
                >
                  Rate this appointment
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/patient/page.tsx
git commit -m "feat(web): rebuild patient dashboard with Card layout, StatusBadge, and empty state"
```

---

### Task 5: Rebuild the doctor dashboard

**Files:**
- Modify: `apps/web/src/app/dashboard/doctor/page.tsx`

**Interfaces:**
- Consumes: `DashboardAnimation` (Task 1), `EmptyState` (Task 2), `StatusBadge` (Task 3), `Card`/`CardContent`, `Button`.

- [ ] **Step 1: Replace the page**

Both sections on this page currently have **no empty-state message at all** — add one to each.

```tsx
// apps/web/src/app/dashboard/doctor/page.tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  useListMyAppointmentsQuery,
  useConfirmAppointmentMutation,
  useRejectAppointmentMutation,
} from '@/store/appointmentsApi';
import { useListMyNotificationsQuery } from '@/store/notificationsApi';
import { getSocket } from '@/lib/socket';
import { DashboardAnimation } from '@/components/ui/dashboard-animation';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function DoctorDashboard() {
  const { data, isLoading, refetch } = useListMyAppointmentsQuery({ status: 'requested' });
  const { data: notifData } = useListMyNotificationsQuery();
  const {
    data: confirmedData,
    isLoading: isConfirmedLoading,
    refetch: refetchConfirmed,
  } = useListMyAppointmentsQuery({ status: 'confirmed' });
  const [confirmAppointment] = useConfirmAppointmentMutation();
  const [rejectAppointment] = useRejectAppointmentMutation();

  useEffect(() => {
    // The server derives this socket's room from the auth cookie, so no user id is
    // needed here; the interval below is a fallback for a dropped socket connection.
    const socket = getSocket();
    const onUpdated = () => {
      refetch();
      refetchConfirmed();
    };
    socket.on('appointment:updated', onUpdated);
    const interval = setInterval(onUpdated, 10000);
    return () => {
      socket.off('appointment:updated', onUpdated);
      clearInterval(interval);
    };
  }, [refetch, refetchConfirmed]);

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading…</main>;

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DashboardAnimation path="/animations/doctor-header.json" size={96} />
          <h1 className="text-2xl font-bold">Doctor Dashboard</h1>
        </div>
        <div className="flex gap-3">
          <Link href="/notifications" className="text-sm underline">
            Notifications{notifData && notifData.unreadCount > 0 ? ` (${notifData.unreadCount} unread)` : ''}
          </Link>
          <Link href="/dashboard/doctor/referrals" className="text-sm underline">
            Lab referrals sent
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold">Pending requests</h2>
        {data?.items.length === 0 ? <EmptyState message="No pending requests." /> : null}
        {data?.items.map((appt) => (
          <Card key={appt._id}>
            <CardContent className="flex items-center justify-between gap-4">
              <div>
                <p className="text-lg">{new Date(appt.slotStart).toLocaleString()}</p>
                <StatusBadge status={appt.status} />
                {appt.triageSummary && appt.triageSummary.length > 0 ? (
                  <p className="text-sm text-muted-foreground">Symptoms: {appt.triageSummary.join(', ')}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={async () => { await confirmAppointment(appt._id).unwrap(); refetch(); refetchConfirmed(); }}
                >
                  Confirm
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => { await rejectAppointment({ id: appt._id, reason: 'Not available' }).unwrap(); refetch(); }}
                >
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold">Confirmed appointments</h2>
        {isConfirmedLoading ? <p>Loading…</p> : null}
        {confirmedData?.items.length === 0 ? <EmptyState message="No confirmed appointments." /> : null}
        {confirmedData?.items.map((appt) => (
          <Card key={appt._id}>
            <CardContent className="flex items-center justify-between gap-4">
              <div>
                <p className="text-lg">{new Date(appt.slotStart).toLocaleString()}</p>
                <StatusBadge status={appt.status} />
                {appt.triageSummary && appt.triageSummary.length > 0 ? (
                  <p className="text-sm text-muted-foreground">Symptoms: {appt.triageSummary.join(', ')}</p>
                ) : null}
              </div>
              {appt.status === 'confirmed' ? (
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/appointments/${appt._id}/prescribe`} />}
                >
                  Write prescription
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/doctor/page.tsx
git commit -m "feat(web): rebuild doctor dashboard with Card layout, StatusBadge, and empty states"
```

---

### Task 6: Rebuild the lab dashboard

**Files:**
- Modify: `apps/web/src/app/dashboard/lab/page.tsx`

**Interfaces:**
- Consumes: `DashboardAnimation` (Task 1), `EmptyState` (Task 2), `StatusBadge` (Task 3), `Card`/`CardContent`, `Button`.

- [ ] **Step 1: Replace the page**

The file-upload `<label>`/`<input type="file">` pair and every handler function body stay byte-identical — only the surrounding markup (divs/lists → Cards, raw buttons → `Button`, raw status text → `StatusBadge`, plain empty messages → `EmptyState`) changes.

```tsx
// apps/web/src/app/dashboard/lab/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useListMyLabBookingsQuery, useUpdateBookingStatusMutation } from '@/store/labBookingsApi';
import { useListReferralsForLabQuery } from '@/store/labReferralsApi';
import { useListMyNotificationsQuery } from '@/store/notificationsApi';
import { DashboardAnimation } from '@/components/ui/dashboard-animation';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function LabDashboardPage() {
  const { data, isLoading, refetch } = useListMyLabBookingsQuery();
  const [updateStatus] = useUpdateBookingStatusMutation();
  const { data: referralsData } = useListReferralsForLabQuery();
  const { data: notifData } = useListMyNotificationsQuery();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function markCollected(id: string) {
    await updateStatus({ id, status: 'sample_collected' }).unwrap();
    refetch();
  }

  async function onUploadReport(id: string, file: File) {
    setUploadingId(id);
    setUploadError(null);
    const formData = new FormData();
    formData.append('report', file);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/lab-bookings/${id}/report`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) {
        setUploadError('Upload failed — please try again.');
        return;
      }
      refetch();
    } catch {
      setUploadError('Upload failed — please try again.');
    } finally {
      setUploadingId(null);
    }
  }

  if (isLoading) return <main className="max-w-3xl mx-auto mt-12">Loading...</main>;

  return (
    <main className="max-w-3xl mx-auto mt-12 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DashboardAnimation path="/animations/lab-header.json" size={96} />
          <h1 className="text-2xl font-bold">Lab Dashboard</h1>
        </div>
        <Link href="/notifications" className="text-sm underline">
          Notifications{notifData && notifData.unreadCount > 0 ? ` (${notifData.unreadCount} unread)` : ''}
        </Link>
      </div>
      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Incoming referrals</h2>
        {referralsData?.items.length === 0 ? <EmptyState message="No incoming referrals yet." /> : null}
        {referralsData?.items.map((r) => (
          <Card key={r._id}>
            <CardContent>
              <p className="text-lg">Tests: {r.suggestedTestCodes.join(', ')}</p>
              <StatusBadge status={r.status} />
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="space-y-2">
        {data?.items.length === 0 ? <EmptyState message="No bookings yet." /> : null}
        {data?.items.map((booking) => (
          <Card key={booking._id}>
            <CardContent className="space-y-2">
              <p className="text-lg">
                {new Date(booking.scheduledAt).toLocaleString()} — {booking.testCodes.join(', ')} — ₹{booking.totalPrice}
              </p>
              <div className="flex items-center gap-2">
                <StatusBadge status={booking.status} />
                {booking.homeCollection ? (
                  <span className="text-sm text-muted-foreground">(home collection)</span>
                ) : null}
              </div>
              {booking.status === 'booked' ? (
                <Button size="sm" onClick={() => markCollected(booking._id)}>
                  Mark sample collected
                </Button>
              ) : null}
              {booking.status === 'sample_collected' ? (
                <label className="text-sm underline cursor-pointer">
                  {uploadingId === booking._id ? 'Uploading...' : 'Upload report (PDF)'}
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void onUploadReport(booking._id, file);
                    }}
                  />
                </label>
              ) : null}
              {booking.status === 'report_ready' ? <p className="text-sm text-green-700">Report uploaded ✓</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/lab/page.tsx
git commit -m "feat(web): rebuild lab dashboard with Card layout, StatusBadge, and empty states"
```

---

### Task 7: Rebuild the admin dashboard

**Files:**
- Modify: `apps/web/src/app/dashboard/admin/page.tsx`

**Interfaces:**
- Consumes: `DashboardAnimation` (Task 1), `EmptyState` (Task 2), `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Button`. (No `StatusBadge` here — the verifications list is already pre-filtered to `status: 'pending'`, so every row is redundantly "pending"; the spec scopes `StatusBadge` to pages with mixed/varying status values.)

- [ ] **Step 1: Replace the page**

```tsx
// apps/web/src/app/dashboard/admin/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useListVerificationsQuery, useDecideVerificationMutation, useGetAnalyticsQuery } from '@/store/adminApi';
import { DashboardAnimation } from '@/components/ui/dashboard-animation';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AdminDashboardPage() {
  const [role, setRole] = useState<'doctor' | 'lab'>('doctor');
  const { data: verifications, isLoading: loadingVerifications, refetch } = useListVerificationsQuery({ role, status: 'pending' });
  const [decide] = useDecideVerificationMutation();
  const { data: analytics, isLoading: loadingAnalytics } = useGetAnalyticsQuery();

  return (
    <main className="max-w-3xl mx-auto mt-12 space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DashboardAnimation path="/animations/admin-header.json" size={96} />
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        </div>
        <Link href="/notifications" className="text-sm underline">Notifications</Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Pending verifications</h2>
        <div className="flex gap-2">
          <Button variant={role === 'doctor' ? 'default' : 'outline'} size="sm" onClick={() => setRole('doctor')}>
            Doctors
          </Button>
          <Button variant={role === 'lab' ? 'default' : 'outline'} size="sm" onClick={() => setRole('lab')}>
            Labs
          </Button>
        </div>
        {loadingVerifications ? <p>Loading…</p> : null}
        {verifications?.items.length === 0 ? <EmptyState message={`No pending ${role}s.`} /> : null}
        {verifications?.items.map((p) => (
          <Card key={p._id}>
            <CardContent className="flex items-center justify-between gap-4">
              <span>{p._id}</span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    await decide({ role, id: p._id, decision: 'approved' }).unwrap();
                    refetch();
                  }}
                >
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    await decide({ role, id: p._id, decision: 'rejected', reason: 'Does not meet verification requirements' }).unwrap();
                    refetch();
                  }}
                >
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Analytics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingAnalytics ? <p>Loading…</p> : null}
          {analytics ? (
            <div className="space-y-2">
              <p>Patients: {analytics.totalRegistrations.patients} · Doctors: {analytics.totalRegistrations.doctors} · Labs: {analytics.totalRegistrations.labs}</p>
              <div>
                <p className="font-semibold">Appointments per day (last 14 days)</p>
                {analytics.appointmentsPerDay.map((d) => (
                  <p key={d.date} className="text-sm text-muted-foreground">{d.date}: {d.count}</p>
                ))}
              </div>
              <div>
                <p className="font-semibold">Top specialties</p>
                {analytics.topSpecialties.map((s) => (
                  <p key={s.specialty} className="text-sm text-muted-foreground">{s.specialty}: {s.count}</p>
                ))}
              </div>
              <p>
                Triage → booking conversion: {analytics.triageToBookingConversion.conversionRate}%
                {' '}({analytics.triageToBookingConversion.sessionsWithBooking}/{analytics.triageToBookingConversion.totalSessions})
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/admin/page.tsx
git commit -m "feat(web): rebuild admin dashboard with Card layout and empty state"
```

---

### Task 8: Manual QA pass (logged-in browser walkthrough)

**Files:** none (verification-only task, no code changes)

- [ ] **Step 1: Start the full stack**

From the repo root: `docker compose up -d mongo redis api ai` (if not already running), then from `apps/web`: `npm run dev`. Confirm the API is reachable: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/doctors` (expect `200`).

- [ ] **Step 2: Drive each dashboard with a headless browser, logged in as a real seeded account**

Use the same throwaway-Playwright-script pattern already used earlier this session (a local `npm install playwright` in a scratch dir, since `apps/web` itself has no browser-testing dependency). For each of the 4 seeded demo accounts (`rahul.p@medlink.demo`, `meera.d@medlink.demo`, `healthfirst.l@medlink.demo`, `admin@medlink.demo` — all password `Demo@123`, per CLAUDE.md §6.7):

1. `page.goto('http://localhost:3000/login')`, fill email/password, submit.
2. Wait for navigation to the matching `/dashboard/{role}` URL.
3. Screenshot the dashboard.
4. Check `page.on('console', ...)` and `page.on('pageerror', ...)` collected zero errors/warnings.

- [ ] **Step 3: Visually confirm, per dashboard**

- Patient: the header animation renders next to "My appointments"; each appointment is a bordered Card with a colored status pill; Cancel/Rate buttons render as the styled `Button` component, not raw buttons/links.
- Doctor: header animation next to "Doctor Dashboard"; both Pending/Confirmed sections show Cards with status pills; if either list happens to be empty for this seeded account, confirm the empty-state animation + message renders instead of blank space.
- Lab: header animation next to "Lab Dashboard"; referral and booking rows are Cards with status pills; the "Upload report" file input still works via its hidden `<input type="file">` (functionally unchanged).
- Admin: header animation next to "Admin Dashboard"; the Doctors/Labs toggle renders as two `Button`s with the active one visually distinct (`default` vs `outline` variant); the Analytics section renders inside its own Card.

- [ ] **Step 4: Confirm no regression in the redirect-by-role fix**

Log in with each account again and confirm each lands on its own correct `/dashboard/{role}` URL (this dashboard redesign must not have broken the login-redirect logic from the prior visual-reskin plan, since none of these tasks touched `(auth)/login/page.tsx`).

- [ ] **Step 5: Stop the stack**

`docker compose down` (or leave running if you're continuing to iterate) — no commit for this task, it's verification-only.
