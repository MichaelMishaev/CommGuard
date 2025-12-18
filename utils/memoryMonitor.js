// utils/memoryMonitor.js
// Comprehensive memory monitoring and management system

const os = require('os');
const { getTimestamp } = require('./logger');

class MemoryMonitor {
    constructor() {
        this.monitoringInterval = null;
        this.alertThreshold = 0.85; // Alert at 85% memory usage
        this.criticalThreshold = 0.95; // Critical at 95% memory usage
        this.checkInterval = 60000; // Check every 60 seconds
        this.memoryHistory = [];
        this.maxHistorySize = 60; // Keep last 60 readings (1 hour if checking every minute)
        this.lastAlertTime = 0;
        this.alertCooldown = 300000; // 5 minutes between alerts
        this.adminNotifier = null;
    }

    /**
     * Get current system memory statistics
     */
    getMemoryStats() {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const usedPercent = (usedMem / totalMem) * 100;

        const processMemory = process.memoryUsage();
        const processUsedMB = Math.round(processMemory.heapUsed / 1024 / 1024);
        const processAllocatedMB = Math.round(processMemory.heapTotal / 1024 / 1024);
        const processRssMB = Math.round(processMemory.rss / 1024 / 1024);

        return {
            system: {
                total: totalMem,
                free: freeMem,
                used: usedMem,
                usedPercent: usedPercent.toFixed(1),
                totalGB: (totalMem / 1024 / 1024 / 1024).toFixed(2),
                freeGB: (freeMem / 1024 / 1024 / 1024).toFixed(2),
                usedGB: (usedMem / 1024 / 1024 / 1024).toFixed(2)
            },
            process: {
                heapUsed: processMemory.heapUsed,
                heapTotal: processMemory.heapTotal,
                rss: processMemory.rss,
                external: processMemory.external,
                arrayBuffers: processMemory.arrayBuffers,
                heapUsedMB: processUsedMB,
                heapTotalMB: processAllocatedMB,
                rssMB: processRssMB
            },
            timestamp: Date.now(),
            timestampLocal: getTimestamp()
        };
    }

    /**
     * Format memory stats for display
     */
    formatMemoryStats(stats) {
        const lines = [
            `📊 System Memory: ${stats.system.usedGB}GB / ${stats.system.totalGB}GB (${stats.system.usedPercent}% used)`,
            `💾 Free Memory: ${stats.system.freeGB}GB`,
            `🤖 Bot Memory: ${stats.process.rssMB}MB RSS, ${stats.process.heapUsedMB}MB heap`
        ];
        return lines.join('\n');
    }

    /**
     * Determine memory health status
     */
    getMemoryHealth(stats) {
        const usedPercent = parseFloat(stats.system.usedPercent);

        if (usedPercent >= this.criticalThreshold * 100) {
            return { status: 'CRITICAL', emoji: '🔴', color: 'red' };
        } else if (usedPercent >= this.alertThreshold * 100) {
            return { status: 'WARNING', emoji: '🟡', color: 'yellow' };
        } else {
            return { status: 'HEALTHY', emoji: '🟢', color: 'green' };
        }
    }

    /**
     * Perform garbage collection if available
     */
    forceGarbageCollection() {
        if (global.gc) {
            console.log(`[${getTimestamp()}] 🧹 Forcing garbage collection...`);
            const before = process.memoryUsage().heapUsed;
            global.gc();
            const after = process.memoryUsage().heapUsed;
            const freed = Math.round((before - after) / 1024 / 1024);
            console.log(`[${getTimestamp()}] ✅ GC completed. Freed: ${freed}MB`);
            return freed;
        } else {
            console.log(`[${getTimestamp()}] ⚠️  GC not available. Start with --expose-gc flag to enable.`);
            return 0;
        }
    }

    /**
     * Attempt to free memory
     */
    async attemptMemoryCleanup() {
        console.log(`[${getTimestamp()}] 🧹 Attempting memory cleanup...`);

        // Force garbage collection if available
        const freed = this.forceGarbageCollection();

        // Additional cleanup strategies
        // Clear any large caches if they exist (can be extended based on your needs)

        return freed;
    }

    /**
     * Check memory and take action if needed
     */
    async checkMemory(sock = null) {
        const stats = this.getMemoryStats();
        const health = this.getMemoryHealth(stats);

        // Add to history
        this.memoryHistory.push({
            timestamp: stats.timestamp,
            usedPercent: parseFloat(stats.system.usedPercent),
            processRssMB: stats.process.rssMB,
            status: health.status
        });

        // Trim history
        if (this.memoryHistory.length > this.maxHistorySize) {
            this.memoryHistory.shift();
        }

        // Check if action needed
        const usedPercent = parseFloat(stats.system.usedPercent);
        const now = Date.now();

        if (usedPercent >= this.criticalThreshold * 100) {
            console.log(`[${getTimestamp()}] ${health.emoji} ${health.status}: System memory at ${stats.system.usedPercent}%!`);
            console.log(this.formatMemoryStats(stats));

            // Attempt cleanup
            await this.attemptMemoryCleanup();

            // Send alert to admin if cooldown passed
            if (sock && this.adminNotifier && (now - this.lastAlertTime) > this.alertCooldown) {
                await this.sendMemoryAlert(sock, stats, health);
                this.lastAlertTime = now;
            }
        } else if (usedPercent >= this.alertThreshold * 100) {
            if ((now - this.lastAlertTime) > this.alertCooldown) {
                console.log(`[${getTimestamp()}] ${health.emoji} ${health.status}: System memory at ${stats.system.usedPercent}%`);

                if (sock && this.adminNotifier) {
                    await this.sendMemoryAlert(sock, stats, health);
                    this.lastAlertTime = now;
                }
            }
        }

        return { stats, health };
    }

    /**
     * Send memory alert to admin
     */
    async sendMemoryAlert(sock, stats, health) {
        if (!this.adminNotifier) return;

        const message = `${health.emoji} *MEMORY ${health.status}*\n\n` +
            `${this.formatMemoryStats(stats)}\n\n` +
            `⚠️ High memory usage detected!\n` +
            `Consider closing other applications or restarting the system.`;

        try {
            await this.adminNotifier(sock, message);
            console.log(`[${getTimestamp()}] 📨 Memory alert sent to admin`);
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Failed to send memory alert:`, error.message);
        }
    }

    /**
     * Start monitoring memory
     */
    startMonitoring(sock = null) {
        if (this.monitoringInterval) {
            console.log(`[${getTimestamp()}] ⚠️  Memory monitoring already running`);
            return;
        }

        console.log(`[${getTimestamp()}] 🎯 Starting memory monitoring (checking every ${this.checkInterval / 1000}s)`);
        console.log(`[${getTimestamp()}] 📊 Alert threshold: ${this.alertThreshold * 100}%, Critical: ${this.criticalThreshold * 100}%`);

        // Initial check
        this.checkMemory(sock);

        // Set up interval
        this.monitoringInterval = setInterval(() => {
            this.checkMemory(sock);
        }, this.checkInterval);
    }

    /**
     * Stop monitoring memory
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            console.log(`[${getTimestamp()}] 🛑 Memory monitoring stopped`);
        }
    }

    /**
     * Get memory trend analysis
     */
    getMemoryTrend() {
        if (this.memoryHistory.length < 2) {
            return { trend: 'INSUFFICIENT_DATA', direction: '➡️' };
        }

        const recent = this.memoryHistory.slice(-10);
        const avgRecent = recent.reduce((sum, r) => sum + r.usedPercent, 0) / recent.length;

        const older = this.memoryHistory.slice(-20, -10);
        const avgOlder = older.length > 0
            ? older.reduce((sum, r) => sum + r.usedPercent, 0) / older.length
            : avgRecent;

        const difference = avgRecent - avgOlder;

        if (difference > 2) {
            return { trend: 'INCREASING', direction: '📈', difference: difference.toFixed(1) };
        } else if (difference < -2) {
            return { trend: 'DECREASING', direction: '📉', difference: difference.toFixed(1) };
        } else {
            return { trend: 'STABLE', direction: '➡️', difference: difference.toFixed(1) };
        }
    }

    /**
     * Generate memory report
     */
    generateReport() {
        const stats = this.getMemoryStats();
        const health = this.getMemoryHealth(stats);
        const trend = this.getMemoryTrend();

        const report = [
            `${health.emoji} *MEMORY HEALTH REPORT*`,
            ``,
            `*Status:* ${health.status}`,
            `*Trend:* ${trend.direction} ${trend.trend}`,
            ``,
            this.formatMemoryStats(stats),
            ``,
            `*History:* ${this.memoryHistory.length} readings collected`,
            `*Monitoring:* ${this.monitoringInterval ? '🟢 Active' : '🔴 Inactive'}`
        ];

        if (this.memoryHistory.length >= 10) {
            const last10 = this.memoryHistory.slice(-10);
            const avgLast10 = (last10.reduce((sum, r) => sum + r.usedPercent, 0) / last10.length).toFixed(1);
            report.push(`*10-min average:* ${avgLast10}%`);
        }

        return report.join('\n');
    }

    /**
     * Set admin notifier function
     */
    setAdminNotifier(notifierFn) {
        this.adminNotifier = notifierFn;
    }

    /**
     * Get safe startup recommendation
     */
    getSafeStartupRecommendation() {
        const stats = this.getMemoryStats();
        const usedPercent = parseFloat(stats.system.usedPercent);

        if (usedPercent >= 95) {
            return {
                safe: false,
                message: '🔴 CRITICAL: System memory at ' + stats.system.usedPercent + '%. Bot may crash. Close other apps first!',
                severity: 'CRITICAL'
            };
        } else if (usedPercent >= 85) {
            return {
                safe: true,
                message: '🟡 WARNING: System memory at ' + stats.system.usedPercent + '%. Monitor closely.',
                severity: 'WARNING'
            };
        } else {
            return {
                safe: true,
                message: '🟢 HEALTHY: System memory at ' + stats.system.usedPercent + '%. Safe to proceed.',
                severity: 'HEALTHY'
            };
        }
    }
}

// Export singleton instance
const memoryMonitor = new MemoryMonitor();
module.exports = memoryMonitor;
