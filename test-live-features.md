non admin posted # Live Feature Testing Guide

## Testing #kick Command

### Requirements:
1. You must be admin in the group
2. Reply to ANY message from another user
3. Type exactly: `#kick` (no spaces before the #)

### Expected Behavior:
1. Bot will delete the message you replied to
2. Bot will kick the user who sent that message
3. Bot will send alert to your admin phone

### Debug:
If it doesn't work, check production logs for:
```bash
ssh root@209.38.231.184 "cd CommGuard && pm2 logs commguard-bot --lines 50 | grep -A5 -B5 '#kick'"
```

---

## Testing Invite Link Detection

### Test Links (send ONE in a group where bot is member):
```
https://chat.whatsapp.com/ABC123DEF456
```

### Expected Behavior:
1. Message gets deleted instantly
2. User gets kicked from group
3. Alert sent to admin phone

### Why It Might Not Trigger:
- ❌ You're an admin (admins are immune)
- ❌ Bot is not admin in the group (can't delete/kick)
- ❌ Recently kicked same user (10-second cooldown)

### Debug:
Check logs for invite link detection:
```bash
ssh root@209.38.231.184 "cd CommGuard && pm2 logs commguard-bot --lines 100 | grep -A10 'INVITE LINK'"
```

---

## Quick Test Script

To see if patterns work on production:
```bash
ssh root@209.38.231.184 "cd CommGuard && node test-kick-and-links.js"
```

---

## Common Issues

### #kick Not Working:
1. Check if you're admin: Bot will log "Is Admin: ❌ No"
2. Check if message starts with #: Trim() is applied, so " #kick" won't work
3. Check if reply exists: Must reply to someone's message

### Invite Link Not Deleting:
1. **Most common**: Admin posted the link (admins are immune)
2. Bot lacks admin permissions in group
3. Bot crashed/restarted between detection and action

### Verify Bot Admin Status:
```bash
# In private chat with bot, send:
#status

# Look for groups where bot is NOT admin
```
