# QA Test Plan - Blacklist Violation Tracking System

## Overview
This document outlines the comprehensive testing plan for the new blacklist violation tracking system with reply-based admin control.

## Prerequisites
- Bot is running on production server (209.38.231.184)
- PostgreSQL database is connected
- Redis cache is connected
- Admin phone is configured in config.js
- Test WhatsApp group is available

## Test Environment Info
- **Database**: PostgreSQL 17.7 (Railway)
- **Cache**: Redis 8.2.1 (Railway)
- **Bot Version**: 2.0.0
- **Deployment**: PM2 on Ubuntu

---

## Test 1: Invite Link Detection with Violation Tracking

### Objective
Verify that when a user posts an invite link, the system:
1. Deletes the message
2. Kicks the user
3. Records violation in database
4. Sends alert to admin with violation count
5. Asks admin to blacklist (reply with 1/0)

### Steps
1. Have a non-admin user post a WhatsApp invite link in a test group
   - Example: `https://chat.whatsapp.com/ABC123DEF456`
2. Observe bot behavior
3. Check admin phone for alert message

### Expected Results
- ✅ Message deleted within 1 second
- ✅ User kicked from group
- ✅ Admin receives alert with format:
  ```
  🚨 WhatsApp Invite Spam - ACTION REQUIRED

  👤 User: [userId]
  📞 Phone: +[phone]
  📍 Group: [groupName]
  ⏰ Time: [timestamp]
  📧 Spam Link: https://chat.whatsapp.com/ABC123DEF456
  ⚠️ Violations: invite_link: 1

  ✅ User was kicked from group

  ❓ Add to blacklist?
  Reply with:
    1️⃣ = Yes, blacklist
    0️⃣ = No, skip
  ```

### Database Verification
```sql
-- Check violation was recorded
SELECT phone_number, violations, is_blacklisted
FROM users
WHERE phone_number = '[test_phone]';

-- Expected: violations = {"invite_link": 1}, is_blacklisted = false
```

### Pass Criteria
- [ ] Message deleted
- [ ] User kicked
- [ ] Violation recorded in database
- [ ] Alert sent with correct format
- [ ] Violation count = 1

---

## Test 2: Reply with "1" to Blacklist User

### Objective
Verify that admin can reply "1" to the alert to blacklist the user

### Prerequisites
- Test 1 completed with alert message received

### Steps
1. Reply to the alert message (not new message!) with: `1`
2. Observe bot response

### Expected Results
- ✅ Bot responds with:
  ```
  ✅ User +[phone] has been blacklisted.

  Violation: invite_link
  ```
- ✅ User is added to blacklist in all systems:
  - PostgreSQL: `is_blacklisted = true`
  - Firebase: Added to blacklist collection
  - Redis: Cached as blacklisted

### Database Verification
```sql
-- Check user is blacklisted
SELECT phone_number, is_blacklisted, blacklisted_at, violations
FROM users
WHERE phone_number = '[test_phone]';

-- Expected: is_blacklisted = true, blacklisted_at = [timestamp]
```

### Pass Criteria
- [ ] Reply "1" triggers blacklist
- [ ] Bot confirms blacklist
- [ ] Database updated (is_blacklisted = true)
- [ ] Firebase updated
- [ ] Redis cache updated

---

## Test 3: Reply with "0" to Skip Blacklist

### Objective
Verify that admin can reply "0" to skip blacklisting

### Prerequisites
- Another user posts invite link (repeat Test 1 with different user)

### Steps
1. Wait for alert from new user posting invite link
2. Reply to the alert with: `0`
3. Observe bot response

### Expected Results
- ✅ Bot responds with:
  ```
  ⏭️ Skipped blacklisting for +[phone]
  ```
- ✅ User is NOT blacklisted in database
- ✅ Violation is still recorded

### Database Verification
```sql
SELECT phone_number, is_blacklisted, violations
FROM users
WHERE phone_number = '[test_phone2]';

-- Expected: is_blacklisted = false, violations = {"invite_link": 1}
```

### Pass Criteria
- [ ] Reply "0" skips blacklist
- [ ] Bot confirms skip
- [ ] User remains NOT blacklisted
- [ ] Violation still recorded

---

## Test 4: Blacklisted User Attempts to Rejoin

### Objective
Verify that when a blacklisted user tries to rejoin, the system:
1. Auto-kicks them
2. Sends alert with #ub option
3. Shows violation history

### Prerequisites
- User is blacklisted (from Test 2)

### Steps
1. Have the blacklisted user try to rejoin the group (or admin re-adds them)
2. Observe bot behavior
3. Check admin phone for alert

### Expected Results
- ✅ User immediately kicked upon joining
- ✅ Admin receives alert with format:
  ```
  🚫 BLACKLISTED USER REJOIN ATTEMPT

  👤 User: [userId]
  📞 Phone: +[phone]
  📍 Group: [groupName]
  ⚠️ Violations: invite_link: 1

  ✅ User was automatically kicked (blacklisted)

  ❓ Unblacklist this user?
  Reply with:
    #ub = Yes, remove from blacklist
    (Ignore to keep blocked)
  ```

### Pass Criteria
- [ ] User kicked on rejoin
- [ ] Alert sent with violation history
- [ ] Alert includes #ub option
- [ ] No manual intervention needed

---

## Test 5: Reply "#ub" to Unblacklist User

### Objective
Verify that admin can reply "#ub" to remove user from blacklist

### Prerequisites
- Test 4 completed with rejoin alert received

### Steps
1. Reply to the rejoin alert with: `#ub`
2. Observe bot response
3. Have user try to rejoin again

### Expected Results
- ✅ Bot responds with:
  ```
  ✅ User +[phone] has been removed from blacklist.
  ```
- ✅ User removed from blacklist in all systems:
  - PostgreSQL: `is_blacklisted = false`
  - Firebase: Removed from blacklist collection
  - Redis: Removed from cache
- ✅ User can now rejoin group successfully
- ✅ Violation history preserved

### Database Verification
```sql
SELECT phone_number, is_blacklisted, violations
FROM users
WHERE phone_number = '[test_phone]';

-- Expected: is_blacklisted = false, violations = {"invite_link": 1} (preserved)
```

### Pass Criteria
- [ ] Reply "#ub" removes from blacklist
- [ ] Bot confirms removal
- [ ] Database updated (is_blacklisted = false)
- [ ] Firebase updated
- [ ] Redis cache cleared
- [ ] User can rejoin
- [ ] Violations preserved

---

## Test 6: #kick Command with Violation Tracking

### Objective
Verify that when admin uses #kick command, the system:
1. Kicks the user
2. Records "kicked_by_admin" violation
3. Sends alert asking to blacklist

### Steps
1. Have any user send a message in group
2. Admin replies to that message with: `#kick`
3. Observe bot behavior
4. Check admin phone for alert

### Expected Results
- ✅ User kicked from group
- ✅ Admin receives alert with format:
  ```
  🚨 User Kicked by Admin - ACTION REQUIRED

  👤 User: [userId]
  📞 Phone: +[phone]
  📍 Group: [groupName]
  ⏰ Time: [timestamp]
  ⚠️ Violations: kicked_by_admin: 1

  ✅ User was kicked from group

  ❓ Add to blacklist?
  Reply with:
    1️⃣ = Yes, blacklist
    0️⃣ = No, skip
  ```

### Database Verification
```sql
SELECT phone_number, violations
FROM users
WHERE phone_number = '[test_phone]';

-- Expected: violations = {"kicked_by_admin": 1}
-- Or if same user from previous tests: {"invite_link": 1, "kicked_by_admin": 1}
```

### Pass Criteria
- [ ] #kick command works
- [ ] User kicked
- [ ] Violation recorded as "kicked_by_admin"
- [ ] Alert sent with blacklist question
- [ ] Can reply 1/0 to blacklist/skip

---

## Test 7: Direct #ub Command (Not Reply)

### Objective
Verify that admin can use #ub command directly with phone number

### Prerequisites
- User is blacklisted

### Steps
1. In private chat with bot, send: `#ub 972XXXXXXXXX` (replace with actual phone)
2. Observe bot response

### Expected Results
- ✅ Bot responds with:
  ```
  ✅ Removed +972XXXXXXXXX from blacklist.

  Violation history preserved for record keeping.
  ```
- ✅ User removed from blacklist in all systems
- ✅ Violation history preserved

### Database Verification
```sql
SELECT phone_number, is_blacklisted, violations
FROM users
WHERE phone_number = '972XXXXXXXXX';

-- Expected: is_blacklisted = false, violations = [preserved]
```

### Pass Criteria
- [ ] Direct #ub command works
- [ ] Bot confirms removal
- [ ] User unblacklisted in all systems
- [ ] Violations preserved

---

## Test 8: Multiple Violations Same User

### Objective
Verify that violation counts accumulate correctly

### Steps
1. Have same user post 3 different invite links (get kicked 3 times)
2. Admin skips blacklist each time (reply "0")
3. Then admin uses #kick command on same user
4. Check violation totals

### Expected Results
- ✅ After 3 invite links: `violations = {"invite_link": 3}`
- ✅ After #kick: `violations = {"invite_link": 3, "kicked_by_admin": 1}`
- ✅ Each alert shows cumulative violations

### Database Verification
```sql
SELECT phone_number, violations
FROM users
WHERE phone_number = '[test_phone]';

-- Expected: violations = {"invite_link": 3, "kicked_by_admin": 1}
```

### Pass Criteria
- [ ] Violations accumulate correctly
- [ ] Each type tracked separately
- [ ] Counts displayed in alerts
- [ ] Database shows correct totals

---

## Test 9: Edge Cases

### Test 9.1: Reply to Old Alert (24+ hours)
- Alert messages expire after 24 hours
- Replying to expired alert should not work
- Bot should respond: "Request expired or not found"

### Test 9.2: Reply "1" to Already Blacklisted User
- User is already blacklisted
- Reply "1" to alert
- Should still work (idempotent operation)

### Test 9.3: #ub on Non-Blacklisted User
- User is not blacklisted
- Try `#ub [phone]`
- Should handle gracefully (no error)

### Test 9.4: LID Format User (Encrypted ID)
- User with @lid format posts invite link
- System should handle LID decoding
- Alert should show phone or indicate LID format

### Test 9.5: Multiple Admins Reply
- Multiple admins receive alerts
- First admin replies "1" or "0"
- Second admin tries to reply
- Should handle gracefully (request already processed)

---

## Monitoring and Logs

### Key Log Patterns to Watch

1. **Violation Recording**:
   ```
   📊 Violation recorded: [phone] - [type] = [count]
   ```

2. **Blacklist Request Stored**:
   ```
   📋 Stored pending blacklist request for: [phone]
   ```

3. **Reply Detection**:
   ```
   Reply Detected - Quoted Message ID: [messageId]
   ```

4. **Blacklist Action**:
   ```
   ✅ User +[phone] has been blacklisted
   ```

5. **Unblacklist Action**:
   ```
   ✅ User +[phone] has been removed from blacklist
   ```

### Database Queries for Debugging

```sql
-- View all users with violations
SELECT phone_number, violations, is_blacklisted, blacklisted_at
FROM users
WHERE violations != '{}'::jsonb
ORDER BY first_seen DESC;

-- Count violations by type
SELECT
    jsonb_object_keys(violations) as violation_type,
    COUNT(*) as user_count
FROM users
WHERE violations != '{}'::jsonb
GROUP BY violation_type;

-- Users with multiple violation types
SELECT phone_number, violations
FROM users
WHERE jsonb_array_length(jsonb_object_keys(violations)) > 1;
```

---

## Performance Benchmarks

### Expected Response Times
- Message deletion: < 100ms
- User kick: < 500ms
- Database violation insert: < 200ms
- Alert send: < 1000ms
- Reply processing: < 500ms

### Load Testing
- System should handle 100+ concurrent invite link violations
- Database should not bottleneck
- Redis cache should improve blacklist check performance

---

## Rollback Plan

If critical issues found during testing:

1. **Stop bot**: `ssh root@209.38.231.184 "pm2 stop commguard-bot"`
2. **Rollback code**: `git revert HEAD~3..HEAD`
3. **Redeploy**: `git push origin main`
4. **Restart bot**: `pm2 start commguard-bot`

---

## Sign-Off Checklist

- [ ] All 9 core tests passed
- [ ] Database queries verified
- [ ] No critical errors in logs
- [ ] Performance within benchmarks
- [ ] Edge cases handled
- [ ] Documentation updated
- [ ] User notified of completion

---

## Notes and Observations

(Use this space to record any issues, edge cases, or observations during testing)

**Test Date**: _____________
**Tester**: _____________
**Environment**: Production
**Result**: ☐ Pass  ☐ Fail  ☐ Pass with Issues

**Issues Found**:
1.
2.
3.

**Recommendations**:
1.
2.
3.
