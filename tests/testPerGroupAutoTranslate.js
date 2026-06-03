/**
 * testPerGroupAutoTranslate.js
 * QA-authored test suite — per-group Russian → Hebrew auto-translation
 * Contract: docs/agentsTeam.md
 *
 * Self-contained: no logger import, no DB connections.
 * Run: node tests/testPerGroupAutoTranslate.js
 */

'use strict';

// ─── Minimal test harness ────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
    if (condition) {
        console.log(`  ✓ ${label}`);
        passed++;
    } else {
        console.error(`  ✗ ${label}`);
        failed++;
        failures.push(label);
    }
}

function section(title) {
    console.log(`\n── ${title} ──────────────────────────────────────────`);
}

function summary() {
    console.log('\n══════════════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    if (failures.length) {
        console.log('\n  FAILED:');
        failures.forEach(f => console.log(`    ✗ ${f}`));
    }
    console.log('══════════════════════════════════════════════════════\n');
    process.exit(failed > 0 ? 1 : 0);
}

// ─── 1. isRussian() — pure Cyrillic regex, no API calls ─────────────────────
section('1. isRussian() — Cyrillic detection');

let isRussian;
try {
    ({ isRussian } = require('../utils/languageUtils'));
    assert(typeof isRussian === 'function', 'isRussian exported as function');
} catch (e) {
    console.error('  FATAL: cannot load utils/languageUtils.js —', e.message);
    failed++;
    failures.push('utils/languageUtils.js must exist and export isRussian');
    isRussian = null;
}

if (isRussian) {
    // Core positives
    assert(isRussian('Привет мир') === true,  'plain Russian text → true');
    assert(isRussian('Добрый день') === true,  'Russian greeting → true');
    assert(isRussian('Я учусь') === true,       'Russian sentence → true');

    // Core negatives
    assert(isRussian('Hello world') === false,  'English → false');
    assert(isRussian('שלום עולם') === false,    'Hebrew → false');
    assert(isRussian('') === false,             'empty string → false');
    assert(isRussian(null) === false,           'null → false (no throw)');
    assert(isRussian(undefined) === false,      'undefined → false (no throw)');
    assert(isRussian('12345') === false,        'only numbers → false');
    assert(isRussian('😀🎉🔥') === false,       'only emojis → false');

    // Single Cyrillic char
    assert(isRussian('а') === true,             'single Cyrillic char → true');
    assert(isRussian('Ё') === true,             'single Cyrillic Ё → true');

    // Mixed
    assert(isRussian('Hello привет') === true,  'mixed Latin+Cyrillic → true (contains Cyrillic)');
    assert(isRussian('שלום привет') === true,   'mixed Hebrew+Cyrillic → true');
    assert(isRussian('שלום עולם 123') === false,'Hebrew+numbers, no Cyrillic → false');

    // Ukrainian Cyrillic (still Cyrillic → true; contract says Ѐ-ӿ range covers it)
    assert(isRussian('Привіт світ') === true,   'Ukrainian Cyrillic → true (in Cyrillic range)');
    assert(isRussian('їжак') === true,          'Ukrainian ї (U+0457) → true');

    // Punctuation / whitespace only
    assert(isRussian('   ') === false,          'whitespace only → false');
    assert(isRussian('...!?') === false,        'punctuation only → false');
}

// ─── 2. DB schema — add-auto-translate-column.sql ──────────────────────────
section('2. DB schema file');

const fs = require('fs');
const path = require('path');

const sqlFile = path.join(__dirname, '../database/add-auto-translate-column.sql');
let sqlContent = null;
try {
    sqlContent = fs.readFileSync(sqlFile, 'utf8');
    assert(true, 'add-auto-translate-column.sql exists');
} catch (e) {
    assert(false, 'add-auto-translate-column.sql must exist');
}

if (sqlContent) {
    assert(/ALTER TABLE groups/i.test(sqlContent),        'SQL alters groups table');
    assert(/auto_translate_from/i.test(sqlContent),       'SQL adds auto_translate_from column');
    assert(/auto_translate_to/i.test(sqlContent),         'SQL adds auto_translate_to column');
    assert(/ADD COLUMN IF NOT EXISTS/i.test(sqlContent),  'SQL uses IF NOT EXISTS guard');
    assert(/DEFAULT NULL/i.test(sqlContent),              'SQL defaults columns to NULL');
    assert(/VARCHAR\(5\)/i.test(sqlContent),              'columns are VARCHAR(5)');
}

// ─── 3. groupService — function exports ─────────────────────────────────────
section('3. groupService — getGroupAutoTranslate / setGroupAutoTranslate / disableGroupAutoTranslate');

let getGroupAutoTranslate, setGroupAutoTranslate, disableGroupAutoTranslate;
try {
    const gs = require('../database/groupService');
    getGroupAutoTranslate    = gs.getGroupAutoTranslate;
    setGroupAutoTranslate    = gs.setGroupAutoTranslate;
    disableGroupAutoTranslate = gs.disableGroupAutoTranslate;

    assert(typeof getGroupAutoTranslate === 'function',    'getGroupAutoTranslate exported');
    assert(typeof setGroupAutoTranslate === 'function',    'setGroupAutoTranslate exported');
    assert(typeof disableGroupAutoTranslate === 'function','disableGroupAutoTranslate exported');
} catch (e) {
    console.error('  FATAL: cannot load database/groupService.js —', e.message);
    failed += 3;
    failures.push('groupService must export getGroupAutoTranslate');
    failures.push('groupService must export setGroupAutoTranslate');
    failures.push('groupService must export disableGroupAutoTranslate');
}

// ─── 4. groupService — cache behaviour (stub DB) ────────────────────────────
section('4. Cache — second call within TTL skips DB round-trip');

// We test via the exported functions with a DB that counts calls.
// Since the real DB isn't available in unit tests, we use module internals
// through a controlled proxy approach: mock the query module, require groupService fresh.

(async () => {
    let dbCallCount = 0;
    const fakeResult = { rows: [{ auto_translate_from: 'ru', auto_translate_to: 'he' }] };

    // Intercept require('../database/connection') for a fresh groupService load
    const Module = require('module');
    const originalLoad = Module._load;
    const connectionPath = require.resolve('../database/connection');
    const groupServicePath = require.resolve('../database/groupService');

    // Remove cached module so we load fresh
    delete require.cache[groupServicePath];

    Module._load = function(request, parent, isMain) {
        if (parent && parent.filename === groupServicePath && request === './connection') {
            return {
                query: async (_sql, _params) => {
                    dbCallCount++;
                    return fakeResult;
                }
            };
        }
        return originalLoad.apply(this, arguments);
    };

    let gsCache;
    try {
        gsCache = require('../database/groupService');
    } catch (e) {
        // Module might not exist yet — skip cache test gracefully
        console.log('  ⚠ groupService not yet loadable — cache test skipped (expected during RED)');
        Module._load = originalLoad;
        return;
    }

    Module._load = originalLoad;

    const gGet = gsCache.getGroupAutoTranslate;
    if (typeof gGet !== 'function') {
        assert(false, 'getGroupAutoTranslate available for cache test');
        return;
    }

    const TEST_GROUP = 'test-group-cache@g.us';
    dbCallCount = 0;

    const first = await gGet(TEST_GROUP);
    const callsAfterFirst = dbCallCount;
    const second = await gGet(TEST_GROUP);
    const callsAfterSecond = dbCallCount;

    assert(callsAfterFirst === 1, 'first call hits DB exactly once');
    assert(callsAfterSecond === 1, 'second call within TTL does NOT hit DB again (cached)');
    assert(first !== null && first.from === 'ru', 'first call returns correct {from} value');
    assert(second !== null && second.to === 'he', 'second call returns correct {to} value (from cache)');

    // Restore require cache state
    delete require.cache[groupServicePath];

// ─── 5. Command parsing — handleTranslationToggle ───────────────────────────
section('5. Command parsing — #autotranslate argument formats');

// We parse argument strings the same way commandHandler will: test the contract shapes.
// This section validates the argument-parsing logic in isolation (pure function test).

function parseAutoTranslateArgs(argsString) {
    // Mirrors what commandHandler.handleTranslationToggle should implement per contract:
    // 'on ru,he'  → { action:'on', from:'ru', to:'he' }
    // 'off'       → { action:'off' }
    // 'status'    → { action:'status' }
    // invalid     → null
    if (!argsString || typeof argsString !== 'string') return null;
    const parts = argsString.trim().toLowerCase().split(/\s+/);
    const action = parts[0];

    if (action === 'off') return { action: 'off' };
    if (action === 'status') return { action: 'status' };
    if (action === 'on') {
        if (!parts[1]) return null;                        // 'on' with no pair
        const pair = parts[1].split(',');
        if (pair.length !== 2 || !pair[0] || !pair[1]) return null;
        return { action: 'on', from: pair[0], to: pair[1] };
    }
    return null;
}

// Valid cases
const r1 = parseAutoTranslateArgs('on ru,he');
assert(r1 !== null && r1.action === 'on' && r1.from === 'ru' && r1.to === 'he',
    '"on ru,he" parses to {action:on, from:ru, to:he}');

const r2 = parseAutoTranslateArgs('off');
assert(r2 !== null && r2.action === 'off', '"off" parses to {action:off}');

const r3 = parseAutoTranslateArgs('status');
assert(r3 !== null && r3.action === 'status', '"status" parses to {action:status}');

// Reversed pair — 'on he,ru' should still work (contract: "should work")
const r4 = parseAutoTranslateArgs('on he,ru');
assert(r4 !== null && r4.action === 'on' && r4.from === 'he' && r4.to === 'ru',
    '"on he,ru" (reversed pair) parses correctly');

// Invalid cases
assert(parseAutoTranslateArgs('on') === null,
    '"on" with no pair → null (invalid)');
assert(parseAutoTranslateArgs('on russ,hebrew') === null || (() => {
    // Per contract lang codes are ISO 639-1 (2-char). 'russ' and 'hebrew' are >2 chars.
    // Parser itself may not enforce length — commandHandler should reject, but parser
    // should at least return something parseable. Either null or a non-null with >2 chars.
    // We just check it does NOT silently produce {from:'ru', to:'he'}.
    const r = parseAutoTranslateArgs('on russ,hebrew');
    return r === null || (r.from !== 'ru' && r.to !== 'he');
})(), '"on russ,hebrew" does not silently produce valid {from:ru, to:he}');
assert(parseAutoTranslateArgs('') === null,             'empty string → null');
assert(parseAutoTranslateArgs(null) === null,           'null → null (no throw)');
assert(parseAutoTranslateArgs('enable') === null,       '"enable" alone → null (not a valid action)');
assert(parseAutoTranslateArgs('on ru') === null,        '"on ru" (missing to) → null');
assert(parseAutoTranslateArgs('on ,he') === null,       '"on ,he" (missing from) → null');

// ─── 6. Index.js — per-group translation integration ────────────────────────
section('6. index.js — per-group translation block present');

const indexPath = path.join(__dirname, '../index.js');
let indexContent = null;
try {
    indexContent = fs.readFileSync(indexPath, 'utf8');
    assert(true, 'index.js is readable');
} catch (e) {
    assert(false, 'index.js must be readable');
}

if (indexContent) {
    assert(/getGroupAutoTranslate/.test(indexContent),
        'index.js imports/calls getGroupAutoTranslate');
    assert(/isRussian/.test(indexContent),
        'index.js imports/calls isRussian');
    // The per-group block must appear BEFORE the old global AUTO_TRANSLATION block
    const perGroupIdx = indexContent.indexOf('getGroupAutoTranslate');
    const globalIdx   = indexContent.indexOf('AUTO_TRANSLATION');
    assert(perGroupIdx !== -1 && globalIdx !== -1 && perGroupIdx < globalIdx,
        'per-group translation block precedes global AUTO_TRANSLATION block in index.js');
}

// ─── 7. commandHandler — per-group scope (not global config) ────────────────
section('7. commandHandler — handleTranslationToggle uses per-group DB, not config flag');

const chPath = path.join(__dirname, '../services/commandHandler.js');
let chContent = null;
try {
    chContent = fs.readFileSync(chPath, 'utf8');
    assert(true, 'commandHandler.js is readable');
} catch (e) {
    assert(false, 'commandHandler.js must be readable');
}

if (chContent) {
    // Find the handleTranslationToggle function body
    const fnStart = chContent.indexOf('handleTranslationToggle');
    const fnEnd   = chContent.indexOf('\n    }', fnStart + 50);
    const fnBody  = fnStart !== -1 ? chContent.slice(fnStart, fnEnd + 10) : '';

    // Must no longer guard with msg.key.fromMe
    assert(!fnBody.includes('msg.key.fromMe'),
        'handleTranslationToggle no longer restricts to msg.key.fromMe');

    // Must call setGroupAutoTranslate (per-group DB write)
    assert(chContent.includes('setGroupAutoTranslate'),
        'commandHandler calls setGroupAutoTranslate');

    // Must call disableGroupAutoTranslate
    assert(chContent.includes('disableGroupAutoTranslate'),
        'commandHandler calls disableGroupAutoTranslate');

    // Must call getGroupAutoTranslate (for status)
    assert(chContent.includes('getGroupAutoTranslate'),
        'commandHandler calls getGroupAutoTranslate (for status)');

    // Must use remoteJid as group scope (not hardcoded getAdminJid for DB operations)
    assert(/remoteJid|msg\.key\.remoteJid/.test(fnBody),
        'handleTranslationToggle scopes to msg.key.remoteJid (the group)');

    // Must NOT toggle global config.FEATURES.AUTO_TRANSLATION
    assert(!fnBody.includes('config.FEATURES.AUTO_TRANSLATION'),
        'handleTranslationToggle no longer touches config.FEATURES.AUTO_TRANSLATION');

    // Must parse 'on ru,he' style args
    assert(/split.*,|from.*to/.test(fnBody),
        'handleTranslationToggle parses lang pair from args');
}

// ─── 8. AC5 & AC6 — no API call for non-Russian / disabled group ─────────────
section('8. isRussian() is pure regex — zero API calls');

// Verify no network calls are needed: isRussian must be synchronous
if (isRussian) {
    const start = Date.now();
    for (let i = 0; i < 10000; i++) {
        isRussian('Привет мир');
        isRussian('Hello world');
        isRussian('');
    }
    const elapsed = Date.now() - start;
    // 30000 calls should complete in well under 100ms if it's truly pure regex
    assert(elapsed < 200, `isRussian() is pure sync regex (30k calls in ${elapsed}ms < 200ms)`);

    // Confirm it's synchronous (returns non-Promise)
    const result = isRussian('тест');
    assert(result === true && typeof result === 'boolean',
        'isRussian() returns boolean (not Promise)');
}

})().then(summary).catch(err => {
    console.error('Unhandled error in test runner:', err);
    process.exit(1);
});
