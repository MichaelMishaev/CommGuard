/**
 * Crash Loop Guard
 *
 * Detects when the bot is restarting too frequently and takes protective action:
 * - Monitors restart frequency
 * - Alerts admin when crash loop detected
 * - Optionally disables problematic features
 * - Prevents resource exhaustion
 */

const fs = require('fs');
const path = require('path');

class CrashLoopGuard {
    constructor() {
        this.restartHistoryFile = path.join(__dirname, '..', 'crash_loop_history.json');
        this.restartHistory = [];
        this.loadHistory();

        // Configuration
        this.maxRestartsInWindow = 10; // Max restarts allowed
        this.timeWindowMs = 5 * 60 * 1000; // 5 minutes
        this.crashLoopThreshold = 5; // Trigger alert after 5 rapid restarts
        this.emergencyStopThreshold = 20; // Stop bot after 20 restarts in window
    }

    loadHistory() {
        try {
            if (fs.existsSync(this.restartHistoryFile)) {
                const data = fs.readFileSync(this.restartHistoryFile, 'utf8');
                this.restartHistory = JSON.parse(data);

                // Clean old entries (older than 1 hour)
                const oneHourAgo = Date.now() - (60 * 60 * 1000);
                this.restartHistory = this.restartHistory.filter(r => r.timestamp > oneHourAgo);
            }
        } catch (error) {
            console.error('[CrashLoopGuard] Failed to load history:', error.message);
            this.restartHistory = [];
        }
    }

    saveHistory() {
        try {
            fs.writeFileSync(
                this.restartHistoryFile,
                JSON.stringify(this.restartHistory, null, 2)
            );
        } catch (error) {
            console.error('[CrashLoopGuard] Failed to save history:', error.message);
        }
    }

    recordRestart(reason = 'unknown') {
        const now = Date.now();

        this.restartHistory.push({
            timestamp: now,
            reason,
            pid: process.pid,
            memory: process.memoryUsage().heapUsed / 1024 / 1024
        });

        // Keep only recent history (last hour)
        const oneHourAgo = now - (60 * 60 * 1000);
        this.restartHistory = this.restartHistory.filter(r => r.timestamp > oneHourAgo);

        this.saveHistory();
    }

    getRestartsInWindow() {
        const now = Date.now();
        const windowStart = now - this.timeWindowMs;

        return this.restartHistory.filter(r => r.timestamp >= windowStart);
    }

    checkForCrashLoop() {
        const recentRestarts = this.getRestartsInWindow();
        const restartCount = recentRestarts.length;

        const status = {
            isCrashLoop: false,
            shouldAlert: false,
            shouldEmergencyStop: false,
            restartCount,
            maxRestarts: this.maxRestartsInWindow,
            timeWindowMinutes: this.timeWindowMs / 60000,
            recentRestarts
        };

        // Check if in crash loop
        if (restartCount >= this.crashLoopThreshold) {
            status.isCrashLoop = true;
            status.shouldAlert = true;
        }

        // Check if emergency stop needed
        if (restartCount >= this.emergencyStopThreshold) {
            status.shouldEmergencyStop = true;
        }

        return status;
    }

    async sendAlertToAdmin(sock, adminPhone, status) {
        try {
            const message = `
🚨 *CRASH LOOP DETECTED*

The bot has restarted *${status.restartCount} times* in the last ${status.timeWindowMinutes} minutes.

⚠️ *Recent Restarts:*
${status.recentRestarts.slice(-5).map((r, i) =>
    `${i + 1}. ${new Date(r.timestamp).toLocaleTimeString()} - ${r.reason} (${r.memory.toFixed(1)}MB)`
).join('\n')}

${status.shouldEmergencyStop ?
    '🛑 *EMERGENCY STOP INITIATED*\nBot will stop to prevent resource exhaustion.' :
    '⚠️ *Action Required*\nPlease investigate and fix the underlying issue.'
}

*Possible Causes:*
- Firebase integration enabled without credentials
- Memory exhaustion
- Network connectivity issues
- Code errors causing exceptions

*Recommended Actions:*
1. Check PM2 logs: \`pm2 logs commguard-bot\`
2. Review error logs: \`tail -100 ~/.pm2/logs/commguard-bot-error.log\`
3. Check config: \`cat config.js | grep -A5 FEATURES\`
4. Verify memory: \`free -h\`
`;

            await sock.sendMessage(adminPhone, { text: message });
            console.log('[CrashLoopGuard] Alert sent to admin:', adminPhone);
        } catch (error) {
            console.error('[CrashLoopGuard] Failed to send alert:', error.message);
        }
    }

    emergencyStop(reason) {
        console.error('\n================================================================================');
        console.error('🛑 EMERGENCY STOP - CRASH LOOP DETECTED');
        console.error('================================================================================');
        console.error(`Reason: ${reason}`);
        console.error(`Restart count: ${this.getRestartsInWindow().length}`);
        console.error(`Time window: ${this.timeWindowMs / 60000} minutes`);
        console.error('================================================================================\n');

        // Save emergency stop marker
        fs.writeFileSync(
            path.join(__dirname, '..', 'emergency_stop.flag'),
            JSON.stringify({
                timestamp: Date.now(),
                reason,
                restartHistory: this.restartHistory
            }, null, 2)
        );

        // Exit with specific code to indicate crash loop
        process.exit(42);
    }

    checkEmergencyStopFlag() {
        const flagFile = path.join(__dirname, '..', 'emergency_stop.flag');

        if (fs.existsSync(flagFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(flagFile, 'utf8'));
                const flagAge = Date.now() - data.timestamp;

                // If flag is less than 10 minutes old, don't start
                if (flagAge < 10 * 60 * 1000) {
                    console.error('🛑 Emergency stop flag detected. Bot will not start.');
                    console.error('Remove emergency_stop.flag file to allow startup.');
                    process.exit(42);
                }

                // Flag is old, remove it
                fs.unlinkSync(flagFile);
            } catch (error) {
                console.error('[CrashLoopGuard] Failed to check emergency flag:', error.message);
            }
        }
    }

    getStats() {
        const recentRestarts = this.getRestartsInWindow();

        return {
            totalRestarts: this.restartHistory.length,
            restartsInWindow: recentRestarts.length,
            timeWindowMinutes: this.timeWindowMs / 60000,
            isCrashLoop: recentRestarts.length >= this.crashLoopThreshold,
            recentRestarts: recentRestarts.slice(-10)
        };
    }

    reset() {
        this.restartHistory = [];
        this.saveHistory();

        // Remove emergency flag if exists
        const flagFile = path.join(__dirname, '..', 'emergency_stop.flag');
        if (fs.existsSync(flagFile)) {
            fs.unlinkSync(flagFile);
        }
    }
}

module.exports = new CrashLoopGuard();
