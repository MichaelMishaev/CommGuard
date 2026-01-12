# CommGuard Bot v2.0 - Deployment Guide

## 🚀 Quick Start

### 1. Stop Current Bot
```bash
# Stop the old bot if running
pkill -f "node index.js"
# or
pm2 stop all
```

### 2. Backup Current Data (Optional)
```bash
# Backup blacklist data if using Firebase
cp blacklist.json blacklist-backup.json 2>/dev/null || echo "No blacklist to backup"

# Backup auth data (optional - will need to re-scan QR)
cp -r baileys_auth_info baileys_auth_backup 2>/dev/null || echo "No auth to backup"
```

### 3. Start New Bot
```bash
# Start the new v2.0 bot
node commguard-v2.js
```

### 4. Scan QR Code
- QR code will display in terminal
- Scan with WhatsApp on your phone
- Wait for "CommGuard Bot v2.0 Connected Successfully!" message

## ✅ Verification Checklist

### Essential Tests (Must Complete)

1. **Bot Connection**
   ```
   ✅ Bot connects without errors
   ✅ QR code scans successfully  
   ✅ Receives startup notification
   ```

2. **Admin Detection Test**
   ```
   ✅ Send #status in test group
   ✅ Bot shows "ADMIN" or "NOT ADMIN" status
   ✅ If "NOT ADMIN" - make bot admin in group
   ```

3. **Message Deletion Test**
   ```
   ✅ Send #clear in group (as admin)
   ✅ Bot attempts to delete recent messages
   ✅ No "not implemented" errors
   ```

4. **Invite Link Detection Test**
   ```
   ✅ Send https://chat.whatsapp.com/test123 (from non-admin)
   ✅ Message gets deleted immediately
   ✅ User gets kicked from group
   ✅ Admin receives alert notification
   ```

5. **Command System Test**
   ```
   ✅ Send #help in private chat
   ✅ Receive full command list
   ✅ All commands show as working ✅
   ```

6. **Blacklist Test**
   ```
   ✅ #blacklist 1234567890 (adds user)
   ✅ #blacklst (shows blacklisted users)
   ✅ #unblacklist 1234567890 (removes user)
   ```

7. **Kick Command Test**
   ```
   ✅ Reply to message and type #kick
   ✅ User gets kicked successfully
   ✅ User gets added to blacklist
   ```

### Advanced Tests (Recommended)

8. **Built-in Test Command**
   ```
   ✅ Send #test in private chat
   ✅ All 5 tests show PASS
   ✅ Success rate shows 100%
   ```

9. **Auto-Kick Blacklisted Test**
   ```
   ✅ Add user to blacklist
   ✅ Add same user to group
   ✅ User gets auto-kicked immediately
   ```

10. **Country Code Restriction Test** (if enabled)
    ```
    ✅ User with +1 number joins → gets kicked
    ✅ User with +6 number joins → gets kicked  
    ✅ Israeli user (+972) joins → stays in group
    ```

## 🔧 Configuration

### Environment Variables (Optional)
```bash
# Set custom admin phones
export ADMIN_PHONE="972555030766"
export ALERT_PHONE="972544345287"

# Enable Firebase (if available)
export FIREBASE_ENABLED="true"

# Enable debug mode
export DEBUG="true"
```

### Feature Toggles (in code)
```javascript
// Edit commguard-v2.js if needed
FEATURES: {
    INVITE_LINK_DETECTION: true,        // ✅ Keep enabled
    AUTO_KICK_BLACKLISTED: true,        // ✅ Keep enabled  
    RESTRICT_COUNTRY_CODES: true,       // ⚙️ Adjust as needed
    FIREBASE_INTEGRATION: false,        // ⚙️ Set to true if Firebase available
    DEBUG_MODE: false                   // ⚙️ Set to true for troubleshooting
}
```

## 🚨 Troubleshooting

### Bot Not Admin Error
```
❌ Bot needs admin permissions to [action]
```
**Solution:**
1. Make bot admin in WhatsApp group
2. Send #status to verify admin status shows "✅ ADMIN"

### QR Code Issues
```
❌ Connection failed / QR code not working
```
**Solution:**
1. Clear auth data: `rm -rf baileys_auth_info`
2. Restart bot: `node commguard-v2.js`
3. Scan fresh QR code

### Invite Links Not Detected
```
❌ Invite links not being deleted/kicked
```
**Solution:**
1. Check bot has admin permissions
2. Test with #test command - should show all PASS
3. Verify invite link pattern: https://chat.whatsapp.com/ABC123

### Commands Not Working
```
❌ Commands return "Unknown command"
```
**Solution:**
1. Use commands in correct context:
   - #help → Private chat only
   - #clear, #kick, #status → Group chat only
   - #blacklist → Either context
2. Only admins can use commands in groups

### Session Errors
```
❌ "No session found to decrypt message"
```
**Solution:**
1. These are normal and handled automatically
2. Bot will auto-clear auth if too many errors
3. For manual fix: `rm -rf baileys_auth_info` and restart

## 📊 Performance Monitoring

### Log Messages to Watch For
```bash
# Success indicators
✅ CommGuard Bot v2.0 Connected Successfully!
✅ Deleted message on attempt 1
✅ Kicked user [phone] on attempt 1
✅ Invite spam handled successfully

# Warning indicators  
⚠️ Bot not found in group participants
⚠️ Cannot handle invite spam - bot is not admin
⚠️ Delete attempt 1/3 failed

# Error indicators (investigate)
❌ Failed to check bot admin status
❌ Failed to delete message after 3 attempts
❌ Failed to kick user after 3 attempts
```

### Health Check Commands
```bash
# Send these to bot in private chat to check health
#status    # Shows bot admin status and statistics
#test      # Runs all built-in tests  
#blacklst  # Shows current blacklist size
```

## 🔄 Switching from Old Bot

### If Old Bot Was Working
1. Stop old bot
2. Start new bot  
3. Complete verification checklist
4. Keep old files as backup for 1 week

### If Old Bot Had Issues
1. Stop old bot
2. Clear auth: `rm -rf baileys_auth_info`
3. Start new bot
4. Re-scan QR code
5. Complete verification checklist

## 📈 Success Metrics

**Bot is working correctly when:**
- ✅ All verification tests pass
- ✅ Invite links get deleted within 2 seconds
- ✅ Spammers get kicked automatically
- ✅ Admin gets notification alerts
- ✅ Commands respond immediately
- ✅ #test shows 100% success rate

## 🆘 Emergency Rollback

If new bot fails completely:
```bash
# Stop new bot
pkill -f "node commguard-v2.js"

# Restore old auth (if backed up)
rm -rf baileys_auth_info
mv baileys_auth_backup baileys_auth_info

# Start old bot
node index.js
```

## 📞 Support

If issues persist after following this guide:
1. Check bot has admin permissions in groups
2. Run #test command and share results
3. Share specific error messages from console
4. Verify phone numbers in configuration are correct

---

**Remember:** The new v2.0 bot has NO bypasses and requires actual admin permissions to function. This is a security improvement over the old bot.