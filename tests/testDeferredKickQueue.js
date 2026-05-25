#!/usr/bin/env node

const { enqueueDeferredKick } = require('../utils/deferredKickQueue');

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

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('🧪 Testing deferredKickQueue\n');

    // Test 1: callback fires after delay
    {
        let fired = false;
        enqueueDeferredKick('u1@lid', 'g1@g.us', 50, async () => { fired = true; });
        assert('Before delay — not fired yet', fired === false);
        await wait(100);
        assert('After delay — fired', fired === true);
    }

    // Test 2: dedup — same senderId+groupId enqueued twice, fires once
    {
        let count = 0;
        enqueueDeferredKick('u2@lid', 'g2@g.us', 50, async () => { count++; });
        enqueueDeferredKick('u2@lid', 'g2@g.us', 50, async () => { count++; });
        await wait(100);
        assert('Dedup: same user+group → fires once', count === 1);
    }

    // Test 3: same user, different groups → both fire
    {
        let cA = 0, cB = 0;
        enqueueDeferredKick('u3@lid', 'gA@g.us', 50, async () => { cA++; });
        enqueueDeferredKick('u3@lid', 'gB@g.us', 50, async () => { cB++; });
        await wait(100);
        assert('Multi-group: group A fires', cA === 1);
        assert('Multi-group: group B fires', cB === 1);
    }

    // Test 4: earlier fire time is never pushed out by a later longer-delay enqueue
    {
        let cA = 0, cB = 0;
        // First: short delay
        enqueueDeferredKick('u4@lid', 'gA@g.us', 50, async () => { cA++; });
        // Second: longer delay — must NOT push the timer out
        enqueueDeferredKick('u4@lid', 'gB@g.us', 300, async () => { cB++; });
        await wait(120);
        assert('Earlier fireAt not pushed out by longer second enqueue', cA === 1 && cB === 1);
    }

    // Test 5: callback error does not prevent other callbacks from running
    {
        let cB = 0;
        enqueueDeferredKick('u5@lid', 'gA@g.us', 50, async () => { throw new Error('boom'); });
        enqueueDeferredKick('u5@lid', 'gB@g.us', 50, async () => { cB++; });
        await wait(100);
        assert('Error in one callback does not block others', cB === 1);
    }

    // Test 6: timer is NOT reset when a longer delay arrives after a shorter one
    {
        let cA = 0, cB = 0;
        const t0 = Date.now();
        // Enqueue short delay first (fires ~T+50ms)
        enqueueDeferredKick('u6@lid', 'gA@g.us', 50, async () => { cA++; });
        // 25ms later enqueue a longer delay (would fire at T+25+300=T+325ms if timer reset)
        await wait(25);
        enqueueDeferredKick('u6@lid', 'gB@g.us', 300, async () => { cB++; });
        // At T+120ms, the short timer should have already fired (both callbacks)
        await wait(95);
        const elapsed = Date.now() - t0;
        assert(`Timer not reset by longer second enqueue (elapsed ${elapsed}ms, expected <200ms)`, cA === 1 && cB === 1 && elapsed < 200);
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
}

runTests().catch(e => { console.error(e); process.exit(1); });
