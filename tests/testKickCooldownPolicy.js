#!/usr/bin/env node

/**
 * Unit tests for kickCooldownPolicy.
 * Run: node tests/testKickCooldownPolicy.js
 */

const { decideKick } = require('../utils/kickCooldownPolicy');

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
}

console.log('🧪 Testing kickCooldownPolicy.decideKick\n');

// Scenario 1: No prior kick → should kick
{
    const map = new Map();
    const result = decideKick(map, 'user@lid', 1000, 10000);
    assert('No prior kick → shouldKick=true', result.shouldKick === true);
    assert('No prior kick → reason="ok"', result.reason === 'ok');
}

// Scenario 2: Recent kick within cooldown → should NOT kick
{
    const map = new Map([['user@lid', 5000]]);
    const result = decideKick(map, 'user@lid', 9000, 10000);
    assert('4s after kick (cooldown 10s) → shouldKick=false', result.shouldKick === false);
    assert('Reason is cooldown_active', result.reason === 'cooldown_active');
    assert('cooldownAgeMs is 4000', result.cooldownAgeMs === 4000);
    assert('cooldownExpiresInMs is 6000', result.cooldownExpiresInMs === 6000);
}

// Scenario 3: Kick older than cooldown window → should kick
{
    const map = new Map([['user@lid', 1000]]);
    const result = decideKick(map, 'user@lid', 15000, 10000);
    assert('14s after kick (cooldown 10s) → shouldKick=true', result.shouldKick === true);
    assert('Stale kick → reason="ok"', result.reason === 'ok');
}

// Scenario 4: Different user has prior kick → current user should still kick
{
    const map = new Map([['other@lid', 5000]]);
    const result = decideKick(map, 'user@lid', 9000, 10000);
    assert('Different user cooldown does not affect current → shouldKick=true', result.shouldKick === true);
}

// Scenario 5: Boundary — kick exactly cooldownMs ago → should kick (cooldown expired)
{
    const map = new Map([['user@lid', 5000]]);
    const result = decideKick(map, 'user@lid', 15000, 10000);
    assert('Exactly 10s after kick (cooldown 10s) → shouldKick=true (boundary)', result.shouldKick === true);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
