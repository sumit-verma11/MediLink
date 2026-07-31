# MedLink Visual Reskin — Clinical Trust Theme

## Context

`apps/web` has been functionally complete since Phase 6 (PR #6) but visually
untouched: `globals.css` still carries the stock shadcn grayscale theme, the
root page (`app/page.tsx`) is the literal `create-next-app` boilerplate
(Next.js/Vercel logos, "Deploy Now" CTA), and both auth pages
(`app/(auth)/login`, `app/(auth)/register`) are raw unstyled `<input>`
elements that don't use the existing `Button`/`Input`/`Card` primitives in
`components/ui/`.

Visual direction was chosen interactively via the brainstorming skill's
visual companion across two mockup screens (session
`.superpowers/brainstorm/39426-1785326675/`, since expired):

- **Palette — "Clinical Trust":** deep teal-blue (`#0B4F6C`) on white, tight
  corner radii, high contrast. Chosen over "Premium Tech" (near-black,
  indigo/violet) and "Calm Care" (warm cream, sage green).
- **Background motif — "Heartbeat-line + soft gradient blobs":** a
  continuous EKG waveform as a recurring signature element, paired with soft
  radial-gradient color blobs (the Stripe/Linear "glow" trick). Chosen over
  a tiled medical icon-line texture and desaturated editorial photography.

A follow-up request (after this spec's first draft was written and
committed) asked for the discarded tiled medical-icon-texture direction
back, applied globally rather than scoped to one section — see §2b.

## Goals

1. Apply the Clinical Trust palette as shadcn CSS variables in `globals.css`
   so every already-built page (all Phase 1-6 dashboards, forms, tables)
   re-colors automatically — they already consume these tokens.
2. Give the app a real first-impression surface: replace the boilerplate
   landing page and unstyled auth forms with content that reflects what
   MedLink actually is.
3. Introduce one reusable heartbeat-motif background component as the
   landing hero's signature visual element.
4. Add a subtle, low-opacity medical-icon texture as an ambient background
   layer behind every page in the app (added after the initial design pass,
   per follow-up user request) — a decoration layer only, not a redesign of
   any existing page's content or layout.

## Non-goals (explicitly out of scope this pass)

- Dark-mode palette design. The existing stock dark-mode grayscale block in
  `globals.css` is left as-is; Clinical Trust is a light-first palette and
  designing a matching dark variant is deferred as follow-up work.
- Retrofitting layout/content of existing dashboard pages (patient/doctor/
  lab/admin, appointment views, prescriptions, etc.) beyond the automatic
  re-color they get for free via shared tokens, and the global
  `<MedicalIconField />` background layer (§2b), which is mounted once at the
  root layout and touches no page's own code. No bespoke redesign of those
  pages in this pass.
- Any animation library or canvas/WebGL work — both background components
  are inline SVG/CSS only.
- Any new icon package — `lucide-react` (already installed) already has a
  sufficient medical icon set (verified: stethoscope, pill, syringe,
  heart-pulse, bandage, thermometer, cross, microscope, flask, test-tube,
  clipboard-plus, tablets, and more).

## Design

### 1. Design tokens (`apps/web/src/app/globals.css`)

Replace the values in the `:root` block (light mode only; `.dark` block
untouched) with values read directly off the approved mockups:

| Token | New value | Old (stock) value | Source |
|---|---|---|---|
| `--background` | `#F7FAFC` | `oklch(1 0 0)` (white) | mockup page bg |
| `--foreground` | `#1A202C` | `oklch(0.145 0 0)` | mockup body text |
| `--card` | `#FFFFFF` | `oklch(1 0 0)` | mockup card |
| `--card-foreground` | `#1A202C` | `oklch(0.145 0 0)` | — |
| `--primary` | `#0B4F6C` | `oklch(0.205 0 0)` | mockup header/button |
| `--primary-foreground` | `#FFFFFF` | `oklch(0.985 0 0)` | — |
| `--secondary` | `#EDF2F7` | `oklch(0.97 0 0)` | derived neutral near border tone |
| `--secondary-foreground` | `#1A202C` | `oklch(0.205 0 0)` | — |
| `--muted` | `#EDF2F7` | `oklch(0.97 0 0)` | — |
| `--muted-foreground` | `#64748B` | `oklch(0.556 0 0)` | slate-500-equivalent |
| `--accent` | `#3A7CA5` | `oklch(0.97 0 0)` | mockup gradient-blob teal |
| `--accent-foreground` | `#FFFFFF` | `oklch(0.205 0 0)` | — |
| `--border` / `--input` | `#E2E8F0` | `oklch(0.922 0 0)` | mockup card border |
| `--ring` | `#3A7CA5` | `oklch(0.708 0 0)` | matches accent |
| `--destructive` | unchanged | unchanged | not covered by mockup |
| `--radius` | `0.4rem` | `0.625rem` | "tight radii" |

`--sidebar*` and `--chart*` tokens are left at their stock values — no
mockup covered them and nothing currently renders a sidebar or chart.

### 2. `<HeartbeatBackground />` component

New file: `apps/web/src/components/ui/heartbeat-background.tsx`.

A single absolutely-positioned decorative layer, composed of:

- **Gradient blob:** a static `radial-gradient(circle, #3A7CA5 0%, transparent 70%)`
  positioned top-right, `opacity: 0.35`, matching the mockup.
- **EKG line:** one inline SVG `<path>` tracing a heartbeat waveform, stroked
  in `--primary`, `stroke-width: 2.5`. Animated in via `stroke-dasharray` /
  `stroke-dashoffset` CSS keyframes on mount (draws left-to-right once, does
  not loop — a looping/pulsing animation reads as a spinner, not a logo).
  Wrapped in a `@media (prefers-reduced-motion: reduce)` guard that renders
  the path fully drawn with no animation.

Props: `className` only (for positioning/sizing by the consumer). No
variants, no configurable colors — this is a single signature visual, not a
themeable component.

Usage sites: landing page hero section, and a shared panel behind both
login and register forms. This stays the landing hero's one signature
animated moment — it does not appear anywhere else.

### 2b. `<MedicalIconField />` component (global ambient background)

New file: `apps/web/src/components/ui/medical-icon-field.tsx`.

A fixed, full-viewport, non-interactive layer (`position: fixed; inset: 0;
z-index: -1; pointer-events: none; overflow: hidden`) tiling a repeating grid
of medical icons from `lucide-react` — already installed, no new dependency.
Icon set: `Stethoscope`, `Pill`, `Syringe`, `HeartPulse`, `Bandage`,
`Thermometer`, `Cross`, `Microscope`, `FlaskConical`, `TestTube`,
`ClipboardPlus`, `Tablets` (12 icons, cycled).

Implementation: a CSS grid (`grid-template-columns: repeat(auto-fill,
minmax(120px, 1fr))`) rendering the icon list cycled by index
(`icons[i % icons.length]`), each at `opacity: 0.05`, `color: var(--primary)`,
with a small deterministic rotation per cell (`(i % 5) * 7deg`, e.g.) for a
scattered, non-grid-aligned feel. **Rotation/placement must be a pure
function of index, not `Math.random()`** — Next.js renders this on the
server first, and a client-side random value would mismatch the
server-rendered markup and throw a hydration error. Deterministic variation
avoids this entirely.

Mounted once in `apps/web/src/app/layout.tsx`, behind `{children}` — every
existing and future page gets it automatically with zero per-page changes.
At `opacity: 0.05` against the `--background` token, it reads as texture,
not as icons competing with real content (tables, forms, dashboards stay
fully legible).

### 3. Landing page (`apps/web/src/app/page.tsx`)

Full replace of the `create-next-app` boilerplate:

- **Hero:** MedLink name/tagline, one-paragraph pitch drawn from CLAUDE.md's
  own framing (AI symptom triage → doctor matching → booking → prescription
  → lab referral), the disclaimer line "This is guidance, not medical
  advice." `<HeartbeatBackground />` behind this section.
- **Role-entry cards (4):** Patient / Doctor / Lab / Admin, each a `Card`
  linking to `/login` (role is determined by the account, not the URL).
- **"How it works" strip:** 3 steps mirroring CLAUDE.md's demo script
  (Triage → Book → Prescribe & Refer), plain text + icon (lucide-react,
  already installed), no new content beyond what's already true of the
  product.
- **Footer:** minimal — product name, no fake links (no pricing/about pages
  exist, per non-goals in CLAUDE.md).

Also fixes `apps/web/src/app/layout.tsx`'s stale metadata
(`title: "Create Next App"` → `"MedLink"`, description updated).

### 4. Auth pages

`app/(auth)/login/page.tsx` and `app/(auth)/register/page.tsx` rebuilt as a
two-panel layout:

- **Form panel:** existing mutation logic (RTK Query, role select on
  register) unchanged apart from one fix — markup changes from raw
  `<input>`/`<button>` to the existing `Input`/`Button`/`Card` primitives in
  `components/ui/`.
- **Visual panel:** `<HeartbeatBackground />` + a short tagline, hidden on
  small screens (single-column form only on mobile).

**Redirect fix (in scope, not cosmetic):** today `login/page.tsx` does
`router.push('/')` after a successful login, which was harmless while `/`
was a blank stub. Once `/` becomes a real public marketing page (this spec,
§3), that same redirect would land every logged-in user back on the
marketing page instead of their dashboard — a functional regression this
reskin would otherwise introduce. The login mutation response already
includes `role` (`authApi.ts`), so the redirect changes to route by role:
`patient` → `/dashboard/patient`, `doctor` → `/dashboard/doctor`, `lab` →
`/dashboard/lab`, `admin` → `/dashboard/admin` (all four routes already
exist per Phase 1-6). Register's post-signup redirect to `/login` is
unaffected and stays as-is.

Register keeps its current 3-option role picker (patient/doctor/lab) — admin
is correctly excluded from self-registration already, no change to that
logic.

### 5. Self-check

No automated test suite for this — it's a visual/content change with no new
business logic. One manual pass: `npm run dev`, confirm landing/login/
register render with the new palette and the heartbeat motif appears on
both, `prefers-reduced-motion` shows the EKG line static, then spot-check
one already-built page (e.g. patient dashboard) to confirm both (a) it
re-colored via the shared tokens with no layout breakage, and (b) the
`<MedicalIconField />` texture renders behind it with no React hydration
warning in the console (the risk called out in §2b). No new automated test
is added since there's no branching logic to assert against beyond CSS
behavior (reduced-motion, deterministic layout), none of which is app logic.

## Open questions

None — all decisions were made interactively via the visual companion
mockups and follow-up clarifying questions in this session.
