# Agent Team — Per-Group Russian → Hebrew Auto-Translation
Date: 2026-06-03

## Mission
Add per-group auto-translation: when admin runs `#autotranslate on ru,he` inside a
WhatsApp group, every Russian message in that group gets automatically translated to
Hebrew and sent as a reply. `#autotranslate off` stops it. Other groups are unaffected.

## Contract (designed before tests)

### DB schema (`database/add-auto-translate-column.sql`)
```sql
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS auto_translate_from VARCHAR(5) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS auto_translate_to   VARCHAR(5) DEFAULT NULL;
```
NULL = disabled. `'ru'` / `'he'` = ISO 639-1 language codes.

### `utils/languageUtils.js` (new file)
```js
function isRussian(text: string): boolean
// true if text contains any Cyrillic character Ѐ-ӿ
// Uses RegExp.test() — exits on first match. Zero API calls.
```

### `database/groupService.js` additions
```js
getGroupAutoTranslate(whatsappGroupId): Promise<{from,to}|null>
// {from,to} if enabled, null if disabled. Cached (5-min TTL).

setGroupAutoTranslate(whatsappGroupId, fromLang, toLang): Promise<boolean>
// Saves to DB, invalidates cache.

disableGroupAutoTranslate(whatsappGroupId): Promise<boolean>
// Sets both columns to NULL, invalidates cache.
```

### `services/commandHandler.js` — update `handleTranslationToggle`
- Remove `msg.key.fromMe` restriction → admin can toggle
- Parse `on ru,he` → `{ action:'on', from:'ru', to:'he' }`
- `on ru,he` → `setGroupAutoTranslate(groupId, 'ru', 'he')`
- `off`     → `disableGroupAutoTranslate(groupId)`
- `status`  → show current setting from `getGroupAutoTranslate(groupId)`
- All actions scoped to the group where the command is sent (msg.key.remoteJid)

### `index.js` — per-group translation check in `handleMessage()`
After command handling block, before the old global AUTO_TRANSLATION block:
```js
const autoTranslate = await getGroupAutoTranslate(chatId);
if (autoTranslate && isRussian(messageText)) {
    const result = await translationService.translateText(messageText, autoTranslate.to, autoTranslate.from);
    await sock.sendMessage(chatId, { text: result.translatedText, quoted: msg });
    return;
}
```
No API call when group has no setting (cache null = instant skip).
No API call when message is not Russian (isRussian is pure regex).

## Baseline
Pre-existing `testAutoTranslation.js` fails with MODULE_NOT_FOUND in logger.js — pre-existing
broken dependency, unrelated to this feature.
No central test runner (`tests/runTests.js` does not exist).
New tests must be self-contained (no logger import).

## Test Runner
Unit: `node tests/testPerGroupAutoTranslate.js`

## Team
Config: A (dev + qa + checker)
| Agent   | Zone                                                                        | Status  |
|---------|-----------------------------------------------------------------------------|---------|
| dev     | database/add-auto-translate-column.sql, database/groupService.js,           | plan    |
|         | utils/languageUtils.js, services/commandHandler.js, index.js,               |         |
|         | tests/testPerGroupAutoTranslate.js                                          |         |
| qa      | tests/ + reads all                                                          | spawned |
| checker | reads all                                                                   | spawned |

## Acceptance Criteria (checker validates each)
- [ ] AC1: `#autotranslate on ru,he` in a group → DB updated, bot confirms
- [ ] AC2: `#autotranslate off` in a group → DB updated, translations stop, bot confirms
- [ ] AC3: `#autotranslate status` → shows from/to or "disabled" for the group
- [ ] AC4: Russian message in enabled group → bot replies with Hebrew translation
- [ ] AC5: Non-Russian message in enabled group → NOT translated, no API call
- [ ] AC6: Group without `#autotranslate on` → zero impact
- [ ] AC7: `isRussian()` uses pure Cyrillic regex — no API calls
- [ ] AC8: Non-admin cannot change setting
- [ ] AC9: All `testPerGroupAutoTranslate.js` tests pass

## Session Log
- [2026-06-03] Baseline: testAutoTranslation.js pre-broken (logger MODULE_NOT_FOUND)
- [2026-06-03] Contract designed, agentsTeam.md written, team spawning
