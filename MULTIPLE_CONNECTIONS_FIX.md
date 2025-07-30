# WhatsApp Multiple Connections Fix Guide

## 🚨 The Real Cause of Error 515

**IT'S NOT FIREBASE!** Based on user feedback from GitHub issues, Error 515 is caused by **multiple connections using the same WhatsApp account simultaneously**.

### What's Happening:
1. You deploy bot to cloud server → It connects to WhatsApp
2. You try to run locally → WhatsApp detects 2 connections
3. WhatsApp throws Error 515 to prevent multiple instances

## ✅ The Solution: Choose ONE Location

### Option 1: Run ONLY on Cloud Server
```bash
# On your LOCAL machine:
rm -rf baileys_auth_info
# Don't run the bot locally anymore

# On your CLOUD server:
pm2 start index.js --name commguard
pm2 logs commguard
```

### Option 2: Run ONLY Locally
```bash
# On your CLOUD server:
pm2 stop commguard
pm2 delete commguard
rm -rf /root/CommGuard/baileys_auth_info

# On your LOCAL machine:
rm -rf baileys_auth_info
npm start
```

### Option 3: Switch Between Locations
Use the helper script:
```bash
./fix-multiple-connections.sh
```

## 🛡️ Prevention: Single Instance Lock

The bot now includes automatic single-instance checking:
- Creates `.commguard.lock` file when running
- Prevents multiple instances on the same machine
- Shows error if another instance is detected

## 📋 Quick Troubleshooting

### "Another instance is already running!"
```bash
# Check if bot is actually running
ps aux | grep node | grep index.js

# If not running, remove stale lock
rm .commguard.lock
```

### Still Getting Error 515?
1. **Wait 30 minutes** - Let WhatsApp clear the connection
2. **Check all locations**:
   ```bash
   # Check local
   ps aux | grep node
   
   # Check cloud (SSH to server)
   pm2 list
   ps aux | grep node
   ```
3. **Clear ALL auth data**:
   ```bash
   # Local
   rm -rf baileys_auth_info
   
   # Cloud
   ssh user@server "rm -rf /root/CommGuard/baileys_auth_info"
   ```

## 🔍 How to Verify Which Instance is Connected

Run this on both local and cloud:
```bash
# Check if auth exists
ls -la baileys_auth_info/creds.json

# Check if process is running
ps aux | grep -E "node.*index.js|pm2"

# Check lock file
cat .commguard.lock 2>/dev/null
```

## 💡 Best Practices

1. **Production = Cloud Only**
   - Use PM2 for automatic restarts
   - Monitor with `pm2 logs`
   - Set up `pm2 startup` for reboot persistence

2. **Development = Local Only**
   - Stop cloud instance first
   - Use `npm run dev` for auto-reload
   - Test thoroughly before deploying

3. **Never Run Both**
   - WhatsApp multi-device ≠ multiple bots
   - One account = one bot instance
   - Use different numbers for dev/prod if needed

## 🚀 Recommended Setup

### For Cloud Production:
```bash
# Initial setup
cd /root/CommGuard
npm install
pm2 start index.js --name commguard

# Auto-start on reboot
pm2 startup
pm2 save

# Monitor
pm2 logs commguard --lines 100
```

### For Local Development:
```bash
# Make sure cloud is stopped
ssh user@server "pm2 stop commguard"

# Run locally
npm run dev
```

## 📝 Summary

- **Error 515 = Multiple connections detected**
- **NOT a Firebase issue**
- **Solution = Run in ONE place only**
- **Use the provided scripts to manage instances**

Remember: WhatsApp Web (which Baileys uses) only allows ONE bot connection per phone number!