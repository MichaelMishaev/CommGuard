# QA Checklist: Self-Service Unblacklist System

## Pre-Test Setup ✅

- [ ] Firebase integration enabled in config.js
- [ ] Bot has proper admin permissions in test groups
- [ ] Admin phone numbers configured correctly
- [ ] Test user accounts available (blacklisted and non-blacklisted)

## Core Functionality Tests

### 1. Policy Message Display ✅
- [ ] Blacklisted user joins group → gets kicked
- [ ] User receives proper policy message with #free instructions
- [ ] Message includes 24-hour cooldown information
- [ ] Message includes agreement to follow rules

**Expected Policy Message:**
```
🚫 You have been automatically removed from [GROUP] because you are blacklisted for sharing WhatsApp invite links.

📋 *To request removal from blacklist:*
1️⃣ Agree to NEVER share invite links in groups
2️⃣ Send *#free* to this bot
3️⃣ Wait for admin approval

⏰ You can request once every 24 hours.
⚠️ By sending #free, you agree to follow group rules.
```

### 2. #free Command Tests ✅

#### Valid #free Command
- [ ] Blacklisted user sends #free in private chat
- [ ] User receives confirmation message
- [ ] Admin receives notification with approval instructions
- [ ] Request stored in Firebase unblacklist_requests collection

#### #free Command Validations
- [ ] Non-blacklisted user sends #free → "You are not on blacklist" message
- [ ] User sends #free in group chat → "Private messages only" message
- [ ] User sends #free twice within 24h → Cooldown message with hours remaining
- [ ] Firebase disabled → Proper error message

### 3. Admin Approval Tests ✅

#### Approval Flow (yes command)
- [ ] Admin sends `yes 972555123456` in private chat
- [ ] User gets removed from blacklist
- [ ] Admin receives confirmation message
- [ ] User receives approval notification
- [ ] Request status updated to "approved" in Firebase

#### Denial Flow (no command)
- [ ] Admin sends `no 972555123456` in private chat
- [ ] User remains on blacklist
- [ ] Admin receives confirmation message
- [ ] User receives denial notification
- [ ] Request status updated to "denied" in Firebase

#### Admin Command Validations
- [ ] Non-admin tries approval command → No response/ignored
- [ ] Admin uses wrong format → Usage instruction message
- [ ] Admin approves non-existent request → "No pending request" message
- [ ] Admin command in group chat → Ignored

### 4. 24-Hour Cooldown Tests ✅

- [ ] User makes request → Can't make another for 24h
- [ ] Exact time calculation working (not 23h 59m or 24h 1m)
- [ ] Cooldown message shows correct hours remaining
- [ ] After 24h expires → User can make new request
- [ ] Multiple requests increment total count correctly

### 5. Firebase Integration Tests ✅

#### Data Storage
- [ ] Requests properly stored in unblacklist_requests collection
- [ ] Document ID matches normalized phone number
- [ ] All required fields present and correct
- [ ] Timestamps in ISO format

#### Data Retrieval
- [ ] Pending requests query works correctly
- [ ] Request details retrieval working
- [ ] Cache loading on bot startup
- [ ] Cache vs Firebase consistency

#### Firebase Failure Handling
- [ ] Firebase unavailable → Graceful degradation
- [ ] Write failure → Proper error message to user
- [ ] Read failure → Fallback behavior
- [ ] Connection timeout → User notified appropriately

## Edge Cases and Error Handling ✅

### User ID Format Handling
- [ ] Standard format: 972555123456@s.whatsapp.net
- [ ] LID format: 972555123456@lid  
- [ ] Legacy format: 972555123456@c.us
- [ ] Bare number: 972555123456
- [ ] All formats normalize correctly

### Security Tests
- [ ] Rate limiting prevents spam
- [ ] Admin verification working
- [ ] Input sanitization working
- [ ] No injection vulnerabilities

### Performance Tests
- [ ] Multiple concurrent requests handled
- [ ] Large number of pending requests
- [ ] Memory usage reasonable
- [ ] Response times under 2 seconds

## Integration Tests ✅

### Complete Flow Test
1. [ ] User shares invite link → Gets blacklisted and kicked
2. [ ] User tries to rejoin → Gets kicked with policy message
3. [ ] User sends #free → Request created, admin notified
4. [ ] Admin approves with yes command
5. [ ] User gets unblacklisted and notified
6. [ ] User can rejoin groups successfully

### Regression Tests
- [ ] Existing blacklist functionality still works
- [ ] Existing commands (#help, #status, etc.) still work
- [ ] Group moderation features unaffected
- [ ] Bot startup and connection stable

## Load and Stress Tests ✅

- [ ] 100 concurrent #free requests
- [ ] 1000 pending requests in Firebase
- [ ] Bot restart with many pending requests
- [ ] High-volume admin approval processing

## Error Recovery Tests ✅

- [ ] Bot restart during pending request
- [ ] Firebase connection lost during operation
- [ ] Partial operation failures
- [ ] Cache corruption recovery

## User Experience Tests ✅

### Message Clarity
- [ ] All user messages clear and actionable
- [ ] Admin instructions easy to follow
- [ ] Error messages helpful and specific
- [ ] Timestamp formats user-friendly

### Response Times
- [ ] #free command responds within 3 seconds
- [ ] Admin commands respond within 2 seconds
- [ ] Policy message sent immediately after kick
- [ ] No user waits more than 5 seconds for response

## Production Readiness ✅

### Monitoring and Logging
- [ ] All operations properly logged
- [ ] Error conditions logged with context
- [ ] Performance metrics available
- [ ] Admin activity tracked

### Documentation
- [ ] CLAUDE.md updated with new commands
- [ ] Feature properly documented
- [ ] Configuration options explained
- [ ] Troubleshooting guide available

### Deployment
- [ ] Configuration changes minimal
- [ ] No breaking changes to existing features
- [ ] Safe rollback plan available
- [ ] Monitoring plan in place

## Final Validation ✅

- [ ] All tests passing
- [ ] No regressions identified
- [ ] Performance within acceptable limits
- [ ] Security review completed
- [ ] Admin training completed
- [ ] Documentation complete

## Known Limitations and Notes

1. **24-hour timer**: Based on when request was made, not when it was denied
2. **Firebase dependency**: Feature degrades gracefully but requires Firebase for persistence
3. **Single admin approval**: Only one admin needs to approve/deny
4. **No appeal process**: Denied users must wait 24h for next request
5. **Cache consistency**: Cache rebuilds on bot restart, may briefly show stale data

## Test Environment Requirements

- Test WhatsApp account for bot
- Test group with bot as admin
- Test user accounts (some blacklisted)
- Firebase test environment
- Network simulation tools for error testing

---

**Test Completion Date:** ___________  
**Tester:** ___________  
**Issues Found:** ___________  
**Ready for Production:** [ ] Yes [ ] No