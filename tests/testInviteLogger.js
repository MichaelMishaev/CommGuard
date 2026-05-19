#!/usr/bin/env node

/**
 * Unit tests for inviteLogger.formatInviteOutcome.
 * Run: node tests/testInviteLogger.js
 */

const { formatInviteOutcome } = require('../utils/inviteLogger');

let passed = 0;
let failed = 0;

function assert(label, condition, actual, expected) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.log(`  ❌ ${label}`);
        if (actual !== undefined) {
            console.log(`     actual:   ${actual}`);
            console.log(`     expected: ${expected}`);
        }
        failed++;
    }
}

console.log('🧪 Testing inviteLogger.formatInviteOutcome\n');

// Scenario 1: Happy path — clean delete + kick
{
    const out = formatInviteOutcome({
        msgId: 'ABC123',
        group: 'Crypto Talk',
        groupId: '120363@g.us',
        user: '205544@lid',
        phone: '972567261261',
        link: 'https://chat.whatsapp.com/XYZ',
        deleted: true,
        deleteReason: 'ok',
        kicked: true,
        kickReason: 'ok',
        cooldownExpiresInMs: null,
    });
    assert('Clean delete+kick: starts with INVITE_OUTCOME marker', out.startsWith('📋 INVITE_OUTCOME'));
    assert('Clean delete+kick: contains deleted=YES', out.includes('deleted=YES'));
    assert('Clean delete+kick: contains kicked=YES', out.includes('kicked=YES'));
    assert('Clean delete+kick: cooldownExpiresInMs=-', out.includes('cooldownExpiresInMs=-'));
}

// Scenario 2: Cooldown skip — delete YES, kick NO with ms remaining
{
    const out = formatInviteOutcome({
        msgId: 'DEF456',
        group: 'מועדון האמהות - נתניה',
        groupId: '120363398653946949@g.us',
        user: '205544954552423@lid',
        phone: '972567261261',
        link: 'https://chat.whatsapp.com/CT79U7',
        deleted: true,
        deleteReason: 'ok',
        kicked: false,
        kickReason: 'cooldown_active',
        cooldownExpiresInMs: 6042,
    });
    assert('Cooldown skip: deleted=YES', out.includes('deleted=YES'));
    assert('Cooldown skip: kicked=NO', out.includes('kicked=NO'));
    assert('Cooldown skip: kickReason="cooldown_active"', out.includes('kickReason="cooldown_active"'));
    assert('Cooldown skip: cooldownExpiresInMs=6042', out.includes('cooldownExpiresInMs=6042'));
    assert('Hebrew group subject is preserved', out.includes('מועדון האמהות - נתניה'));
}

// Scenario 3: Group subject with double-quote — must be escaped to single quote
{
    const out = formatInviteOutcome({
        msgId: 'X',
        group: 'Bob "the boss" Smith',
        groupId: 'g@g.us',
        user: 'u@lid',
        phone: '1',
        link: 'l',
        deleted: true,
        deleteReason: 'ok',
        kicked: true,
        kickReason: 'ok',
        cooldownExpiresInMs: null,
    });
    assert('Double quotes in group subject → replaced with single quotes', out.includes("group=\"Bob 'the boss' Smith\""));
    assert('Resulting line has exactly 2 double-quotes around group value', (out.match(/group="[^"]*"/) || []).length === 1);
}

// Scenario 4: Missing/null fields → fall back to "-"
{
    const out = formatInviteOutcome({
        msgId: null,
        group: null,
        groupId: 'g@g.us',
        user: 'u@lid',
        phone: null,
        link: null,
        deleted: false,
        deleteReason: 'no_delete_permission',
        kicked: false,
        kickReason: 'not_attempted',
        cooldownExpiresInMs: null,
    });
    assert('Null msgId → msgId=-', out.includes('msgId=-'));
    assert('Null group → group=""', out.includes('group=""'));
    assert('Null phone → phone=+unknown', out.includes('phone=+unknown'));
    assert('Null link → link=-', out.includes('link=-'));
}

// Scenario 5: Single line — no embedded newlines
{
    const out = formatInviteOutcome({
        msgId: 'X', group: 'g', groupId: 'g@g.us', user: 'u', phone: '1',
        link: 'l', deleted: true, deleteReason: 'ok', kicked: true, kickReason: 'ok',
        cooldownExpiresInMs: null,
    });
    assert('Output is single-line (no \\n)', !out.includes('\n'));
}

// Scenario 6: Output is grep-able for "deleted=NO"
{
    const out = formatInviteOutcome({
        msgId: 'X', group: 'g', groupId: 'g@g.us', user: 'u', phone: '1',
        link: 'l', deleted: false, deleteReason: 'stealth_failure', kicked: false, kickReason: 'not_attempted',
        cooldownExpiresInMs: null,
    });
    assert('grep \'deleted=NO\' matches', out.includes('deleted=NO'));
}

// Scenario 7: logInviteOutcome survives a throwing getTimestamp
{
    const { logInviteOutcome } = require('../utils/inviteLogger');
    const throwingTs = () => { throw new Error('clock broken'); };
    let threw = false;
    try {
        logInviteOutcome(throwingTs, {
            msgId: 'X', group: 'g', groupId: 'g@g.us', user: 'u', phone: '1',
            link: 'l', deleted: true, deleteReason: 'ok', kicked: true, kickReason: 'ok',
            cooldownExpiresInMs: null,
        });
    } catch (_) {
        threw = true;
    }
    assert('logInviteOutcome does NOT throw when getTimestamp throws', threw === false);
}

// Scenario 8: logInviteOutcome survives an undefined getTimestamp
{
    const { logInviteOutcome } = require('../utils/inviteLogger');
    let threw = false;
    try {
        logInviteOutcome(undefined, {
            msgId: 'X', group: 'g', groupId: 'g@g.us', user: 'u', phone: '1',
            link: 'l', deleted: true, deleteReason: 'ok', kicked: true, kickReason: 'ok',
            cooldownExpiresInMs: null,
        });
    } catch (_) {
        threw = true;
    }
    assert('logInviteOutcome does NOT throw when getTimestamp is undefined', threw === false);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
