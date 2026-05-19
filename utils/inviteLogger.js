/**
 * Formats and logs a single structured "INVITE_OUTCOME" line per invite-link incident.
 *
 * The line is grep-able by design:
 *   grep 'INVITE_OUTCOME' logs              → all incidents
 *   grep 'INVITE_OUTCOME.*deleted=NO' logs  → missed deletions
 *   grep 'INVITE_OUTCOME.*kicked=NO' logs   → users not kicked (cooldown or permission)
 *
 * All fields are emitted on a single line. Group subject can contain Hebrew/Russian/
 * special characters; double-quotes inside the subject are replaced with single-quotes
 * to keep the line parseable as `key="value"` pairs.
 *
 * Field order is fixed for stable parsing across log analysis tools.
 */
function formatInviteOutcome(fields) {
    const {
        msgId, group, groupId, user, phone, link,
        deleted, deleteReason, kicked, kickReason, cooldownExpiresInMs,
    } = fields;

    const safeGroup = (group == null ? '' : String(group)).replace(/"/g, "'");
    const cooldownStr = cooldownExpiresInMs == null ? '-' : String(cooldownExpiresInMs);

    return [
        '📋 INVITE_OUTCOME',
        `msgId=${msgId == null ? '-' : msgId}`,
        `group="${safeGroup}"`,
        `groupId=${groupId}`,
        `user=${user}`,
        `phone=+${phone == null ? 'unknown' : phone}`,
        `link=${link == null ? '-' : link}`,
        `deleted=${deleted ? 'YES' : 'NO'}`,
        `deleteReason="${deleteReason || '-'}"`,
        `kicked=${kicked ? 'YES' : 'NO'}`,
        `kickReason="${kickReason || '-'}"`,
        `cooldownExpiresInMs=${cooldownStr}`,
    ].join(' ');
}

/**
 * Safe wrapper around formatInviteOutcome that:
 *   1. Catches its own errors (logging must never crash the bot)
 *   2. Falls back to a JSON dump if formatting throws
 *
 * @param {function(): string} getTimestamp  Function that returns a formatted timestamp string
 * @param {object} fields                    The same shape as formatInviteOutcome's input
 */
function logInviteOutcome(getTimestamp, fields) {
    try {
        console.log(`[${getTimestamp()}] ${formatInviteOutcome(fields)}`);
    } catch (err) {
        try {
            console.log(`[${getTimestamp()}] 📋 INVITE_OUTCOME FALLBACK ${JSON.stringify(fields)}`);
        } catch (_) {
            // Swallow — never throw from a log call
        }
    }
}

module.exports = { formatInviteOutcome, logInviteOutcome };
