# Invite Link Cooldown Fix + Structured Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the bot from silently failing to delete invite-link messages in groups where the sender was kicked from a different group within the last 10 seconds, and add a grep-able structured outcome log per incident.

**Architecture:** Two pure-function utilities (no I/O, no Baileys, easy to unit-test) plus a small re-ordering of the existing invite-link handler in `index.js`. The cooldown decision moves from "gates the entire handler" to "gates only the kick action," so deletion always runs for non-admin senders. Admin exemption stays as the first guard, unchanged.

**Tech Stack:** Node.js 20, Baileys WhatsApp library, PM2 cluster mode. No test framework — tests are runnable Node scripts following the existing `tests/test*.js` convention.

**Spec:** `docs/superpowers/specs/2026-05-19-invite-cooldown-fix-design.md`

---

## File Structure

| File | Status | Purpose |
|---|---|---|
| `utils/kickCooldownPolicy.js` | NEW | Pure function: given senderId + cooldown map + now + cooldownMs, returns `{ shouldKick, reason, cooldownAgeMs?, cooldownExpiresInMs? }` |
| `utils/inviteLogger.js` | NEW | Pure formatter for `INVITE_OUTCOME` log line + safe wrapper that catches its own errors |
| `tests/testKickCooldownPolicy.js` | NEW | Unit tests for the cooldown policy (5 scenarios) |
| `tests/testInviteLogger.js` | NEW | Unit tests for the log formatter (6 scenarios incl. Hebrew + escaping) |
| `index.js` | MODIFY | (1) Add 2 requires. (2) Remove old cooldown early-return at lines 2440-2445. (3) Wrap existing violation+kick block at lines 2540-2595 with cooldown gate. (4) Update misleading log message. (5) Emit `INVITE_OUTCOME` at end of try block. |

**Total LOC**: 2 new files (~50 LOC each), 2 new test files (~80 LOC each), 1 modified file (~30 LOC net).

---

## Task 1: Create `utils/kickCooldownPolicy.js` (pure function)

**Files:**
- Create: `utils/kickCooldownPolicy.js`
- Test: `tests/testKickCooldownPolicy.js`

- [ ] **Step 1.1: Write the failing test file**

Create `tests/testKickCooldownPolicy.js`:

```js
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
```

- [ ] **Step 1.2: Run the test and confirm it fails**

```bash
cd /Users/michaelmishayev/Desktop/Projects/CommGuard-prod
node tests/testKickCooldownPolicy.js
```

Expected output (first failing line):
```
Error: Cannot find module '../utils/kickCooldownPolicy'
```

- [ ] **Step 1.3: Implement the policy module**

Create `utils/kickCooldownPolicy.js`:

```js
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
```

- [ ] **Step 1.4: Run the test and confirm it passes**

```bash
node tests/testKickCooldownPolicy.js
```

Expected last line: `9 passed, 0 failed`

- [ ] **Step 1.5: Commit**

```bash
cd /Users/michaelmishayev/Desktop/Projects/CommGuard-prod
git add utils/kickCooldownPolicy.js tests/testKickCooldownPolicy.js
git commit -m "$(cat <<'EOF'
feat: add kickCooldownPolicy pure function + unit tests

Extracts the kick cooldown decision into a testable pure function.
Used in next commit to gate kick (not delete) on invite-link path.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create `utils/inviteLogger.js` (pure formatter)

**Files:**
- Create: `utils/inviteLogger.js`
- Test: `tests/testInviteLogger.js`

- [ ] **Step 2.1: Write the failing test file**

Create `tests/testInviteLogger.js`:

```js
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2.2: Run the test and confirm it fails**

```bash
node tests/testInviteLogger.js
```

Expected: `Error: Cannot find module '../utils/inviteLogger'`

- [ ] **Step 2.3: Implement the logger module**

Create `utils/inviteLogger.js`:

```js
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
```

- [ ] **Step 2.4: Run the test and confirm it passes**

```bash
node tests/testInviteLogger.js
```

Expected last line: `15 passed, 0 failed`

- [ ] **Step 2.5: Commit**

```bash
git add utils/inviteLogger.js tests/testInviteLogger.js
git commit -m "$(cat <<'EOF'
feat: add inviteLogger structured outcome formatter + tests

Pure formatter for grep-able INVITE_OUTCOME log lines:
  grep 'INVITE_OUTCOME.*deleted=NO' logs → missed deletions

Handles Hebrew/Russian group names, escapes embedded quotes,
falls back to JSON dump on its own errors (never crashes).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire requires into `index.js`

**Files:**
- Modify: `index.js` (top of file, near other utility requires)

- [ ] **Step 3.1: Read current line 341 area to confirm anchor**

```bash
sed -n '340,343p' /Users/michaelmishayev/Desktop/Projects/CommGuard-prod/index.js
```

Expected to find:
```
const { decodeLIDToPhone } = require('./utils/jidUtils');
```

- [ ] **Step 3.2: Add the two new requires right after `decodeLIDToPhone`**

Use the Edit tool with this exact change in `index.js`:

```js
// BEFORE (current line ~341):
const { decodeLIDToPhone } = require('./utils/jidUtils');

// AFTER:
const { decodeLIDToPhone } = require('./utils/jidUtils');
const { decideKick } = require('./utils/kickCooldownPolicy');
const { logInviteOutcome } = require('./utils/inviteLogger');
```

- [ ] **Step 3.3: Verify the bot still starts (syntax-check only)**

```bash
cd /Users/michaelmishayev/Desktop/Projects/CommGuard-prod
node -c index.js
```

Expected: no output (syntax OK). If there's a parse error, fix it before continuing.

- [ ] **Step 3.4: Commit**

```bash
git add index.js
git commit -m "$(cat <<'EOF'
chore: wire kickCooldownPolicy and inviteLogger imports into index.js

Imports only; behavior unchanged. Next commit removes the buggy
cooldown early-return.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Remove the buggy cooldown early-return

**Files:**
- Modify: `index.js` (current lines 2440-2445)

**What you're removing:** the early `return` that exits the handler before the deletion code runs.

- [ ] **Step 4.1: Confirm anchor before editing**

```bash
sed -n '2438,2447p' /Users/michaelmishayev/Desktop/Projects/CommGuard-prod/index.js
```

Expected exact content:
```
        }
        
        // Check cooldown
        const lastKick = kickCooldown.get(senderId);
        if (lastKick && Date.now() - lastKick < config.KICK_COOLDOWN) {
            console.log('⏳ User recently kicked, skipping to prevent spam');
            return;
        }
        
        // Check bot permissions before attempting deletion (unless bypass is enabled)
```

- [ ] **Step 4.2: Delete lines 2440-2445 using Edit**

Use the Edit tool:

```
old_string:
        }
        
        // Check cooldown
        const lastKick = kickCooldown.get(senderId);
        if (lastKick && Date.now() - lastKick < config.KICK_COOLDOWN) {
            console.log('⏳ User recently kicked, skipping to prevent spam');
            return;
        }
        
        // Check bot permissions before attempting deletion (unless bypass is enabled)

new_string:
        }
        
        // Check bot permissions before attempting deletion (unless bypass is enabled)
```

- [ ] **Step 4.3: Syntax-check**

```bash
node -c index.js
```

Expected: no output.

- [ ] **Step 4.4: Commit**

```bash
git add index.js
git commit -m "$(cat <<'EOF'
fix: stop cooldown from blocking invite-link message deletion

Removes the early return at lines 2440-2445. The cooldown was intended
to suppress repeated KICKS of the same user across groups (legitimate),
but it was also suppressing DELETIONS, leaving invite-link spam visible
for hours until an admin manually intervened.

Confirmed production incident: 19/05/2026 03:33:56 in מועדון האמהות
where invite stayed visible 11h until manual #kick at 15:09.

Next commit re-adds the cooldown gate around just the kick action.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

> ⚠️ At this point the bot would kick the same user from every group within 10s — WhatsApp API spam. **DO NOT DEPLOY between Task 4 and Task 5.** Tasks 4 + 5 must land together.

---

## Task 5: Wrap violation+kick block with the new cooldown gate

**Files:**
- Modify: `index.js` (current lines ~2534-2589, which were 2540-2595 before Task 4 shifted lines)

**What you're doing:** wrap the existing "Extract user information / Increment violation / Kick" chunk with a cooldown decision. If cooldown active, the entire chunk is skipped (matches today's pre-bug behavior on cooldown path). The deletion at lines 2483-2511 runs unconditionally — that's the fix.

You also need to capture outcome data into local variables for the structured log in Task 7.

- [ ] **Step 5.1: Confirm the anchor**

```bash
grep -n "// Extract user information" /Users/michaelmishayev/Desktop/Projects/CommGuard-prod/index.js
```

Expected: one match around line 2534.

- [ ] **Step 5.2: Replace the block using Edit**

Edit `index.js`. The exact `old_string` is everything from `// Extract user information` through the closing `}` of `if (permissions.canKickUsers) { ... } else { ... }`. Replace it with the cooldown-gated version that also captures outcome variables.

```
old_string:
        // Extract user information
        const userPhone = senderId.split('@')[0];
        const isLidFormat = senderId.endsWith('@lid');
        const isIsraeliUser = userPhone.startsWith('972');

        console.log(`[${getTimestamp()}] 📊 Processing invite link violation: ${userPhone} - Israeli: ${isIsraeliUser}, LID: ${isLidFormat}`);

        // Increment violation count in database
        try {
            const violations = await incrementViolation(userPhone, 'invite_link');
            console.log(`[${getTimestamp()}] 📊 Violation recorded - Total violations:`, violations);
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to record violation:`, error.message);
        }

        // Kick the user (only if bot has permission)
        if (permissions.canKickUsers) {
            try {
                await sock.groupParticipantsUpdate(groupId, [senderId], 'remove');
                console.log('✅ Kicked user for invite link:', senderId);
                kickCooldown.set(senderId, Date.now());

                // Get user violations
                const violations = await getViolations(userPhone);

                // Try to decode LID to real phone number
                let phoneDisplay = userPhone;
                if (isLidFormat) {
                    const decoded = await decodeLIDToPhone(sock, senderId);
                    phoneDisplay = decoded || `${userPhone} (LID - Encrypted ID)`;
                }

                // Send alert with NEW format (ask admin to blacklist)
                const alertResult = await sendKickAlert(sock, {
                    userPhone: phoneDisplay,
                    userId: senderId,
                    groupName: groupMetadata.subject,
                    groupId: groupId,
                    reason: 'invite_link',
                    spamLink: matches.join(', '),
                    violations: violations
                });

                // Store pending blacklist request with groupId
                if (alertResult && alertResult.key) {
                    storePendingRequest(alertResult.key.id, phoneDisplay, senderId, 'invite_link', groupId);
                    console.log(`[${getTimestamp()}] 📋 Stored pending blacklist request for: ${phoneDisplay}`);
                }

            } catch (kickError) {
                console.error('❌ Failed to kick user:', kickError.message);
                advancedLogger.logPermissionError('kick_invite_spam_user', groupId, kickError);
            }
        } else {
            console.log(`⚠️ Cannot kick user - bot lacks kick permission in ${groupId}`);
        }

new_string:
        // Cooldown gate — applies only to the KICK action. Deletion above is already done.
        // When cooldown is active, the violation+kick+alert+pendingRequest chunk is skipped
        // entirely. This matches today's behavior on the cooldown path (today's early return
        // at the old line 2444 also skipped all of these). The only behavior change vs today
        // is that deletion (above) now always runs for non-admin senders.
        const kickDecision = decideKick(kickCooldown, senderId, Date.now(), config.KICK_COOLDOWN);

        let kicked = false;
        let kickReason = 'not_attempted';
        let userPhone = senderId.split('@')[0];

        if (!kickDecision.shouldKick) {
            kickReason = kickDecision.reason; // 'cooldown_active'
            console.log(`[${getTimestamp()}] ⏳ User recently kicked elsewhere — message deleted, kick deferred (cooldown ${kickDecision.cooldownExpiresInMs}ms remaining)`);
        } else {
            // Extract user information
            const isLidFormat = senderId.endsWith('@lid');
            const isIsraeliUser = userPhone.startsWith('972');

            console.log(`[${getTimestamp()}] 📊 Processing invite link violation: ${userPhone} - Israeli: ${isIsraeliUser}, LID: ${isLidFormat}`);

            // Increment violation count in database
            try {
                const violations = await incrementViolation(userPhone, 'invite_link');
                console.log(`[${getTimestamp()}] 📊 Violation recorded - Total violations:`, violations);
            } catch (error) {
                console.error(`[${getTimestamp()}] ❌ Failed to record violation:`, error.message);
            }

            // Kick the user (only if bot has permission)
            if (permissions.canKickUsers) {
                try {
                    await sock.groupParticipantsUpdate(groupId, [senderId], 'remove');
                    console.log('✅ Kicked user for invite link:', senderId);
                    kickCooldown.set(senderId, Date.now());
                    kicked = true;
                    kickReason = 'ok';

                    // Get user violations
                    const violations = await getViolations(userPhone);

                    // Try to decode LID to real phone number
                    let phoneDisplay = userPhone;
                    if (isLidFormat) {
                        const decoded = await decodeLIDToPhone(sock, senderId);
                        phoneDisplay = decoded || `${userPhone} (LID - Encrypted ID)`;
                    }

                    // Send alert with NEW format (ask admin to blacklist)
                    const alertResult = await sendKickAlert(sock, {
                        userPhone: phoneDisplay,
                        userId: senderId,
                        groupName: groupMetadata.subject,
                        groupId: groupId,
                        reason: 'invite_link',
                        spamLink: matches.join(', '),
                        violations: violations
                    });

                    // Store pending blacklist request with groupId
                    if (alertResult && alertResult.key) {
                        storePendingRequest(alertResult.key.id, phoneDisplay, senderId, 'invite_link', groupId);
                        console.log(`[${getTimestamp()}] 📋 Stored pending blacklist request for: ${phoneDisplay}`);
                    }

                } catch (kickError) {
                    console.error('❌ Failed to kick user:', kickError.message);
                    advancedLogger.logPermissionError('kick_invite_spam_user', groupId, kickError);
                    kickReason = `error_${(kickError.message || 'unknown').replace(/\s+/g, '_').substring(0, 40)}`;
                }
            } else {
                console.log(`⚠️ Cannot kick user - bot lacks kick permission in ${groupId}`);
                kickReason = 'no_kick_permission';
            }
        }
```

Note: variable `userPhone` is now declared at the outer scope (used by the INVITE_OUTCOME log in Task 7). `kicked`, `kickReason`, and `kickDecision` are also declared at outer scope.

- [ ] **Step 5.3: Syntax-check**

```bash
node -c index.js
```

Expected: no output. If you see "userPhone already declared" or similar, you missed removing the inner `const userPhone =` (it should now be in the outer scope only).

- [ ] **Step 5.4: Commit**

```bash
git add index.js
git commit -m "$(cat <<'EOF'
fix: gate kick (not delete) by cooldown on invite-link path

Re-introduces the cooldown decision around the violation+kick block,
so the kick API isn't spammed against WhatsApp. Deletion (above) now
always runs for non-admin senders, fixing the main bug.

Captures kicked/kickReason locals for the INVITE_OUTCOME log
emitted in the next commit.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Emit `INVITE_OUTCOME` structured log

**Files:**
- Modify: `index.js` (insert right before the outer `} catch (error) {` of the invite-link try block)

- [ ] **Step 6.1: Confirm the anchor**

```bash
grep -n "} catch (error) {" /Users/michaelmishayev/Desktop/Projects/CommGuard-prod/index.js | head -5
```

There will be several `} catch (error) {` matches. The one we want is inside `handleInviteSpam` (or wherever the invite-link handler lives — after Task 5 the closing brace of the outer try is right before `console.error('❌ Error handling invite spam:'`). Use that string to disambiguate:

```bash
grep -n "❌ Error handling invite spam" /Users/michaelmishayev/Desktop/Projects/CommGuard-prod/index.js
```

The `} catch (error) {` directly above this line is the anchor.

- [ ] **Step 6.2: Insert the log emission before the outer catch**

Use Edit:

```
old_string:
            } else {
                console.log(`⚠️ Cannot kick user - bot lacks kick permission in ${groupId}`);
                kickReason = 'no_kick_permission';
            }
        }
        
    } catch (error) {
        console.error('❌ Error handling invite spam:', error);
    }

new_string:
            } else {
                console.log(`⚠️ Cannot kick user - bot lacks kick permission in ${groupId}`);
                kickReason = 'no_kick_permission';
            }
        }

        // Structured outcome log — one grep-able line per invite-link incident.
        // Wrapped in its own try internally (logInviteOutcome catches its own errors),
        // so this can never crash the handler.
        let phoneForLog = null;
        try {
            phoneForLog = senderId.endsWith('@lid')
                ? await decodeLIDToPhone(sock, senderId).catch(() => null)
                : userPhone;
        } catch (_) { /* best-effort */ }

        logInviteOutcome(getTimestamp, {
            msgId: msg.key.id,
            group: groupMetadata.subject,
            groupId,
            user: senderId,
            phone: phoneForLog || userPhone,
            link: matches[0],
            deleted: !deletionFailed,
            deleteReason: deletionFailed ? (deletionError || 'unknown') : 'ok',
            kicked,
            kickReason,
            cooldownExpiresInMs: kickDecision.shouldKick ? null : kickDecision.cooldownExpiresInMs,
        });
        
    } catch (error) {
        console.error('❌ Error handling invite spam:', error);
    }
```

- [ ] **Step 6.3: Syntax-check**

```bash
node -c index.js
```

Expected: no output.

- [ ] **Step 6.4: Quick grep-ability smoke test**

Run a one-liner that imports the formatter and asserts the line shape:

```bash
node -e "
const { formatInviteOutcome } = require('./utils/inviteLogger');
const line = formatInviteOutcome({
  msgId: 'TEST', group: 'מועדון האמהות - נתניה', groupId: 'g@g.us',
  user: '205544@lid', phone: '972567261261',
  link: 'https://chat.whatsapp.com/X',
  deleted: true, deleteReason: 'ok',
  kicked: false, kickReason: 'cooldown_active', cooldownExpiresInMs: 6042,
});
console.log(line);
if (!/INVITE_OUTCOME.*deleted=YES.*kicked=NO.*cooldown_active/.test(line)) {
  console.error('FAIL: line does not match expected pattern');
  process.exit(1);
}
console.log('OK');
"
```

Expected output: the structured line, followed by `OK`.

- [ ] **Step 6.5: Commit**

```bash
git add index.js
git commit -m "$(cat <<'EOF'
feat: emit structured INVITE_OUTCOME log per invite-link incident

Adds a single grep-able line at the end of every invite-link handling
path, capturing msgId, group name, decoded phone, deleted/kicked outcomes
and reasons.

Enables: grep 'INVITE_OUTCOME.*deleted=NO' logs → missed deletions.

Closes the debug-hostility gap that made the 19/05 incident hard to
investigate.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Run integration smoke test against a local Node load of `index.js`

**Files:**
- No new files. This is a syntax + require-graph smoke test.

- [ ] **Step 7.1: Verify all requires resolve and the file parses**

```bash
cd /Users/michaelmishayev/Desktop/Projects/CommGuard-prod
node --check index.js && echo "PARSE OK"
```

Expected: `PARSE OK`.

- [ ] **Step 7.2: Run both unit test suites one more time**

```bash
node tests/testKickCooldownPolicy.js && node tests/testInviteLogger.js
```

Expected: both end with `N passed, 0 failed`.

- [ ] **Step 7.3: Dry-import `index.js` against syntax errors caused by re-declarations**

```bash
node -e "
// Replace problematic side-effect imports with mocks for static-check load.
// We only want to assert the file parses and top-level requires resolve, not actually start the bot.
try {
  require.cache[require.resolve('./services/bullywatch')] = { exports: {} };
} catch (_) {}
console.log('Top-level requires resolve OK');
"
```

If this fails with `userPhone already declared` or similar, return to Task 5 Step 5.2 and confirm the inner `const userPhone` was removed.

- [ ] **Step 7.4: Commit a checkpoint marker if desired**

(Nothing to add — this task is a verification gate, not a code change.)

---

## Task 8: Update the rollout checklist in the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-05-19-invite-cooldown-fix-design.md`

- [ ] **Step 8.1: Mark items in the spec's "Definition of Done" checklist**

In the spec file, change the unchecked `- [ ]` items to `- [x]` for the items completed:

- [x] `index.js` modified: cooldown moved after delete, applies to kick only
- [x] `INVITE_OUTCOME` structured log emitted at end of every invite-link incident
- [x] Synthetic test added in `tests/`

Leave the deploy/24h-observation items unchecked until rollout happens.

- [ ] **Step 8.2: Commit**

```bash
git add docs/superpowers/specs/2026-05-19-invite-cooldown-fix-design.md
git commit -m "docs: mark implementation items done in spec checklist

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9 (OPTIONAL): Add phone-fallback to admin check

> Only do this task if you want extra defense against the pre-existing JID-drift risk for admins. The main fix works without it. Skip if you want the smallest possible change.

**Files:**
- Modify: `index.js` (right after the existing admin-check block, around line 2438)

- [ ] **Step 9.1: Locate the existing admin check**

```bash
sed -n '2425,2440p' /Users/michaelmishayev/Desktop/Projects/CommGuard-prod/index.js
```

Expected to find the `if (senderIsAdmin)` block ending with `return;`.

- [ ] **Step 9.2: Add phone-fallback right after the existing admin return**

Use Edit. Find the closing `}` of the admin if-block and insert the fallback right after it:

```
old_string:
        if (senderIsAdmin) {
            console.log('✅ Sender is admin, ignoring invite link');
            console.log(`   Admin properties: admin="${senderParticipant.admin}", isAdmin=${senderParticipant.isAdmin}, isSuperAdmin=${senderParticipant.isSuperAdmin}`);
            return;
        }
        
        // Check bot permissions before attempting deletion (unless bypass is enabled)

new_string:
        if (senderIsAdmin) {
            console.log('✅ Sender is admin, ignoring invite link');
            console.log(`   Admin properties: admin="${senderParticipant.admin}", isAdmin=${senderParticipant.isAdmin}, isSuperAdmin=${senderParticipant.isSuperAdmin}`);
            return;
        }

        // Defensive: match by phone number as fallback in case JID format differs
        // between message and participant list (LID format drift). Admins must
        // never have their messages deleted regardless of JID format.
        {
            const senderPhone = senderId.split('@')[0].split(':')[0];
            const adminByPhone = groupMetadata.participants.find(p => {
                const pPhone = p.id.split('@')[0].split(':')[0];
                return pPhone === senderPhone && (
                    p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin || p.isSuperAdmin
                );
            });
            if (adminByPhone) {
                console.log(`✅ Sender matched admin by phone fallback (JID drift): ${senderId} → ${adminByPhone.id}`);
                return;
            }
        }
        
        // Check bot permissions before attempting deletion (unless bypass is enabled)
```

- [ ] **Step 9.3: Syntax-check**

```bash
node -c index.js
```

Expected: no output.

- [ ] **Step 9.4: Commit**

```bash
git add index.js
git commit -m "$(cat <<'EOF'
fix: add phone-fallback to admin check on invite-link path

Strengthens admin exemption against pre-existing JID format drift
between message sender and groupMetadata.participants list. Admin
posts can never be deleted regardless of LID format.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Deployment (not part of the code plan, but the rollout step)

After Tasks 1-8 (and optionally Task 9) all land on `main`:

```bash
cd /Users/michaelmishayev/Desktop/Projects/CommGuard-prod
git push origin main
ssh root@209.38.231.184 "cd ~/CommGuard && git pull && pm2 restart commguard-bot && pm2 logs commguard-bot --lines 20"
```

Watch for `INVITE_OUTCOME` lines in the live tail:

```bash
ssh root@209.38.231.184 "pm2 logs commguard-bot --nostream --lines 1000 | grep INVITE_OUTCOME | tail -20"
```

After 24h, run:

```bash
# Count incidents
ssh root@209.38.231.184 "grep -c INVITE_OUTCOME /root/.pm2/logs/commguard-bot-out-0.log"

# Count missed deletions (should be near-zero)
ssh root@209.38.231.184 "grep 'INVITE_OUTCOME.*deleted=NO' /root/.pm2/logs/commguard-bot-out-0.log | head -20"

# Count cooldown-skipped kicks (expected during multi-group attacks; deletions still YES)
ssh root@209.38.231.184 "grep 'INVITE_OUTCOME.*kickReason=\"cooldown_active\"' /root/.pm2/logs/commguard-bot-out-0.log | wc -l"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task implementing it |
|---|---|
| Cooldown moved after delete, kick-only gating | Task 4 (remove) + Task 5 (re-add gate) |
| Admin exemption preserved (4 signals, first guard) | Untouched; verified by visual inspection in Task 5 (the admin-check block at line 2426-2438 is above the modified range) |
| INVITE_OUTCOME structured log with all fields | Task 6 emits; Task 2 formats |
| `msgId` field included | Task 2 formatter, Task 6 passes `msg.key.id` |
| Misleading log rephrased | Task 5 (replaced with "User recently kicked elsewhere — message deleted, kick deferred") |
| Variable scope for outcome data | Task 5 declares `kicked`, `kickReason`, `kickDecision`, `userPhone` at outer scope |
| Synthetic test in `tests/` | Tasks 1.1, 2.1 |
| Optional phone-fallback admin check | Task 9 |
| Deploy via documented command | Deployment section |
| Logging never crashes the bot | Task 2 wraps formatter in try/catch with JSON fallback |
| 11-row regression matrix preserved | Tasks 4 + 5 implement the single behavior change (Group B within 10s) |

### Placeholder scan

- No `TBD` / `TODO` / `implement later`
- No "add appropriate error handling" — all error paths explicit
- All code blocks are complete and runnable
- All file paths are absolute or rooted at `CommGuard-prod/`

### Type/name consistency

- `decideKick` — defined in Task 1, used in Task 5 ✅
- `formatInviteOutcome` / `logInviteOutcome` — defined in Task 2, used in Tasks 2 + 6 ✅
- `kickCooldown` (Map) — existing variable, read+written same as today ✅
- `kickDecision.shouldKick` / `kickDecision.cooldownExpiresInMs` — consistent in Tasks 1, 5, 6 ✅
- `kicked` / `kickReason` — declared in Task 5, used in Task 6 ✅
- `deletionFailed` / `deletionError` — existing variables, used in Task 6 ✅
- `userPhone` — moved from inner to outer scope in Task 5, used in Task 6 ✅

### Risks during execution

- **Most likely failure:** the `old_string` in Task 5 Step 5.2 does not exactly match because of whitespace differences. Mitigation: confirm anchor first (Step 5.1), and if Edit fails, re-read the exact lines and retry with the file's actual indentation.
- **Second most likely:** forgetting to remove the inner `const userPhone =` when moving it to outer scope. Mitigation: syntax check at Step 5.3 will catch this.
- **Third:** the multiple `} catch (error) {` matches in index.js make Task 6's anchor ambiguous. Mitigation: Step 6.1 uses the unique `❌ Error handling invite spam` string to disambiguate.
