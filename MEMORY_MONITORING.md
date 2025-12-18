# Memory Monitoring System

## Overview

The bot now includes a comprehensive memory monitoring and leak detection system to prevent crashes due to high memory usage. This system was implemented in response to restart issues caused by critical memory levels (95-99% system memory usage).

## Features

### 1. Real-Time Memory Monitoring
- **Automatic monitoring**: Checks memory every 60 seconds
- **Alert thresholds**:
  - 🟡 WARNING: 85% system memory usage
  - 🔴 CRITICAL: 95% system memory usage
- **Admin alerts**: Automatic WhatsApp notifications when thresholds are exceeded
- **5-minute cooldown** between alerts to prevent spam

### 2. Memory Leak Detection
- **Snapshot-based tracking**: Takes memory snapshots every 5 minutes
- **Pattern analysis**: Detects consistent memory growth over time
- **Leak criteria**: 4+ consecutive increases AND 50MB+ growth
- **Automatic alerts**: Notifies admin when leak detected

### 3. Startup Health Checks
- **Pre-flight check**: Validates memory health before bot starts
- **Recommendations**: Warns if system memory too high
- **Status display**: Shows memory status in startup notification

### 4. Manual Memory Management
- **Garbage collection**: Force GC with `#gc` command
- **Memory reports**: Detailed analysis with `#memory` and `#memreport`
- **Trend analysis**: Track memory usage patterns over time

## Bot Commands

### Admin Commands (Private Chat Only)

#### `#memory` or `#memcheck`
Quick memory status check showing:
- System memory usage (used/total/percentage)
- Free memory available
- Bot memory usage (RSS and heap)
- Current health status and trend

**Example response:**
```
🔴 MEMORY STATUS

Health: CRITICAL
Trend: 📈 INCREASING

System Memory:
• Used: 61.01GB / 64.00GB (95.3%)
• Free: 2.99GB

Bot Memory:
• RSS: 50MB
• Heap: 12MB / 14MB

⏰ 18/12/2025 23:23:00
```

#### `#memreport`
Comprehensive memory report including:
- Full memory health analysis
- Memory trend over last hour
- Leak detection report
- Snapshot history
- Monitoring status

**Example response:**
```
🔴 MEMORY HEALTH REPORT

Status: CRITICAL
Trend: 📈 INCREASING

📊 System Memory: 61.04GB / 64.00GB (95.4% used)
💾 Free Memory: 2.96GB
🤖 Bot Memory: 42MB RSS, 4MB heap

History: 15 readings collected
Monitoring: 🟢 Active
10-min average: 95.2%

────────────────────────────────────────

🔍 MEMORY LEAK DETECTION REPORT

Status: ✅ Normal
Snapshots: 12
Monitoring: 🟢 Active

Overall Growth:
• 8MB over 60 minutes
• From 4MB to 12MB

Recent Pattern:
• Memory growth: 2MB over 20 minutes (normal)
• Consecutive growth: 2/4
```

#### `#gc` or `#clearmem`
Force garbage collection to free memory.

**Requires**: Bot must be started with `--expose-gc` flag (already configured in package.json)

**Example response:**
```
🧹 Garbage Collection Complete

Before: 12MB
After: 8MB
Freed: 4MB

System memory: 94.8%
⏰ 18/12/2025 23:23:00
```

If GC not available:
```
⚠️ Garbage Collection Not Available

To enable GC, restart the bot with:
`node --expose-gc index.js`

Current heap: 12MB
```

## Automatic Features

### Startup Monitoring
The bot automatically:
1. Checks memory health on startup
2. Displays memory status in console
3. Includes memory stats in startup notification to admin
4. Starts continuous monitoring if connection successful

### Continuous Monitoring
Every 60 seconds, the system:
- Checks current memory usage
- Records history for trend analysis
- Detects if thresholds exceeded
- Attempts automatic cleanup if critical
- Sends alerts to admin if needed

### Leak Detection
Every 5 minutes, the system:
- Takes memory snapshot
- Analyzes growth pattern
- Detects potential leaks
- Alerts admin if leak found

### Automatic Cleanup
When memory usage reaches CRITICAL (95%):
1. Attempts garbage collection (if enabled)
2. Logs cleanup results
3. Sends alert to admin
4. Recommends closing other applications

## Configuration

### Memory Monitor Settings
Located in `utils/memoryMonitor.js`:

```javascript
alertThreshold: 0.85      // Alert at 85% usage
criticalThreshold: 0.95   // Critical at 95% usage
checkInterval: 60000      // Check every 60 seconds
alertCooldown: 300000     // 5 minutes between alerts
```

### Leak Detector Settings
Located in `utils/memoryLeakDetector.js`:

```javascript
snapshotInterval: 5 * 60 * 1000  // 5 minutes
leakThreshold: 50 * 1024 * 1024  // 50MB
consecutiveThreshold: 4           // 4 consecutive growths
```

## Technical Details

### System Architecture

```
index.js
  ├─ Imports memoryMonitor and memoryLeakDetector
  ├─ Shows memory status on startup
  └─ Starts monitoring after successful connection

utils/memoryMonitor.js (Singleton)
  ├─ getMemoryStats() - Current memory snapshot
  ├─ checkMemory() - Periodic health check
  ├─ forceGarbageCollection() - Manual GC
  ├─ generateReport() - Detailed report
  └─ getSafeStartupRecommendation() - Startup check

utils/memoryLeakDetector.js (Singleton)
  ├─ takeSnapshot() - Memory snapshot
  ├─ analyzeGrowth() - Pattern analysis
  ├─ generateReport() - Leak report
  └─ startMonitoring() - Automatic detection

services/commandHandler.js
  ├─ handleMemoryCheck() - #memory command
  ├─ handleMemoryReport() - #memreport command
  └─ handleForceGC() - #gc command
```

### Memory Metrics Tracked

**System Memory:**
- Total memory (GB)
- Used memory (GB)
- Free memory (GB)
- Usage percentage

**Process Memory:**
- RSS (Resident Set Size) - Total memory used
- Heap Used - JavaScript heap in use
- Heap Total - JavaScript heap allocated
- External - C++ objects bound to JavaScript
- Array Buffers - Memory for typed arrays

### Health Status Levels

- 🟢 **HEALTHY**: < 85% system memory
- 🟡 **WARNING**: 85-95% system memory
- 🔴 **CRITICAL**: ≥ 95% system memory

### Trend Analysis

The system analyzes memory trends by:
1. Keeping last 60 readings (1 hour of history)
2. Comparing last 10 readings to previous 10
3. Detecting:
   - 📈 INCREASING: Average up by 2%+
   - 📉 DECREASING: Average down by 2%+
   - ➡️ STABLE: Change less than 2%

## Testing

### Run Memory Monitoring Tests
```bash
npm run test:memory
```

This runs all tests including:
- Memory stats collection
- Health status detection
- Leak detection
- Garbage collection (if available)
- Trend analysis
- Report generation

### Manual Testing
1. Start bot: `npm start`
2. Check startup shows memory status
3. Send `#memory` in private chat with bot
4. Send `#memreport` for detailed analysis
5. Send `#gc` to force garbage collection

## Troubleshooting

### High Memory Warnings
If you see frequent CRITICAL warnings:

1. **Check system memory**: Close other applications
2. **Monitor trends**: Use `#memreport` to see growth patterns
3. **Force GC**: Try `#gc` to free memory
4. **Check for leaks**: Review leak detection report
5. **Restart bot**: If memory leak confirmed

### Bot Crashes Due to Memory
If bot crashes with out-of-memory errors:

1. **Check restart history**: `#restarthistory` shows restart reasons
2. **Review restart_history.jsonl**: Contains detailed restart data
3. **Monitor before startup**: Check system memory before starting bot
4. **Close other apps**: Free up system memory first
5. **Consider system upgrade**: If consistent 95%+ usage

### Memory Leak Detection False Positives
Normal bot operation may show slight memory growth:

- **Acceptable**: < 50MB growth over 20 minutes
- **Investigate**: > 50MB growth with consistent pattern
- **Action needed**: 4+ consecutive increases

### Garbage Collection Not Working
If `#gc` shows "Not Available":

1. **Check package.json**: Should have `--expose-gc` in start scripts
2. **Restart bot**: Use `npm start` (not manual node command)
3. **Verify flag**: Check process started with `--expose-gc`

## Best Practices

1. **Monitor regularly**: Check `#memory` daily
2. **Watch trends**: Review `#memreport` weekly
3. **Respond to alerts**: Don't ignore CRITICAL warnings
4. **Close unused apps**: Keep system memory below 85%
5. **Use GC when needed**: Force cleanup during low-activity periods
6. **Track restart reasons**: Review `#restarthistory` for patterns

## Files Modified

- `index.js` - Added memory monitoring integration
- `services/commandHandler.js` - Added memory commands
- `utils/memoryMonitor.js` - Memory monitoring service (new)
- `utils/memoryLeakDetector.js` - Leak detection service (new)
- `package.json` - Added --expose-gc flag to scripts
- `tests/testMemoryMonitoring.js` - Test suite (new)

## Version History

**v2.1** - Memory Monitoring System
- Added real-time memory monitoring
- Added memory leak detection
- Added admin commands (#memory, #memreport, #gc)
- Added automatic alerts and cleanup
- Added startup health checks
- Enabled garbage collection support
