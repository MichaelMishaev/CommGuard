# SSH Connection Guide for CommGuard Bot

## 🚀 Quick Start

### Connect to Server
```bash
ssh root@209.38.231.184
```

### Navigate to Project
```bash
cd /root/CommGuard
```

### Check Bot Status
```bash
pm2 status
```

---

## 📋 Server Information

- **Server IP**: `209.38.231.184`
- **Username**: `root`
- **Project Path**: `/root/CommGuard`
- **Bot Process**: `commguard` (PM2)

---

## 🔧 Essential Commands

### Bot Management
```bash
# Check bot status
pm2 status

# View bot logs (real-time)
pm2 logs commguard

# View last 20 lines of logs
pm2 logs commguard --lines 20

# Restart bot
pm2 restart commguard

# Stop bot
pm2 stop commguard

# Start bot
pm2 start commguard

# Delete old processes
pm2 delete whatsapp-bot

# Monitor bot in real-time
pm2 monit

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
```

### File Management
```bash
# List project files
ls -la

# Check Firebase files
ls -la firebaseConfig.js
ls -la guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json

# View log files directly
tail -f ~/.pm2/logs/commguard-out.log
tail -f ~/.pm2/logs/commguard-error.log
```

### Copy Files to Server (from local machine)
```bash
# Copy Firebase config
scp firebaseConfig.js root@209.38.231.184:/root/CommGuard/

# Copy Firebase service account key
scp guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json root@209.38.231.184:/root/CommGuard/
```

### Git Operations
```bash
# Pull latest changes
git pull origin main

# Check git status
git status

# View recent commits
git log --oneline -5
```

---

## 🚨 Troubleshooting

### Bot Not Starting - Firebase Error
```bash
# Check if Firebase files exist
ls -la firebaseConfig.js
ls -la guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json

# If missing, copy from local machine:
scp firebaseConfig.js root@209.38.231.184:/root/CommGuard/
scp guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json root@209.38.231.184:/root/CommGuard/

# Restart bot
pm2 restart commguard
```

### Stream Error 515 (Multiple Connections)
```bash
# Clear auth data to force new login
rm -rf baileys_auth_info

# Restart bot
pm2 restart commguard

# Check for multiple instances
ps aux | grep node
pkill -f node  # Kill all Node processes if needed
```

### Bot Process Issues
```bash
# Check all PM2 processes
pm2 list

# Delete unwanted processes
pm2 delete process-name

# Clear PM2 logs
pm2 flush

# Reset PM2
pm2 kill
pm2 start index.js --name commguard
```

### Server Resources
```bash
# Check disk space
df -h

# Check memory usage
free -h

# Check CPU usage
htop

# Check running processes
ps aux | grep node
```

---

## 📁 Important Files

### Required for Bot Operation
- `index.js` - Main bot file
- `firebaseConfig.js` - Firebase configuration
- `guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json` - Firebase service account key
- `config.js` - Bot configuration

### Bot Process & Logs
- **PM2 Process Name**: `commguard`
- **Logs Location**: `~/.pm2/logs/`
- **Working Directory**: `/root/CommGuard`
- **Lock File**: `.commguard.lock` (prevents multiple instances)

---

## 🔐 Security Notes

- Firebase service account key contains sensitive credentials
- Keep `guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json` secure
- Never commit Firebase credentials to Git
- Use `.gitignore` to exclude sensitive files
- Bot uses single-instance lock to prevent multiple connections

---

## 📞 Quick Fixes

### Bot Won't Start
1. Check Firebase files: `ls -la firebaseConfig.js`
2. Copy missing files from local machine
3. Restart: `pm2 restart commguard`

### Bot Disconnected
1. Check logs: `pm2 logs commguard`
2. Clear auth: `rm -rf baileys_auth_info`
3. Restart: `pm2 restart commguard`

### Multiple Connection Error
1. Choose one location (cloud OR local)
2. Clear auth on unused location
3. Restart bot

### PM2 Issues
1. Check status: `pm2 status`
2. Delete old processes: `pm2 delete process-name`
3. Restart: `pm2 restart commguard` 