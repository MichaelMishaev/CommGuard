/**
 * testPerGroupAutoTranslate.js
 * QA-authored test suite — per-group Russian → Hebrew auto-translation
 * Contract: docs/agentsTeam.md
 *
 * Self-contained: no logger import, no live DB connections.
 * Run: node tests/testPerGroupAutoTranslate.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

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

let isRussian = null;
try {
    ({ isRussian } = require('../utils/languageUtils'));
    assert(typeof isRussian === 'function', 'isRussian exported as function');
} catch (e) {
    failed++;
    failures.push('utils/languageUtils.js must exist and export isRussian');
    console.error(`  ✗ utils/languageUtils.js must exist and export isRussian — ${e.message}`);
}

if (isRussian) {
    // Core positives
    assert(isRussian('Привет мир') === true,   'plain Russian text → true');
    assert(isRussian('Добрый день') === true,   'Russian greeting → true');
    assert(isRussian('Я учусь') === true,        'Russian sentence → true');

    // Core negatives
    assert(isRussian('Hello world') === false,  'English → false');
    assert(isRussian('שלום עולם') === false,    'Hebrew → false');

    // Edge cases mandated by QA
    assert(isRussian('') === false,             'empty string → false');
    assert(isRussian(null) === false,           'null → false (no throw)');
    assert(isRussian(undefined) === false,      'undefined → false (no throw)');
    assert(isRussian('12345') === false,        'only numbers → false');
    assert(isRussian('😀🎉🔥') === false,       'only emojis → false');
    assert(isRussian('а') === true,             'single Cyrillic char → true');
    assert(isRussian('Ё') === true,             'single Cyrillic Ё → true');
    assert(isRussian('Hello привет') === true,  'mixed Latin+Cyrillic → true (contains Cyrillic)');
    assert(isRussian('שלום привет') === true,   'mixed Hebrew+Cyrillic → true');
    assert(isRussian('שלום עולם 123') === false,'Hebrew+numbers, no Cyrillic → false');
    assert(isRussian('   ') === false,          'whitespace only → false');
    assert(isRussian('...!?') === false,        'punctuation only → false');

    // Ukrainian Cyrillic (U+0400–U+04FF range — same block as Russian)
    assert(isRussian('Привіт світ') === true,   'Ukrainian Cyrillic → true (in Cyrillic range)');
    assert(isRussian('їжак') === true,          'Ukrainian ї (U+0457) → true');
}

// ─── 2. DB schema — add-auto-translate-column.sql ──────────────────────────
section('2. DB schema file');

const sqlFile = path.join(__dirname, '../database/add-auto-translate-column.sql');
let sqlContent = null;
try {
    sqlContent = fs.readFileSync(sqlFile, 'utf8');
    assert(true, 'add-auto-translate-column.sql exists');
} catch (e) {
    assert(false, 'add-auto-translate-column.sql must exist');
}

if (sqlContent) {
    assert(/ALTER TABLE groups/i.test(sqlContent),       'SQL alters groups table');
    assert(/auto_translate_from/i.test(sqlContent),      'SQL adds auto_translate_from column');
    assert(/auto_translate_to/i.test(sqlContent),        'SQL adds auto_translate_to column');
    assert(/ADD COLUMN IF NOT EXISTS/i.test(sqlContent), 'SQL uses IF NOT EXISTS guard');
    assert(/DEFAULT NULL/i.test(sqlContent),             'SQL defaults columns to NULL');
    assert(/VARCHAR\(5\)/i.test(sqlContent),             'columns are VARCHAR(5)');
}

// ─── 3. groupService — function exports ─────────────────────────────────────
section('3. groupService — exported functions');

// groupService imports logger → pino chain. We check exports without executing DB code
// by intercepting the connection module before requiring groupService.
const Module = require('module');
const originalLoad = Module._load;

let gsExports = null;
try {
    const groupServicePath = require.resolve('../database/groupService');
    delete require.cache[groupServicePath];

    Module._load = function(request, parent, isMain) {
        if (parent && parent.filename === groupServicePath && request === './connection') {
            return { query: async () => ({ rows: [] }) };
        }
        return originalLoad.apply(this, arguments);
    };

    // Also stub logger if needed
    const loggerPath = path.join(__dirname, '../utils/logger.js');
    if (!require.cache[loggerPath]) {
        require.cache[loggerPath] = {
            id: loggerPath,
            filename: loggerPath,
            loaded: true,
            exports: {
                getTimestamp: () => new Date().toISOString(),
                logger: { info: () => {}, warn: () => {}, error: () => {} }
            }
        };
    }

    gsExports = require('../database/groupService');
    Module._load = originalLoad;
    assert(true, 'groupService loads');
} catch (e) {
    Module._load = originalLoad;
    failed += 3;
    failures.push('groupService must export getGroupAutoTranslate');
    failures.push('groupService must export setGroupAutoTranslate');
    failures.push('groupService must export disableGroupAutoTranslate');
    console.error(`  ✗ groupService load failed — ${e.message}`);
    gsExports = null;
}

if (gsExports) {
    assert(typeof gsExports.getGroupAutoTranslate === 'function',
        'getGroupAutoTranslate exported');
    assert(typeof gsExports.setGroupAutoTranslate === 'function',
        'setGroupAutoTranslate exported');
    assert(typeof gsExports.disableGroupAutoTranslate === 'function',
        'disableGroupAutoTranslate exported');
}

// ─── 4. Cache — second call within TTL must skip DB ─────────────────────────
section('4. Cache — second call within TTL skips DB round-trip');

(async () => {
    let dbCallCount = 0;
    const fakeRow = { auto_translate_from: 'ru', auto_translate_to: 'he' };

    let gsCache = null;
    try {
        const groupServicePath = require.resolve('../database/groupService');
        delete require.cache[groupServicePath];

        Module._load = function(request, parent, isMain) {
            if (parent && parent.filename === groupServicePath && request === './connection') {
                return {
                    query: async (_sql, _params) => {
                        dbCallCount++;
                        return { rows: [fakeRow] };
                    }
                };
            }
            return originalLoad.apply(this, arguments);
        };

        gsCache = require('../database/groupService');
        Module._load = originalLoad;
    } catch (e) {
        Module._load = originalLoad;
        console.log('  ⚠ groupService not yet loadable — cache test skipped (expected during RED)');
        failed++;
        failures.push('cache test: groupService must be loadable');
        return;
    }

    const gGet = gsCache.getGroupAutoTranslate;
    if (typeof gGet !== 'function') {
        assert(false, 'getGroupAutoTranslate available for cache test');
        return;
    }

    const TEST_GROUP = 'test-group-cache@g.us';
    dbCallCount = 0;

    const first  = await gGet(TEST_GROUP);
    const callsAfterFirst  = dbCallCount;
    const second = await gGet(TEST_GROUP);
    const callsAfterSecond = dbCallCount;

    assert(callsAfterFirst === 1,   'first call hits DB exactly once');
    assert(callsAfterSecond === 1,  'second call within TTL does NOT hit DB again (cached)');
    assert(first  !== null && first.from  === 'ru', 'first call returns {from:"ru"}');
    assert(second !== null && second.to   === 'he', 'second call returns {to:"he"} from cache');

    // Clean up so later sections get a fresh load
    delete require.cache[require.resolve('../database/groupService')];

})().then(runRemainingSync).catch(err => {
    console.error('Async section error:', err);
    runRemainingSync();
});

function runRemainingSync() {

// ─── 5. Command parsing — handleTranslationToggle argument formats ───────────
section('5. Command parsing — #autotranslate argument formats');

// Pure function exercising the same parse logic the handler must implement.
function parseAutoTranslateArgs(argsString) {
    // Mirrors what commandHandler.handleTranslationToggle must implement:
    // 'on ru,he'  → { action:'on', from:'ru', to:'he' }
    // 'off'       → { action:'off' }
    // 'status'    → { action:'status' }
    // otherwise   → null
    if (!argsString || typeof argsString !== 'string') return null;
    const parts  = argsString.trim().toLowerCase().split(/\s+/);
    const action = parts[0];

    if (action === 'off')    return { action: 'off' };
    if (action === 'status') return { action: 'status' };
    if (action === 'on') {
        if (!parts[1]) return null;                   // 'on' with no pair
        const pair = parts[1].split(',');
        if (pair.length !== 2 || !pair[0] || !pair[1]) return null;
        return { action: 'on', from: pair[0], to: pair[1] };
    }
    return null;
}

// Valid formats
const r1 = parseAutoTranslateArgs('on ru,he');
assert(r1 !== null && r1.action === 'on' && r1.from === 'ru' && r1.to === 'he',
    '"on ru,he" → {action:on, from:ru, to:he}');

const r2 = parseAutoTranslateArgs('off');
assert(r2 !== null && r2.action === 'off', '"off" → {action:off}');

const r3 = parseAutoTranslateArgs('status');
assert(r3 !== null && r3.action === 'status', '"status" → {action:status}');

// Reversed pair — contract says 'on he,ru' should work
const r4 = parseAutoTranslateArgs('on he,ru');
assert(r4 !== null && r4.action === 'on' && r4.from === 'he' && r4.to === 'ru',
    '"on he,ru" (reversed pair) → {action:on, from:he, to:ru}');

// Invalid formats
assert(parseAutoTranslateArgs('on') === null,
    '"on" with no pair → null');

// 'on russ,hebrew' — long codes must NOT silently map to ru/he
const rLong = parseAutoTranslateArgs('on russ,hebrew');
assert(rLong === null || (rLong.from !== 'ru' && rLong.to !== 'he'),
    '"on russ,hebrew" does not silently produce {from:ru, to:he}');

assert(parseAutoTranslateArgs('') === null,       'empty string → null');
assert(parseAutoTranslateArgs(null) === null,     'null → null (no throw)');
assert(parseAutoTranslateArgs('enable') === null, '"enable" alone → null');
assert(parseAutoTranslateArgs('on ru') === null,  '"on ru" (missing to-lang) → null');
assert(parseAutoTranslateArgs('on ,he') === null, '"on ,he" (missing from-lang) → null');

// ─── 6. Index.js — per-group translation block present ──────────────────────
section('6. index.js — per-group translation block wired in');

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
        'index.js calls getGroupAutoTranslate');
    assert(/isRussian/.test(indexContent),
        'index.js calls isRussian');

    // Find the per-group translation CALL SITE (not the require import)
    // Look for the await getGroupAutoTranslate(... pattern
    const perGroupCallIdx = indexContent.indexOf('await getGroupAutoTranslate');
    const globalIdx       = indexContent.indexOf('AUTO_TRANSLATION');
    assert(
        perGroupCallIdx !== -1 && globalIdx !== -1 && perGroupCallIdx < globalIdx,
        'per-group getGroupAutoTranslate block precedes global AUTO_TRANSLATION block'
    );

    // The sendMessage call in that block must quote the original message
    const perGroupBlock = perGroupCallIdx !== -1
        ? indexContent.slice(perGroupCallIdx, perGroupCallIdx + 600)
        : '';
    assert(/quoted.*msg|msg.*quoted/.test(perGroupBlock),
        'translation sendMessage in index.js quotes the original message');
}

// ─── 7. commandHandler — per-group scope, not global config ─────────────────
section('7. commandHandler — handleTranslationToggle uses per-group DB');

const chPath = path.join(__dirname, '../services/commandHandler.js');
let chContent = null;
try {
    chContent = fs.readFileSync(chPath, 'utf8');
    assert(true, 'commandHandler.js is readable');
} catch (e) {
    assert(false, 'commandHandler.js must be readable');
}

if (chContent) {
    // Find the function DEFINITION (not the call site) by looking for the async def pattern
    const fnDefStart = chContent.indexOf('async handleTranslationToggle');
    // Grab ~2000 chars of the function body to cover the full implementation
    const fnBody = fnDefStart !== -1 ? chContent.slice(fnDefStart, fnDefStart + 2000) : '';

    assert(!fnBody.includes('msg.key.fromMe'),
        'handleTranslationToggle no longer restricts to msg.key.fromMe');

    assert(chContent.includes('setGroupAutoTranslate'),
        'commandHandler calls setGroupAutoTranslate');

    assert(chContent.includes('disableGroupAutoTranslate'),
        'commandHandler calls disableGroupAutoTranslate');

    assert(chContent.includes('getGroupAutoTranslate'),
        'commandHandler calls getGroupAutoTranslate (status action)');

    assert(/remoteJid/.test(fnBody),
        'handleTranslationToggle scopes DB calls to msg.key.remoteJid (the group)');

    assert(!fnBody.includes('config.FEATURES.AUTO_TRANSLATION'),
        'handleTranslationToggle no longer mutates config.FEATURES.AUTO_TRANSLATION');

    // Must parse comma-separated lang pair
    assert(/split\s*\(\s*['"`,]\s*,/.test(fnBody) || /split.*','/.test(fnBody) || /split\(','\)/.test(fnBody) || /\[0\]/.test(fnBody),
        'handleTranslationToggle splits lang pair on comma');
}

// ─── 8. isRussian() performance — confirms pure sync regex ──────────────────
section('8. isRussian() is synchronous pure regex — no API calls');

if (isRussian) {
    const start = Date.now();
    for (let i = 0; i < 10000; i++) {
        isRussian('Привет мир');
        isRussian('Hello world');
        isRussian('');
    }
    const elapsed = Date.now() - start;
    assert(elapsed < 200,
        `isRussian() is pure sync regex (30 000 calls in ${elapsed}ms < 200ms)`);

    const result = isRussian('тест');
    assert(result === true && typeof result === 'boolean',
        'isRussian() returns boolean synchronously (not a Promise)');
} else {
    console.log('  ⚠ isRussian not loaded — performance test skipped');
    failed++;
    failures.push('isRussian performance test skipped (module missing)');
}

// ─── Final summary ───────────────────────────────────────────────────────────
summary();

} // end runRemainingSync
