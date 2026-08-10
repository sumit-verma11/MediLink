# Phase 7 — Telegram Bot Notifications: Design Spec

## Context

CLAUDE.md §0.3 already lists the intended notification stack: "Nodemailer
(Gmail SMTP free) + optional Telegram bot" and names this exact feature in
§2 Phase 7's optional post-launch list. This spec scopes that one item.

**Existing notification wiring (read from the actual code, not assumed):**
there are two independent, non-overlapping call-site families today, not one
unified "notification creation path":

- **Email**, via `sendAppointmentEmail()` (`apps/api/src/lib/mailer.ts`),
  called directly from `apps/api/src/modules/appointments/appointments.service.ts`
  (`requested`, `new_request`, `confirmed`, `rejected` templates) and
  `apps/api/src/jobs/reminderJob.ts` (`reminder` template, hourly
  node-cron scan). Every call site already fetches the recipient's `IUser`
  document before sending and fires the send with `void` (not awaited) —
  `sendAppointmentEmail` itself swallows all errors internally and only
  `logger.error`s them.
- **In-app `Notification` documents**, via `createNotification()`
  (`apps/api/src/lib/notifications.ts` → `apps/api/src/models/Notification.ts`),
  called from `apps/api/src/modules/labReferrals/labReferrals.service.ts`
  (referral sent / received) and
  `apps/api/src/modules/labBookings/labBookings.service.ts` (report ready,
  ×2 — patient and referring doctor). These are read via
  `apps/api/src/modules/notifications/` (`GET /api/notifications/me`) and
  rendered on `apps/web/src/app/notifications/page.tsx`.

Prescription creation (`apps/api/src/modules/prescriptions/prescriptions.service.ts`)
fires **neither** channel today — there is no existing notification event to
extend there. Per this feature's own instruction to reuse existing
notification content rather than inventing new events, prescription-ready
is **out of scope** for this pass (see Non-goals).

`apps/api/src/models/User.ts` has no telegram-related field.
`apps/api/src/lib/socket.ts`'s `emitAppointmentUpdate()` confirms the
established shape for a best-effort, fire-and-forget async side effect
fanned out alongside a primary DB write — the same shape this feature
follows for Telegram sends. `.env.example` / `docker-compose.yml` show the
`SMTP_USER`/`SMTP_PASS` convention for third-party credentials, and
`mailer.ts` falls back to nodemailer's `jsonTransport` (zero network I/O)
when `SMTP_USER` is unset so local dev and the test suite never depend on
real credentials — the Telegram client follows the identical fallback shape.

## Goals

1. A user (patient, doctor, or lab) can link their Telegram account to their
   MedLink account from the existing notifications page.
2. Once linked, every event that already fires an email notification
   (appointment requested/confirmed/rejected, doctor's new-request alert,
   24h reminder) or an in-app `Notification` (lab referral sent/received,
   lab report ready ×2) also pushes the same content as a Telegram message.
3. A Telegram send failure never blocks or fails the primary action it rides
   alongside (booking, referral creation, report upload, etc.).
4. No new npm dependency — Node 20's global `fetch` talks to the Telegram
   Bot HTTP API directly.

## Non-goals

- No new bot commands beyond `/start <code>` for linking. No chat-based
  interaction, no reply handling beyond the link confirmation.
- No prescription-ready fan-out — no existing notification call site exists
  there to extend (see Context); adding one would be new scope, not
  extending existing behavior.
- No message templating system / i18n / rich Telegram formatting
  (buttons, inline keyboards) beyond plain text.
- No retry queue, no delivery-status tracking for Telegram sends — logged
  on failure, same as email, nothing more.
- No mobile push, no SMS. Telegram only.

## Design

### 1. Data model: `User.telegramChatId`

Add one optional field to the existing `User` model
(`apps/api/src/models/User.ts`), not a new collection — it's a 1:1
attribute of the account, same category as `avatarUrl`:

```ts
telegramChatId?: string;
```

```ts
telegramChatId: { type: String, index: { unique: true, sparse: true } },
```

`sparse: true` so the huge majority of users (who never link) don't collide
on a shared `null`/missing value under a unique index — same reasoning
already applied implicitly by `LabReferral.token`'s unique index (every
document has a value there; here most documents won't, so sparse is the
correct variant).

### 2. Linking flow

**Chosen: bot deep-link + one-time code**, per the standard pattern
(`t.me/<bot>?start=<code>`):

1. User opens their notifications page, clicks "Connect Telegram".
2. `POST /api/telegram/link-code` (authenticated) generates an 8-char
   `nanoid()` code, stores it in Redis as `telegram:link:{code} → userId`
   with a 10-minute TTL (`SET ... EX 600`) — the same
   `SET key value [NX] EX seconds` shape already used for slot locking in
   the booking engine (`apps/api/src/modules/appointments`), just without
   `NX` since collisions here aren't a concurrency hazard, only a UX one.
3. Response includes `{ code, deepLink: "https://t.me/<TELEGRAM_BOT_USERNAME>?start=<code>" }`.
   The web page renders it as a plain link/button — no QR code. (The
   existing `qrcode` dependency is used server-side for the prescription
   PDF's verification link, a scan-from-paper use case; here the user is
   already on the device they'd open Telegram on, so a clickable link is
   strictly simpler and a QR would be dead weight.)
4. User taps the link, Telegram opens the bot, sends `/start <code>` to it.
5. Telegram POSTs that update to our webhook: `POST /api/telegram/webhook`
   (public, no auth — see §3 for how it's still trusted). Handler parses
   `/start (.+)`, looks up the code in Redis, and if found: sets
   `User.telegramChatId = update.message.chat.id` on the matching user,
   deletes the Redis key, and replies via `sendMessage` confirming the
   link. If the code is missing/expired, it replies asking the user to
   regenerate the code from MedLink.
6. `DELETE /api/telegram/link` (authenticated) clears `telegramChatId` —
   the notifications page's disconnect action.

### 3. Bot architecture: webhook, not long-polling

**Chosen: webhook** (`POST /api/telegram/webhook`, registered once via
Telegram's `setWebhook` API against the deployed API's public URL).

Rationale: `apps/api` is already a long-running Express server (unlike
`apps/ai`, which CLAUDE.md keeps internal-only) — a webhook is one more
route on infrastructure that already exists. Long-polling would require a
second always-on loop process (or a background task inside the same
process competing for the event loop), duplicated across every environment
(dev, CI, each Render/Railway deploy), for no benefit this app needs — it
already isn't running anything else that would make the webhook harder to
reach (contrast with `apps/ai`, which is intentionally never exposed
publicly; the Telegram bot, by definition, must be reachable from
Telegram's servers, so it's the one deliberate public HTTP surface added
here).

Webhook trust: Telegram supports a `secret_token` set at `setWebhook` time,
echoed back on every request as the
`X-Telegram-Bot-Api-Secret-Token` header. The route checks that header
against `TELEGRAM_WEBHOOK_SECRET` and 404s (not 401 — don't reveal the
route exists to a scanner) on mismatch. This is Telegram's own recommended
verification mechanism — no custom HMAC scheme needed.

### 4. Telegram client (`apps/api/src/lib/telegram.ts`)

Low-level send, mirroring `mailer.ts`'s shape exactly (same fallback,
same try/catch-and-log, same "never throws" contract):

```ts
export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // No token configured (local dev without a real bot) — log instead of
    // calling out to Telegram, same fallback shape as mailer.ts's jsonTransport.
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

No `node-telegram-bot-api` / `telegraf` dependency — the Bot HTTP API is
plain JSON-over-HTTPS and Node 20 ships `fetch` globally; a dependency
would buy nothing this doesn't already have (ladder: stdlib beats a new
package for a single POST call).

### 5. Fan-out wiring — two call-site families, same as today

No single existing "notification creation" choke point exists to hook once
(see Context), so each family gets its own small extension, in the spirit
of "plug into the existing path" rather than inventing a third parallel one:

- **In-app `Notification` family** (lab referral + lab booking events):
  extend `createNotification()` itself. After the `Notification` document
  is created, look up the recipient's `telegramChatId` and, if set,
  `void sendTelegramMessage(chatId, \`${title}\n\n${body}\`)`. This is a
  single function-body change — it automatically covers all four existing
  call sites (`labReferrals.service.ts` ×2, `labBookings.service.ts` ×2)
  with zero call-site edits.
- **Email family** (appointment lifecycle + reminder): each call site
  already has the recipient's loaded `IUser` document in scope (it's what
  `sendAppointmentEmail(patientUser.email, ...)` reads `.email` off of), so
  add a sibling `sendAppointmentTelegram(user, template, data)` in
  `lib/telegram.ts` that takes the same `IUser` + `Template` + `data`
  shape as `sendAppointmentEmail`, reuses `mailer.ts`'s existing
  `subjectFor`/`bodyFor` (exported, not duplicated) to build the message
  text, and no-ops if `user.telegramChatId` is unset. Call it with `void`
  immediately next to each existing `void sendAppointmentEmail(...)` call
  — 5 call sites: `appointments.service.ts` (requested, new_request,
  confirmed, rejected) and `reminderJob.ts` (reminder).

Reusing `subjectFor`/`bodyFor` instead of writing parallel Telegram copy
means the two channels can never drift out of sync in wording.

### 6. Failure handling

Every Telegram send is fire-and-forget (`void`, not `await`) at every call
site, exactly matching the existing email calls, and `sendTelegramMessage`
itself never throws (try/catch + `logger.error`, same as `mailer.ts`). A
Telegram API outage, an invalid token, or a since-revoked chat can never
fail a booking, a referral, or a report upload.

### 7. Config / env

New vars, following the `SMTP_USER`/`SMTP_PASS` convention in
`.env.example` and `apps/api/.env.example`:

```
TELEGRAM_BOT_TOKEN=change-me-telegram-bot-token
TELEGRAM_BOT_USERNAME=change-me_bot
TELEGRAM_WEBHOOK_SECRET=change-me-webhook-secret
```

`docker-compose.yml`'s `api` service gets the same three as demo-only
placeholders alongside `ACCESS_TOKEN_SECRET`/`REFRESH_TOKEN_SECRET` — since
there's no real bot behind them by default, `sendTelegramMessage` degrades
to a log line (§4), so `docker compose up` still works on a clean checkout
with zero manual Telegram setup, same promise the compose file already
makes for the other secrets.

### 8. Web UI

One addition to the existing notifications page
(`apps/web/src/app/notifications/page.tsx`) — no new page, no dedicated
"settings" section (none exists in the app today; inventing one is out of
scope for a single toggle). A small card at the top: "Connect Telegram"
button (calls the link-code endpoint, shows the deep link) when
unlinked, "Connected — Disconnect" when linked. Two new RTK Query
endpoints on a small `telegramApi.ts` slice (`store/telegramApi.ts`)
following the existing `notificationsApi.ts` shape: `generateLinkCode`
mutation and `unlinkTelegram` mutation, both invalidating a `TelegramLink`
tag that a `getTelegramLinkStatus` query provides.

### 9. Test coverage

Mirroring the existing `nodemailer-mock` pattern in `mailer.test.ts`:

- `lib/telegram.test.ts`: stub global `fetch`, assert `sendTelegramMessage`
  posts the right `chat_id`/`text` and swallows a rejected fetch without
  throwing; assert it no-ops (no fetch call) when `TELEGRAM_BOT_TOKEN` is
  unset.
- `lib/notifications.test.ts` (extend existing): `createNotification`
  calls `sendTelegramMessage` when the target user has a `telegramChatId`,
  and does not call it when they don't.
- `modules/telegram/telegram.test.ts` (new): link-code generation stores
  the Redis entry; webhook `/start <validCode>` sets `telegramChatId` and
  deletes the code; webhook with an unknown/expired code does not set
  anything; webhook request missing/mismatching the secret-token header is
  rejected; unlink clears the field.
- `modules/appointments/appointments.test.ts` and `jobs/reminderJob.test.ts`
  (extend existing): mock `lib/telegram.ts`, assert
  `sendAppointmentTelegram` is invoked once per existing email call site
  when the recipient has a `telegramChatId`, and is not invoked when they
  don't.

## Open questions

None — every decision above follows directly from an existing pattern
already in the codebase (Redis one-time codes ≈ slot locks, webhook trust ≈
Telegram's own secret-token mechanism, fire-and-forget ≈ existing email
calls, fallback-when-unconfigured ≈ `mailer.ts`'s `jsonTransport`), so
none required a judgment call beyond what's recorded inline above.
