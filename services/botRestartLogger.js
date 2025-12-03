// services/botRestartLogger.js
// Service to track bot restarts, crashes, and uptime in PostgreSQL

const { query } = require('../database/connection');
const { getTimestamp } = require('../utils/logger');
const os = require('os');

// Track current session
let currentSessionId = null;
let sessionStartTime = null;
let messagesProcessedThisSession = 0;

/**
 * Log bot restart/start to database
 * @param {Object} options - Restart details
 * @returns {Promise<number>} Session ID
 */
async function logBotStart(options = {}) {
    const {
        reason = 'startup',
        serverLocation = process.env.SERVER_LOCATION || 'unknown',
        nodeVersion = process.version,
        botVersion = '2.0.0',
        previousUptime = 0,
        error = null
    } = options;

    try {
        const memoryUsage = process.memoryUsage();
        const memoryMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);

        const result = await query(`
            INSERT INTO bot_restarts (
                restart_time,
                restart_reason,
                server_location,
                node_version,
                bot_version,
                status,
                uptime_seconds,
                memory_usage_mb,
                error_message,
                error_stack
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `, [
            new Date(),
            reason,
            serverLocation,
            nodeVersion,
            botVersion,
            'starting',
            previousUptime || 0,
            memoryMB,
            error?.message || null,
            error?.stack || null
        ]);

        currentSessionId = result.rows[0].id;
        sessionStartTime = Date.now();
        messagesProcessedThisSession = 0;

        console.log(`[${getTimestamp()}] 📊 Bot restart logged to database (Session ID: ${currentSessionId})`);
        return currentSessionId;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to log bot start:`, error.message);
        return null;
    }
}

/**
 * Update session status when WhatsApp connection succeeds
 * @param {Object} options - Connection details
 */
async function logBotConnected(options = {}) {
    if (!currentSessionId) {
        console.warn(`[${getTimestamp()}] ⚠️ Cannot log connection - no active session`);
        return;
    }

    const {
        qrCodeShown = false,
        blacklistCount = 0,
        groupsCount = 0,
        postgresConnected = true,
        redisConnected = true
    } = options;

    try {
        const connectionDuration = sessionStartTime ? Date.now() - sessionStartTime : 0;

        await query(`
            UPDATE bot_restarts
            SET
                connected_at = $1,
                connection_duration_ms = $2,
                qr_code_shown = $3,
                status = 'connected',
                blacklist_loaded = $4,
                groups_count = $5,
                postgres_connected = $6,
                redis_connected = $7
            WHERE id = $8
        `, [
            new Date(),
            connectionDuration,
            qrCodeShown,
            blacklistCount,
            groupsCount,
            postgresConnected,
            redisConnected,
            currentSessionId
        ]);

        console.log(`[${getTimestamp()}] ✅ Bot connected status updated in database`);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to log bot connection:`, error.message);
    }
}

/**
 * Log bot crash or error
 * @param {Error} error - Error that caused crash
 * @param {string} reason - Crash reason
 */
async function logBotCrash(error, reason = 'crash') {
    if (!currentSessionId) {
        // Create emergency log entry
        return await logBotStart({
            reason: reason,
            error: error,
            previousUptime: 0
        });
    }

    try {
        const uptime = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
        const memoryUsage = process.memoryUsage();
        const memoryMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);

        await query(`
            UPDATE bot_restarts
            SET
                status = 'crashed',
                uptime_seconds = $1,
                error_message = $2,
                error_stack = $3,
                memory_usage_mb = $4,
                messages_processed = $5
            WHERE id = $6
        `, [
            uptime,
            error?.message || 'Unknown error',
            error?.stack || null,
            memoryMB,
            messagesProcessedThisSession,
            currentSessionId
        ]);

        console.error(`[${getTimestamp()}] 💥 Bot crash logged (Session ID: ${currentSessionId}, Uptime: ${uptime}s)`);
    } catch (logError) {
        console.error(`[${getTimestamp()}] ❌ Failed to log bot crash:`, logError.message);
    }
}

/**
 * Log graceful bot shutdown
 * @param {string} reason - Shutdown reason
 */
async function logBotShutdown(reason = 'manual_stop') {
    if (!currentSessionId) return;

    try {
        const uptime = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
        const memoryUsage = process.memoryUsage();
        const memoryMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);

        await query(`
            UPDATE bot_restarts
            SET
                status = 'stopped',
                uptime_seconds = $1,
                memory_usage_mb = $2,
                messages_processed = $3,
                notes = $4
            WHERE id = $5
        `, [
            uptime,
            memoryMB,
            messagesProcessedThisSession,
            reason,
            currentSessionId
        ]);

        console.log(`[${getTimestamp()}] 🛑 Bot shutdown logged (Session ID: ${currentSessionId}, Uptime: ${uptime}s)`);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to log bot shutdown:`, error.message);
    }
}

/**
 * Increment message counter for current session
 */
function incrementMessageCount() {
    messagesProcessedThisSession++;

    // Update database every 100 messages to avoid too many writes
    if (messagesProcessedThisSession % 100 === 0) {
        updateSessionMetrics().catch(err => {
            console.error(`[${getTimestamp()}] ⚠️ Failed to update session metrics:`, err.message);
        });
    }
}

/**
 * Update session metrics in database
 */
async function updateSessionMetrics() {
    if (!currentSessionId) return;

    try {
        const uptime = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
        const memoryUsage = process.memoryUsage();
        const memoryMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);

        await query(`
            UPDATE bot_restarts
            SET
                uptime_seconds = $1,
                memory_usage_mb = $2,
                messages_processed = $3
            WHERE id = $4
        `, [uptime, memoryMB, messagesProcessedThisSession, currentSessionId]);
    } catch (error) {
        // Silent fail - don't spam logs for metric updates
    }
}

/**
 * Get current session info
 * @returns {Object} Current session details
 */
function getCurrentSession() {
    if (!currentSessionId) return null;

    return {
        sessionId: currentSessionId,
        startTime: sessionStartTime,
        uptime: sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0,
        messagesProcessed: messagesProcessedThisSession
    };
}

/**
 * Get bot restart history from database
 * @param {number} limit - Number of records to fetch
 * @returns {Promise<Array>} Restart history
 */
async function getRestartHistory(limit = 10) {
    try {
        const result = await query(`
            SELECT
                id,
                restart_time,
                restart_reason,
                status,
                uptime_seconds,
                ROUND(uptime_seconds / 3600.0, 2) as uptime_hours,
                connection_duration_ms,
                blacklist_loaded,
                groups_count,
                memory_usage_mb,
                messages_processed,
                error_message
            FROM bot_restarts
            ORDER BY restart_time DESC
            LIMIT $1
        `, [limit]);

        return result.rows;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to get restart history:`, error.message);
        return [];
    }
}

/**
 * Get bot health summary
 * @returns {Promise<Object>} Health summary
 */
async function getHealthSummary() {
    try {
        const result = await query(`
            SELECT * FROM v_bot_health_summary
        `);

        return result.rows[0];
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to get health summary:`, error.message);
        return null;
    }
}

// Automatically update metrics every 5 minutes
setInterval(() => {
    updateSessionMetrics().catch(() => {});
}, 5 * 60 * 1000);

module.exports = {
    logBotStart,
    logBotConnected,
    logBotCrash,
    logBotShutdown,
    incrementMessageCount,
    updateSessionMetrics,
    getCurrentSession,
    getRestartHistory,
    getHealthSummary
};
