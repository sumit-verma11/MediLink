# Modern 3D Redesign — Design Spec

## Problem
The just-shipped dashboard redesign (PR #9) reads as "cheap/immature" — small cartoon-style Lottie illustrations (stock clipart characters) clash with the clean Card layout, and nothing conveys "modern" polish. User wants: large visuals, real motion, 3D depth, applied consistently across the whole app, not just the 4 dashboards.

## Decision: retire Lottie, adopt 3D Fluent Emoji icons + CSS depth
Replace all 5 cartoon Lottie animations with static 3D PNG icons from Microsoft's **Fluent Emoji 3D** set (MIT-licensed, github.com/microsoft/fluentui-emoji, fetched directly via raw GitHub URLs — verified reachable, no manual download step). These are object/icon-based (not character-based), avoiding the clipart-clash problem entirely. `lottie-react` dependency and the 5 JSON files are deleted — nothing else in the app uses them.

## Icon assignments
| Page/spot | Icon | Fluent Emoji 3D asset path |
|---|---|---|
| Patient dashboard header | Pill | `assets/Pill/3D/pill_3d.png` |
| Patient empty state | Calendar | `assets/Calendar/3D/calendar_3d.png` |
| Doctor dashboard header | Stethoscope | `assets/Stethoscope/3D/stethoscope_3d.png` |
| Doctor "pending requests" empty | Bell | `assets/Bell/3D/bell_3d.png` |
| Doctor "confirmed" empty | Calendar | `assets/Calendar/3D/calendar_3d.png` |
| Lab dashboard header | Test tube | `assets/Test tube/3D/test_tube_3d.png` |
| Lab referrals empty | Microscope | `assets/Microscope/3D/microscope_3d.png` |
| Admin dashboard header | Bar chart | `assets/Bar chart/3D/bar_chart_3d.png` |
| Admin verifications empty | Shield | `assets/Shield/3D/shield_3d.png` |
| Landing hero | Red heart | `assets/Red heart/3D/red_heart_3d.png` |
| Login/register panel | Stethoscope | `assets/Stethoscope/3D/stethoscope_3d.png` |

All fetched once at build time into `apps/web/public/icons-3d/*.png` (a small script or manual `curl`, committed as static assets — no runtime fetch, unlike the old Lottie approach, avoiding the fetch/`.catch()`/loading-state complexity entirely).

## New component: `FloatingIcon3D`
Replaces `DashboardAnimation` + `EmptyState`'s animation half. Props: `src` (one of the committed PNGs), `size` (default 160, empty states use 96), `alt`.
Renders: a circular radial-gradient glow badge (teal palette tokens) behind the `<img>`, with a `@keyframes float` bob (±6px, 4s ease-in-out infinite), gated behind the existing `prefers-reduced-motion` check pattern already used by `HeartbeatBackground`. Plain CSS — no JS animation library.
`EmptyState` keeps its message-text prop, swaps its internal animation for `FloatingIcon3D` at size 96.

## Depth system (globals.css + component tweaks)
- `Card`: add hover state — `translateY(-2px)` + `box-shadow` using a teal-tinted multi-layer shadow (replace flat default shadow).
- New `.glass-panel` utility class: `backdrop-blur-md`, translucent background + border — applied to dashboard header rows and the auth page's side panel.
- `Button`: subtle `active:translate-y-px` press depth (already has hover states from base-ui; just add the shadow/translate polish).

## Scope
All 4 dashboards (patient/doctor/lab/admin) + landing page hero + login/register panels. The existing `HeartbeatBackground` SVG animation and `MedicalIconField` tiled texture are **kept as-is** — they were not part of the complaint and already work.

## Migration
- Delete: `apps/web/src/components/ui/dashboard-animation.tsx`, `apps/web/public/animations/*.json`, `lottie-react` from `package.json`.
- Add: `apps/web/src/components/ui/floating-icon-3d.tsx`, `apps/web/public/icons-3d/*.png` (11 files, ~11 icons but 2 reused so 9 unique files).
- Modify: `empty-state.tsx`, `card.tsx`, `button.tsx`, all 4 dashboard pages, landing page hero section, login/register page.

## Testing
Same gate as before: typecheck + production build (apps/web has no test runner) + a live-browser check at desktop and mobile viewports. This time, the dev server used for manual QA must run from a directory where no `next build` is executed concurrently (root cause of the last false alarm) — QA builds/checks will use a separate throwaway `next build && next start` on a different port instead of touching the live dev server's `.next` folder.
