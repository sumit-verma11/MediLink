# Phase 7 — Hindi Triage via Multilingual MiniLM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The existing English-only triage chat also works in Hindi. A
patient picks a language toggle before starting a session; from then on
red-flag detection, the fixed clarifying questions, the AI specialty
match, and the specialty names shown all use that language, with the same
safety and accuracy bar as the English path (≥90% top-3 fixture accuracy,
100% red-flag detection on the fixture's emergency cases).

Design reference: `docs/superpowers/specs/2026-08-09-phase7-hindi-triage-design.md`.

**Architecture:** Extends `apps/ai` (model swap, Hindi keyword list,
`language` request field) and `apps/api`'s existing `modules/triage/`
(Hindi keyword list mirrored per the existing Node/Python parity pattern,
`language` threaded through `triage.service.ts`, one new
`TriageSession.language` field), plus a new shared localization file in
`packages/shared` and a small UI addition to the existing triage page. No
new service, no new database, no new npm/pip dependency — this is a swap
and an extension of code that already exists end-to-end for English.

**Tech Stack:** Same as Phase 3 (`sentence-transformers`, FastAPI,
pydantic v2 on the AI side; Express/TS/Mongoose/Zod on the Node side;
Vitest + pytest for tests). The only change of substance is the
`sentence-transformers` model name
(`all-MiniLM-L6-v2` → `paraphrase-multilingual-MiniLM-L12-v2`), which is
loaded the same way `SentenceTransformer(model_name)` already loads any
model — no new package.

## Global Constraints

- CLAUDE.md §0.1: **AI never diagnoses. AI never prescribes.** Applies
  identically in Hindi — the Hindi path returns the same shape of output
  (specialties + confidence, or an emergency instruction) as English,
  nothing more.
- The red-flag layer runs **before** any embedding call, in both
  languages, in both places it already runs today (Node's
  `checkRedFlagLocally`, independent of the AI service; Python's
  `check_red_flag` inside `/triage`) — this plan must not weaken that
  property while adding Hindi.
- The existing Python↔TS red-flag keyword parity test
  (`apps/api/src/modules/triage/redFlags.test.ts`) must keep passing, and
  must be extended to also cover the new Hindi lists — a Hindi list that
  drifts between the two languages silently reintroduces the exact
  failure mode that test exists to prevent.
- English accuracy must not regress: the existing 51-case fixture
  (`apps/ai/tests/fixtures/triage_cases.json`) and its
  `test_fixture_accuracy_meets_target` (≥90% top-3) must stay green
  against the new model. If it drops below 90%, the fix is tuning
  `specialty_map.json`'s **English** phrases — never loosening the
  threshold, never deleting a failing case.
- `specialty_map.json`'s keys and content are unchanged (English-only,
  same 39 specialties) — see the design spec's Non-goals for why no
  Hindi seed phrases are added.
- TypeScript strict everywhere; no `any`. Python: ruff + mypy clean
  (CLAUDE.md §3).
- Conventional commits, PR-sized commits per task.
- No frontend automated test suite (established precedent) — the one
  frontend task in this plan verifies via
  `npm run build --workspace=apps/web`.

---

## File Structure

```
apps/ai/
├── app/
│   ├── config.py                   # MODIFY: model_name default
│   ├── red_flags.py                # MODIFY: + RED_FLAG_KEYWORDS_HI, language param
│   ├── schemas.py                  # MODIFY: TriageRequest.language
│   └── routes/triage.py            # MODIFY: pass language through
├── Dockerfile                      # MODIFY: bake the new model name
├── tests/
│   ├── test_red_flags.py           # MODIFY: + Hindi cases
│   ├── test_embeddings.py          # MODIFY: re-run English gate against new model
│   └── fixtures/
│       └── triage_cases_hi.json    # NEW: Hindi fixture set

apps/api/src/
├── models/
│   └── TriageSession.ts            # MODIFY: + language field
├── modules/triage/
│   ├── redFlags.ts                 # MODIFY: + RED_FLAG_KEYWORDS_HI, language param
│   ├── redFlags.test.ts            # MODIFY: + Hindi cases, extended parity test
│   ├── aiClient.ts                 # MODIFY: language param, cache key includes it
│   ├── aiClient.test.ts            # MODIFY: language-aware cache test
│   ├── triage.service.ts           # MODIFY: thread language through
│   └── triage.test.ts              # MODIFY: Hindi-session cases

packages/shared/src/
├── schemas/triage.ts                # MODIFY: SendTriageMessageInput.language
├── i18n/
│   └── specialtyLabels.ts          # NEW: SPECIALTY_LABELS_HI + localizeSpecialtyName
└── index.ts                        # MODIFY: export the new i18n module

apps/web/src/app/triage/
└── page.tsx                        # MODIFY: language toggle, Hindi static copy

docker-compose.yml                   # MODIFY: MODEL_NAME env value
```

---

### Task 1: Swap to the multilingual embedding model + validate no English regression

**Files:**
- Modify: `apps/ai/app/config.py`, `apps/ai/Dockerfile`, `docker-compose.yml`

**Interfaces:**
- Consumes: nothing new — `SpecialtyMatcher.__init__(specialty_map_path, model_name)` (Phase 3) already accepts any model name.
- Produces: `SpecialtyMatcher` now loads `paraphrase-multilingual-MiniLM-L12-v2` by default — consumed unchanged by every existing caller; consumed by Task 3's language-aware route.

- [ ] **Step 1: Change the default model name**

```python
# apps/ai/app/config.py (modify)
    model_name: str = "paraphrase-multilingual-MiniLM-L12-v2"
```

```python
# apps/ai/app/embeddings.py — the constructor's default param stays a
# fallback for direct instantiation outside the app (e.g. ad-hoc scripts);
# update it too for consistency:
    def __init__(self, specialty_map_path: str, model_name: str = "paraphrase-multilingual-MiniLM-L12-v2") -> None:
```

```dockerfile
# apps/ai/Dockerfile (modify line 8 — bake the new model at build time)
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"
```

```yaml
# docker-compose.yml (modify the `ai` service's environment block)
      MODEL_NAME: paraphrase-multilingual-MiniLM-L12-v2
```

- [ ] **Step 2: Verify — English fixture accuracy must not regress**

Run: `cd apps/ai && python -m pytest tests/test_embeddings.py -v -s`

Expected: `test_fixture_accuracy_meets_target` still PASSES at ≥90% top-3
against the **existing English** `triage_cases.json`. First run will be
slow (downloads the ~470MB multilingual model, vs. ~90MB for the old
one — this is expected, not a bug). If accuracy drops below 90%, tune
`apps/ai/specialty_map.json`'s English seed phrases per the printed `MISS`
lines until it passes again — do not lower the threshold.

Run: `cd apps/ai && python -m pytest tests/test_red_flags.py -v`

Expected: unaffected (red-flag detection is pure keyword matching, has no
dependency on the embedding model) — still PASSES.

Run: `cd apps/ai && ruff check app/config.py app/embeddings.py && mypy app/config.py app/embeddings.py`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/ai/app/config.py apps/ai/app/embeddings.py apps/ai/Dockerfile docker-compose.yml
git commit -m "feat(ai): swap to paraphrase-multilingual-MiniLM-L12-v2, validate no English regression"
```

---

### Task 2: Hindi red-flag keyword layer (Node + Python, mirrored)

**Files:**
- Modify: `apps/ai/app/red_flags.py`, `apps/ai/tests/test_red_flags.py`
- Modify: `apps/api/src/modules/triage/redFlags.ts`, `apps/api/src/modules/triage/redFlags.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `check_red_flag(text, language="en")` (Python) and
  `checkRedFlagLocally(text, language='en')` (TS), each now accepting a
  `language` argument — consumed by Task 3's route/service wiring. Both
  keep working with zero call-site changes until Task 3 passes `language`
  explicitly (default stays `"en"`/`'en'`).

- [ ] **Step 1: Implement the Python side**

```python
# apps/ai/app/red_flags.py (modify — add alongside the existing RED_FLAG_KEYWORDS)
RED_FLAG_KEYWORDS_HI: list[str] = [
    # Devanagari + common Latin-transliterated variants, one pair per
    # English concept above. AUTHOR/REVIEW NOTE: these must be reviewed by
    # a fluent Hindi speaker (or clinically-informed reviewer) before this
    # task is considered done — see the design spec's "highest-stakes part
    # of this feature" note. Do not merge on translation-plausibility alone.
    "सीने में दर्द", "seene mein dard", "chest mein dard",
    "सांस लेने में तकलीफ", "saans lene mein takleef", "saans phoolna",
    "आत्महत्या", "khudkushi", "aatmahatya", "khud ko nuksan",
    "बहुत खून बह रहा", "bahut khoon beh raha hai", "khoon nahi ruk raha",
    "अचानक दिखना बंद", "achanak dikhna band ho gaya", "achanak roshni chali gayi",
    "बेहोश", "behosh", "behoshi",
    "दौरा पड़ना", "daura padna", "mirgi ka daura",
    "लकवा", "lakwa", "chehra tedha ho gaya", "बोलने में लड़खड़ाहट",
    "पेट में तेज दर्द", "pet mein bahut tez dard",
]


def check_red_flag(text: str, language: str = "en") -> str | None:
    """Return the matched keyword if `text` contains a red-flag phrase in
    the given language, else None. Must run before any embedding-based
    matching — a red-flag match skips specialty matching entirely."""
    keywords = RED_FLAG_KEYWORDS_HI if language == "hi" else RED_FLAG_KEYWORDS
    normalized = text.lower()
    for keyword in keywords:
        if keyword.lower() in normalized:
            return keyword
    return None
```

- [ ] **Step 2: Write Hindi test cases (Python)**

```python
# apps/ai/tests/test_red_flags.py (append)
def test_detects_hindi_chest_pain_devanagari():
    assert check_red_flag("सीने में तेज दर्द हो रहा है", language="hi") is not None


def test_detects_hindi_chest_pain_transliterated():
    assert check_red_flag("mujhe seene mein dard ho raha hai", language="hi") is not None


def test_detects_hindi_breathlessness():
    assert check_red_flag("saans lene mein bahut takleef ho rahi hai", language="hi") is not None


def test_detects_hindi_suicidal_ideation():
    assert check_red_flag("mujhe khudkushi karne ka man kar raha hai", language="hi") is not None


def test_detects_hindi_severe_bleeding():
    assert check_red_flag("bahut khoon beh raha hai aur ruk nahi raha", language="hi") is not None


def test_does_not_flag_ordinary_hindi_symptoms():
    assert check_red_flag("mere kohni par laal khujli wale daane hain", language="hi") is None


def test_hindi_keywords_do_not_leak_into_english_check():
    # An English-language call must not match against the Hindi list.
    assert check_red_flag("seene mein dard", language="en") is None
```

- [ ] **Step 3: Run and verify (Python)**

Run: `cd apps/ai && python -m pytest tests/test_red_flags.py -v`
Expected: all PASS, including the 7 new Hindi cases.

Run: `cd apps/ai && ruff check app/red_flags.py && mypy app/red_flags.py`
Expected: clean.

- [ ] **Step 4: Implement the Node side (mirrored)**

```ts
// apps/api/src/modules/triage/redFlags.ts (modify)
const RED_FLAG_KEYWORDS_HI: readonly string[] = [
  'सीने में दर्द', 'seene mein dard', 'chest mein dard',
  'सांस लेने में तकलीफ', 'saans lene mein takleef', 'saans phoolna',
  'आत्महत्या', 'khudkushi', 'aatmahatya', 'khud ko nuksan',
  'बहुत खून बह रहा', 'bahut khoon beh raha hai', 'khoon nahi ruk raha',
  'अचानक दिखना बंद', 'achanak dikhna band ho gaya', 'achanak roshni chali gayi',
  'बेहोश', 'behosh', 'behoshi',
  'दौरा पड़ना', 'daura padna', 'mirgi ka daura',
  'लकवा', 'lakwa', 'chehra tedha ho gaya', 'बोलने में लड़खड़ाहट',
  'पेट में तेज दर्द', 'pet mein bahut tez dard',
];
// KEEP THIS LIST IDENTICAL to apps/ai/app/red_flags.py's RED_FLAG_KEYWORDS_HI
// — enforced mechanically by the parity test below, not just this comment.

export function checkRedFlagLocally(text: string, language: 'en' | 'hi' = 'en'): string | null {
  const keywords = language === 'hi' ? RED_FLAG_KEYWORDS_HI : RED_FLAG_KEYWORDS;
  const normalized = text.toLowerCase();
  for (const keyword of keywords) {
    if (normalized.includes(keyword.toLowerCase())) return keyword;
  }
  return null;
}

export function redFlagKeywordsHiForTesting(): readonly string[] {
  return RED_FLAG_KEYWORDS_HI;
}
```

- [ ] **Step 5: Write Hindi test cases + extend the parity test (Node)**

```ts
// apps/api/src/modules/triage/redFlags.test.ts (modify)
import { checkRedFlagLocally, redFlagKeywordsForTesting, redFlagKeywordsHiForTesting } from './redFlags';

describe('checkRedFlagLocally — Hindi', () => {
  it('detects chest pain (Devanagari)', () => {
    expect(checkRedFlagLocally('सीने में तेज दर्द हो रहा है', 'hi')).not.toBeNull();
  });
  it('detects chest pain (transliterated)', () => {
    expect(checkRedFlagLocally('mujhe seene mein dard ho raha hai', 'hi')).not.toBeNull();
  });
  it('detects suicidal ideation', () => {
    expect(checkRedFlagLocally('mujhe khudkushi karne ka man kar raha hai', 'hi')).not.toBeNull();
  });
  it('does not flag ordinary Hindi symptoms', () => {
    expect(checkRedFlagLocally('mere kohni par laal khujli wale daane hain', 'hi')).toBeNull();
  });
  it('does not match Hindi keywords when language is "en"', () => {
    expect(checkRedFlagLocally('seene mein dard', 'en')).toBeNull();
  });
});

describe('Hindi keyword parity with apps/ai/app/red_flags.py', () => {
  it('matches the Python RED_FLAG_KEYWORDS_HI list exactly', () => {
    const pythonPath = path.join(__dirname, '../../../../ai/app/red_flags.py');
    const pythonSource = fs.readFileSync(pythonPath, 'utf-8');
    const listMatch = pythonSource.match(/RED_FLAG_KEYWORDS_HI[^=]*=\s*\[([\s\S]*?)\]/);
    const listBody = listMatch?.[1];
    if (!listBody) throw new Error('Could not find RED_FLAG_KEYWORDS_HI in red_flags.py — path or format changed');
    const pythonKeywords = [...listBody.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const tsKeywords = [...redFlagKeywordsHiForTesting()];
    expect(new Set(tsKeywords)).toEqual(new Set(pythonKeywords));
  });
});
```

Note: the existing English parity test's regex expects double-quoted
Python string literals (`"chest pain"`); write the Hindi Python list with
the same double-quote style so this regex-based extraction keeps working
without a parser change.

- [ ] **Step 6: Run and verify (Node)**

Run: `npm run test --workspace=apps/api -- redFlags.test.ts`
Expected: all PASS, including the parity test (only passes once the two
lists are byte-for-byte the same set — this is the actual regression gate,
not just a nice-to-have).

- [ ] **Step 7: Commit**

```bash
git add apps/ai/app/red_flags.py apps/ai/tests/test_red_flags.py apps/api/src/modules/triage/redFlags.ts apps/api/src/modules/triage/redFlags.test.ts
git commit -m "feat(triage): Hindi red-flag keyword layer, mirrored Node+Python with parity test"
```

**Review checkpoint (do not skip):** before merging this task, have the
Hindi keyword lists reviewed by a fluent Hindi speaker for the same
emergency concepts the English list covers (chest pain, breathlessness,
suicidal ideation, severe bleeding, sudden vision loss, unconsciousness,
seizure, stroke symptoms, severe abdominal pain) and for phrasing patients
would plausibly type, not textbook translations. This is a manual step —
no test can substitute for it.

---

### Task 3: `language` field end-to-end plumbing

**Files:**
- Modify: `packages/shared/src/schemas/triage.ts`
- Modify: `apps/api/src/models/TriageSession.ts`
- Modify: `apps/api/src/modules/triage/aiClient.ts`, `aiClient.test.ts`
- Modify: `apps/api/src/modules/triage/triage.service.ts`, `triage.test.ts`
- Modify: `apps/ai/app/schemas.py`, `apps/ai/app/routes/triage.py`, `apps/ai/tests/test_triage_route.py`

**Interfaces:**
- Consumes: `checkRedFlagLocally`/`check_red_flag` with `language` (Task 2).
- Produces: `TriageSession.language`, `sendTriageMessage(patientId, sessionId, text, language?)`, `callTriageAI(text, language)`, FastAPI `/triage` accepting `{text, language}` — consumed by Task 4's frontend wiring.

- [ ] **Step 1: Shared schema**

```ts
// packages/shared/src/schemas/triage.ts (modify)
export const SendTriageMessageInput = z.object({
  text: z.string().min(1),
  sessionId: z.string().optional(),
  language: z.enum(['en', 'hi']).optional(),
});
export type SendTriageMessageInput = z.infer<typeof SendTriageMessageInput>;
```

- [ ] **Step 2: `TriageSession.language` field**

```ts
// apps/api/src/models/TriageSession.ts (modify)
export interface ITriageSession {
  // ...existing fields...
  language: 'en' | 'hi';
}

// inside triageSessionSchema, add:
  language: { type: String, enum: ['en', 'hi'], default: 'en' },
```

- [ ] **Step 3: FastAPI side — `language` on request/route**

```python
# apps/ai/app/schemas.py (modify)
from typing import Literal

class TriageRequest(BaseModel):
    text: str = Field(min_length=1)
    language: Literal["en", "hi"] = "en"
```

```python
# apps/ai/app/routes/triage.py (modify)
@router.post("/triage", response_model=TriageResponse)
def triage(payload: TriageRequest, request: Request) -> TriageResponse:
    matched_keyword = check_red_flag(payload.text, payload.language)
    if matched_keyword is not None:
        emergency_message = (
            "यह एक चिकित्सीय आपातकाल हो सकता है। तुरंत आपातकालीन देखभाल लें या 112 पर कॉल करें।"
            if payload.language == "hi"
            else "This may be a medical emergency. Seek emergency care immediately or call 112."
        )
        return TriageResponse(
            emergency=True,
            message=emergency_message,
            extractedSymptoms=[],
            suggestedSpecialties=[],
        )

    matcher = request.app.state.specialty_matcher
    matches = matcher.match(payload.text, top_k=3)
    # ...unchanged from here (extractedSymptoms/suggestedSpecialties construction)...
```

Add a matching test to `apps/ai/tests/test_triage_route.py`:

```python
def test_hindi_red_flag_short_circuits_before_matching():
    response = client.post("/triage", json={"text": "seene mein dard", "language": "hi"})
    body = response.json()
    assert body["emergency"] is True
    assert "112" in body["message"] or "आपातकालीन" in body["message"]


def test_defaults_to_english_language():
    response = client.post("/triage", json={"text": "itchy red patches on my elbow"})
    assert response.status_code == 200  # `language` omitted entirely still works
```

- [ ] **Step 4: Node `aiClient.ts` — thread language through, cache key includes it**

```ts
// apps/api/src/modules/triage/aiClient.ts (modify)
function cacheKey(text: string, language: 'en' | 'hi'): string {
  const normalized = text.trim().toLowerCase();
  const hash = crypto.createHash('sha256').update(`${language}:${normalized}`).digest('hex');
  return `triage:${hash}`;
}

export async function callTriageAI(text: string, language: 'en' | 'hi' = 'en'): Promise<AITriageResult> {
  const key = cacheKey(text, language);
  // ...unchanged cache-read logic using `key`...
  // ...unchanged circuit-breaker check...
  const response = await fetch(`${baseUrl}/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
    signal: controller.signal,
  });
  // ...unchanged from here, using `key` for the cache write...
}
```

Add a test to `aiClient.test.ts` confirming an English and a Hindi call
with the same normalized text do **not** share a cache entry (two `fetch`
calls, not one) — the existing "caches a successful AI response" test
already proves same-language-same-text hits the cache; this proves
different-language-same-text does not.

- [ ] **Step 5: `triage.service.ts` — session-scoped language, Hindi fixed strings**

```ts
// apps/api/src/modules/triage/triage.service.ts (modify)
const DISCLAIMER: Record<'en' | 'hi', string> = {
  en: 'This is guidance, not medical advice.',
  hi: 'यह मार्गदर्शन है, चिकित्सीय सलाह नहीं।',
};
const EMERGENCY_MESSAGE: Record<'en' | 'hi', string> = {
  en: 'This may be a medical emergency. Seek emergency care immediately or call 112.',
  hi: 'यह एक चिकित्सीय आपातकाल हो सकता है। तुरंत आपातकालीन देखभाल लें या 112 पर कॉल करें।',
};
const CLARIFYING_QUESTION_1: Record<'en' | 'hi', string> = {
  en: 'How long have you had these symptoms?',
  hi: 'आपको ये लक्षण कब से हैं?',
};
const CLARIFYING_QUESTION_2: Record<'en' | 'hi', string> = {
  en: 'How severe is it — mild, moderate, or severe?',
  hi: 'यह कितना गंभीर है — हल्का, मध्यम, या गंभीर?',
};

export async function sendTriageMessage(
  patientId: string,
  sessionId: string | undefined,
  text: string,
  language?: 'en' | 'hi'
): Promise<ITriageSession> {
  let session: HydratedDocument<ITriageSession> | null;

  if (sessionId) {
    session = await TriageSession.findOne({ _id: sessionId, patientId });
    if (!session) throw new AppError(404, 'Triage session not found', 'TRIAGE_SESSION_NOT_FOUND');
    // `language`, if sent on an existing session, is ignored — the session's
    // stored language always wins (see design spec §3).
  } else {
    session = await TriageSession.create({
      patientId: new Types.ObjectId(patientId),
      language: language ?? 'en',
      disclaimerShownAt: new Date(),
    });
  }

  const matchedKeyword = checkRedFlagLocally(text, session.language);
  if (matchedKeyword || session.isRedFlag) {
    session.isRedFlag = true;
    session.messages.push({ role: 'user', text, at: new Date() });
    pushAssistantMessage(session, EMERGENCY_MESSAGE[session.language], { includeDisclaimer: false });
    await session.save();
    return session;
  }

  // ...priorUserTurns / terminal-session guard unchanged...

  if (turnCount === 1) {
    pushAssistantMessage(session, CLARIFYING_QUESTION_1[session.language]);
    await session.save();
    return session;
  }
  if (turnCount === 2) {
    pushAssistantMessage(session, CLARIFYING_QUESTION_2[session.language]);
    await session.save();
    return session;
  }

  // turnCount === 3
  const combinedText = /* unchanged */;
  try {
    const aiResult = await callTriageAI(combinedText, session.language);
    session.extractedSymptoms = aiResult.extractedSymptoms;
    session.suggestedSpecialties = aiResult.suggestedSpecialties;
    session.recommendedDoctorIds = await findRecommendedDoctors(aiResult.suggestedSpecialties);
    const specialtyNames = aiResult.suggestedSpecialties
      .map((s) => localizeSpecialtyName(s.name, session.language))
      .join(session.language === 'hi' ? '، ' : ', ');
    const summarySentence =
      session.language === 'hi'
        ? `आपके बताए लक्षणों के आधार पर, आपको दिखाना चाहिए: ${specialtyNames}।`
        : `Based on what you've described, you may want to see: ${specialtyNames}.`;
    pushAssistantMessage(session, summarySentence);
  } catch (err) {
    // ...unchanged AIServiceUnavailableError handling; add a Hindi fallback string
    // the same way, selected by session.language...
  }

  await session.save();
  return session;
}
```

Also update `pushAssistantMessage` to append the language-correct
disclaimer: `DISCLAIMER[session.language]` instead of the hardcoded
English constant it uses today.

Update `triage.controller.ts`'s `sendTriageMessageHandler` to pass
`req.body.language` through as the fourth argument.

Add tests to `triage.test.ts`: creating a session with `language: 'hi'`
persists it; a Hindi red-flag phrase on turn 1 sets `isRedFlag` and
returns the Hindi emergency string; the clarifying questions on turns 1–2
are in Hindi for a Hindi session; sending a different `language` on an
existing session is silently ignored (session keeps its original
language).

- [ ] **Step 6: Verify**

Run: `npm run test --workspace=apps/api -- aiClient.test.ts triage.test.ts`
Expected: PASS.

Run: `cd apps/ai && python -m pytest tests/test_triage_route.py -v`
Expected: PASS.

Run: `npm run typecheck --workspace=apps/api && cd apps/ai && ruff check app && mypy app`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schemas/triage.ts apps/api/src/models/TriageSession.ts apps/api/src/modules/triage apps/ai/app/schemas.py apps/ai/app/routes/triage.py apps/ai/tests/test_triage_route.py
git commit -m "feat(triage): thread session-scoped language through red-flag/clarifying/AI-match pipeline"
```

---

### Task 4: Specialty display-name localization + web UI language toggle

**Files:**
- Create: `packages/shared/src/i18n/specialtyLabels.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/app/triage/page.tsx`

**Interfaces:**
- Consumes: `SendTriageMessageInput.language` (Task 3), `TriageSession.language`/`suggestedSpecialties` (existing `triageApi.ts` types — add `language` to the `TriageSession` TS interface there too).
- Produces: `localizeSpecialtyName(name, language)` — consumed by Task 3's `triage.service.ts` (already wired above) and by this task's frontend cards.

- [ ] **Step 1: Localization file**

Write `packages/shared/src/i18n/specialtyLabels.ts` per the design spec
§5 — `SPECIALTY_LABELS_HI` covering at minimum the 10 specialties with
seeded doctors (Dermatology, General Physician, Gastroenterology,
Cardiology, Gynecology, Orthopedics, Pediatrics, ENT, Psychiatry,
Ophthalmology; add more of the remaining 29 `specialty_map.json` keys on
a best-effort basis) and `localizeSpecialtyName(name, language)` with
English fallback for any missing key.

Export it from `packages/shared/src/index.ts`:
```ts
export * from './i18n/specialtyLabels';
```

- [ ] **Step 2: Frontend — language toggle + Hindi static copy**

```tsx
// apps/web/src/app/triage/page.tsx (modify)
import { localizeSpecialtyName } from '@medlink/shared';

// add local state:
const [language, setLanguage] = useState<'en' | 'hi'>('en');

// pass language only when creating the session (session is still null):
const { session: updated } = await sendMessage({
  text: input,
  sessionId: session?._id,
  ...(session ? {} : { language }),
}).unwrap();
```

Add the toggle above the chat input, disabled once `session` is non-null:

```tsx
<div className="flex gap-2">
  <Button size="sm" variant={language === 'en' ? 'default' : 'outline'} disabled={!!session} onClick={() => setLanguage('en')}>
    English
  </Button>
  <Button size="sm" variant={language === 'hi' ? 'default' : 'outline'} disabled={!!session} onClick={() => setLanguage('hi')}>
    हिन्दी
  </Button>
</div>
```

Conditional copy (placeholder, disclaimer line, emergency banner)
switched on `language` (or `session?.language ?? language` once a session
exists, so the copy stays correct even though the toggle itself is now
disabled):

```tsx
<p className="text-sm text-muted-foreground">
  {(session?.language ?? language) === 'hi' ? 'यह मार्गदर्शन है, चिकित्सीय सलाह नहीं।' : 'This is guidance, not medical advice.'}
</p>
```

Specialty cards use the localized name:
```tsx
{localizeSpecialtyName(s.name, session.language)} ({Math.round(s.confidence * 100)}% match)
```

Also add `language: 'en' | 'hi'` to the `TriageSession` interface in
`apps/web/src/store/triageApi.ts`.

- [ ] **Step 3: Verify**

Run: `npm run build --workspace=@medlink/shared && npm run build --workspace=apps/web`
Expected: builds clean, no type errors.

Manual smoke check (dev server): toggle to हिन्दी, send a Hindi symptom
phrase through the 3-turn flow, confirm the clarifying questions,
disclaimer, and specialty cards all render in Hindi; separately, send a
Hindi red-flag phrase and confirm the Hindi emergency banner appears.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/i18n packages/shared/src/index.ts apps/web/src/app/triage/page.tsx apps/web/src/store/triageApi.ts
git commit -m "feat(web): Hindi/English triage language toggle with localized specialty names"
```

---

### Task 5: Hindi 50-case fixture set + accuracy/safety gate (validation task)

**Files:**
- Create: `apps/ai/tests/fixtures/triage_cases_hi.json`
- Modify: `apps/ai/tests/test_embeddings.py`

**Interfaces:**
- Consumes: `SpecialtyMatcher` (Task 1), `check_red_flag` (Task 2).
- Produces: nothing consumed elsewhere — this is the end-to-end
  correctness/safety gate for the whole feature, the Hindi mirror of the
  English fixture Phase 3 already established.

This is the task that proves the model swap (Task 1) and the Hindi
keyword list (Task 2) actually work **together**, in Hindi, not just in
isolated unit tests. Do not shrink or skip this task to save time — it is
the closest thing this plan has to a pre-ship safety check on the exact
failure mode (missed emergency, wrong specialty) that matters most.

- [ ] **Step 1: Write the Hindi fixture file**

Mirror `triage_cases.json`'s exact structure and case count (46
specialty-labeled cases spanning the same specialties the English file
covers, ideally ≥3 per specialty for the 10 seeded-doctor specialties at
minimum, matching Phase 3's original CLAUDE.md §6.6 bar; 5 emergency
cases). Author natural, colloquial Hindi phrasing — Devanagari, mixing in
Hinglish where that's how patients would plausibly type it — not a
mechanical sentence-by-sentence translation of the English fixture (see
design spec §"Test fixtures" for why).

```json
// apps/ai/tests/fixtures/triage_cases_hi.json (illustrative excerpt — author all 51 cases)
[
  {"input": "मेरी कोहनी पर दो हफ्तों से लाल, खुजली वाले दाने हैं", "expected_specialty": "Dermatology"},
  {"input": "chehre aur peeth par baar baar pimples ho rahe hain", "expected_specialty": "Dermatology"},
  {"input": "mujhe kal se bukhar aur poore badan mein dard hai", "expected_specialty": "General Physician"},
  {"input": "khana khane ke baad seene mein jalan hoti hai", "expected_specialty": "Gastroenterology"},
  {"input": "sidhiyan chadhte waqt seena tight lagta hai", "expected_specialty": "Cardiology"},
  {"input": "पिछले दो महीने से मेरे मासिक धर्म अनियमित हैं", "expected_specialty": "Gynecology"},
  {"input": "seedhi chadhne mein ghutno mein dard hota hai", "expected_specialty": "Orthopedics"},
  {"input": "mere bachche ko teen din se bukhar hai", "expected_specialty": "Pediatrics"},
  {"input": "kaan mein dard hai aur sunai kam de raha hai", "expected_specialty": "ENT"},
  {"input": "kai hafton se neend nahi aa rahi aur bahut chinta hoti hai", "expected_specialty": "Psychiatry"},
  {"input": "kuch dino se dhundhla dikhai de raha hai", "expected_specialty": "Ophthalmology"},
  {"input": "seene mein tez dard ho raha hai aur baayin baanh mein bhi", "emergency": true},
  {"input": "saans lene mein bahut takleef ho rahi hai, ruk ruk kar saans aa rahi hai", "emergency": true},
  {"input": "mann kar raha hai khud ko nuksan pahunchau", "emergency": true},
  {"input": "chot se bahut khoon beh raha hai aur ruk nahi raha", "emergency": true},
  {"input": "achanak ek aankh se dikhna band ho gaya", "emergency": true}
  // ...continue to the full 46 specialty-labeled + 5 emergency case count,
  // covering the same specialty spread as triage_cases.json.
]
```

- [ ] **Step 2: Write the Hindi accuracy test**

```python
# apps/ai/tests/test_embeddings.py (append)
def test_hindi_fixture_accuracy_meets_target():
    """Hindi mirror of test_fixture_accuracy_meets_target: runs the same
    specialty_map.json (English-keyed, unchanged) against Hindi-language
    input via the multilingual model's cross-lingual matching, plus the
    Hindi red-flag keyword list. Same 90% top-3 bar as English — Hindi does
    not ship at a lower accuracy standard."""
    fixtures_path = os.path.join(os.path.dirname(__file__), "fixtures", "triage_cases_hi.json")
    with open(fixtures_path) as f:
        cases = json.load(f)

    real_map_path = os.path.join(os.path.dirname(__file__), "..", "specialty_map.json")
    matcher = SpecialtyMatcher(real_map_path)

    emergency_cases = [c for c in cases if c.get("emergency")]
    specialty_cases = [c for c in cases if "expected_specialty" in c]

    for case in emergency_cases:
        assert check_red_flag(case["input"], language="hi") is not None, f"missed Hindi red flag: {case['input']}"

    hits = 0
    for case in specialty_cases:
        top3 = [name for name, _ in matcher.match(case["input"], top_k=3)]
        if case["expected_specialty"] in top3:
            hits += 1
        else:
            print(f"MISS: '{case['input']}' expected {case['expected_specialty']}, got {top3}")

    accuracy = hits / len(specialty_cases)
    total = len(specialty_cases)
    assert accuracy >= 0.90, f"Hindi top-3 accuracy {accuracy:.2%} below 90% target ({hits}/{total})"
```

- [ ] **Step 3: Run and tune**

Run: `cd apps/ai && python -m pytest tests/test_embeddings.py::test_hindi_fixture_accuracy_meets_target -v -s`

Expected: eventually PASS. If below 90%, the printed `MISS` lines show
which specialties the multilingual model confuses for Hindi input — the
fix is almost always in the fixture phrasing (make the Hindi input less
ambiguous / more like how a real patient would phrase it) rather than the
English `specialty_map.json` seed phrases, since Task 1 already confirmed
those work for English; but if a specific specialty consistently misses
across several Hindi phrasings, adding a couple more English seed phrases
for that specialty (per the design spec's "if implementation-time
validation shows otherwise" escape hatch) is in scope too. Never lower
the threshold or delete a failing case to force a pass.

- [ ] **Step 4: Run the full suites**

Run: `cd apps/ai && python -m pytest && ruff check . && mypy app`
Run: `npm run test --workspace=apps/api`
Run: `npm run build --workspace=apps/web`

Expected: everything green — this is the final integration check across
both services and the frontend before this feature is considered done.

- [ ] **Step 5: Commit**

```bash
git add apps/ai/tests/fixtures/triage_cases_hi.json apps/ai/tests/test_embeddings.py
git commit -m "test(ai): 50-case Hindi triage fixture set with 90% top-3 accuracy gate"
```

**Review checkpoint (do not skip):** same as Task 2 — before considering
this feature ship-ready, have the Hindi fixture phrases (not just the
red-flag keywords) sanity-checked by a fluent Hindi speaker for
naturalness. A fixture set that reads as machine-translated risks
validating the model against phrasing no real patient would use, which
would make the 90% number look reassuring without actually being so.
