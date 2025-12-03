# Bot Restart Tracking Setup Guide

## Overview

This system tracks all bot restarts, crashes, uptime, and functionality in PostgreSQL Railway database. It helps monitor bot stability and diagnose issues.

## What Was Created

### 1. Database Table: `bot_restarts`
Tracks every bot restart with:
- Restart time and reason (startup, crash, manual, deploy, error_515, etc.)
- Connection duration and status
- System info (Node version, bot version, server location)
- Performance metrics (memory usage, CPU, messages processed)
- Service status (PostgreSQL, Redis connected)
- Error messages and stack traces for crashes
- Uptime in seconds

### 2. Database Views

**`v_recent_bot_activity`** - Last 50 restarts with key metrics
```sql
SELECT * FROM v_recent_bot_activity;
```

**`v_bot_health_summary`** - 30-day health statistics
```sql
SELECT * FROM v_bot_health_summary;
```

### 3. Service: `botRestartLogger.js`

Provides functions to log bot lifecycle events:
- `logBotStart(options)` - Log when bot starts
- `logBotConnected(options)` - Update when WhatsApp connects
- `logBotCrash(error, reason)` - Log crashes
- `logBotShutdown(reason)` - Log graceful shutdown
- `incrementMessageCount()` - Track messages processed
- `getRestartHistory(limit)` - Get recent restart history
- `getHealthSummary()` - Get bot health stats

## Setup Instructions

### Step 1: Apply Database Schema

**On Production Server:**
```bash
ssh root@209.38.231.184
cd /root/CommGuard
git pull origin main
node database/apply-bot-restarts-table.js
```

This will create:
- `bot_restarts` table
- `v_recent_bot_activity` view
- `v_bot_health_summary` view
- `get_current_bot_session()` function

### Step 2: Integrate into index.js

Add at the top of index.js:
```javascript
const botRestartLogger = require('./services/botRestartLogger');
```

Add when bot starts (after PostgreSQL connection):
```javascript
// Log bot startup
await botRestartLogger.logBotStart({
    reason: 'manual_restart', // or 'startup', 'crash', 'deploy', 'error_515'
    serverLocation: 'production'
});
```

Add when WhatsApp connects successfully:
```javascript
// Log successful connection
await botRestartLogger.logBotConnected({
    qrCodeShown: false,
    blacklistCount: blacklistService.getBlacklistCount(),
    groupsCount: Object.keys(sock.groupMetadata).length,
    postgresConnected: true,
    redisConnected: true
});
```

Add in message handler (to track messages):
```javascript
// In handleMessage function
botRestartLogger.incrementMessageCount();
```

Add crash handlers:
```javascript
// Handle crashes
process.on('uncaughtException', async (error) => {
    await botRestartLogger.logBotCrash(error, 'uncaught_exception');
    process.exit(1);
});

process.on('unhandledRejection', async (error) => {
    await botRestartLogger.logBotCrash(error, 'unhandled_rejection');
    process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    await botRestartLogger.logBotShutdown('manual_sigint');
    process.exit(0);
});
```

### Step 3: Add Admin Command to View Stats

Add to `commandHandler.js`:

```javascript
async handleBotHealth(msg, isAdmin) {
    if (!isAdmin) {
        return false;
    }

    try {
        const botRestartLogger = require('./botRestartLogger');

        // Get current session
        const currentSession = botRestartLogger.getCurrentSession();

        // Get recent history
        const history = await botRestartLogger.getRestartHistory(5);

        // Get health summary
        const health = await botRestartLogger.getHealthSummary();

        let response = '🤖 *Bot Health Report*\n\n';

        // Current session
        if (currentSession) {
            const uptimeHours = (currentSession.uptime / 3600).toFixed(2);
            response += `📊 *Current Session:*\n`;
            response += `   Session ID: ${currentSession.sessionId}\n`;
            response += `   Uptime: ${uptimeHours} hours\n`;
            response += `   Messages: ${currentSession.messagesProcessed}\n\n`;
        }

        // Health summary (30 days)
        if (health) {
            response += `📈 *30-Day Statistics:*\n`;
            response += `   Total Restarts: ${health.total_restarts}\n`;
            response += `   Crashes: ${health.crash_count}\n`;
            response += `   Success Rate: ${((health.successful_starts / health.total_restarts) * 100).toFixed(1)}%\n`;
            response += `   Avg Uptime: ${health.avg_uptime_hours} hours\n`;
            response += `   Max Uptime: ${health.max_uptime_hours} hours\n`;
            response += `   Current Status: ${health.current_status}\n\n`;
        }

        // Recent restarts
        if (history && history.length > 0) {
            response += `🔄 *Last 5 Restarts:*\n`;
            history.forEach((restart, index) => {
                const time = new Date(restart.restart_time).toLocaleString('en-GB');
                response += `${index + 1}. ${time}\n`;
                response += `   Reason: ${restart.restart_reason}\n`;
                response += `   Status: ${restart.status}\n`;
                response += `   Uptime: ${restart.uptime_hours || 0}h\n`;
                if (restart.error_message) {
                    response += `   Error: ${restart.error_message.substring(0, 50)}...\n`;
                }
            });
        }

        await this.sock.sendMessage(msg.key.remoteJid, { text: response });
        return true;
    } catch (error) {
        console.error('Error in handleBotHealth:', error);
        await this.sock.sendMessage(msg.key.remoteJid, {
            text: '❌ Failed to get bot health stats: ' + error.message
        });
        return true;
    }
}
```

Add to command switch in `handleCommand()`:
```javascript
case '#bothealth':
case '#health':
    return await this.handleBotHealth(msg, isAdmin);
```

## Usage

### View Bot Health (Admin Command)
```
#bothealth
```

Shows:
- Current session uptime
- Messages processed this session
- 30-day crash statistics
- Average and max uptime
- Last 5 restarts with reasons

### Query Database Directly

**Get recent restarts:**
```sql
SELECT * FROM v_recent_bot_activity LIMIT 10;
```

**Get health summary:**
```sql
SELECT * FROM v_bot_health_summary;
```

**Get current session:**
```sql
SELECT * FROM get_current_bot_session();
```

**Find all crashes in last 7 days:**
```sql
SELECT
    restart_time,
    uptime_seconds / 3600.0 as uptime_hours,
    error_message,
    memory_usage_mb
FROM bot_restarts
WHERE restart_reason = 'crash'
    AND restart_time > NOW() - INTERVAL '7 days'
ORDER BY restart_time DESC;
```

**Get average uptime by restart reason:**
```sql
SELECT
    restart_reason,
    COUNT(*) as count,
    ROUND(AVG(uptime_seconds) / 3600.0, 2) as avg_uptime_hours
FROM bot_restarts
WHERE uptime_seconds > 0
GROUP BY restart_reason
ORDER BY count DESC;
```

## Benefits

1. **Monitor Stability** - Track how often bot crashes and why
2. **Diagnose Issues** - See error messages and patterns
3. **Track Performance** - Monitor memory usage and message throughput
4. **Uptime Reports** - Know exactly how long bot has been running
5. **Historical Data** - Analyze trends over time

## Files Created

- `database/add-bot-restarts-table.sql` - SQL schema
- `database/apply-bot-restarts-table.js` - Apply script
- `services/botRestartLogger.js` - Logging service
- `BOT_RESTART_TRACKING_SETUP.md` - This guide

## Next Steps

1. ✅ Push code to GitHub
2. ⏳ SSH to production and apply schema
3. ⏳ Integrate logging into index.js
4. ⏳ Add #bothealth command
5. ⏳ Test with a manual restart

## Notes

- Metrics auto-update every 5 minutes
- Message count updates every 100 messages (to reduce DB writes)
- All times stored in UTC
- Views are read-only and calculated on-demand
