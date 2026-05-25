const pending = new Map();

const MAX_CALLBACKS_PER_SENDER = 20;
const MAX_DELAY_MS = 15000;
const MIN_DELAY_MS = 50;

/**
 * Enqueues a deferred kick callback for a user in a specific group.
 * Fires asyncFn at the earliest absolute fire time across all enqueues
 * for the same senderId. Deduplicates by senderId+groupId.
 *
 * @param {string} senderId - Sender JID (e.g. "123@lid")
 * @param {string} groupId  - Group JID (e.g. "456@g.us")
 * @param {number} delayMs  - Milliseconds to wait before executing
 * @param {() => Promise<void>} asyncFn - Async callback to run (full kick flow)
 */
function enqueueDeferredKick(senderId, groupId, delayMs, asyncFn) {
    const clampedDelay = Math.min(Math.max(delayMs, MIN_DELAY_MS), MAX_DELAY_MS);
    const proposedFireAt = Date.now() + clampedDelay;

    let entry = pending.get(senderId);
    if (!entry) {
        entry = { timerId: null, fireAt: proposedFireAt, callbacks: new Map() };
        pending.set(senderId, entry);
    }

    if (entry.callbacks.has(groupId)) return;
    if (entry.callbacks.size >= MAX_CALLBACKS_PER_SENDER) return;
    entry.callbacks.set(groupId, asyncFn);

    if (entry.timerId !== null && proposedFireAt >= entry.fireAt) {
        // Timer already running and new fire time is not earlier — keep existing timer untouched
        return;
    }

    // Either first enqueue (no timer yet) or new fire time is earlier — schedule/reschedule
    entry.fireAt = proposedFireAt;
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
    }, clampedDelay);
}

module.exports = { enqueueDeferredKick };
