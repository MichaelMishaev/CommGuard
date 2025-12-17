// utils/restartTracker.js
// Ultra-detailed bot restart tracking system

const fs = require('fs');
const path = require('path');
const { getTimestamp } = require('./logger');

const RESTART_LOG_FILE = path.join(__dirname, '../restart_history.jsonl');
const PROCESS_INFO_FILE = path.join(__dirname, '../last_process_info.json');

/**
 * Detect restart reason based on process environment and logs
 * @returns {Object} Restart reason details
 */
function detectRestartReason() {
    const reason = {
        timestamp: new Date().toISOString(),
        timestampLocal: getTimestamp(),
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        env: {
            NODE_ENV: process.env.NODE_ENV,
            PM2_HOME: process.env.PM2_HOME,
            PM2_USAGE: process.env.PM2_USAGE,
            instance_var: process.env.instance_var
        },
        possibleReasons: []
    };

    // Check if this is first start vs restart
    if (fs.existsSync(PROCESS_INFO_FILE)) {
        try {
            const lastProcess = JSON.parse(fs.readFileSync(PROCESS_INFO_FILE, 'utf8'));
            const timeSinceLastStart = Date.now() - new Date(lastProcess.timestamp).getTime();

            reason.lastProcess = lastProcess;
            reason.timeSinceLastStart = timeSinceLastStart;
            reason.timeSinceLastStartFormatted = formatDuration(timeSinceLastStart);

            // Detect restart reasons
            if (timeSinceLastStart < 5000) {
                reason.possibleReasons.push('CRASH_LOOP - Restarted within 5 seconds');
            }

            if (lastProcess.memory.heapUsed > 900 * 1024 * 1024) {
                reason.possibleReasons.push('MEMORY_LIMIT - Previous heap usage exceeded 900MB');
            }

            if (lastProcess.pid !== process.pid) {
                reason.possibleReasons.push('NEW_PROCESS - PID changed (manual restart or PM2 restart)');
            }
        } catch (err) {
            reason.possibleReasons.push('ERROR_READING_LAST_PROCESS - ' + err.message);
        }
    } else {
        reason.possibleReasons.push('FIRST_START - No previous process info found');
    }

    // Check environment variables for PM2 restart indicators
    if (process.env.PM2_RESTART_COUNT) {
        reason.possibleReasons.push(`PM2_RESTART - Count: ${process.env.PM2_RESTART_COUNT}`);
    }

    // Check if git pull happened recently
    try {
        const gitHeadPath = path.join(__dirname, '../.git/FETCH_HEAD');
        if (fs.existsSync(gitHeadPath)) {
            const gitStats = fs.statSync(gitHeadPath);
            const gitModTime = gitStats.mtime.getTime();
            const timeSinceGitPull = Date.now() - gitModTime;

            if (timeSinceGitPull < 300000) { // Within 5 minutes
                reason.possibleReasons.push(`CODE_DEPLOYMENT - Git pull ${Math.floor(timeSinceGitPull / 1000)}s ago`);
                reason.gitPullTime = new Date(gitModTime).toISOString();
            }
        }
    } catch (err) {
        // Ignore git errors
    }

    // Check system load
    const loadavg = require('os').loadavg();
    if (loadavg[0] > 10) {
        reason.possibleReasons.push(`HIGH_SYSTEM_LOAD - Load: ${loadavg[0].toFixed(2)}`);
    }

    // Check available memory
    const freemem = require('os').freemem();
    const totalmem = require('os').totalmem();
    const memPercent = ((totalmem - freemem) / totalmem * 100).toFixed(1);
    if (memPercent > 90) {
        reason.possibleReasons.push(`LOW_SYSTEM_MEMORY - ${memPercent}% used`);
    }

    // If no specific reason found
    if (reason.possibleReasons.length === 0) {
        reason.possibleReasons.push('UNKNOWN - No specific restart reason detected');
    }

    return reason;
}

/**
 * Format duration in ms to human readable
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

/**
 * Log restart event to file
 */
function logRestartEvent(reason) {
    try {
        // Append to JSONL file (one JSON object per line)
        const logLine = JSON.stringify(reason) + '\n';
        fs.appendFileSync(RESTART_LOG_FILE, logLine, 'utf8');

        // Save current process info for next restart
        const currentProcess = {
            timestamp: new Date().toISOString(),
            pid: process.pid,
            memory: process.memoryUsage(),
            uptime: process.uptime()
        };
        fs.writeFileSync(PROCESS_INFO_FILE, JSON.stringify(currentProcess, null, 2), 'utf8');

        console.log(`\n[${getTimestamp()}] 📝 RESTART TRACKING:`);
        console.log(`   Reason(s): ${reason.possibleReasons.join(', ')}`);
        if (reason.timeSinceLastStartFormatted) {
            console.log(`   Time since last start: ${reason.timeSinceLastStartFormatted}`);
        }
        console.log(`   Log file: ${RESTART_LOG_FILE}\n`);
    } catch (err) {
        console.error(`[${getTimestamp()}] ❌ Failed to log restart event:`, err.message);
    }
}

/**
 * Get restart history
 */
function getRestartHistory(limit = 10) {
    try {
        if (!fs.existsSync(RESTART_LOG_FILE)) {
            return [];
        }

        const lines = fs.readFileSync(RESTART_LOG_FILE, 'utf8').trim().split('\n');
        const history = lines
            .slice(-limit) // Get last N lines
            .map(line => JSON.parse(line))
            .reverse(); // Most recent first

        return history;
    } catch (err) {
        console.error('Failed to read restart history:', err.message);
        return [];
    }
}

/**
 * Track restart on bot startup
 */
function trackRestart() {
    const reason = detectRestartReason();
    logRestartEvent(reason);
    return reason;
}

module.exports = {
    trackRestart,
    getRestartHistory,
    detectRestartReason,
    RESTART_LOG_FILE
};
