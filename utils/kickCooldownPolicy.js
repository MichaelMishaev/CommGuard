/**
 * Decides whether a user should be kicked, based on their cross-group kick history.
 *
 * Background: WhatsApp throttles repeated kick API calls of the same user. The bot
 * tracks the timestamp of the last kick per user in a Map. This policy enforces a
 * cooldown window: within N milliseconds of the last kick, further kicks for the
 * same user are suppressed. Deletion of invite-link messages is NOT gated by this
 * policy — only the kick action is.
 *
 * @param {Map<string, number>} kickCooldownMap  Map of senderId → timestamp (ms) of last kick
 * @param {string} senderId                       Sender JID (e.g. "123@lid" or "123@s.whatsapp.net")
 * @param {number} now                            Current time in ms (Date.now())
 * @param {number} cooldownMs                     Cooldown window in ms
 * @returns {{ shouldKick: boolean, reason: string, cooldownAgeMs?: number, cooldownExpiresInMs?: number }}
 */
function decideKick(kickCooldownMap, senderId, now, cooldownMs) {
    const lastKick = kickCooldownMap.get(senderId);
    if (!lastKick) {
        return { shouldKick: true, reason: 'ok' };
    }
    const cooldownAgeMs = now - lastKick;
    if (cooldownAgeMs < cooldownMs) {
        return {
            shouldKick: false,
            reason: 'cooldown_active',
            cooldownAgeMs,
            cooldownExpiresInMs: cooldownMs - cooldownAgeMs,
        };
    }
    return { shouldKick: true, reason: 'ok' };
}

module.exports = { decideKick };
