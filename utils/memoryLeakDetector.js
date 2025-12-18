// utils/memoryLeakDetector.js
// Detects potential memory leaks by tracking heap growth patterns

const { getTimestamp } = require('./logger');

class MemoryLeakDetector {
    constructor() {
        this.snapshots = [];
        this.maxSnapshots = 20; // Keep last 20 snapshots
        this.snapshotInterval = 5 * 60 * 1000; // 5 minutes
        this.monitoringInterval = null;
        this.leakThreshold = 50 * 1024 * 1024; // 50MB growth over 20 minutes = potential leak
        this.consecutiveGrowth = 0;
        this.consecutiveThreshold = 4; // 4 consecutive growths = leak warning
    }

    /**
     * Take a memory snapshot
     */
    takeSnapshot() {
        const memory = process.memoryUsage();
        const snapshot = {
            timestamp: Date.now(),
            timestampLocal: getTimestamp(),
            heapUsed: memory.heapUsed,
            heapTotal: memory.heapTotal,
            rss: memory.rss,
            external: memory.external,
            heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
            rssMB: Math.round(memory.rss / 1024 / 1024)
        };

        this.snapshots.push(snapshot);

        // Trim old snapshots
        if (this.snapshots.length > this.maxSnapshots) {
            this.snapshots.shift();
        }

        return snapshot;
    }

    /**
     * Analyze memory growth pattern
     */
    analyzeGrowth() {
        if (this.snapshots.length < 4) {
            return {
                status: 'INSUFFICIENT_DATA',
                message: 'Need more data to detect leaks',
                leakDetected: false
            };
        }

        const recent = this.snapshots.slice(-4);
        const oldest = recent[0];
        const newest = recent[recent.length - 1];

        const heapGrowth = newest.heapUsed - oldest.heapUsed;
        const heapGrowthMB = Math.round(heapGrowth / 1024 / 1024);
        const timeDiff = newest.timestamp - oldest.timestamp;
        const timeDiffMinutes = Math.round(timeDiff / 1000 / 60);

        // Check if heap is consistently growing
        let isConsistentGrowth = true;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i].heapUsed <= recent[i - 1].heapUsed) {
                isConsistentGrowth = false;
                break;
            }
        }

        if (isConsistentGrowth) {
            this.consecutiveGrowth++;
        } else {
            this.consecutiveGrowth = 0;
        }

        // Detect potential leak
        const leakDetected = isConsistentGrowth &&
            this.consecutiveGrowth >= this.consecutiveThreshold &&
            heapGrowth > this.leakThreshold;

        return {
            status: leakDetected ? 'LEAK_DETECTED' : 'NORMAL',
            heapGrowthMB,
            timeDiffMinutes,
            consecutiveGrowth: this.consecutiveGrowth,
            isConsistentGrowth,
            leakDetected,
            message: leakDetected
                ? `Potential memory leak: ${heapGrowthMB}MB growth over ${timeDiffMinutes} minutes`
                : `Memory growth: ${heapGrowthMB}MB over ${timeDiffMinutes} minutes (normal)`
        };
    }

    /**
     * Start monitoring for leaks
     */
    startMonitoring(alertCallback = null) {
        if (this.monitoringInterval) {
            console.log(`[${getTimestamp()}] ⚠️  Leak detection already running`);
            return;
        }

        console.log(`[${getTimestamp()}] 🔍 Starting memory leak detection`);
        console.log(`[${getTimestamp()}] 📸 Taking snapshots every ${this.snapshotInterval / 1000 / 60} minutes`);

        // Take initial snapshot
        this.takeSnapshot();

        // Set up interval
        this.monitoringInterval = setInterval(() => {
            const snapshot = this.takeSnapshot();
            const analysis = this.analyzeGrowth();

            if (analysis.leakDetected) {
                console.log(`[${getTimestamp()}] 🚨 MEMORY LEAK DETECTED!`);
                console.log(`[${getTimestamp()}] ${analysis.message}`);
                console.log(`[${getTimestamp()}] Current heap: ${snapshot.heapUsedMB}MB`);

                if (alertCallback) {
                    alertCallback(analysis, snapshot);
                }
            } else if (analysis.status !== 'INSUFFICIENT_DATA') {
                console.log(`[${getTimestamp()}] 🔍 Leak check: ${analysis.message}`);
            }
        }, this.snapshotInterval);
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            console.log(`[${getTimestamp()}] 🛑 Memory leak detection stopped`);
        }
    }

    /**
     * Generate leak detection report
     */
    generateReport() {
        if (this.snapshots.length === 0) {
            return '📊 No memory snapshots available';
        }

        const oldest = this.snapshots[0];
        const newest = this.snapshots[this.snapshots.length - 1];
        const totalGrowth = newest.heapUsed - oldest.heapUsed;
        const totalGrowthMB = Math.round(totalGrowth / 1024 / 1024);
        const timeDiff = newest.timestamp - oldest.timestamp;
        const timeDiffMinutes = Math.round(timeDiff / 1000 / 60);
        const analysis = this.analyzeGrowth();

        const report = [
            `🔍 *MEMORY LEAK DETECTION REPORT*`,
            ``,
            `*Status:* ${analysis.leakDetected ? '🚨 LEAK DETECTED' : '✅ Normal'}`,
            `*Snapshots:* ${this.snapshots.length}`,
            `*Monitoring:* ${this.monitoringInterval ? '🟢 Active' : '🔴 Inactive'}`,
            ``,
            `*Overall Growth:*`,
            `• ${totalGrowthMB}MB over ${timeDiffMinutes} minutes`,
            `• From ${oldest.heapUsedMB}MB to ${newest.heapUsedMB}MB`,
            ``,
            `*Recent Pattern:*`,
            `• ${analysis.message}`,
            `• Consecutive growth: ${this.consecutiveGrowth}/${this.consecutiveThreshold}`
        ];

        if (analysis.leakDetected) {
            report.push(``);
            report.push(`⚠️ *RECOMMENDATION:*`);
            report.push(`Consider restarting the bot to free memory.`);
        }

        return report.join('\n');
    }

    /**
     * Reset detection
     */
    reset() {
        this.snapshots = [];
        this.consecutiveGrowth = 0;
        console.log(`[${getTimestamp()}] 🔄 Memory leak detector reset`);
    }
}

// Export singleton instance
const memoryLeakDetector = new MemoryLeakDetector();
module.exports = memoryLeakDetector;
