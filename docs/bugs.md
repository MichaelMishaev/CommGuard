# CommGuard-prod Bug Log

## Format
Each entry: `[date] [severity] [unit] — description — status`

---

## Open Bugs

### 2026-06-03 — testPerGroupAutoTranslate.js section 7 false-negative (FIXED in same session)

**Unit:** `commandHandler.handleTranslationToggle` audit test
**Severity:** Test quality (QA self-bug, not product bug)

**Detail:** The initial test file (QA-authored) used `chContent.indexOf('handleTranslationToggle')`
to locate the function body for section 7 checks. This found the **call site** at line 243
(`return await this.handleTranslationToggle(...)`) instead of the function **definition** at line 3170.
As a result, the 1500-char `fnBody` slice covered surrounding routing code, not the function body.
This caused two false results:
- `handleTranslationToggle no longer mutates config.FEATURES.AUTO_TRANSLATION` — FALSE PASS
  (the call site doesn't contain `config.FEATURES.AUTO_TRANSLATION`, but the function body does)
- `handleTranslationToggle no longer restricts to msg.key.fromMe` — FALSE PASS
  (the call site doesn't contain `msg.key.fromMe`, but the function body does at line 3172)

**Fix:** Changed `indexOf('handleTranslationToggle')` to `indexOf('async handleTranslationToggle')`
to match only the definition. Slice extended to 2000 chars to cover the full implementation.

**Status:** Fixed in `tests/testPerGroupAutoTranslate.js` (QA edge-case enhancement commit).
After fix, both checks correctly FAIL (RED) as expected until dev rewrites the function.

---

## Trail Violations

### 2026-06-03 — extractPreviewUrls feature

**Observation:** At QA session start, both `tests/testUrlExtraction.js` and `utils/urlUtils.js`
were untracked (never committed). Dev had written both files in working tree without committing.

**Result:** No strict TDD trail violation because dev committed both files via `git add` later in
the same session with correct `test: ... (red)` → `feat: ... (green)` ordering:
- `6abfb1a` — `test: extractPreviewUrls full test suite (red)` — test file only
- `f96e667` — `feat: extractPreviewUrls — extract URLs from link preview fields (green)` — urlUtils.js

**Status:** Trail valid. Red commit properly precedes green commit. No NO-RED violation.

---

## Closed Bugs

_(none)_
