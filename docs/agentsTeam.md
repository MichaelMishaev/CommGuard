# Agent Team — Link Preview URL Extraction Fix
Date: 2026-06-03

## Mission
Messages sent as WhatsApp link previews ("חשבתי זה לא אמיתי...") carry the
actual URL in `extendedTextMessage.matchedText` / `canonicalUrl`, not in the
message body. The URL scanner in `index.js` only reads `messageText` (from
`extractMessageText()`), so the URL is never extracted, Safe Browsing is never
called, and no alert fires.

Fix: extract a pure helper `extractPreviewUrls(rawMsg)` in `utils/urlUtils.js`
and use it to build a `urlScanText` at line 2451 of `index.js`, leaving
`messageText` unchanged everywhere else.

## Contract (designed before tests)

### `extractPreviewUrls(rawMsg: object | null | undefined): string[]`
- Reads `rawMsg?.message?.extendedTextMessage?.matchedText`
- Reads `rawMsg?.message?.extendedTextMessage?.canonicalUrl`
- Extracts all `https?://...` URLs from each field (regex)
- Returns a **deduplicated** array of URLs
- NEVER throws — returns `[]` on any null/undefined/missing path
- Pure function: no side effects, no I/O

### Change in `index.js` at line 2451
```js
// BEFORE
const urlMatches = messageText.match(/https?:\/\/[^\s<>"]+/gi) || [];

// AFTER
const previewUrls = extractPreviewUrls(msg);
const urlScanText = previewUrls.length
    ? messageText + ' ' + previewUrls.join(' ')
    : messageText;
const urlMatches = urlScanText.match(/https?:\/\/[^\s<>"]+/gi) || [];
```
`messageText` is NOT modified — it continues to feed commands, bullywatch, etc.

## Test Runner
Unit: `node tests/testUrlExtraction.js`
E2E: N/A (no live WhatsApp needed)

## Baseline
No automated URL-extraction tests exist before this change.
Existing tests that require Baileys/live connection are unchanged and untouched.
`git status` before any change: clean (2 untracked doc files, no staged/modified src).

## Team
Config: A (dev + qa + checker)
| Agent | Zone | Status |
|---|---|---|
| dev | `utils/urlUtils.js` (new), `index.js` line 2451 only, `tests/testUrlExtraction.js` | plan |
| qa | `tests/testUrlExtraction.js` (edge cases), `docs/bugs.md` | spawned |
| checker | reads all, runs `node tests/testUrlExtraction.js` | spawned |

## Acceptance Criteria (checker validates each)
- [ ] AC1: Message with URL **only** in `matchedText`, empty body → URL detected
- [ ] AC2: Message with URL **only** in `canonicalUrl`, empty body → URL detected
- [ ] AC3: Same URL in both body and `matchedText` → appears exactly **once** in `urlMatches`
- [ ] AC4: Message with URL only in body (existing path) → still detected (no regression)
- [ ] AC5: `extractPreviewUrls(null)` → returns `[]` without throwing
- [ ] AC6: `extractPreviewUrls({})` → returns `[]` without throwing
- [ ] AC7: `extractPreviewUrls({ message: { extendedTextMessage: {} } })` → returns `[]`
- [ ] AC8: `messageText` variable in `index.js` is unchanged — commands/bullywatch/translate unaffected

## Session Log
- [start] baseline: no URL unit tests existed; src files clean
- [dev/red] `tests/testUrlExtraction.js` committed with 8 test cases (all RED — module not found)
- [dev/green TC1] `null input returns []` — PASS
- [dev/green TC2] `empty object returns []` — PASS
- [dev/green TC3] `extendedTextMessage empty returns []` — PASS
- [dev/green TC4] `URL only in matchedText is returned` (AC1) — PASS
- [dev/green TC5] `URL only in canonicalUrl is returned` (AC2) — PASS
- [dev/green TC6] `duplicate URL in both fields appears exactly once` (AC3) — PASS
- [dev/green TC7] `URL only in body → extractPreviewUrls returns []` (AC4) — PASS
- [dev/green TC8] `multiple URLs in matchedText are all returned and deduplicated` — PASS
- [dev/wire] `index.js` import added + URL scan (line ~2452) updated — `messageText` unchanged
- [dev/final] `node tests/testUrlExtraction.js` → 8 passed, 0 failed ✅
