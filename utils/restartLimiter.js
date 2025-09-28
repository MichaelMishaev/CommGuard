// Restart limiting system to prevent excessive restarts
const fs = require('fs').promises;
const path = require('path');
const { getTimestamp } = require('./logger');

const RESTART_LOG_FILE = path.join(__dirname, '..', 'restart_log.json');
const MAX_RESTARTS_PER_DAY = 10;
const ADMIN_PHONE = '0544345287@s.whatsapp.net';

class RestartLimiter {
    constructor() {
        this.restartLog = [];
        this.loadRestartLog();
    }

    async loadRestartLog() {
        try {
            const data = await fs.readFile(RESTART_LOG_FILE, 'utf8');
            this.restartLog = JSON.parse(data);
            console.log(`[${getTimestamp()}] 📊 Loaded restart log: ${this.restartLog.length} entries`);
        } catch (error) {
            console.log(`[${getTimestamp()}] 📊 Creating new restart log file`);
            this.restartLog = [];
        }
    }

    async saveRestartLog() {
        try {
            await fs.writeFile(RESTART_LOG_FILE, JSON.stringify(this.restartLog, null, 2));
        } catch (error) {
            console.error(`Failed to save restart log:`, error.message);
        }
    }

    // Clean old entries (older than 24 hours)
    cleanOldEntries() {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const originalLength = this.restartLog.length;
        this.restartLog = this.restartLog.filter(entry => entry.timestamp > oneDayAgo);

        if (originalLength !== this.restartLog.length) {
            console.log(`[${getTimestamp()}] 🧹 Cleaned ${originalLength - this.restartLog.length} old restart entries`);
        }
    }

    // Record a restart attempt
    async recordRestart(reason = 'Unknown') {
        this.cleanOldEntries();

        const restartEntry = {
            timestamp: Date.now(),
            reason: reason,
            time: getTimestamp()
        };

        this.restartLog.push(restartEntry);
        await this.saveRestartLog();

        const todayCount = this.getTodayRestartCount();
        console.log(`[${getTimestamp()}] 🔄 Restart recorded: ${reason} (${todayCount}/${MAX_RESTARTS_PER_DAY} today)`);

        return todayCount;
    }

    // Get restart count for today
    getTodayRestartCount() {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        return this.restartLog.filter(entry => entry.timestamp > oneDayAgo).length;
    }

    // Check if restart limit exceeded
    isRestartLimitExceeded() {
        const todayCount = this.getTodayRestartCount();
        return todayCount >= MAX_RESTARTS_PER_DAY;
    }

    // Send admin notification about restart
    async notifyAdmin(sock, restartCount, reason) {
        if (!sock) return;

        try {
            let message = `🔄 Bot restart detected\n\n` +
                         `📊 Count today: ${restartCount}/${MAX_RESTARTS_PER_DAY}\n` +
                         `📝 Reason: ${reason}\n` +
                         `⏰ Time: ${getTimestamp()}`;

            if (restartCount >= MAX_RESTARTS_PER_DAY) {
                message += `\n\n⚠️ CRITICAL: Daily restart limit exceeded!\n` +
                          `🚨 Bot may be unstable - manual intervention needed`;
            } else if (restartCount >= MAX_RESTARTS_PER_DAY * 0.8) {
                message += `\n\n⚠️ WARNING: Approaching restart limit\n` +
                          `🔍 Monitor for issues`;
            }

            await sock.sendMessage(ADMIN_PHONE, { text: message });
            console.log(`[${getTimestamp()}] 📱 Admin notified of restart (${restartCount}/${MAX_RESTARTS_PER_DAY})`);
        } catch (error) {
            console.error(`Failed to notify admin of restart:`, error.message);
        }
    }

    // Get restart statistics
    getStats() {
        this.cleanOldEntries();

        const todayCount = this.getTodayRestartCount();
        const recentEntries = this.restartLog.slice(-5); // Last 5 restarts

        return {
            todayCount,
            maxAllowed: MAX_RESTARTS_PER_DAY,
            limitExceeded: this.isRestartLimitExceeded(),
            recentRestarts: recentEntries.map(entry => ({
                reason: entry.reason,
                time: entry.time,
                ago: Math.floor((Date.now() - entry.timestamp) / (1000 * 60)) + ' minutes ago'
            }))
        };
    }

    // Force emergency stop if too many restarts
    shouldEmergencyStop() {
        const todayCount = this.getTodayRestartCount();
        return todayCount > MAX_RESTARTS_PER_DAY + 5; // 15 restarts = emergency stop
    }
}

// Export singleton instance
const restartLimiter = new RestartLimiter();
module.exports = restartLimiter;