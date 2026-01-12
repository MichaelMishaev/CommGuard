---
name: whatsapp-bot-deployment
description: Production deployment workflow for bCommGuard WhatsApp bot to VPS server
tags: [deployment, ssh, pm2, production]
---

# WhatsApp Bot Deployment Skill

This skill guides you through deploying bCommGuard to the production VPS server.

## Server Information

- **IP**: 209.38.231.184
- **User**: root
- **Bot Path**: `/root/CommGuard/`
- **Process Manager**: PM2 (process name: `commguard`)

## Pre-Deployment Checklist

1. **Test locally first**:
   ```bash
   npm test
   node tests/comprehensiveQA.js
   ```

2. **Verify git status**:
   ```bash
   git status
   git log -1  # Check latest commit
   ```

3. **Ensure changes are committed**:
   - All changes must be committed to git
   - Push to GitHub (deployment is via GitHub)

## Deployment Workflow

### Step 1: SSH to Server
```bash
ssh root@209.38.231.184
```

### Step 2: Navigate to Bot Directory
```bash
cd /root/CommGuard/
```

### Step 3: Check Current Status
```bash
pm2 status
pm2 logs commguard --lines 20
```

### Step 4: Pull Latest Changes
```bash
git pull origin main
```

### Step 5: Install Dependencies (if package.json changed)
```bash
npm install
```

### Step 6: Restart Bot
```bash
pm2 restart commguard
```

### Step 7: Verify Deployment
```bash
# Check logs for errors
pm2 logs commguard --lines 50

# Check bot is running
pm2 status

# Monitor for 30 seconds
pm2 logs commguard --lines 0
```

## Memory Protection Verification

After deployment, verify triple-layer memory protection:

```bash
# Check PM2 config
pm2 info commguard | grep -E 'cron|memory'

# Check swap space
swapon --show

# Check current memory usage
free -h
```

Expected output:
- `max_memory_restart: 400M`
- `cron_restart: '0 0 * * *'` (midnight daily)
- Swap: 1G

## Rollback Procedure

If deployment fails:

```bash
# Check previous commits
git log --oneline -5

# Rollback to previous commit
git reset --hard HEAD~1

# Restart bot
pm2 restart commguard

# Verify
pm2 logs commguard
```

## Common Issues

### Bot Not Starting
```bash
# Check auth files
ls -la baileys_auth_info/

# Clear auth and restart (requires QR scan)
rm -rf baileys_auth_info/
pm2 restart commguard
```

### High Memory Usage
```bash
# Check memory
free -h
pm2 info commguard

# Force restart if needed
pm2 restart commguard
```

### Port Already in Use
```bash
# Find process using port
lsof -i :3000

# Kill if needed
kill -9 <PID>
```

## Post-Deployment Monitoring

Monitor for 5-10 minutes after deployment:

```bash
# Real-time logs
pm2 logs commguard

# Memory monitoring
watch -n 5 'free -h && pm2 info commguard | grep memory'
```

## Critical Safety Rules

- **NEVER** delete production database data
- **ALWAYS** test locally before deploying
- **ALWAYS** deploy via GitHub (never manual file edits)
- **VERIFY** logs after deployment
- **MONITOR** memory usage (960MB server limit)

## Emergency Contacts

If critical issues occur:
1. Check PM2 logs immediately
2. Rollback if necessary
3. Document the issue
4. Test fix locally before redeploying
