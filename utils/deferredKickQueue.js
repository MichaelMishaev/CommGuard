const pending = new Map();

/**
 * Enqueues a deferred kick callback for a user in a specific group.
 * Fires asyncFn after delayMs. Deduplicates by senderId+groupId.
 * Timer resets on each new enqueue for the same senderId (uses shortest delay).
 *
 * @param {string} senderId - Sender JID (e.g. "123@lid")
 * @param {string} groupId  - Group JID (e.g. "456@g.us")
 * @param {number} delayMs  - Milliseconds to wait before executing
 * @param {() => Promise<void>} asyncFn - Async callback to run (full kick flow)
 */
function enqueueDeferredKick(senderId, groupId, delayMs, asyncFn) {
    let entry = pending.get(senderId);
    if (!entry) {
        entry = { timerId: null, callbacks: new Map() };
        pending.set(senderId, entry);
    }

    if (entry.callbacks.has(groupId)) return;
    entry.callbacks.set(groupId, asyncFn);

    if (entry.timerId) clearTimeout(entry.timerId);
    entry.timerId = setTimeout(async () => {
        pending.delete(senderId);
        for (const [gid, fn] of entry.callbacks) {
            try {
                await fn();
            } catch (e) {
                console.error(`[DeferredKick] Error for ${senderId} in ${gid}:`, e.message);
            }
        }
    }, delayMs);
}

module.exports = { enqueueDeferredKick };
