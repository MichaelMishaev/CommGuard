# Mute Functionality Debug Test Plan

## Issue Description
User sent `#mute 5` command and received confirmation that user was muted, but:
- User can still send messages
- Bot is NOT deleting their messages

## What I've Found

### ✅ Working Components
1. **Mute Service**: User is correctly stored in Firebase as muted
   - User ID: `77709346664559@lid`
   - Muted until: 21/12/2025, 16:23:33
   - Remaining time: ~3 minutes

2. **Mute Detection Code**: Logic exists in `index.js:1481-1556` to:
   - Check if user is muted
   - Delete their messages
   - Send warnings after 7 messages
   - Kick after 10 messages

### 🔍 Added Debug Logging
I've added enhanced logging to help diagnose the issue:
- Line 1481-1482: Shows mute check results
- Line 1485: Shows deletion attempt
- Line 1489: Shows successful deletion
- Line 1553-1558: Shows detailed error information
- Line 1561-1562: Shows if muted user is admin (bypasses deletion)

## Test Instructions

### Step 1: Start Bot with Logging
```bash
cd /Users/michaelmishayev/Desktop/CommGuard/bCommGuard
npm start
```

Watch the console output carefully!

### Step 2: Have Muted User Send Message
1. Ask the muted user to send a message in the group
2. Watch for these log entries:

**Expected logs:**
```
[timestamp] 🔍 MUTE DEBUG - senderId: 77709346664559@lid, isMuted: true, isAdmin: false
[timestamp] 🔇 ATTEMPTING TO DELETE MESSAGE FROM MUTED USER
[timestamp] 🔇 ✅ SUCCESS: Deleted message from muted user (1 messages deleted)
```

**Problem scenarios:**

**Scenario A: User is detected as admin**
```
[timestamp] 🔍 MUTE DEBUG - senderId: 77709346664559@lid, isMuted: true, isAdmin: true
[timestamp] ⚠️ MUTE SKIP: User is muted but is an admin - allowing message
```
→ **Solution**: User has admin privileges in the group, mute won't work on admins

**Scenario B: Deletion fails**
```
[timestamp] 🔍 MUTE DEBUG - senderId: 77709346664559@lid, isMuted: true, isAdmin: false
[timestamp] 🔇 ATTEMPTING TO DELETE MESSAGE FROM MUTED USER
[timestamp] ❌ MUTE ERROR: Failed to delete muted user message: [error message]
```
→ **Solution**: Bot needs admin privileges in the group to delete messages

**Scenario C: Not reaching mute check**
No log entries appear at all
→ **Solution**: Message flow is stopping earlier (whitelist, private message, etc.)

### Step 3: Check Bot Admin Status
```bash
# In the group, send this command as admin:
#botadmin
```

This will show if the bot has admin privileges. If bot is NOT admin, it CANNOT delete messages.

### Step 4: Verify User Admin Status
Check if the muted user is also a group admin. Muted admins bypass deletion (line 1481: `&& !isAdmin`)

## Common Issues & Solutions

### Issue 1: Bot Not Admin
**Symptoms**: Deletion fails with permission error
**Solution**: Make bot a group admin
**How**: Group Info → Edit Group Info → Admins → Add bot as admin

### Issue 2: Muted User is Admin
**Symptoms**: Log shows "User is muted but is an admin"
**Solution**: Remove admin privileges from muted user OR use `#kick` instead

### Issue 3: User ID Mismatch
**Symptoms**: Mute check shows `isMuted: false` but database shows user is muted
**Solution**: LID format mismatch - check `utils/jidUtils.js:jidKey()` function

### Issue 4: Bot Not Running
**Symptoms**: No logs appear when user sends message
**Solution**: Start the bot with `npm start`

## Quick Debug Commands

```bash
# Check if user is in mute database
node tests/debugMuteIssue.js

# Check bot admin status
# Send in group: #botadmin

# Check current participant IDs
# Send in group: #debugnumbers
```

## Expected Working Flow

1. Admin sends `#mute 5` (reply to user's message)
2. Bot adds user to mute database
3. User sends message
4. Bot detects user is muted
5. Bot checks user is not admin
6. Bot deletes message
7. Bot increments counter
8. At 7 messages: Warning sent
9. At 10 messages: User kicked

## Next Steps Based on Test Results

**Share these logs with me:**
1. The console output when muted user sends message
2. Result of `#botadmin` command
3. Whether muted user is a group admin

This will help identify the exact issue!
