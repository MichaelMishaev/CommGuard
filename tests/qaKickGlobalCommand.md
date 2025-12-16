# QA Test Plan - #kickglobal Command

## Overview
The `#kickglobal` command instantly kicks a user from the current group AND all other groups where you (0544345287) are admin.

## Command Behavior

### What #kickglobal Does:
1. ✅ Deletes the replied-to message
2. ✅ Deletes the #kickglobal command message
3. ✅ Kicks user from current group
4. ✅ Sends "processing" notification to admin (you)
5. ✅ Scans ALL groups where you're admin
6. ✅ Kicks user from every group they're in
7. ✅ Sends detailed report to admin

### What #kickglobal Does NOT Do:
- ❌ Does NOT blacklist the user (they can rejoin)
- ❌ Does NOT ask for confirmation (instant action)
- ❌ Does NOT send alerts to the group (silent in group)

---

## Comparison: #kick vs #kickglobal

| Feature | #kick | #kickglobal |
|---------|-------|-------------|
| Delete message | ✅ | ✅ |
| Kick from current group | ✅ | ✅ |
| Kick from all admin groups | ❌ | ✅ |
| Ask admin for blacklist | ✅ (4 options) | ❌ |
| Instant execution | ✅ | ✅ |
| Group notification | Silent | Silent |
| Admin notification | Alert with options | Progress + Report |

---

## Test Cases

### TC-KG-001: Basic Functionality
**Steps**:
1. In a test group, have a test user send a message
2. Reply to that message with: `#kickglobal`
3. Check group chat
4. Check your private messages

**Expected**:
- ✅ Both messages deleted (user's + command)
- ✅ User kicked from group
- ✅ No visible notification in group
- ✅ You receive:
  - Message 1: "Global Ban Started - Scanning groups..."
  - Message 2: Detailed report

**Status**: ⏳ Pending

---

### TC-KG-002: Multi-Group Kick
**Prerequisite**: Test user is member of 3+ groups where you're admin

**Steps**:
1. Reply to user message with `#kickglobal`
2. Wait for report

**Expected Report**:
```
🌍 Global Ban Report

📊 Summary:
   • Total Groups Checked: [N]
   • User Found In: [M] groups
   • Successfully Removed: [M] ✅

ℹ️ Additional Info:
   • You're not admin in: [X] groups
   • User not member of: [Y] groups
```

**Status**: ⏳ Pending

---

### TC-KG-003: User Only in Current Group
**Prerequisite**: User only in 1 group

**Steps**:
1. Use `#kickglobal`
2. Check report

**Expected**:
- ✅ Kicked from current group
- ✅ Report shows: "User Found In: 0 groups" (already kicked from current)
- ✅ No errors

**Status**: ⏳ Pending

---

### TC-KG-004: Non-Reply Usage (Error Case)
**Steps**:
1. Type `#kickglobal` without replying to any message

**Expected**:
- ⚠️ Error message: "Please reply to a message from the user you want to globally kick"
- ❌ No kick action

**Status**: ⏳ Pending

---

### TC-KG-005: Kick Admin User (Error Case)
**Steps**:
1. Reply to another admin's message with `#kickglobal`

**Expected**:
- ⚠️ Error message: "Cannot kick admin users"
- ❌ No kick action

**Status**: ⏳ Pending

---

### TC-KG-006: User Already Left Group
**Steps**:
1. Reply to message from user who already left
2. Use `#kickglobal`

**Expected**:
- ⚠️ Error message: "User is not in this group"
- ❌ No global ban executed

**Status**: ⏳ Pending

---

### TC-KG-007: Non-Admin Usage (Error Case)
**Prerequisite**: Get a friend to test

**Steps**:
1. Friend (non-admin) tries `#kickglobal`

**Expected**:
- ❌ Error: "Only admins can use #kickglobal"

**Status**: ⏳ Pending

---

### TC-KG-008: Private Chat Usage (Error Case)
**Steps**:
1. Try `#kickglobal` in private chat with bot

**Expected**:
- ⚠️ Error: "The #kickglobal command can only be used in groups"

**Status**: ⏳ Pending

---

### TC-KG-009: Large Group Performance
**Prerequisite**: User in 10+ groups

**Steps**:
1. Use `#kickglobal`
2. Monitor console logs
3. Time the operation

**Expected**:
- ✅ Progress logs every 10 groups
- ✅ 500ms delay between kicks
- ✅ Estimated time: ~5 seconds for 10 groups
- ✅ No timeouts

**Status**: ⏳ Pending

---

### TC-KG-010: Bot Not Admin in Some Groups
**Prerequisite**: Bot lacks admin in some groups

**Steps**:
1. Use `#kickglobal`
2. Check report "Failed Groups" section

**Expected**:
- ✅ Failed kicks listed with reason
- ✅ Other groups processed successfully
- ✅ No crash/errors

**Status**: ⏳ Pending

---

### TC-KG-011: Compare with Reply Alert Option 2
**Prerequisite**: Two different users to test

**Test A - #kickglobal**:
1. Reply to User A with `#kickglobal`
2. Check behavior

**Test B - Alert Option 2**:
1. User B shares invite link (auto-kicked)
2. You get alert, reply with `2`
3. Check behavior

**Expected**:
- ✅ BOTH should produce same global ban result
- ✅ BOTH should send same report format
- ❌ #kickglobal does NOT ask for blacklist
- ✅ Alert option 2 gives choice after kick

**Status**: ⏳ Pending

---

### TC-KG-012: #help Command Update
**Steps**:
1. Send `#help` in private chat
2. Check moderation commands section

**Expected**:
```
👮 Moderation Commands:
• #kick - Reply to message → Kicks user + deletes message + asks for blacklist
• #kickglobal - Reply to message → Kicks user + deletes message + kicks from ALL your groups
• #ban - Reply to message → Permanently bans user
```

**Status**: ⏳ Pending

---

## Usage Scenarios

### Scenario 1: Immediate Threat Removal
**Situation**: Spammer sends malicious content
**Action**: `#kickglobal`
**Result**: Instantly removed from all your groups

---

### Scenario 2: Known Spammer Appears
**Situation**: User who spammed before joins new group
**Action**: `#kickglobal`
**Result**: Preemptively removed before they spam

---

### Scenario 3: Testing User Presence
**Situation**: Check if user is in multiple groups
**Action**: `#kickglobal` (use test user)
**Result**: Report shows exactly which groups they're in

---

## Important Notes

1. **No Undo**: Once executed, user is kicked from ALL groups immediately
2. **No Blacklist**: User CAN rejoin if they have group links
3. **Admin Only**: Only you (0544345287) can use this command
4. **Bot Needs Admin**: Bot must be admin in target groups to kick
5. **Silent in Group**: No notification shown to other group members
6. **Report to Admin**: You get private report, not group notification

---

## Recommended Usage

✅ **Use #kickglobal when:**
- Immediate removal needed from all groups
- Known spammer/scammer appears
- Testing/debugging (with test user)

❌ **Don't use #kickglobal when:**
- You want to blacklist (use alert option 3 instead)
- You want to keep user in some groups (use #kick)
- Unsure about the user (use #kick first for alert options)

---

## Manual Testing Checklist

- [ ] TC-KG-001: Basic functionality
- [ ] TC-KG-002: Multi-group kick
- [ ] TC-KG-003: Single group only
- [ ] TC-KG-004: Non-reply error
- [ ] TC-KG-005: Admin protection
- [ ] TC-KG-006: User left group
- [ ] TC-KG-007: Non-admin usage
- [ ] TC-KG-008: Private chat error
- [ ] TC-KG-009: Performance test
- [ ] TC-KG-010: Bot not admin
- [ ] TC-KG-011: Compare with option 2
- [ ] TC-KG-012: Help command

---

**Created**: 2025-12-16
**Command**: #kickglobal
**Version**: 1.0.0
