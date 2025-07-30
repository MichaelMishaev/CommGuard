# Manual QA Testing Checklist for bCommGuard

## Pre-Testing Setup ✅

- [ ] Bot is running and connected to WhatsApp
- [ ] Bot is admin in test group
- [ ] Test group has at least 3 members (bot + admin + test user)
- [ ] Firebase is connected (check console logs)
- [ ] All services loaded successfully

## Core Functionality Tests

### 1. Invite Link Detection & Auto-Kick ✅

**Test Cases:**
- [ ] Send invite link: `https://chat.whatsapp.com/ABC123DEF456`
- [ ] Send alternative format: `https://whatsapp.com/chat/XYZ789`
- [ ] Send message with invite link embedded: `Join us here: https://chat.whatsapp.com/TEST123`

**Expected Results:**
- [ ] Message is immediately deleted
- [ ] User is kicked from group
- [ ] User is added to blacklist
- [ ] Admin receives alert notification
- [ ] Bot logs the action with timestamp

### 2. Mute Functionality ✅

#### Group Mute
- [ ] **Command:** `#mute 5` (mute group for 5 minutes)
- [ ] **Expected:** Only admins can send messages
- [ ] **Test:** Send message as non-admin (should be deleted)
- [ ] **Test:** Send message as admin (should go through)
- [ ] **Wait:** After 5 minutes, group should auto-unmute

#### Individual User Mute
- [ ] **Command:** Reply to user message with `#mute 10`
- [ ] **Expected:** User's messages deleted for 10 minutes
- [ ] **Test:** User sends message (should be deleted)
- [ ] **Test:** User sends 10+ messages (should be kicked)

### 3. Command System ✅

#### Public Commands
- [ ] **`#help`** - Anyone can use, shows command list
- [ ] Non-admin uses admin command - should get permission error

#### Admin Commands
- [ ] **`#status`** - Shows bot status and configuration
- [ ] **`#stats`** - Shows group statistics
- [ ] **`#whitelist 972555123456`** - Add number to whitelist
- [ ] **`#whitelst`** - List whitelisted numbers
- [ ] **`#unwhitelist 972555123456`** - Remove from whitelist

#### Whitelist Testing
- [ ] Add admin number to whitelist
- [ ] Admin sends invite link (should be ignored)
- [ ] Remove admin from whitelist
- [ ] Admin sends invite link (should be kicked)

### 4. Blacklist System ✅

- [ ] **`#blacklist 972555987654`** - Manually add to blacklist
- [ ] **`#blacklst`** - List blacklisted numbers
- [ ] Add test user with blacklisted number to group
- [ ] **Expected:** User auto-kicked on join
- [ ] **`#unblacklist 972555987654`** - Remove from blacklist

### 5. Moderation Commands ✅

- [ ] **`#kick`** - Reply to message to kick user
- [ ] **`#ban`** - Reply to message to ban user (adds to blacklist)
- [ ] **`#warn`** - Reply to message to warn user
- [ ] **`#clear`** - Reply to message to clear user's recent messages

### 6. Advanced Commands ✅

- [ ] **`#botkick`** - Remove all blacklisted users from group
- [ ] **`#sweep`** - Comprehensive blacklist scan (super admin only)

## Error Handling Tests

### 1. Invalid Commands
- [ ] Send `#invalidcommand` - should be ignored
- [ ] Send `#mute abc` - should show error message
- [ ] Send `#whitelist` without number - should show usage

### 2. Permission Errors
- [ ] Non-admin uses `#mute` - should get permission error
- [ ] Admin uses `#sweep` - should get super admin error
- [ ] Non-admin uses `#kick` - should get permission error

### 3. Edge Cases
- [ ] Bot receives message when not admin - should log warning
- [ ] User sends invite link multiple times rapidly - cooldown should work
- [ ] Bot restarts - should reload all cached data

## Performance Tests

### 1. High Volume
- [ ] Send 10 messages rapidly from different users
- [ ] Send multiple invite links from different users
- [ ] Test with 50+ group members

### 2. Stability
- [ ] Bot runs for 24+ hours without issues
- [ ] Memory usage remains stable
- [ ] No crashes or disconnections

## Integration Tests

### 1. Firebase Integration
- [ ] Add user to whitelist - check Firebase console
- [ ] Blacklist user - verify in Firebase
- [ ] Mute user - check muted_users collection
- [ ] Bot restart - data should persist

### 2. Multi-Group Testing
- [ ] Add bot to multiple groups
- [ ] Test commands in different groups
- [ ] Verify group-specific muting works
- [ ] Check cross-group blacklist enforcement

## Regression Tests

### 1. Original Features Still Work
- [ ] Invite link detection works as before
- [ ] Auto-kick functionality intact
- [ ] Blacklist persistence maintained
- [ ] Performance not degraded

### 2. New Features Don't Break Old Ones
- [ ] Whitelist doesn't interfere with blacklist
- [ ] Mute doesn't interfere with invite detection
- [ ] Commands don't slow down message processing

## Security Tests

### 1. Access Control
- [ ] Only admins can use admin commands
- [ ] Only super admins can use super admin commands
- [ ] Whitelisted users properly bypass restrictions
- [ ] Non-whitelisted users subject to all rules

### 2. Data Protection
- [ ] Sensitive data not logged
- [ ] Firebase credentials secure
- [ ] No user data exposed in errors

## Deployment Checklist

### Pre-Deployment
- [ ] All manual tests passed
- [ ] No console errors or warnings
- [ ] Firebase connections stable
- [ ] Memory usage acceptable (<200MB)

### Post-Deployment
- [ ] Monitor logs for 24 hours
- [ ] Verify all features working in production
- [ ] Check Firebase for proper data flow
- [ ] Confirm admin notifications working

## Test Results Summary

**Date:** ___________  
**Tester:** ___________  
**Version:** 2.0 (Baileys)

**Results:**
- [ ] All core functionality tests passed
- [ ] All command system tests passed  
- [ ] All error handling tests passed
- [ ] All performance tests passed
- [ ] All integration tests passed
- [ ] All regression tests passed
- [ ] All security tests passed

**Issues Found:**
1. ________________________________
2. ________________________________
3. ________________________________

**Overall Status:** ✅ PASS / ❌ FAIL

**Notes:**
_____________________________________________
_____________________________________________
_____________________________________________

**Approved for Production:** YES / NO

**Signature:** ___________________