# QA Test Plan - Global Ban Feature

## Overview
This test plan covers the new 4-option global ban feature for CommGuard bot.

## Feature Description
When a user is kicked for sharing invite links or via #kick command, the admin (0544345287) receives an alert with 4 action options:
- **1️⃣ Blacklist Only** - Prevent user from rejoining any group
- **2️⃣ Global Ban Only** - Kick user from all groups where admin is admin
- **3️⃣ Blacklist + Global Ban** - Both actions (maximum protection)
- **0️⃣ Ignore** - Do nothing

## Files Modified
- ✅ `utils/globalBanHelper.js` (NEW)
- ✅ `utils/alertService.js` (UPDATED)
- ✅ `utils/blacklistPendingRequests.js` (UPDATED)
- ✅ `index.js` (UPDATED)
- ✅ `services/commandHandler.js` (UPDATED)

---

## Test Cases

### TC-001: Alert Format - Invite Link Kick
**Prerequisite**: User shares invite link in a group

**Steps**:
1. User shares WhatsApp invite link in test group
2. Bot auto-kicks the user
3. Check alert sent to 0544345287

**Expected Result**:
```
🚨 WhatsApp Invite Spam - ACTION REQUIRED

👤 User: [user_jid]
📞 Phone: +[phone]
📍 Group: [group_name]
🔗 Group URL: [group_link]
⏰ Time: [timestamp]
📧 Spam Link: [invite_link]
⚠️ Violations: [violation_count]

✅ User was kicked from this group

❓ Choose action:
Reply with:
  1️⃣ = Blacklist Only (prevent rejoin)
  2️⃣ = Global Ban Only (kick from all your groups)
  3️⃣ = Blacklist + Global Ban (both!)
  0️⃣ = Ignore (do nothing)
```

**Status**: ⏳ Pending Test

---

### TC-002: Alert Format - Manual #kick
**Prerequisite**: Admin uses #kick command

**Steps**:
1. Admin replies to user message with #kick
2. Bot kicks the user
3. Check alert sent to 0544345287

**Expected Result**:
```
👮‍♂️ Admin Command - User Kicked

[Same format as TC-001]
```

**Status**: ⏳ Pending Test

---

### TC-003: Option 1 - Blacklist Only
**Prerequisite**: Alert received (TC-001 or TC-002)

**Steps**:
1. Reply to alert with: `1`
2. Check bot response
3. Verify user is blacklisted
4. Test user trying to rejoin any group

**Expected Result**:
- ✅ Response: "User +[phone] has been blacklisted"
- ✅ User added to blacklist cache
- ✅ User auto-kicked if tries to rejoin ANY group
- ⚠️ User NOT kicked from other existing groups

**Status**: ⏳ Pending Test

---

### TC-004: Option 2 - Global Ban Only
**Prerequisite**: Alert received, user is member of multiple groups

**Steps**:
1. Reply to alert with: `2`
2. Check bot response
3. Verify user kicked from all admin groups
4. Test user trying to rejoin

**Expected Result**:
- ✅ Response: "Starting Global Ban..."
- ✅ Progress updates every 10 groups
- ✅ Summary report showing:
  - Total groups checked
  - Groups where user was found
  - Successful kicks
  - Failed kicks
  - Skipped groups (bot not admin)
- ✅ User kicked from all groups where:
  - Admin is admin
  - User is member
  - Bot has kick permissions
- ⚠️ User CAN rejoin groups (not blacklisted)

**Status**: ⏳ Pending Test

---

### TC-005: Option 3 - Blacklist + Global Ban (NUCLEAR)
**Prerequisite**: Alert received, user in multiple groups

**Steps**:
1. Reply to alert with: `3`
2. Check bot responses (should be 2 messages)
3. Verify both actions completed

**Expected Result**:
- ✅ Message 1: "Full Protection Activated - User blacklisted - Starting global ban..."
- ✅ Message 2: Global ban report
- ✅ User blacklisted
- ✅ User kicked from all admin groups
- ✅ User CANNOT rejoin any group

**Status**: ⏳ Pending Test

---

### TC-006: Option 0 - Ignore
**Prerequisite**: Alert received

**Steps**:
1. Reply to alert with: `0`
2. Check bot response

**Expected Result**:
- ✅ Response: "Ignored action for +[phone] - No changes made"
- ⚠️ User NOT blacklisted
- ⚠️ User NOT kicked from other groups
- ✅ User can rejoin the original group (no blacklist)

**Status**: ⏳ Pending Test

---

### TC-007: Israeli Number Protection (BLACKLIST ONLY)
**Prerequisite**: Israeli user (+972) shares invite link

**Steps**:
1. User with +972 number shares link
2. Bot kicks from group
3. Reply to alert with: `1` (blacklist only)
4. Reply to different alert with: `2` or `3` (global ban)

**Expected Result for Option 1 (Blacklist)**:
- 🚫 Blacklist blocked (existing safeguard in blacklistService.js)
- ✅ Console log: "BLOCKED: Attempted to blacklist Israeli number"
- ✅ User NOT blacklisted

**Expected Result for Option 2/3 (Global Ban)**:
- ✅ Global ban PROCEEDS normally
- ✅ Israeli user kicked from all admin groups
- ✅ Option 3: Blacklist fails (protected), but global ban succeeds
- ℹ️ Note: Kicking is allowed, blacklisting is not

**Status**: ⏳ Pending Test

---

### TC-008: LID Format Handling
**Prerequisite**: User with LID format (@lid) JID shares link

**Steps**:
1. User with encrypted LID shares invite link
2. Check if LID is decoded to phone
3. Reply with global ban option (2 or 3)

**Expected Result**:
- ✅ LID decoded to real phone number
- ✅ Global ban uses decoded phone for matching
- ✅ User kicked from groups successfully

**Status**: ⏳ Pending Test

---

### TC-009: Large Number of Groups (Performance Test)
**Prerequisite**: Admin is admin in 50+ groups

**Steps**:
1. Reply to alert with: `2` or `3`
2. Monitor console for progress updates
3. Check response time

**Expected Result**:
- ✅ Progress update every 10 groups
- ✅ 500ms delay between kicks (rate limiting)
- ✅ Total time: ~25 seconds for 50 groups
- ✅ No timeout errors
- ✅ Detailed report at end

**Status**: ⏳ Pending Test

---

### TC-010: Bot Not Admin in Some Groups
**Prerequisite**: Bot lacks admin in some groups

**Steps**:
1. Reply to alert with: `2` or `3`
2. Check report details

**Expected Result**:
- ✅ Skipped groups listed as "failed"
- ✅ Reason: Bot not admin or no kick permission
- ✅ No errors thrown
- ✅ Other groups processed successfully

**Status**: ⏳ Pending Test

---

### TC-011: User Not Member of Admin's Other Groups
**Prerequisite**: User only in 1 group

**Steps**:
1. Reply to alert with: `2` or `3`
2. Check report

**Expected Result**:
- ✅ Report shows: "User not member of: [N] groups"
- ✅ No errors
- ✅ Successful kicks: 0 (already kicked from original group)

**Status**: ⏳ Pending Test

---

### TC-012: Expired Pending Request (24h timeout)
**Prerequisite**: Wait 24+ hours after alert (or modify timeout for testing)

**Steps**:
1. Receive alert
2. Wait for timeout
3. Reply with any option

**Expected Result**:
- ⚠️ No action taken
- ✅ Console: "No pending request found for message ID"
- ℹ️ No response to user (graceful degradation)

**Status**: ⏳ Pending Test

---

### TC-013: Concurrent Alerts (Multiple Users)
**Prerequisite**: 2+ users share links simultaneously

**Steps**:
1. Trigger 2 alerts at same time
2. Reply to first alert with: `1`
3. Reply to second alert with: `2`

**Expected Result**:
- ✅ Each alert has unique message ID
- ✅ No collision in pending requests
- ✅ Correct user blacklisted/banned for each reply

**Status**: ⏳ Pending Test

---

### TC-014: Invalid Reply (Not 0,1,2,3)
**Prerequisite**: Alert received

**Steps**:
1. Reply to alert with: `4` or `abc` or any invalid text

**Expected Result**:
- ⚠️ No action taken
- ⚠️ No error message (handler doesn't match)
- ✅ Pending request remains active

**Status**: ⏳ Pending Test

---

### TC-015: Backward Compatibility - Old Blacklist Code
**Prerequisite**: Existing blacklist users

**Steps**:
1. Check existing blacklist cache
2. Verify cache loading on startup
3. Test existing blacklisted user trying to join

**Expected Result**:
- ✅ Old blacklist still works
- ✅ No breaking changes
- ✅ Auto-kick still functional

**Status**: ⏳ Pending Test

---

## Regression Tests

### RT-001: #kick Command Still Works
**Steps**: Use #kick command as before

**Expected**: ✅ Works normally with new alert format

---

### RT-002: #ban Command Still Works
**Steps**: Use #ban command (if exists)

**Expected**: ✅ Works normally

---

### RT-003: Whitelist Immunity
**Steps**: Whitelisted user shares invite link

**Expected**: ✅ Not kicked, no alert sent

---

### RT-004: Admin Immunity
**Steps**: Admin shares invite link

**Expected**: ✅ Not kicked, no alert sent

---

### RT-005: Auto-Kick Country Codes
**Steps**: User from +1 or +6 joins group

**Expected**: ✅ Still auto-kicked (no alert change needed)

---

## Manual Testing Checklist

- [ ] TC-001: Alert Format - Invite Link
- [ ] TC-002: Alert Format - Manual Kick
- [ ] TC-003: Option 1 - Blacklist Only
- [ ] TC-004: Option 2 - Global Ban Only
- [ ] TC-005: Option 3 - Blacklist + Global Ban
- [ ] TC-006: Option 0 - Ignore
- [ ] TC-007: Israeli Number Protection ⚠️ CRITICAL
- [ ] TC-008: LID Format Handling
- [ ] TC-009: Performance Test (50+ groups)
- [ ] TC-010: Bot Not Admin Handling
- [ ] TC-011: User Not in Other Groups
- [ ] TC-012: Expired Request
- [ ] TC-013: Concurrent Alerts
- [ ] TC-014: Invalid Reply
- [ ] TC-015: Backward Compatibility
- [ ] RT-001: #kick Command
- [ ] RT-002: #ban Command
- [ ] RT-003: Whitelist Immunity
- [ ] RT-004: Admin Immunity
- [ ] RT-005: Country Code Auto-Kick

---

## Known Limitations

1. **Rate Limiting**: 500ms delay between kicks may cause long wait times for admins in 100+ groups
2. **LID Decoding**: May fail if user changed privacy settings
3. **Bot Admin Status**: Relies on `BYPASS_BOT_ADMIN_CHECK` - may fail in groups where bot truly isn't admin
4. **Israeli Number Protection**: Only applies to BLACKLISTING (option 1), NOT to global ban (option 2/3). Israeli users CAN be kicked from groups, but CANNOT be permanently blacklisted.

---

## Rollback Plan

If critical issues found:

1. Revert `index.js` lines 1144-1261 to old 2-option handler
2. Revert `alertService.js` lines 72-92 and 94-113
3. Remove `utils/globalBanHelper.js`
4. Restart bot with `npm start`

Original code backed up in git commit before this feature.

---

## Success Criteria

- ✅ All 15 test cases pass
- ✅ All 5 regression tests pass
- ✅ No errors in production for 48 hours
- ✅ Israeli number protection verified
- ✅ Admin reports positive feedback

---

**Created**: 2025-12-16
**Feature**: Global Ban with 4 Options
**Version**: 1.0.0
