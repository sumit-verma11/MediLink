# Phase 7 — Telegram Bot Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can link their Telegram account to MedLink via a bot
deep-link one-time code, after which every event that already fires an
email notification (appointment requested/confirmed/rejected, doctor
new-request alert, 24h reminder) or an in-app `Notification` (lab referral
sent/received, lab report ready) also pushes as a Telegram message. Telegram
send failures are logged, never thrown, and never block the primary action.

Design reference: `docs/superpowers/specs/2026-08-09-phase7-telegram-notifications-design.md`.

**Architecture:** Extends `apps/api` only (plus one small `apps/web`
addition in Task 5) — no new service, no new collection. One new optional
field on the existing `User` model (`telegramChatId`), one new Express
module (`modules/telegram/`) for linking + the webhook, one new lib
(`lib/telegram.ts`) for the low-level send, and small edits to the two
existing notification call-site families (`lib/notifications.ts` and the
appointment/reminder email call sites) to fan out to Telegram alongside
what they already send.

**Tech Stack:** Node 20 global `fetch` (no new HTTP client dependency),
existing `ioredis` for the one-time link code (same `SET key value EX
seconds` shape as slot locking), existing `nanoid` for code generation,
existing Express/Mongoose/Vitest/Supertest conventions. `apps/web`: existing
RTK Query (`baseApi`) pattern, no new dependency.

## Global Constraints

- No new npm dependency anywhere (CLAUDE.md's "₹0" tech choices — the
  Telegram Bot HTTP API is plain JSON-over-HTTPS, `fetch` already covers it).
- Every Telegram send is fire-and-forget (`void`, not `await`) and never
  throws into its caller — same contract as `sendAppointmentEmail`.
- `sendTelegramMessage` degrades to a log line when `TELEGRAM_BOT_TOKEN` is
  unset, so `docker compose up` and the test suite never need a real bot
  token — same fallback shape as `mailer.ts`'s `jsonTransport`.
- TypeScript strict everywhere; no `any` (CLAUDE.md §3).
- Conventional commits, PR-sized commits per task (CLAUDE.md §3).
- Do not touch prescription creation — no existing notification call site
  there to extend (see design spec's Non-goals).

---

### Task 1: `User.telegramChatId` field + env config + low-level Telegram client

**Files:**
- Modify: `apps/api/src/models/User.ts` (add `telegramChatId?: string`, sparse unique index)
- Modify: `.env.example`, `apps/api/.env.example`, `docker-compose.yml` (add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`)
- Create: `apps/api/src/lib/telegram.ts`
- Test: `apps/api/src/lib/telegram.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `sendTelegramMessage(chatId, text)` — used by Task 3 (notifications fan-out) and Task 4 (appointment fan-out); `User.telegramChatId` field — used by Task 2 (linking), Task 3, Task 4.

- [ ] **Step 1: Implement**

Add to `apps/api/src/models/User.ts`:

```ts
export interface IUser {
  // ...existing fields...
  telegramChatId?: string;
}

const userSchema = new Schema<IUser>({
  // ...existing fields...
  telegramChatId: { type: String, index: { unique: true, sparse: true } },
});
```

Add to `.env.example` and `apps/api/.env.example` (alongside the existing
`SMTP_USER`/`SMTP_PASS` lines):

```
TELEGRAM_BOT_TOKEN=change-me-telegram-bot-token
TELEGRAM_BOT_USERNAME=change-me_bot
TELEGRAM_WEBHOOK_SECRET=change-me-webhook-secret
```

Add the same three, as demo-only placeholders, to `docker-compose.yml`'s
`api` service `environment:` block, next to `ACCESS_TOKEN_SECRET`.

Create `apps/api/src/lib/telegram.ts`:

```ts
import { logger } from './logger';

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // No bot configured (local dev / CI) — log instead of calling out, same
    // fallback shape as mailer.ts's jsonTransport when SMTP_USER is unset.
    logger.info({ chatId, text }, 'telegram send skipped: no TELEGRAM_BOT_TOKEN configured');
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    // Best-effort, same contract as sendAppointmentEmail: never throws into the caller.
    logger.error(err, 'failed to send telegram message');
  }
}
```

Write `apps/api/src/lib/telegram.test.ts` (stub global `fetch`):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendTelegramMessage } from './telegram';

describe('sendTelegramMessage', () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;

  afterEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = originalToken;
    vi.unstubAllGlobals();
  });

  it('posts chat_id and text to the Telegram Bot API when a token is configured', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendTelegramMessage('12345', 'hello');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '12345', text: 'hello' }),
      })
    );
  });

  it('does not call fetch when TELEGRAM_BOT_TOKEN is unset', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await sendTelegramMessage('12345', 'hello');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows a fetch rejection without throwing', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(sendTelegramMessage('12345', 'hello')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify**

Run: `npm run test --workspace=apps/api -- telegram.test.ts`
Expected: PASS (3 tests).

Run: `npm run typecheck --workspace=apps/api`
Expected: no errors (confirms `telegramChatId` compiles cleanly through the model).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/models/User.ts apps/api/src/lib/telegram.ts apps/api/src/lib/telegram.test.ts .env.example apps/api/.env.example docker-compose.yml
git commit -m "feat(api): add telegramChatId to User model and low-level Telegram send client"
```

---

### Task 2: Linking flow — one-time code + webhook receiver + unlink

**Files:**
- Create: `apps/api/src/modules/telegram/telegram.service.ts`, `telegram.controller.ts`, `telegram.routes.ts`
- Modify: `apps/api/src/middleware/rateLimit.ts` (add `telegramWebhookLimiter`, following `referralLookupLimiter`'s shape for the second public surface)
- Modify: `apps/api/src/app.ts` (mount `/api/telegram`)
- Test: `apps/api/src/modules/telegram/telegram.test.ts`

**Interfaces:**
- Consumes: `getRedis()` (`apps/api/src/lib/redis.ts`), `User` model + `telegramChatId` (Task 1), `requireAuth` (`apps/api/src/middleware/auth.ts`), `AppError`.
- Produces: `POST /api/telegram/link-code` (auth) → `{ code, deepLink }`; `POST /api/telegram/webhook` (public, secret-token gated); `DELETE /api/telegram/link` (auth) — used by Task 5's web UI.

- [ ] **Step 1: Implement**

`apps/api/src/modules/telegram/telegram.service.ts`:

```ts
import { nanoid } from 'nanoid';
import { getRedis } from '../../lib/redis';
import { User } from '../../models/User';
import { sendTelegramMessage } from '../../lib/telegram';
import { AppError } from '../../lib/errors';

const LINK_CODE_TTL_SECONDS = 600;
const LINK_CODE_PREFIX = 'telegram:link:';

export async function generateLinkCode(userId: string): Promise<{ code: string; deepLink: string }> {
  const code = nanoid(8);
  await getRedis().set(`${LINK_CODE_PREFIX}${code}`, userId, 'EX', LINK_CODE_TTL_SECONDS);
  const username = process.env.TELEGRAM_BOT_USERNAME ?? 'medlink_bot';
  return { code, deepLink: `https://t.me/${username}?start=${code}` };
}

export async function handleStartCommand(code: string, chatId: string): Promise<void> {
  const redis = getRedis();
  const key = `${LINK_CODE_PREFIX}${code}`;
  const userId = await redis.get(key);
  if (!userId) {
    await sendTelegramMessage(chatId, 'This link code has expired. Generate a new one from your MedLink notifications page.');
    return;
  }
  await User.findByIdAndUpdate(userId, { telegramChatId: chatId });
  await redis.del(key);
  await sendTelegramMessage(chatId, 'Your MedLink account is now connected. You will get appointment, prescription, and lab updates here.');
}

export async function unlinkTelegram(userId: string): Promise<void> {
  const user = await User.findByIdAndUpdate(userId, { $unset: { telegramChatId: 1 } });
  if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
}
```

`apps/api/src/modules/telegram/telegram.controller.ts` — thin handlers:
`generateLinkCodeHandler` (calls `generateLinkCode(req.user!.id)`),
`webhookHandler` (checks `req.header('X-Telegram-Bot-Api-Secret-Token') === process.env.TELEGRAM_WEBHOOK_SECRET`,
404s on mismatch; parses `req.body.message.text` for `/^\/start (.+)$/`,
calls `handleStartCommand(match[1], String(req.body.message.chat.id))`;
always responds `200 {}` to Telegram regardless of match, since Telegram
retries on non-2xx), `unlinkHandler` (calls `unlinkTelegram(req.user!.id)`).

`apps/api/src/modules/telegram/telegram.routes.ts`:

```ts
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { apiLimiter, telegramWebhookLimiter } from '../../middleware/rateLimit';
import { generateLinkCodeHandler, webhookHandler, unlinkHandler } from './telegram.controller';

export const telegramRouter = Router();
telegramRouter.post('/link-code', apiLimiter, requireAuth, generateLinkCodeHandler);
telegramRouter.delete('/link', apiLimiter, requireAuth, unlinkHandler);

// Public, secret-token gated (Telegram's own webhook verification mechanism) —
// separate from the two routes above, same reasoning as publicReferralRouter
// in labReferrals.routes.ts: never pass through requireAuth.
export const telegramWebhookRouter = Router();
telegramWebhookRouter.post('/webhook', telegramWebhookLimiter, webhookHandler);
```

Add `telegramWebhookLimiter` to `apps/api/src/middleware/rateLimit.ts`,
reusing the existing `SimpleRedisStore`, same construction as
`referralLookupLimiter`.

Mount in `apps/api/src/app.ts`:

```ts
app.use('/api/telegram', telegramRouter);
app.use('/api/telegram', telegramWebhookRouter);
```

- [ ] **Step 2: Verify**

Write `apps/api/src/modules/telegram/telegram.test.ts` first (TDD), covering:
- `POST /api/telegram/link-code` (authenticated) returns a code and a
  `deepLink` containing that code, and the code is readable back from Redis
  (`ioredis-mock` via `setRedisClient`, same pattern as `auth.test.ts`).
- `POST /api/telegram/webhook` with a valid secret-token header and
  `/start <code>` for a code just generated: sets `telegramChatId` on the
  right `User` document, and the code is no longer in Redis afterward.
- `POST /api/telegram/webhook` with an unknown/expired code: does not set
  `telegramChatId` on any user (mock `sendTelegramMessage` to assert it was
  called with the "expired" text instead).
- `POST /api/telegram/webhook` with a missing/wrong secret-token header:
  responds 404, `handleStartCommand` never invoked.
- `DELETE /api/telegram/link` (authenticated): clears `telegramChatId` on
  the calling user.

Run: `npm run test --workspace=apps/api -- telegram.test.ts`
Expected: PASS (5 tests). Then run the full API suite once —
`npm run test --workspace=apps/api` — to confirm the new mount and rate
limiter didn't break `app.test.ts` or any existing routes test.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/telegram apps/api/src/middleware/rateLimit.ts apps/api/src/app.ts
git commit -m "feat(api): Telegram account linking (deep-link one-time code + webhook)"
```

---

### Task 3: Fan-out from `createNotification()` (lab referral + lab booking events)

**Files:**
- Modify: `apps/api/src/lib/notifications.ts`
- Modify (test): `apps/api/src/lib/notifications.test.ts`

**Interfaces:**
- Consumes: `sendTelegramMessage` (Task 1), `User.telegramChatId` (Task 1).
- Produces: no new exported symbol — `createNotification()`'s existing
  callers (`labReferrals.service.ts` ×2, `labBookings.service.ts` ×2) get
  Telegram fan-out with zero call-site changes.

- [ ] **Step 1: Implement**

```ts
// apps/api/src/lib/notifications.ts
import { Types } from 'mongoose';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { sendTelegramMessage } from './telegram';

export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  await Notification.create({
    userId: new Types.ObjectId(params.userId),
    type: params.type,
    title: params.title,
    body: params.body,
    link: params.link,
  });

  // Best-effort fan-out to Telegram, alongside the in-app Notification record
  // this function already writes. Never awaited by callers of createNotification
  // (they already don't await this function's DB write's downstream effects),
  // and sendTelegramMessage itself never throws.
  const user = await User.findById(params.userId).select('telegramChatId');
  if (user?.telegramChatId) {
    void sendTelegramMessage(user.telegramChatId, `${params.title}\n\n${params.body}`);
  }
}
```

- [ ] **Step 2: Verify**

Extend `apps/api/src/lib/notifications.test.ts` (mock `./telegram`'s
`sendTelegramMessage`, same `vi.mock` shape as `mailer.test.ts`'s
`nodemailer` mock):

```ts
it('sends a Telegram message when the target user has a linked chatId', async () => {
  const user = await User.create({ role: 'patient', email: 'x@medlink.demo', phone: '9999999999', passwordHash: 'h', name: 'X', telegramChatId: '555' });
  await createNotification({ userId: user._id.toString(), type: 'lab_report_ready', title: 'T', body: 'B' });
  expect(sendTelegramMessage).toHaveBeenCalledWith('555', 'T\n\nB');
});

it('does not send a Telegram message when the target user has no linked chatId', async () => {
  const user = await User.create({ role: 'patient', email: 'y@medlink.demo', phone: '9999999999', passwordHash: 'h', name: 'Y' });
  await createNotification({ userId: user._id.toString(), type: 'lab_report_ready', title: 'T', body: 'B' });
  expect(sendTelegramMessage).not.toHaveBeenCalled();
});
```

Run: `npm run test --workspace=apps/api -- notifications.test.ts`
Expected: PASS (3 tests — 1 existing + 2 new).

Run: `npm run test --workspace=apps/api -- labReferrals labBookings`
Expected: PASS, unchanged — confirms the fan-out addition didn't alter
existing behavior for those two modules' own tests.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/notifications.ts apps/api/src/lib/notifications.test.ts
git commit -m "feat(api): fan out in-app notifications to Telegram when a user has linked their account"
```

---

### Task 4: Fan-out for the appointment/reminder email call sites

**Files:**
- Modify: `apps/api/src/lib/mailer.ts` (export `subjectFor`, `bodyFor`, `Template`)
- Modify: `apps/api/src/lib/telegram.ts` (add `sendAppointmentTelegram`)
- Modify: `apps/api/src/modules/appointments/appointments.service.ts` (4 call sites)
- Modify: `apps/api/src/jobs/reminderJob.ts` (1 call site)
- Modify (tests): `apps/api/src/modules/appointments/appointments.test.ts`, `apps/api/src/jobs/reminderJob.test.ts`

**Interfaces:**
- Consumes: `subjectFor`/`bodyFor`/`Template` from `mailer.ts` (newly
  exported, not duplicated); `sendTelegramMessage` (Task 1);
  `IUser.telegramChatId` (Task 1).
- Produces: `sendAppointmentTelegram(user, template, data)` in `telegram.ts`.

- [ ] **Step 1: Implement**

In `mailer.ts`, change `function subjectFor` / `function bodyFor` to
`export function subjectFor` / `export function bodyFor`, and export the
`Template` type. No behavior change — visibility only.

Add to `apps/api/src/lib/telegram.ts`:

```ts
import { subjectFor, bodyFor, Template } from './mailer';
import { IUser } from '../models/User';

export async function sendAppointmentTelegram(
  user: IUser | null,
  template: Template,
  data: Record<string, unknown>
): Promise<void> {
  if (!user?.telegramChatId) return;
  const text = `${subjectFor(template, data)}\n\n${bodyFor(template, data)}`;
  await sendTelegramMessage(user.telegramChatId, text);
}
```

In `apps/api/src/modules/appointments/appointments.service.ts`, add a
`void sendAppointmentTelegram(...)` call directly after each existing
`void sendAppointmentEmail(...)` call, reusing the already-loaded
`patientUser`/`doctorUser` in scope at each site (no extra query) —
4 sites: `requested` (patient), `new_request` (doctor), `confirmed`
(patient), `rejected` (patient). Example for the `requested` site:

```ts
if (patientUser) {
  void sendAppointmentEmail(patientUser.email, 'requested', {
    doctorName: doctorUser?.name ?? 'the doctor',
    slotStart: appointment.slotStart.toISOString(),
  });
  void sendAppointmentTelegram(patientUser, 'requested', {
    doctorName: doctorUser?.name ?? 'the doctor',
    slotStart: appointment.slotStart.toISOString(),
  });
}
```

Apply the same pattern at the `new_request`, `confirmed`, and `rejected`
sites, passing the same `data` object already built for the email call.

In `apps/api/src/jobs/reminderJob.ts`, add one call after the existing
`await sendAppointmentEmail(...)` (awaited here too, matching the existing
"this runs on a cron tick, not a request path" comment already on that
call):

```ts
await sendAppointmentEmail(patient.email, 'reminder', {
  doctorName: doctorUser?.name ?? 'your doctor',
  slotStart: appointment.slotStart.toISOString(),
});
await sendAppointmentTelegram(patient, 'reminder', {
  doctorName: doctorUser?.name ?? 'your doctor',
  slotStart: appointment.slotStart.toISOString(),
});
```

- [ ] **Step 2: Verify**

Extend `apps/api/src/modules/appointments/appointments.test.ts` (mock
`../../lib/telegram`'s `sendAppointmentTelegram`, same `vi.mock` shape as
the `nodemailer-mock` usage in `mailer.test.ts`): for each of
requested/confirmed/rejected, assert `sendAppointmentTelegram` is called
with the correct template name when the recipient has a `telegramChatId`
set, and is not called (or called with a user missing the field, verify
`sendTelegramMessage` underneath is never actually hit — Task 1's own test
already covers that no-op) when they don't.

Extend `apps/api/src/jobs/reminderJob.test.ts` similarly for the
`reminder` template.

Run: `npm run test --workspace=apps/api -- appointments.test.ts reminderJob.test.ts`
Expected: PASS, existing assertions untouched, new Telegram assertions pass.

Run: `npm run test --workspace=apps/api`
Expected: full suite PASS — confirms the `mailer.ts` export change didn't
break anything importing `Template` or the private functions elsewhere.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/mailer.ts apps/api/src/lib/telegram.ts apps/api/src/modules/appointments/appointments.service.ts apps/api/src/jobs/reminderJob.ts apps/api/src/modules/appointments/appointments.test.ts apps/api/src/jobs/reminderJob.test.ts
git commit -m "feat(api): fan out appointment lifecycle and reminder emails to Telegram"
```

---

### Task 5: Web — Telegram linking UI on the notifications page

**Files:**
- Create: `apps/web/src/store/telegramApi.ts`
- Modify: `apps/web/src/store/api.ts` (add `'TelegramLink'` to `tagTypes`)
- Modify: `apps/web/src/app/notifications/page.tsx`

**Interfaces:**
- Consumes: `POST /api/telegram/link-code`, `DELETE /api/telegram/link`
  (Task 2), the existing `baseApi` (`apps/web/src/store/api.ts`).
- Produces: no new route — this is the last task, nothing downstream
  depends on it.

- [ ] **Step 1: Implement**

`apps/web/src/store/telegramApi.ts`, following `notificationsApi.ts`'s
shape:

```ts
import { baseApi } from './api';

export const telegramApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    generateTelegramLinkCode: builder.mutation<{ code: string; deepLink: string }, void>({
      query: () => ({ url: '/telegram/link-code', method: 'POST' }),
    }),
    unlinkTelegram: builder.mutation<void, void>({
      query: () => ({ url: '/telegram/link', method: 'DELETE' }),
      invalidatesTags: ['TelegramLink'],
    }),
  }),
});

export const { useGenerateTelegramLinkCodeMutation, useUnlinkTelegramMutation } = telegramApi;
```

Add `'TelegramLink'` to `baseApi`'s `tagTypes` array in
`apps/web/src/store/api.ts` (used for future cache invalidation
consistency with the rest of the store, even though this page tracks
linked/unlinked state locally rather than via a dedicated status query —
no `GET /api/telegram/link` status endpoint exists or is needed since the
"Connect Telegram" card only needs to show the freshly generated deep link
once per click, not persist linked/unlinked across reloads for this pass).

In `apps/web/src/app/notifications/page.tsx`, add a small card above the
notification list:

```tsx
'use client';

import { useState } from 'react';
import { useGenerateTelegramLinkCodeMutation, useUnlinkTelegramMutation } from '@/store/telegramApi';

function TelegramLinkCard() {
  const [generate, { data }] = useGenerateTelegramLinkCodeMutation();
  const [unlink] = useUnlinkTelegramMutation();
  const [unlinked, setUnlinked] = useState(false);

  return (
    <div className="border p-3 rounded space-y-2">
      <p className="font-semibold">Telegram notifications</p>
      {data && !unlinked ? (
        <a href={data.deepLink} target="_blank" rel="noreferrer" className="text-sm underline">
          Open Telegram to finish connecting
        </a>
      ) : (
        <button className="text-sm underline" onClick={() => generate()}>
          Connect Telegram
        </button>
      )}
      <button
        className="text-sm underline block"
        onClick={async () => {
          await unlink().unwrap();
          setUnlinked(true);
        }}
      >
        Disconnect
      </button>
    </div>
  );
}
```

Render `<TelegramLinkCard />` above the existing notification list in the
page's default export.

- [ ] **Step 2: Verify**

Run: `npm run typecheck --workspace=apps/web`
Expected: no errors.

Manual check (no Playwright pass required for a single small card, per
this repo's precedent of reserving browser verification for visual
redesign passes): `npm run dev --workspace=apps/web`, log in as a seeded
patient, open `/notifications`, click "Connect Telegram", confirm a
deep-link anchor renders; click "Disconnect", confirm the mutation
resolves without error (no real bot token configured in dev, so the link
itself won't complete an actual Telegram round-trip — that path is covered
by Task 2's webhook tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/store/telegramApi.ts apps/web/src/store/api.ts apps/web/src/app/notifications/page.tsx
git commit -m "feat(web): add Telegram connect/disconnect card to the notifications page"
```
