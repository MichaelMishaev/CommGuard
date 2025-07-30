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

### Restart Bot
```bash
pm2 restart commguard
```

---

## 📋 Server Information

- **Server IP**: `209.38.231.184`
- **Username**: `root`
- **Project Path**: `/root/CommGuard`
- **Bot Process**: `commguard` (PM2)

---

## 🔧 Common Commands

### Connect to Server
```bash
ssh root@209.38.231.184
```

### Copy Files to Server (from local machine)
```bash
# Copy Firebase config
scp firebaseConfig.js root@209.38.231.184:/root/CommGuard/

# Copy Firebase service account key
scp guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json root@209.38.231.184:/root/CommGuard/
```

### Bot Management
```bash
# Check bot status
pm2 status

# Restart bot
pm2 restart commguard

# View bot logs
pm2 logs commguard

# Stop bot
pm2 stop commguard

# Start bot
pm2 start commguard
```

### File Management
```bash
# List files in project
ls -la

# Check if Firebase files exist
ls -la firebaseConfig.js
ls -la guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json

# View bot logs
tail -f ~/.pm2/logs/commguard-out.log
tail -f ~/.pm2/logs/commguard-error.log
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

### Bot Not Starting
1. Check if Firebase files exist:
   ```bash
   ls -la firebaseConfig.js
   ls -la guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json
   ```

2. If files missing, copy from local:
   ```bash
   # From your local machine:
   scp firebaseConfig.js root@209.38.231.184:/root/CommGuard/
   scp guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json root@209.38.231.184:/root/CommGuard/
   ```

3. Restart bot:
   ```bash
   pm2 restart commguard
   ```

### Firebase Authentication Error
- Ensure both Firebase files are present
- Check file permissions: `ls -la *.json *.js`
- Restart bot after adding files

### QR Code Issues
- Bot needs to scan QR code to connect to WhatsApp
- Check logs: `pm2 logs commguard`
- Restart if needed: `pm2 restart commguard`

---

## 📁 Important Files

### Required for Bot Operation
- `index.js` - Main bot file
- `firebaseConfig.js` - Firebase configuration
- `guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json` - Firebase service account key
- `config.js` - Bot configuration

### Bot Process
- **PM2 Process Name**: `commguard`
- **Logs Location**: `~/.pm2/logs/`
- **Working Directory**: `/root/CommGuard`

---

## 🔐 Security Notes

- Firebase service account key contains sensitive credentials
- Keep `guard1-d43a3-firebase-adminsdk-fbsvc-e40f231d96.json` secure
- Never commit Firebase credentials to Git
- Use `.gitignore` to exclude sensitive files

---

## 📞 Support

If you encounter issues:
1. Check bot logs: `pm2 logs commguard`
2. Verify Firebase files exist
3. Restart bot: `pm2 restart commguard`
4. Check server resources: `htop` or `df -h` 