# CommGuard-prod Bug Log

## Format
Each entry: `[date] [severity] [unit] — description — status`

---

## Open Bugs

_(none currently)_

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
