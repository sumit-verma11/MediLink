# MedLink Redesign — Phase 1: Foundation (Soft Care theme)

## Context

`apps/web` is functionally complete through Phase 6 but visually still the
stock shadcn grayscale theme: `globals.css`'s `:root` block is untouched
boilerplate, the root page (`app/page.tsx`) is the literal `create-next-app`
starter (Next.js/Vercel logos, "Deploy Now" CTA), and both auth pages
(`app/(auth)/login`, `app/(auth)/register`) use raw unstyled `<input>` /
`<button>` elements rather than the existing `Button`/`Input`/`Card`
primitives in `components/ui/`.

A prior spec (`docs/superpowers/specs/2026-07-31-visual-reskin-design.md`,
"Clinical Trust" theme — teal-blue, tight radii, heartbeat-line motif) was
written and approved but never implemented. Per explicit direction from the
project owner, this spec supersedes it with a new visual direction chosen
fresh, using the emil-design-eng and frontend-design skills for taste/
polish judgment, and Playwright (browser automation) for live verification
of the implemented result. This spec does not modify or delete the prior
one; it is left in place as history and simply not acted on.

This is **Phase 1 of a 5-phase redesign** covering the whole app (landing,
auth, patient/doctor/lab/admin dashboards, and everything between). Phase 1
scope is the foundation: design tokens, typography, one signature
background component, the landing page, and the auth pages. Phases 2-5
(patient flows, doctor flows, lab flows, admin & misc) are separate specs,
each to be brainstormed on its own — not designed here.

Visual direction was chosen interactively via the brainstorming skill's
visual companion across three mockup screens (session
`.superpowers/brainstorm/70492-1786286711/`):

- **Palette — "Soft Care":** pale sage/mint background, deep navy text,
  dusty-rose accent used sparingly. Very rounded corners, generous
  whitespace. Chosen over "Warm Clinical" (cream/forest-teal/terracotta,
  serif headings) and "Precision Mono" (near-white/ink-black/signal-orange,
  sharp corners).
- **Typography — "Clean Geometric":** a single geometric sans throughout,
  weight and size doing the work. Chosen over "Rounded Warm" (rounded
  display sans) and "Editorial Serif" (serif display headings).
- **Hero layout — "Split, soft shapes right":** text block left-aligned,
  right half holds soft organic blob shapes (pure CSS/SVG, no illustration
  asset). Chosen over "Centered" (centered text + role cards, no visual
  panel) and "Centered + ambient glow" (centered text with blobs floating
  behind the whole hero).
- **Motif scope:** the blob-shape motif appears everywhere in the app,
  low-opacity, not just on marketing/auth surfaces — chosen over confining
  it to landing + auth only.

## Goals

1. Apply the Soft Care palette as shadcn CSS variables in `globals.css` so
   every already-built page (all Phase 1-6 dashboards, forms, tables)
   re-colors automatically — they already consume these tokens.
2. Switch typography to a single geometric sans (Manrope, via
   `next/font/google` — ships with Next.js, no new dependency).
3. Add one reusable `<BlobBackground />` component with two variants
   (`hero`, `ambient`) — pure CSS/SVG, no new dependency, no illustration
   assets.
4. Replace the `create-next-app` boilerplate landing page with a real split
   hero, role-entry cards, a "how it works" strip, and a footer.
5. Rebuild both auth pages on the existing `Button`/`Input`/`Card`
   primitives in a two-panel layout, and fix the post-login redirect to
   route by role instead of always landing on `/`.
6. Mount the `ambient` blob layer once in the root layout so every existing
   and future page gets the low-opacity background motif with zero
   per-page changes.

## Non-goals (explicitly out of scope this pass)

- Dark-mode palette design. The `.dark` block in `globals.css` is left
  as-is; Soft Care is a light-first palette, same precedent as the prior
  (unimplemented) spec.
- Any redesign of the patient/doctor/lab/admin dashboard *layouts* or the
  booking/prescription/lab-referral flows. Those pages get the automatic
  re-color from shared tokens and the global ambient blob layer, and
  nothing else, in this pass — they're Phases 2-5.
- Any new npm dependency. `next/font/google` (Next.js built-in) supplies
  the font; `lucide-react` (already installed) supplies any icons the
  landing page's "how it works" strip needs.
- Illustration assets or an icon/illustration library. The blob motif is
  CSS/SVG gradients and shapes only.

## Design

### 1. Design tokens (`apps/web/src/app/globals.css`)

Replace the values in the `:root` block (light mode only; `.dark` block
untouched) with:

| Token | New value | Role |
|---|---|---|
| `--background` | `#F3F7F5` | pale sage/mint |
| `--foreground` | `#1B3A4B` | deep navy |
| `--card` | `#FFFFFF` | |
| `--card-foreground` | `#1B3A4B` | |
| `--popover` / `--popover-foreground` | `#FFFFFF` / `#1B3A4B` | |
| `--primary` | `#1B3A4B` | navy — dominant UI chrome, outline buttons, headings |
| `--primary-foreground` | `#FFFFFF` | |
| `--secondary` | `#DCEAE3` | light sage surfaces |
| `--secondary-foreground` | `#1B3A4B` | |
| `--muted` | `#EAF2EE` | very light sage |
| `--muted-foreground` | `#5C7A6D` | sage-grey body text |
| `--accent` | `#E8A896` | dusty rose — used sparingly (hero/CTA emphasis only, not every button) |
| `--accent-foreground` | `#1B3A4B` | navy reads better than white on this light rose |
| `--border` / `--input` | `#DCEAE3` | |
| `--ring` | `#1B3A4B` | navy, for focus-visibility contrast |
| `--destructive` | unchanged | not covered by this palette |
| `--radius` | `1rem` | very rounded, per Soft Care |

`--sidebar*` and `--chart*` tokens are left at their stock values — same
rationale as the prior spec: nothing currently renders a sidebar or chart.

Because `--primary` is navy rather than the rose accent, the existing
`Button` primitive's default variant stays navy-filled everywhere it's
already used across the app (dashboards, forms) — visually calm, not
attention-grabbing. The rose `--accent` is reserved for the landing hero's
primary CTA and equivalent one-per-screen emphasis moments, applied via the
`Button` primitive's existing `variant="accent"` if present, or a
one-off `bg-accent text-accent-foreground` class if not — whichever
matches how `components/ui/button.tsx` is already structured (checked
during implementation, not assumed here).

### 2. Typography

Add Manrope via `next/font/google` in `apps/web/src/app/layout.tsx`
(replacing whatever font Next.js's starter currently loads there), applied
as the `--font-sans` CSS variable already wired into
`globals.css`'s `@theme inline` block (`--font-sans: var(--font-sans)` →
consumed by Tailwind's `font-sans` utility, already used app-wide via
`html { @apply font-sans; }`). One font, two weights in practice (600/700
for headings via `font-semibold`/`font-bold` utility classes, 400 for
body) — no separate heading font, no `--font-heading` override.

### 3. `<BlobBackground />` component

New file: `apps/web/src/components/ui/blob-background.tsx`.

Two soft, blurred radial-gradient shapes (sage `#DCEAE3` and rose
`#F3DCD3`), absolutely positioned, `filter: blur(...)`, rendered as plain
`<div>`s with inline gradient backgrounds — no SVG needed, no animation.

Props: `variant: "hero" | "ambient"` (required), `className` (optional, for
positioning by the consumer).

- **`hero`**: larger blobs, `opacity: 0.5`, sized/positioned for a visual
  panel (landing hero right half, auth page side panel). Two usage sites.
- **`ambient`**: same shape composition, smaller and `opacity: 0.12`, `fixed
  inset-0 z-[-1] pointer-events-none overflow-hidden`. Mounted once in
  `apps/web/src/app/layout.tsx` behind `{children}` — every existing and
  future page gets it automatically. At this opacity against
  `--background`, it reads as ambient texture, not as a shape competing
  with real content (tables, forms, dashboards stay fully legible) — same
  legibility bar the prior spec's icon-field component held itself to.

No `Math.random()` anywhere in this component — both variants use fixed
gradient positions/sizes, not per-render or per-index variation, so there's
no server/client hydration-mismatch risk (Next.js App Router renders this
on the server first).

### 4. Landing page (`apps/web/src/app/page.tsx`)

Full replace of the `create-next-app` boilerplate:

- **Hero (split layout):** left — MedLink name/tagline, one-paragraph pitch
  drawn from CLAUDE.md's own framing (AI symptom triage → doctor matching →
  booking → prescription → lab referral), the disclaimer line "This is
  guidance, not medical advice," a rose-accent primary CTA button, a
  navy-outline secondary button. Right — `<BlobBackground variant="hero" />`
  panel, hidden on small screens (single-column, text-only hero on mobile).
- **Role-entry cards (4):** Patient / Doctor / Lab / Admin, each a `Card`
  linking to `/login` (role is determined by the account, not the URL) —
  same content as the prior spec's version, restyled to the new tokens.
- **"How it works" strip:** 3 steps mirroring CLAUDE.md's demo script
  (Triage → Book → Prescribe & Refer), plain text + icon (lucide-react,
  already installed).
- **Footer:** minimal — product name, no fake links (no pricing/about pages
  exist).

Also fixes `apps/web/src/app/layout.tsx`'s stale metadata
(`title: "Create Next App"` → `"MedLink"`, description updated) — same fix
the prior spec called for, still needed regardless of visual direction.

### 5. Auth pages

`app/(auth)/login/page.tsx` and `app/(auth)/register/page.tsx` rebuilt as a
two-panel layout via a new `app/(auth)/layout.tsx` (Next.js native nested
layout, avoids duplicating panel markup in both page files):

- **Form panel:** existing mutation logic (RTK Query, role select on
  register) unchanged apart from markup — raw `<input>`/`<button>` becomes
  the existing `Input`/`Button`/`Card` primitives.
- **Visual panel:** `<BlobBackground variant="hero" />` + a short tagline,
  hidden on small screens (single-column form only on mobile).

**Redirect fix (in scope, not cosmetic — carried forward from the prior
spec because the underlying problem is real regardless of visual
direction):** today `login/page.tsx` does `router.push('/')` after a
successful login, which is harmless only while `/` is a blank stub. Once
`/` becomes a real public marketing page (§4), that same redirect would
land every logged-in user back on the marketing page instead of their
dashboard. The login mutation response already includes `role`
(`authApi.ts`), so the redirect changes to route by role: `patient` →
`/dashboard/patient`, `doctor` → `/dashboard/doctor`, `lab` →
`/dashboard/lab`, `admin` → `/dashboard/admin` (all four routes already
exist per Phase 1-6). Register's post-signup redirect to `/login` is
unaffected.

Register keeps its current 3-option role picker (patient/doctor/lab) —
admin stays correctly excluded from self-registration, no change to that
logic.

### 6. Tooling for this pass

- **emil-design-eng / frontend-design skills:** consulted during
  implementation for component-level taste calls not fully pinned down by
  this spec (exact blob sizing/blur, spacing rhythm, button/card polish) —
  the spec defines direction and tokens; these skills guide the pixel-level
  execution.
- **Playwright MCP:** used to load the running dev server
  (`npm run dev --workspace=apps/web`) and visually verify the landing page,
  login, and register pages after implementation — screenshot-based check
  that the palette, split hero, and blob panels render as designed, plus a
  spot-check of one existing dashboard page for the automatic re-color and
  ambient blob layer.
- **Figma MCP:** not used this pass — no existing Figma file to pull from
  (confirmed with project owner; this is a from-scratch design).

### 7. Self-check

No automated test suite for this — it's a visual/content change with no
new business logic, same precedent as the prior spec. Manual pass (via
Playwright, per §6): `npm run dev`, confirm landing/login/register render
with the Soft Care palette and both `BlobBackground` variants, then
spot-check one already-built dashboard page to confirm (a) it re-colored
via the shared tokens with no layout breakage, and (b) the `ambient` blob
layer renders behind it with no React hydration warning in the console.

## Open questions

None — all decisions were made interactively via the visual companion
mockups and follow-up clarifying questions in this session.
