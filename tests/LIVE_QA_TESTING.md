# Live QA Testing Guide for bCommGuard Bot

## Pre-Test Setup ✅

**Before starting these tests, ensure:**
- [ ] Bot is connected and running
- [ ] Bot is admin in test group  
- [ ] You have admin privileges in test group
- [ ] At least one test user (non-admin) in group
- [ ] Firebase connection working (check console logs)

---

## Test 1: Basic Connection & Status ✅

### Steps:
1. Send: `#help`
2. Send: `#status`

### Expected Results:
- [ ] Bot responds with comprehensive help message
- [ ] Status shows bot information and features
- [ ] Response time < 2 seconds
- [ ] No errors in console

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

---

## Test 2: Invite Link Detection & Auto-Kick ✅

### Test 2.1: Basic Invite Link
**Steps:**
1. From non-admin account, send: `https://chat.whatsapp.com/ABC123DEF456`

**Expected Results:**
- [ ] Message deleted immediately
- [ ] User kicked from group
- [ ] Console logs show detection
- [ ] Admin receives alert notification

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

### Test 2.2: Alternative Format
**Steps:**
1. From test user, send: `https://whatsapp.com/chat/XYZ789ABC`

**Expected Results:**
- [ ] Message deleted
- [ ] User kicked
- [ ] Same alert behavior

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

### Test 2.3: Embedded Link
**Steps:**
1. From test user, send: `Join our group here: https://chat.whatsapp.com/TEST123`

**Expected Results:**
- [ ] Message deleted
- [ ] User kicked
- [ ] Link extracted correctly

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

### Test 2.4: Admin Immunity (if implemented)
**Steps:**
1. From admin account, send invite link

**Expected Results:**
- [ ] Message NOT deleted (if whitelist implemented)
- [ ] OR message deleted but admin not kicked

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

---

## Test 3: Group Mute Functionality ✅

### Test 3.1: Group Mute
**Steps:**
1. Send: `#mute 2` (mute for 2 minutes)
2. From non-admin, send test message
3. From admin, send test message  
4. Wait 2+ minutes
5. From non-admin, send another message

**Expected Results:**
- [ ] Bot confirms group muted
- [ ] Non-admin message deleted in step 2
- [ ] Admin message goes through in step 3
- [ ] Bot announces unmute after 2 minutes
- [ ] Non-admin message goes through in step 5

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

### Test 3.2: Invalid Mute Duration
**Steps:**
1. Send: `#mute abc`
2. Send: `#mute -5`
3. Send: `#mute`

**Expected Results:**
- [ ] Error message for invalid input
- [ ] Usage instructions shown
- [ ] Group not muted

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

---

## Test 4: Individual User Mute ✅

### Test 4.1: User Mute
**Steps:**
1. Wait for test user to send a message
2. Reply to that message with: `#mute 3`
3. Test user sends another message
4. Wait 3+ minutes
5. Test user sends final message

**Expected Results:**
- [ ] Bot confirms user muted
- [ ] User's message in step 3 deleted
- [ ] User auto-unmuted after 3 minutes
- [ ] User's message in step 5 goes through

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

### Test 4.2: Muted User Spam Protection
**Steps:**
1. Mute a test user for 10 minutes
2. Have user send 10+ messages rapidly

**Expected Results:**
- [ ] First 10 messages deleted
- [ ] User kicked after 10th message
- [ ] Console logs show progression

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

---

## Test 5: Whitelist System ✅

### Test 5.1: Add to Whitelist
**Steps:**
1. Send: `#whitelist 972555123456`
2. Send: `#whitelst`

**Expected Results:**
- [ ] Success confirmation
- [ ] Number appears in whitelist
- [ ] Firebase updated (check console)

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

### Test 5.2: Whitelist Protection
**Steps:**
1. Add test user's number to whitelist
2. Test user sends invite link
3. Remove from whitelist: `#unwhitelist [number]`
4. Test user sends another invite link

**Expected Results:**
- [ ] First invite link ignored (step 2)
- [ ] Removal confirmed (step 3)  
- [ ] Second invite link triggers kick (step 4)

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

---

## Test 6: Command Permission System ✅

### Test 6.1: Non-Admin Command Attempt
**Steps:**
1. From non-admin account, send: `#mute 5`
2. From non-admin account, send: `#whitelist 123456`
3. From non-admin account, send: `#help`

**Expected Results:**
- [ ] Permission denied for steps 1 & 2
- [ ] Help command works in step 3
- [ ] Clear error messages

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

### Test 6.2: Invalid Commands
**Steps:**
1. Send: `#invalidcommand`
2. Send: `#xyz123`

**Expected Results:**
- [ ] Commands ignored
- [ ] No error messages for invalid commands
- [ ] Bot continues normal operation

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

---

## Test 7: Stats and Monitoring ✅

### Test 7.1: Group Statistics
**Steps:**
1. Send: `#stats`

**Expected Results:**
- [ ] Shows member count
- [ ] Shows admin count
- [ ] Shows group name
- [ ] Shows timestamp
- [ ] Data matches actual group

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

---

## Test 8: Error Handling & Edge Cases ✅

### Test 8.1: Rapid Commands
**Steps:**
1. Send 5 commands rapidly in 2 seconds
2. Check bot responsiveness

**Expected Results:**
- [ ] All commands processed
- [ ] No crashes or errors
- [ ] Reasonable response time

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

### Test 8.2: Special Characters
**Steps:**
1. Send: `#help 🚀💯`
2. Send invite link with emojis
3. Send command with special chars: `#mute @#$%`

**Expected Results:**
- [ ] Bot handles gracefully
- [ ] No crashes
- [ ] Appropriate error handling

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

---

## Test 9: Performance & Stability ✅

### Test 9.1: Memory Usage
**Steps:**
1. Check initial memory usage
2. Run bot for 30 minutes with activity
3. Check memory usage again

**Expected Results:**
- [ ] Memory usage < 150MB
- [ ] No significant memory leaks
- [ ] Stable performance

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

### Test 9.2: Connection Stability
**Steps:**
1. Monitor bot for 2+ hours
2. Check for disconnections
3. Verify auto-reconnection works

**Expected Results:**
- [ ] Stable connection
- [ ] Auto-reconnection if needed
- [ ] No data loss

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

---

## Test 10: Multi-Group Testing ✅

### Test 10.1: Cross-Group Functionality
**Steps:**
1. Add bot to second test group
2. Test commands in both groups
3. Verify group-specific muting

**Expected Results:**
- [ ] Commands work in both groups
- [ ] Group mutes are independent
- [ ] No cross-group interference

**✅ Test Result:** PASS / FAIL  
**Notes:** ________________________________

---

## Overall Test Results Summary

**Date:** ___________  
**Tester:** ___________  
**Bot Version:** 2.0 (Baileys)  
**Node.js Version:** ___________

### Test Results Overview:
- [ ] Test 1: Basic Connection & Status
- [ ] Test 2: Invite Link Detection (4 sub-tests)
- [ ] Test 3: Group Mute Functionality (2 sub-tests)
- [ ] Test 4: Individual User Mute (2 sub-tests)
- [ ] Test 5: Whitelist System (2 sub-tests)
- [ ] Test 6: Command Permissions (2 sub-tests)
- [ ] Test 7: Stats and Monitoring
- [ ] Test 8: Error Handling (2 sub-tests)
- [ ] Test 9: Performance & Stability (2 sub-tests)
- [ ] Test 10: Multi-Group Testing

**Total Subtests:** 20  
**Passed:** ___/20  
**Failed:** ___/20

### Critical Issues Found:
1. ________________________________
2. ________________________________
3. ________________________________

### Minor Issues Found:
1. ________________________________
2. ________________________________
3. ________________________________

### Performance Metrics:
- **Memory Usage:** ______ MB
- **Response Time:** ______ seconds (average)
- **Uptime:** ______ hours without issues
- **Error Count:** ______ errors in console

### Final Assessment:
**Overall Status:** ✅ PASS / ❌ FAIL

**Ready for Production:** YES / NO

**Additional Notes:**
_____________________________________________
_____________________________________________
_____________________________________________

**Tester Signature:** ___________________  
**Date Completed:** ___________________