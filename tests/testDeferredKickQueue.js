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

    // Test 4: timer always uses shortest delay across all enqueues for same user
    {
        let cA = 0, cB = 0;
        // First enqueue: short delay (50ms)
        enqueueDeferredKick('u4@lid', 'gA@g.us', 50, async () => { cA++; });
        // Second enqueue: longer delay (300ms) — should NOT push the timer out
        enqueueDeferredKick('u4@lid', 'gB@g.us', 300, async () => { cB++; });
        await wait(120);
        assert('Min-delay: both fire at the shorter delay (not pushed to 300ms)', cA === 1 && cB === 1);
    }

    // Test 5: callback error does not prevent other callbacks from running
    {
        let cB = 0;
        enqueueDeferredKick('u5@lid', 'gA@g.us', 50, async () => { throw new Error('boom'); });
        enqueueDeferredKick('u5@lid', 'gB@g.us', 50, async () => { cB++; });
        await wait(100);
        assert('Error in one callback does not block others', cB === 1);
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
}

runTests().catch(e => { console.error(e); process.exit(1); });
