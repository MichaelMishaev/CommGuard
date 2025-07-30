# QA Checklist for bCommGuard Bot

## Pre-deployment Testing

### 1. Environment Setup ✓
- [ ] Node.js version 17+ installed
- [ ] All dependencies installed (`npm install`)
- [ ] Firebase configuration copied (`firebaseConfig.js` and `guard1-dbkey.json`)
- [ ] Admin phone numbers configured in `config.js`

### 2. Basic Functionality Tests

#### 2.1 Bot Connection
- [ ] Bot generates QR code for authentication
- [ ] Bot connects successfully after QR scan
- [ ] Bot reconnects automatically after disconnection
- [ ] Bot shows correct ID and name after connection

#### 2.2 Invite Link Detection
- [ ] Detects standard format: `https://chat.whatsapp.com/XXXXX`
- [ ] Detects alternate format: `https://whatsapp.com/chat/XXXXX`
- [ ] Detects multiple links in one message
- [ ] Ignores non-invite WhatsApp URLs
- [ ] Ignores regular messages without links

#### 2.3 Message Deletion
- [ ] Bot deletes messages containing invite links
- [ ] Deletion works when bot is admin
- [ ] Deletion fails gracefully when bot is not admin
- [ ] No action taken when sender is admin
- [ ] No action taken for bot's own messages

#### 2.4 User Kicking
- [ ] Bot kicks users who send invite links
- [ ] Kick works when bot is admin
- [ ] Kick fails gracefully when bot is not admin
- [ ] No kick when sender is admin
- [ ] Cooldown prevents repeated kicks (10 seconds)

#### 2.5 Blacklist Management
- [ ] Users are added to blacklist after sending invite links
- [ ] Blacklisted users are kicked when joining groups
- [ ] Blacklist persists across bot restarts (if Firebase configured)
- [ ] Blacklist works in memory-only mode (if Firebase unavailable)

#### 2.6 Notifications
- [ ] Kicked users receive notification message
- [ ] Admin receives alert for each incident
- [ ] Alert contains: group name, user ID, links, timestamp
- [ ] Notifications sent even if kick fails

### 3. Edge Cases

#### 3.1 Permission Scenarios
- [ ] Bot not admin: No action taken, logged appropriately
- [ ] Sender is admin: Link allowed, no action taken
- [ ] Bot removed from admin: Handles gracefully

#### 3.2 Network Issues
- [ ] Bot reconnects after network disconnection
- [ ] Messages queued during disconnection are processed
- [ ] No duplicate processing of same message

#### 3.3 Error Handling
- [ ] Firebase connection errors handled gracefully
- [ ] WhatsApp API errors logged but don't crash bot
- [ ] Invalid message formats don't cause crashes

### 4. Performance Tests

#### 4.1 Load Testing
- [ ] Bot handles multiple groups simultaneously
- [ ] Bot processes rapid message flow without lag
- [ ] Memory usage remains stable over time
- [ ] No memory leaks after extended operation

#### 4.2 Response Time
- [ ] Message deletion occurs within 1 second
- [ ] User kick occurs within 2 seconds
- [ ] Notifications sent within 3 seconds

### 5. Security Tests

#### 5.1 Authorization
- [ ] Only group admins bypass invite link restrictions
- [ ] Bot commands restricted to authorized users (if implemented)
- [ ] Firebase credentials not exposed in logs

#### 5.2 Rate Limiting
- [ ] Kick cooldown prevents abuse (10 seconds per user)
- [ ] Message processing doesn't overwhelm the system

### 6. Integration Tests

#### 6.1 Firebase Integration
- [ ] Blacklist syncs with Firebase when available
- [ ] Bot works without Firebase (memory-only mode)
- [ ] Firebase errors don't crash the bot

#### 6.2 Multi-Device Support
- [ ] Bot maintains session across device restarts
- [ ] Authentication persists in `baileys_auth_info`

## Test Execution Guide

### Running Automated Tests
```bash
# Run pattern detection tests
node tests/testInviteDetection.js

# The test will:
1. Run pattern matching tests
2. Optionally start live test with real WhatsApp connection
```

### Manual Testing Procedure

1. **Setup Test Environment**
   - Create a test WhatsApp group
   - Add the bot to the group
   - Make the bot an admin
   - Have at least 2 test accounts (admin and non-admin)

2. **Test Invite Link Detection**
   - Non-admin sends: `Join here: https://chat.whatsapp.com/ABC123`
   - Verify: Message deleted, user kicked, notifications sent
   - Admin sends same link
   - Verify: No action taken

3. **Test Blacklist**
   - After user is kicked, remove them manually
   - Re-add the kicked user to group
   - Verify: User is automatically kicked again

4. **Test Error Scenarios**
   - Remove bot admin privileges
   - Non-admin sends invite link
   - Verify: Bot logs error but doesn't crash

## Known Limitations

1. **Baileys Library**
   - Not officially supported by WhatsApp
   - May break with WhatsApp updates
   - Use at your own risk

2. **Rate Limits**
   - WhatsApp may limit actions if too frequent
   - Implement appropriate delays between operations

3. **Group Size**
   - Performance may degrade with very large groups (1000+ members)

## Troubleshooting

### Common Issues

1. **"Cannot read property 'admin' of undefined"**
   - Ensure bot is added to group before checking admin status
   - Wait for group metadata to load

2. **"Failed to kick user"**
   - Verify bot has admin privileges
   - Check if user is still in group
   - Ensure correct participant ID format

3. **QR Code not appearing**
   - Check if `baileys_auth_info` folder exists
   - Delete folder to force new authentication

4. **Firebase errors**
   - Verify `guard1-dbkey.json` is valid
   - Check internet connectivity
   - Bot will work without Firebase (memory-only)

## Deployment Checklist

- [ ] All tests passed
- [ ] Configuration updated with production values
- [ ] Firebase credentials secured
- [ ] Monitoring/logging configured
- [ ] Backup admin account configured
- [ ] Documentation updated
- [ ] Recovery procedures documented