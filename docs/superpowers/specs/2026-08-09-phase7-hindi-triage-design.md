# Phase 7 — Hindi Triage via Multilingual MiniLM (Design Spec)

## Context

CLAUDE.md §2 "Phase 7 (optional, post-launch differentiators)" names this
feature in one line: "Hindi language toggle for triage chat (multilingual
MiniLM model)." Everything else below is resolved against the actual
Phase 3 triage implementation as it exists today, not the Phase 3 *plan*
(the plan and the code have already diverged in a few places — notably, the
red-flag keyword layer exists **twice**, not once).

**What's actually in `apps/ai` and `apps/api` today:**

- `apps/ai/app/embeddings.py`'s `SpecialtyMatcher` loads
  `all-MiniLM-L6-v2`, precomputes one centroid embedding per specialty from
  `apps/ai/specialty_map.json` (39 specialties, all English), and matches
  free-text against those centroids by cosine similarity. Model name is
  configurable via `apps/ai/app/config.py`'s `Settings.model_name`
  (env var `MODEL_NAME`, wired in `docker-compose.yml`).
- The red-flag keyword layer is **duplicated by design**, not by accident:
  `apps/api/src/modules/triage/redFlags.ts`'s `checkRedFlagLocally()` runs
  first, inside `triage.service.ts`, on every turn's raw text, entirely
  independent of the AI service (so emergency detection still works if
  `apps/ai` is down or the circuit breaker is open). `apps/ai/app/red_flags.py`'s
  `check_red_flag()` is a second, independent check inside the `/triage`
  route itself. A committed test
  (`apps/api/src/modules/triage/redFlags.test.ts`, "keyword parity with
  apps/ai/app/red_flags.py") parses the Python source file's
  `RED_FLAG_KEYWORDS` list and asserts the TS list is set-equal to it — the
  two lists are pinned together mechanically, not just by convention.
- `TriageSession` (Mongoose) has no language field today. `triage.service.ts`'s
  `sendTriageMessage()` runs a fixed 3-turn script (clarifying question 1 →
  clarifying question 2 → AI-backed match), with all fixed strings —
  clarifying questions, the disclaimer, the emergency message — hardcoded
  in English.
- `packages/shared/src/schemas/triage.ts`'s `SendTriageMessageInput` is
  `{ text: string, sessionId?: string }` — no language field.
- The web triage page (`apps/web/src/app/triage/page.tsx`) is a plain chat
  UI with no language control; it renders `suggestedSpecialties[].name`
  (the raw English specialty-map key) directly.
- `apps/ai/tests/fixtures/triage_cases.json` has 51 cases (46 specialty +
  5 emergency) gated by `test_fixture_accuracy_meets_target` at ≥90% top-3.

This spec extends all of the above to also work in Hindi. It does not
change what the system is allowed to say: CLAUDE.md §0.1's "AI never
diagnoses, AI never prescribes" applies identically in both languages —
Hindi triage still only returns specialties, confidence scores, and (for a
red-flag match) an emergency instruction. No new capability is added, only
a new input/output language.

## Goals

1. A patient can toggle the triage chat to Hindi and get the same
   specialty-matching quality and the same emergency-detection reliability
   as in English.
2. The existing English path is provably unregressed — same ≥90% top-3
   fixture-accuracy bar, same red-flag test suite, still green.
3. Hindi emergency detection is reviewed with the same rigor as a new
   safety-critical code path, not shipped as a mechanical translation.
4. The change is additive and narrow: one model swap, one new language
   field threaded through the existing pipeline, one new keyword list
   (mirrored the way the English one already is), one new fixture set, one
   small UI control. No new service, no new database, no new dependency.

## Non-goals

- **No auto-detection of language from free text.** See Design §2 — an
  explicit toggle is simpler and safer for a flow where a misdetection on
  a 3-word symptom phrase could route an emergency message in the wrong
  language.
- **No third language.** `paraphrase-multilingual-MiniLM-L12-v2` supports
  50+ languages, but nothing in this spec, the fixtures, or the UI adds a
  language switcher beyond English/Hindi — a generic `language: string`
  free-for-all is exactly the kind of speculative flexibility this
  codebase avoids elsewhere (see the FHIR-lite spec's non-goals for the
  same instinct applied to resource types).
- **No mid-conversation language switching.** Language is fixed for the
  lifetime of a `TriageSession`, set on the first message, immutable after
  (Design §3) — matches the existing rule that a session's fixed 3-turn
  script doesn't change shape once started.
- **No Hindi seed phrases added to `specialty_map.json`.** The whole point
  of a multilingual sentence-embedding model is that a Hindi query and an
  English centroid phrase for the same concept land close together in the
  shared embedding space — see Design §1. Adding a parallel Hindi phrase
  set would double the maintenance surface for zero accuracy benefit this
  spec can point to; if implementation-time validation (Task 5 in the
  plan) shows otherwise for specific specialties, that's a follow-up, not
  part of this scope.
- **No language-based doctor filtering.** `DoctorProfile.languages` already
  exists and already lists what languages a doctor speaks (CLAUDE.md §1),
  but wiring "prefer a Hindi-speaking doctor when the session is in Hindi"
  into `findRecommendedDoctors()` is a separate, non-safety-critical
  product decision with its own edge cases (what if no Hindi-speaking
  doctor exists in that specialty/city?) — out of scope here.
- **No translation of doctor-authored content** (prescriptions, bios,
  clinic names) — only the triage chat's own AI-generated/fixed strings.

## Design decisions (summary)

| Decision | Choice | Why (1–2 sentences) |
|---|---|---|
| Model | Swap `all-MiniLM-L6-v2` → `paraphrase-multilingual-MiniLM-L12-v2` everywhere (one model, not two) | Same `sentence-transformers`/cosine-similarity architecture, same `SpecialtyMatcher` API, drop-in via the existing `model_name` config — a multilingual model also performs reasonably on English, so one model covers both languages without a routing layer. Must be validated against the existing English fixture set before shipping (Task 1). |
| Language selection | Explicit toggle, not auto-detection | Emergency detection is safety-critical; misdetecting a short Hindi symptom phrase as English (or vice versa) risks showing the wrong-language emergency instruction at the worst possible moment. An explicit, session-scoped toggle removes that risk entirely and is one UI control, not an ML problem. |
| Red-flag keyword layer | Parallel Hindi list, mirrored in both `apps/ai/app/red_flags.py` and `apps/api/src/modules/triage/redFlags.ts`, same as the existing English list | Preserves the existing "Node checks locally first, independent of the AI service" safety property (CLAUDE.md's graceful-degradation story) — a Hindi-only list in Python alone would silently lose emergency detection whenever the circuit breaker is open. Highest-stakes part of this feature; flagged for native-speaker/clinical-phrasing review before ship, not treated as a mechanical translation task. |
| specialty_map.json | Unchanged — internal keys stay the existing English strings | `DoctorProfile.specialties` (Phase 1) is already English-keyed and every specialty-filtering query (`findRecommendedDoctors`) matches against it; changing the map's keys would touch every reference site for no reason. The map's *content* (English seed phrases) also stays English — see Non-goals. |
| Specialty display name | New small localization lookup table, English key → Hindi label, with English fallback for any key not yet translated | Keeps internal keys stable (nothing that queries by specialty name changes) while giving a Hindi-language session Hindi-language specialty names in the assistant's message and the UI cards. Only the specialties with real seeded doctors (10) need be complete at launch; missing entries degrade to the English name, never to a blank or an error. |
| Language persistence | `TriageSession.language: 'en' \| 'hi'`, default `'en'`, set once on session creation, never changed after | A session's fixed clarifying-question script and its emergency copy must stay in one language throughout — storing it once avoids re-deriving or re-validating language on every subsequent turn, and matches the existing "toggle is disabled after the first message" UX (Design §3, §6). |
| Test fixtures | New `apps/ai/tests/fixtures/triage_cases_hi.json`, same shape and case count as the English fixture (46 specialty-labeled + 5 emergency), same ≥90% top-3 accuracy gate | Mirrors CLAUDE.md's own bar for the English set — there is no principled reason to ship Hindi at a lower accuracy standard. Phrases should be authored as natural colloquial Hindi (Devanagari, with common Hinglish variants where relevant), not machine-translated word-for-word from the English fixture, since embedding quality depends on natural phrasing. |

## Design

### 1. Model swap and why no Hindi seed phrases are needed

`paraphrase-multilingual-MiniLM-L12-v2` (sentence-transformers, ~470MB,
vs. ~90MB for `all-MiniLM-L6-v2`) is trained so that semantically
equivalent sentences in *different* languages land close together in the
same embedding space — a Hindi sentence meaning "itchy red patches on my
skin" embeds near the English centroid for `specialty_map.json`'s
`"itchy red patches on skin"` phrase, without either phrase being
translated into the other's language first. This is the entire reason a
single-model swap is viable instead of running two matchers or duplicating
`specialty_map.json` in Hindi.

`SpecialtyMatcher`'s public interface (`match(text, top_k) -> list[(name,
score)]`) does not change at all — only the `model_name` constructor
argument's default, in three places that already reference it:
`apps/ai/app/config.py` (`Settings.model_name`), `docker-compose.yml`
(`MODEL_NAME` env var on the `ai` service), and `apps/ai/Dockerfile`'s
bake-at-build-time line (`RUN python -c "...SentenceTransformer(...)"`,
so the larger model is still fetched once at image-build time, not at
every cold start — CLAUDE.md §4's existing risk mitigation still applies,
just to a bigger download).

**This must not regress English accuracy.** The existing 51-case English
fixture (`apps/ai/tests/fixtures/triage_cases.json`) and its
`test_fixture_accuracy_meets_target` gate (≥90% top-3) are the regression
check — implementation must re-run that exact test against the new model
before touching anything else, and if it drops below 90%, the fix is
tuning `specialty_map.json`'s English phrases (same rule the Phase 3 plan
already established), never loosening the threshold.

### 2. Why an explicit toggle, not language auto-detection

Auto-detecting language from a short free-text symptom phrase (a 3-8 word
input is the norm here, per the existing fixture set) is unreliable in
exactly the cases that matter most: transliterated Hindi ("chest mein
dard ho raha hai") is ambiguous between "this is English" and "this is
Hindi written in Latin script" to a language-ID model, and a wrong guess
on a chest-pain phrase could suppress or mislabel an emergency response.
An explicit toggle removes the ambiguity entirely at the cost of one UI
control the patient sets before typing — a reasonable trade for a
safety-critical flow, and consistent with this codebase's general
preference for deterministic, testable behavior over inferred behavior
(see the Phase 3 plan's "Scope decisions" on why clarifying questions are
fixed and scripted rather than LLM-generated, for the same underlying
reasoning).

### 3. Language plumbing, end to end

```
apps/web (language toggle, sent once)
  → POST /api/triage/messages { text, sessionId?, language? }
    → packages/shared: SendTriageMessageInput adds `language: z.enum(['en','hi']).default('en').optional()`
      → apps/api triage.controller.ts → triage.service.ts sendTriageMessage(patientId, sessionId, text, language)
        → on session creation only: TriageSession.language = language ?? 'en'
        → on an existing session: the `language` param, if sent, is ignored — the
          session's stored language always wins (this is what "immutable after
          first message" means in practice; the frontend enforces it too by
          disabling the toggle, see §6, but the backend is the actual guarantee)
        → checkRedFlagLocally(text, session.language) — Hindi keyword list when session.language === 'hi'
        → fixed clarifying-question strings selected by session.language
        → callTriageAI(combinedText, session.language)
          → cache key includes language (a Hindi and an English message with
            coincidentally the same normalized text must not share a cache entry)
          → POST http://ai:8000/triage { text, language }
            → apps/ai: check_red_flag(text, language) — Hindi list when language == "hi"
            → SpecialtyMatcher.match(text) — unchanged; the multilingual model
              handles the cross-lingual match without a language argument
        → assistant message composed using session.language (disclaimer, emergency
          copy, "you may want to see: <specialties>" sentence with each specialty
          name passed through the Hindi display-name lookup, §5)
```

`TriageResponse` (pydantic) and `AITriageResult` (TS interface) gain no
new fields — `language` only affects which keyword list and which fixed
strings are used; the shape of what `/triage` returns
(`emergency`, `message`, `extractedSymptoms`, `suggestedSpecialties`) is
identical in both languages, keeping `aiClient.ts` and `triage.service.ts`'s
downstream logic (recommended-doctor lookup, session persistence) entirely
language-agnostic.

### 4. Hindi red-flag keyword layer

Mirrors the existing English layer's exact shape and the exact places it
lives:

- `apps/ai/app/red_flags.py`: add `RED_FLAG_KEYWORDS_HI: list[str]`
  alongside the existing `RED_FLAG_KEYWORDS`; `check_red_flag(text,
  language)` selects the list by `language` (default `"en"` — the existing
  call signature keeps working with one new optional argument, so no
  existing caller breaks).
- `apps/api/src/modules/triage/redFlags.ts`: same shape,
  `RED_FLAG_KEYWORDS_HI`, `checkRedFlagLocally(text, language)`.
- The existing Python↔TS parity test
  (`redFlags.test.ts`'s "keyword parity with apps/ai/app/red_flags.py")
  gets a second assertion for the Hindi lists, using the same
  parse-the-Python-source approach — this is the mechanical guarantee that
  the two independent code paths (Node's local check, Python's route-level
  check) never silently drift apart, which matters even more for a list
  that's harder for most contributors to eyeball-review than the English
  one.

**Coverage:** every English red-flag concept (chest pain, breathlessness,
suicidal ideation, severe bleeding, sudden vision loss, unconsciousness,
seizure, stroke symptoms, severe abdominal pain — the existing 18-keyword
list) needs a Hindi equivalent. Because patients commonly type Hindi
symptoms in Latin transliteration on a phone keyboard as often as in
Devanagari, each concept should have **both** a Devanagari phrase (e.g.
"सीने में दर्द") and a common transliterated variant (e.g. "seene mein
dard", "chest mein dard") — substring matching, the same mechanism the
English layer already uses, doesn't need anything fancier than a longer
list to cover both scripts.

**This is the highest-stakes part of the feature.** A mechanically
translated keyword (e.g. a literal dictionary translation of "shortness of
breath") can miss how patients actually describe the symptom colloquially,
under-detect, and let an emergency through the ordinary specialty-matching
path instead of the emergency banner. The implementation plan's dedicated
task for this list must be treated as needing native-Hindi-speaker (or
clinically-informed) review before merge — not signed off on translation
plausibility alone, the same way the English list wasn't invented from a
dictionary either but from the specific phrases CLAUDE.md's Phase 3 entry
named.

### 5. Specialty display-name localization

New file `packages/shared/src/i18n/specialtyLabels.ts`:

```ts
export const SPECIALTY_LABELS_HI: Record<string, string> = {
  'Dermatology': 'त्वचा रोग विशेषज्ञ',
  'General Physician': 'सामान्य चिकित्सक',
  'Gastroenterology': 'गैस्ट्रोएंटेरोलॉजी',
  'Cardiology': 'हृदय रोग विशेषज्ञ',
  'Gynecology': 'स्त्री रोग विशेषज्ञ',
  'Orthopedics': 'हड्डी रोग विशेषज्ञ',
  'Pediatrics': 'बाल रोग विशेषज्ञ',
  'ENT': 'कान-नाक-गला विशेषज्ञ',
  'Psychiatry': 'मनोरोग विशेषज्ञ',
  'Ophthalmology': 'नेत्र रोग विशेषज्ञ',
  // ...remaining specialty_map.json keys, best-effort; any key missing here
  // falls back to the English name rather than erroring or showing blank.
};

export function localizeSpecialtyName(name: string, language: 'en' | 'hi'): string {
  if (language === 'hi') return SPECIALTY_LABELS_HI[name] ?? name;
  return name;
}
```

Placed in `packages/shared` (not only in `apps/web`) because the Hindi
assistant message is composed **server-side**, in `triage.service.ts`
("आपके बताए लक्षणों के आधार पर, आपको दिखाना चाहिए: <specialty names>")
— the same lookup is reused by the web triage page when it renders the
`suggestedSpecialties` cards, so the sentence a patient reads in chat and
the cards below it never disagree on the Hindi name for a given
specialty. The 10 specialties with seeded, bookable doctors (per
CLAUDE.md §6.2) must be complete at launch; the remaining ~29 are
best-effort and degrade to English — acceptable because a demo/interview
dataset only ever surfaces the 10 seeded specialties as actual bookable
recommendations.

### 6. Web UI

`apps/web/src/app/triage/page.tsx` gains one small control: a two-option
toggle ("English" / "हिन्दी") above the chat input, defaulting to
English, disabled once `session` is non-null (mirrors §3's backend
invariant — the toggle can't lie about being changeable mid-session). The
selected language is sent as `language` only on the very first
`sendTriageMessage` call (when `session` is still `null`); once a session
exists, the language is whatever the session already carries.

Language-conditional copy needed on the page: the input placeholder, the
"This is guidance, not medical advice" disclaimer line, and the red-flag
emergency banner text. These are static UI strings (not AI-generated), so
they're plain conditional JSX on a `language` piece of local state — no
i18n framework needed for two strings' worth of static copy on one page.

## Testing / validation strategy

1. **English regression** (Task 1): re-run the existing
   `test_fixture_accuracy_meets_target` and the full `test_red_flags.py`
   suite against the new model — both must stay green, no threshold
   changes.
2. **Hindi red-flag unit tests** (Task 2): both `apps/ai/tests/test_red_flags.py`
   and `apps/api/src/modules/triage/redFlags.test.ts` gain Hindi-language
   cases for every red-flag concept (Devanagari and transliterated), plus
   the extended Python↔TS parity assertion.
3. **End-to-end Hindi fixture accuracy** (the plan's dedicated Task 5): a
   new `triage_cases_hi.json` (46 specialty-labeled + 5 emergency cases,
   same structure as the English file) run through the same
   ≥90% top-3 gate for specialty matches and 100% detection for the 5
   emergency cases — this is the integration-level check that the model
   swap, the Hindi keyword list, and the existing pipeline work correctly
   *together*, not just as isolated units.
4. **Manual smoke test** (implementation-time, not automated): a real
   Hindi sentence typed into the running web UI, both an ordinary symptom
   and a red-flag phrase, confirming the emergency banner and the
   specialty cards render in Hindi as expected.

## Open questions

None — CLAUDE.md's one-line mention left every detail (model choice,
detection strategy, keyword-list shape, fixture format, display-name
localization) open; each is resolved above against this repo's existing
Phase 3 code and conventions, including the two implementation details
(the duplicated red-flag layer, the Python↔TS parity test) that only
became visible by reading the actual code rather than the original
Phase 3 plan document.
