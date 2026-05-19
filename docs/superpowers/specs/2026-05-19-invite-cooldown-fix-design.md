# Invite Link Cooldown Fix + Structured Logging

**Date:** 2026-05-19
**File affected:** `index.js` (production bot)
**Scope:** ~15 lines of changed code in one function. No new dependencies. No infrastructure changes.

## Problem (Evidence-Based)

During multi-group spam attacks, the bot detects an invite link but fails to delete it. The invite link remains visible until an admin manually intervenes hours later.

### Confirmed incident (real production data)

User `205544954552423@lid` (`+972567261261`) attacked group "מועדון האמהות - נתניה" on 19/05/2026 at 03:33:56. The invite link stayed visible until **15:09:51** — over **11 hours** — when an admin manually replied `#kick` to remove the user. The bot kicked them only after the manual command.

Production log proves the bot DID see the attack and made a deliberate decision not to act:

```
[19/05/2026 03:33:56] 🚨 INVITE LINK DETECTED!
Group: 120363398653946949@g.us
Sender: 205544954552423@lid
Links: https://chat.whatsapp.com/CT79U7ro8kp3UwLPg8fs9u
⏳ User recently kicked, skipping to prevent spam
```

### Root cause

`index.js` lines 2440-2445:

```js
const lastKick = kickCooldown.get(senderId);
if (lastKick && Date.now() - lastKick < config.KICK_COOLDOWN) {
    console.log('⏳ User recently kicked, skipping to prevent spam');
    return;   // ← exits BEFORE deletion block at line 2486
}
```

`KICK_COOLDOWN = 10000` (10 seconds, defined in `config.js:17`). The cooldown is keyed by `senderId` only — **not** by `senderId + groupId`. So when a spammer hits Group A then Group B within 10 seconds:

1. Group A: detect → delete → kick → cooldown set. ✅
2. Group B (4 seconds later): detect → cooldown active → `return`. ❌ Message never deleted.

The cooldown is intended to prevent kick-spam against WhatsApp's API, which is a legitimate concern. But the current implementation conflates "don't kick the same user twice within 10s" (correct) with "don't act at all on this user's messages" (the bug). Deletion is idempotent and has no WhatsApp-side rate-limit concern — deleting an already-deleted message is a silent no-op.

### Secondary problem: debug-hostile logs

The log line `⏳ User recently kicked, skipping to prevent spam` is technically true but operationally misleading. It implies kick suppression. It does not say:
- That message deletion was also skipped
- Which group this occurred in
- The user's decoded phone number (only LID shown)
- Where the original kick happened
- When the cooldown expires

A human investigating "why is this invite link still visible?" must grep across many log files and cross-reference timestamps to learn what happened.

## Goals

1. **Delete invite-link messages even when the sender is in cross-group kick cooldown.**
2. **Preserve kick-spam prevention.** Kick is the WhatsApp-API-expensive action; the cooldown must continue to suppress repeated kicks of the same user across groups.
3. **Preserve admin exemption.** Group admins must remain fully exempt from invite-link enforcement — admin messages must never be deleted, kicked, or alerted on. This is unchanged from existing behavior.
4. **Make incidents grep-able.** One structured terminal log line per invite-link incident, so "show me all missed invites today" is a one-line shell command.
5. **No regressions.** Touch the minimum number of call sites. No new infrastructure (no Redis changes, no caches, no queues). On any failure path, behavior must be no worse than today.

## Non-Goals

- Not solving Baileys connection drops (separate problem; observed 4× on 19/05 but out of scope here).
- Not solving the rate-limited `sock.groupMetadata()` issue I previously theorized (logs show this is not the dominant failure mode).
- Not adding retries on deletion failure (regression risk — could cause duplicate admin alerts).
- Not adding reconnect catch-up (regression risk — could cause double-kicks).
- Not touching the other 17 `sock.groupMetadata()` call sites.
- Not modifying `extractMessageText()` or any text-extraction path.

## Design

### Change 1: Cooldown gates kick only, not delete

**File:** `index.js`
**Function:** the invite-link branch starting around line 2421
**Lines moved:** ~5

#### Current order

```
1. groupMetadata fetch (line 2423)
2. Admin check         (line 2426-2438)   → return if admin
3. Cooldown check      (line 2440-2445)   → return if cooldown   ← BUG: blocks delete too
4. Permission check    (line 2447-2454)
5. Delete branch       (line 2483-2511)
6. Kick branch         (line ~2553)
```

#### New order

```
1. groupMetadata fetch (line 2423)
2. Admin check         (line 2426-2438)   → return if admin   ← UNCHANGED (admin exemption preserved)
3. Permission check    (line 2447-2454)
4. Delete branch       (line 2483-2511)
5. Cooldown check                          → if cooldown active, skip kick only, log explicitly
6. Kick branch         (line ~2553)
```

Note: **the admin check stays first.** Admins remain fully exempt — their messages are never deleted, never kicked, never alerted on. The cooldown move happens entirely in the non-admin branch.

#### Pseudocode of the relevant block

```js
// 1. Admin exemption (UNCHANGED) — admins can send anything
if (senderIsAdmin) {
    console.log('✅ Sender is admin, ignoring invite link');
    return;
}

// 2. Permissions (UNCHANGED)
const permissions = await getPermissions();

// 3. Delete (UNCHANGED logic, MOVED earlier in flow) — always runs for non-admins
let deletionOutcome;
if (permissions.canDeleteMessages) {
    deletionOutcome = await deleteInviteMessage(...);   // existing code at lines 2483-2511
} else {
    deletionOutcome = { deleted: false, reason: 'no_delete_permission' };
    await notifyGroupBotNeedsAdmin(...);                 // existing code at lines 2469-2479
}

// 4. Cooldown — NOW only guards kick, not delete
const lastKick = kickCooldown.get(senderId);
const cooldownActiveMs = lastKick ? (Date.now() - lastKick) : null;
const cooldownActive = lastKick && cooldownActiveMs < config.KICK_COOLDOWN;

let kickOutcome;
if (cooldownActive) {
    kickOutcome = {
        kicked: false,
        reason: 'cooldown_active',
        cooldownAgeMs: cooldownActiveMs,
        cooldownExpiresInMs: config.KICK_COOLDOWN - cooldownActiveMs,
    };
} else {
    kickOutcome = await kickUser(...);   // existing code at lines ~2553+, sets kickCooldown at line 2560 on success
}

// 5. Structured log (new — see Change 2)
logInviteOutcome({ groupId, senderId, link, deletionOutcome, kickOutcome });
```

### Change 2: Structured `INVITE_OUTCOME` log

**File:** `index.js` (or optionally a 1-function helper at `utils/inviteLogger.js`)
**Lines added:** ~15

At the end of every invite-link incident (success, partial, or skipped), log a single line in a fixed grep-able format:

```
[timestamp] 📋 INVITE_OUTCOME group="<group_subject>" groupId=<jid> user=<lid> phone=+<decoded> link=<url> deleted=<YES|NO> deleteReason="<reason>" kicked=<YES|NO> kickReason="<reason>" cooldownExpiresInMs=<n|->
```

Concrete example for the 03:33:56 incident under the new behavior:

```
[19/05/2026 03:33:56] 📋 INVITE_OUTCOME group="מועדון האמהות - נתניה" groupId=120363398653946949@g.us user=205544954552423@lid phone=+972567261261 link=https://chat.whatsapp.com/CT79U7ro8kp3UwLPg8fs9u deleted=YES deleteReason="ok" kicked=NO kickReason="cooldown_active" cooldownExpiresInMs=6042
```

Concrete example for a clean kick (no cooldown):

```
[19/05/2026 03:33:48] 📋 INVITE_OUTCOME group="Crypto Talk" groupId=120363... user=205544954552423@lid phone=+972567261261 link=https://chat.whatsapp.com/CT79U7... deleted=YES deleteReason="ok" kicked=YES kickReason="ok" cooldownExpiresInMs=-
```

#### Required fields

| Field | Source | Notes |
|---|---|---|
| `group` | `groupMetadata.subject` | Quoted; may contain Hebrew/Russian/special chars |
| `groupId` | `groupId` arg | The `@g.us` JID |
| `user` | `senderId` | Raw JID (could be `@lid` or `@s.whatsapp.net`) |
| `phone` | `decodeLIDToPhone()` or `senderId.split('@')[0]` | Best-effort decoded phone; falls back to `unknown` if decode fails |
| `link` | first match from `matches` | Only the first link if multiple present |
| `deleted` | `YES` or `NO` | |
| `deleteReason` | `ok` / `no_delete_permission` / `stealth_failure` / `<error.message>` | Short token, no spaces (use underscore) |
| `kicked` | `YES` or `NO` | |
| `kickReason` | `ok` / `cooldown_active` / `delete_failed` / `<error.message>` | Short token |
| `cooldownExpiresInMs` | integer ms or `-` | Only meaningful when `kickReason=cooldown_active` |

#### Why this format

- One line per incident → `grep INVITE_OUTCOME` shows all attacks
- `deleted=NO` is grep-able → "show me missed invites"
- Reason tokens are short and stable → easy to aggregate counts
- Group subject is included → no need to cross-reference IDs
- Phone is decoded → no need to look up LID mappings

#### What this log replaces

The verbose existing logs (`🚨 INVITE LINK DETECTED!`, `✅ Deleted invite link message`, `✅ Kicked user`, `❌ Failed to delete`) are **kept as-is** for backward compatibility. The `INVITE_OUTCOME` line is **additive** — it is the new grep target, not a replacement of the existing verbose logs.

**One existing log MUST be rephrased** to stop being misleading:

- Old: `⏳ User recently kicked, skipping to prevent spam` (implies message is also skipped — false under new behavior)
- New: `⏳ User recently kicked elsewhere — message deleted, kick deferred (cooldown ${ms}ms remaining)`

This change is small but important: a developer reading the log under the new behavior should immediately see that deletion succeeded and only the kick was deferred.

### Change 3: (optional, not required for fix) Per-group cooldown key

The cooldown currently uses `senderId` as the map key. A future improvement could use `${senderId}:${groupId}` so the same user can be kicked from each group exactly once per attack wave. This is **not part of this fix** — current behavior (one kick per user per 10s window globally) is preserved. Mentioned here so future work can build on top.

## Files Changed

| File | Change | Approx lines |
|---|---|---|
| `index.js` | Move cooldown check from before deletion to after deletion; restructure return into `kickOutcome` data | ~10 lines moved/added |
| `index.js` | Add `INVITE_OUTCOME` structured log at end of invite-link handler | ~15 lines added |
| (optional) `utils/inviteLogger.js` | Small helper to format the structured line | ~20 lines, new file |

**No new dependencies. No infrastructure changes. No new Redis keys. No new env vars.**

## Testing Plan

### Manual log verification (primary)

After deployment, search the logs during the next attack:

1. `grep 'INVITE_OUTCOME' logs | wc -l` — should be non-zero
2. `grep 'INVITE_OUTCOME.*deleted=NO' logs` — should be near-zero (only "no_delete_permission" or genuine failures)
3. `grep 'INVITE_OUTCOME.*deleted=YES.*kicked=NO' logs` — should match the count of "cooldown_active" cases. Expected during multi-group attacks. Important: in these cases the message is **gone**, only the kick is deferred.

### Synthetic test

In `tests/`:
1. Mock a sequence of two invite-link messages from the same user 5 seconds apart in different groups.
2. Assert: both messages get deleted; only one kick is attempted (second is cooldown-suppressed).
3. Assert: two `INVITE_OUTCOME` lines emitted with correct field values.

### Regression checks (must hold)

| Scenario | Expected behavior |
|---|---|
| Admin posts an invite link | No delete, no kick, no alert. Same as today. |
| Non-admin posts invite, bot lacks delete permission | Hebrew message sent to group requesting admin status. Same as today. |
| Non-admin posts invite, no cooldown active | Delete + kick + violation recorded + admin alert. Same as today. |
| Same user posts invite in Group A then Group B within 10s | **NEW:** both messages deleted. Only Group A kick fires. Group B logs cooldown skip on kick. |
| Same user posts invite in Group A then Group B after 11s | Both messages deleted. Both kicks fire (cooldown expired). Same as today. |
| Delete fails for transient reason | `deleted=NO deleteReason=<reason>` logged. Kick still proceeds if not on cooldown. Same as today (no new retry behavior). |

### Out-of-scope failure modes (explicitly NOT fixed)

These will still cause missed invites occasionally. Acceptable for this fix — to be addressed separately:

- Baileys WebSocket disconnect mid-attack (Error 428 observed 4× on 19/05). Messages between disconnect and reconnect are lost at the Baileys layer.
- WhatsApp deletion API transient failures. Currently no retry; this fix does not add one (retry has regression risk for duplicate admin alerts).
- OpenAI quota exhaustion blocking `BULLYWATCH` (separate billing issue).

## Rollout

1. Merge to `main` in `CommGuard-prod` repo.
2. Deploy: `git push origin main && ssh root@209.38.231.184 "cd ~/CommGuard && git pull && pm2 restart commguard-bot"`.
3. Watch logs for the next 24h: count `INVITE_OUTCOME` lines and compare `deleted=YES` vs `deleted=NO` ratios. Target: >95% of detected invites have `deleted=YES`.
4. If `deleted=NO` ratio is high, the `deleteReason` field tells us why → next iteration informed by real data, not guesses.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Admin's invite-link message gets deleted by mistake (highest user-facing risk) | Admin check at line 2434 is **unchanged and remains first**. Uses 4 signals (`admin === 'admin'`, `admin === 'superadmin'`, `isAdmin`, `isSuperAdmin`). |
| Log helper throws and breaks the handler | Wrap `logInviteOutcome` in try/catch; on failure, fall back to a plain `console.log(JSON.stringify(...))`. Never let logging crash the bot. |
| Move of cooldown breaks an unnoticed code path | Cooldown is read in exactly one place (line 2441) and written in exactly one place (line ~2570 after kick). Both are in this handler. Verified by grep. |
| Structured log line is too long, breaks PM2 log file lines | Format is single-line, ~300 chars max. PM2 has no line length limit; pm2-logrotate is enabled. |

## Definition of Done

- [ ] `index.js` modified: cooldown moved after delete, applies to kick only
- [ ] `INVITE_OUTCOME` structured log emitted at end of every invite-link incident
- [ ] Admin exemption verified preserved (manual test: admin posts a link, no action taken)
- [ ] Synthetic test added in `tests/`
- [ ] Deployed to prod via documented deploy command
- [ ] 24h post-deploy: `grep INVITE_OUTCOME` shows incidents with reasons populated
- [ ] Spec linked from a PR description
