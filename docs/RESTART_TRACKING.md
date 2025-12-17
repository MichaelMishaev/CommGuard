# Bot Restart Tracking System

## Overview

Ultra-detailed restart tracking system to detect **WHY** the bot restarts.

## Features

### 1. **Automatic Restart Detection**
Every time the bot starts, it automatically:
- Detects the restart reason
- Logs detailed information to `restart_history.jsonl`
- Sends restart reason in WhatsApp startup message
- Tracks time since last restart

### 2. **Restart Reasons Detected**

The system detects:

**✅ Deployment:**
- `CODE_DEPLOYMENT` - Git pull within last 5 minutes
- Includes timestamp of git pull

**✅ Memory Issues:**
- `MEMORY_LIMIT` - Previous heap usage exceeded 900MB
- `LOW_SYSTEM_MEMORY` - System memory > 90% used

**✅ Crash Detection:**
- `CRASH_LOOP` - Restarted within 5 seconds (crash loop)
- `NEW_PROCESS` - PID changed (manual restart or PM2 auto-restart)

**✅ System Issues:**
- `HIGH_SYSTEM_LOAD` - System load > 10
- `PM2_RESTART` - PM2 automatic restart with counter

**✅ First Start:**
- `FIRST_START` - No previous process info

**✅ Unknown:**
- `UNKNOWN` - No specific reason detected

### 3. **PM2 Auto-Restart Configuration**

**Current Config** (`ecosystem.config.js`):
```javascript
max_memory_restart: "1G"  // Auto-restart when memory exceeds 1GB
```

This means PM2 will **automatically restart** the bot if memory usage exceeds 1GB.

## New Startup Message

The bot now sends detailed restart information:

```
🟢 CommGuard Bot Started

✅ Bot is now online and monitoring groups
🔧 Enhanced session error recovery enabled
⚡ Fast startup mode active
📊 Connection stable after 0 attempts
🔄 Restart Reason: CODE_DEPLOYMENT - Git pull 45s ago
⏱️ Time since last: 23h 15m
⏰ Time: 17/12/2025 19:17:19
```

## Commands

### `#restarthistory` (Admin Only)

View the last 10 bot restarts with detailed information:

```
📊 Bot Restart History (Last 10)

*1. 17/12/2025 19:17:19*
🔄 Reason: CODE_DEPLOYMENT - Git pull 45s ago
⏱️ Time since last: 23h 15m
💾 Memory: 245MB
🆔 PID: 2105025

*2. 16/12/2025 20:02:14*
🔄 Reason: MEMORY_LIMIT - Previous heap usage exceeded 900MB
⏱️ Time since last: 4h 32m
💾 Memory: 987MB
🆔 PID: 2095362

...

📁 Full log: restart_history.jsonl
```

## Log Files

### `restart_history.jsonl`
- **Location:** `/root/CommGuard/restart_history.jsonl`
- **Format:** JSONL (one JSON object per line)
- **Contents:** Complete restart details including:
  - Timestamp (ISO + local)
  - PID and uptime
  - Memory usage
  - Environment variables
  - Detected restart reasons
  - Last process info
  - Git pull timing
  - System load and memory

**Example Entry:**
```json
{
  "timestamp": "2025-12-17T19:17:19.123Z",
  "timestampLocal": "17/12/2025 19:17:19",
  "pid": 2105025,
  "uptime": 0.245,
  "memory": {
    "rss": 123456789,
    "heapTotal": 104857600,
    "heapUsed": 89128960,
    "external": 1234567,
    "arrayBuffers": 123456
  },
  "possibleReasons": [
    "CODE_DEPLOYMENT - Git pull 45s ago",
    "NEW_PROCESS - PID changed (manual restart or PM2 restart)"
  ],
  "lastProcess": {
    "timestamp": "2025-12-16T20:02:14.456Z",
    "pid": 2095362,
    "memory": {...}
  },
  "timeSinceLastStart": 83705000,
  "timeSinceLastStartFormatted": "23h 15m",
  "gitPullTime": "2025-12-17T19:16:34.000Z"
}
```

### `last_process_info.json`
- **Location:** `/root/CommGuard/last_process_info.json`
- **Purpose:** Stores info about previous bot process
- **Used:** To detect crash loops and time between restarts

## Implementation Files

1. **`utils/restartTracker.js`** - Core restart tracking logic
2. **`index.js:15`** - Import and call on bot startup
3. **`index.js:693-696`** - Track restart before sending message
4. **`services/commandHandler.js:11`** - Import for #restarthistory
5. **`services/commandHandler.js:95-96`** - Add command to switch
6. **`services/commandHandler.js:555-599`** - Handler implementation

## Use Cases

### 1. Debugging Unexpected Restarts
```bash
# SSH into server
ssh root@209.38.231.184

# View restart log
cat /root/CommGuard/restart_history.jsonl | tail -10 | jq '.'

# Or use WhatsApp command
# Send: #restarthistory
```

### 2. Monitoring Memory Issues
```bash
# Check for memory-related restarts
grep "MEMORY_LIMIT" /root/CommGuard/restart_history.jsonl
```

### 3. Track Deployments
```bash
# See all deployment-triggered restarts
grep "CODE_DEPLOYMENT" /root/CommGuard/restart_history.jsonl
```

## Why This Solves Your Problem

**Before:**
- ❓ Bot restarted at 19:17:19, but you didn't push anything
- ❓ No way to know WHY it restarted
- ❓ Could be: manual restart, crash, memory limit, PM2 auto-restart, deployment

**After:**
- ✅ Every restart logs detailed reason
- ✅ Startup message shows exact restart reason
- ✅ #restarthistory command shows full history
- ✅ Can trace back to exact cause (git pull, memory, crash, etc.)

**Next Time Bot Restarts:**
You'll receive a message like:
```
🟢 CommGuard Bot Started
...
🔄 Restart Reason: PM2_RESTART - Count: 101, MEMORY_LIMIT - Previous heap usage exceeded 900MB
⏱️ Time since last: 4h 23m
...
```

Now you'll know **exactly why** it restarted!

## Prevention Strategies

### If Memory Limit Issues:
1. Increase max_memory_restart to 1.5G
2. Investigate memory leaks
3. Monitor with `pm2 monit`

### If Too Many Deployments:
1. Batch multiple commits before deploying
2. Review who has SSH access
3. Check for auto-deploy webhooks

### If Crash Loops:
1. Check error logs immediately
2. Fix the crashing code
3. Implement better error handling

## Testing

To test the restart tracker:

```bash
# On production
ssh root@209.38.231.184
cd /root/CommGuard

# Manual restart
pm2 restart commguard-bot

# Check logs
tail -20 restart_history.jsonl

# Or check WhatsApp - you'll get startup message with restart reason
```

## Summary

- ✅ Tracks ALL restart reasons automatically
- ✅ Logs to permanent JSONL file
- ✅ Shows in WhatsApp startup message
- ✅ #restarthistory command for history
- ✅ Detects: deployments, crashes, memory issues, PM2 restarts
- ✅ No more mystery restarts!
