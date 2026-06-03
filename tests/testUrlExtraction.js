'use strict';
const assert = require('assert');
const { extractPreviewUrls } = require('../utils/urlUtils');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.log(`  ❌ FAIL: ${name}`);
        console.log(`     ${err.message}`);
        failed++;
    }
}

console.log('\n=== testUrlExtraction.js ===\n');

// TC1: null input
test('null input returns []', () => {
    const result = extractPreviewUrls(null);
    assert.deepStrictEqual(result, []);
});

// TC2: empty object
test('empty object returns []', () => {
    const result = extractPreviewUrls({});
    assert.deepStrictEqual(result, []);
});

// TC3: extendedTextMessage present but empty
test('extendedTextMessage empty returns []', () => {
    const result = extractPreviewUrls({ message: { extendedTextMessage: {} } });
    assert.deepStrictEqual(result, []);
});

// TC4: URL only in matchedText (AC1)
test('URL only in matchedText is returned', () => {
    const rawMsg = {
        message: {
            extendedTextMessage: {
                matchedText: 'https://evil.com/malware',
            }
        }
    };
    const result = extractPreviewUrls(rawMsg);
    assert.deepStrictEqual(result, ['https://evil.com/malware']);
});

// TC5: URL only in canonicalUrl (AC2)
test('URL only in canonicalUrl is returned', () => {
    const rawMsg = {
        message: {
            extendedTextMessage: {
                canonicalUrl: 'https://phishing.example.org/login',
            }
        }
    };
    const result = extractPreviewUrls(rawMsg);
    assert.deepStrictEqual(result, ['https://phishing.example.org/login']);
});

// TC6: same URL in both matchedText and canonicalUrl → deduplicated (AC3)
test('duplicate URL in both fields appears exactly once', () => {
    const rawMsg = {
        message: {
            extendedTextMessage: {
                matchedText: 'https://example.com/page',
                canonicalUrl: 'https://example.com/page',
            }
        }
    };
    const result = extractPreviewUrls(rawMsg);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0], 'https://example.com/page');
});

// TC7: URL only in body → extractPreviewUrls returns [] (no regression, AC4)
test('URL only in body (no extendedTextMessage) → extractPreviewUrls returns []', () => {
    const rawMsg = {
        message: {
            conversation: 'check this out https://example.com/page',
        }
    };
    const result = extractPreviewUrls(rawMsg);
    assert.deepStrictEqual(result, []);
});

// TC8: multiple URLs in matchedText → all returned, deduplicated
test('multiple URLs in matchedText are all returned and deduplicated', () => {
    const rawMsg = {
        message: {
            extendedTextMessage: {
                matchedText: 'https://a.com https://b.com https://a.com',
            }
        }
    };
    const result = extractPreviewUrls(rawMsg);
    assert.strictEqual(result.length, 2);
    assert.ok(result.includes('https://a.com'));
    assert.ok(result.includes('https://b.com'));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
