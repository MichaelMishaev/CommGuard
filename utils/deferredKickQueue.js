const pending = new Map();

const MAX_CALLBACKS_PER_SENDER = 20;
const MAX_DELAY_MS = 15000;
const MIN_DELAY_MS = 50;

/**
 * Enqueues a deferred kick callback for a user in a specific group.
 * Fires asyncFn after delayMs (clamped to [50, 15000]ms). Deduplicates
 * by senderId+groupId. Timer always uses the minimum delay seen for this
 * senderId so earlier-expiring cooldowns are never pushed out.
 *
 * @param {string} senderId - Sender JID (e.g. "123@lid")
 * @param {string} groupId  - Group JID (e.g. "456@g.us")
 * @param {number} delayMs  - Milliseconds to wait before executing
 * @param {() => Promise<void>} asyncFn - Async callback to run (full kick flow)
 */
function enqueueDeferredKick(senderId, groupId, delayMs, asyncFn) {
    const clampedDelay = Math.min(Math.max(delayMs, MIN_DELAY_MS), MAX_DELAY_MS);

    let entry = pending.get(senderId);
    if (!entry) {
        entry = { timerId: null, minDelayMs: clampedDelay, callbacks: new Map() };
        pending.set(senderId, entry);
    }

    if (entry.callbacks.has(groupId)) return;
    if (entry.callbacks.size >= MAX_CALLBACKS_PER_SENDER) return;
    entry.callbacks.set(groupId, asyncFn);

    if (clampedDelay < entry.minDelayMs) {
        entry.minDelayMs = clampedDelay;
    }

    if (entry.timerId) clearTimeout(entry.timerId);
    entry.timerId = setTimeout(async () => {
        pending.delete(senderId);
        for (const [gid, fn] of entry.callbacks) {
            try {
                await fn();
            } catch (e) {
                console.error(`[DeferredKick] Error for ${senderId} in ${gid}:`, e);
            }
        }
    }, entry.minDelayMs);
}

module.exports = { enqueueDeferredKick };
