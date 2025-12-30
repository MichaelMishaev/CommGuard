// Redis-based blacklist scan queue service
const { getTimestamp } = require('../utils/logger');

// God number with absolute authority
const GOD_NUMBER = '0544345287';
const GOD_NUMBER_INTL = '972544345287';

let redisClient = null;

// Initialize Redis client
async function initRedis() {
    if (redisClient) return redisClient;

    try {
        const redis = require('redis');
        redisClient = redis.createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379'
        });

        redisClient.on('error', (err) => {
            console.error(`[${getTimestamp()}] ❌ Redis error:`, err.message);
        });

        await redisClient.connect();
        console.log(`[${getTimestamp()}] ✅ Redis connected for scan queue`);
        return redisClient;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to connect to Redis:`, error.message);
        return null;
    }
}

/**
 * Check if user is god number (absolute protection)
 */
function isGodNumber(phoneNumber) {
    if (!phoneNumber) return false;
    const normalized = phoneNumber.replace(/[@\s\-\+]/g, '');
    return normalized === GOD_NUMBER || normalized === GOD_NUMBER_INTL;
}

/**
 * Queue a scan job for a group
 */
async function queueScan(groupId, memberCount, adminList = []) {
    const client = await initRedis();
    if (!client) {
        console.log(`[${getTimestamp()}] ⚠️ Redis unavailable, scan skipped for ${groupId}`);
        return false;
    }

    try {
        // Check if god number is admin
        const hasGodAdmin = adminList.some(admin => isGodNumber(admin));
        if (hasGodAdmin) {
            console.log(`[${getTimestamp()}] 👑 God number is admin in ${groupId} - SKIPPING SCAN`);
            return false;
        }

        const scanJob = {
            groupId,
            memberCount,
            queuedAt: Date.now(),
            status: 'queued'
        };

        await client.rPush('scan_queue', JSON.stringify(scanJob));
        console.log(`[${getTimestamp()}] 📋 Queued scan for ${groupId} (${memberCount} members)`);
        return true;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to queue scan:`, error.message);
        return false;
    }
}

/**
 * Get next scan job from queue
 */
async function getNextScan() {
    const client = await initRedis();
    if (!client) return null;

    try {
        const job = await client.lPop('scan_queue');
        if (job) {
            return JSON.parse(job);
        }
        return null;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to get next scan:`, error.message);
        return null;
    }
}

/**
 * Cache user blacklist status to reduce DB hits
 */
async function cacheUserStatus(phoneNumber, userData) {
    const client = await initRedis();
    if (!client) return;

    try {
        const key = `user_blacklist:${phoneNumber}`;
        await client.setEx(key, 3600, JSON.stringify(userData)); // 1 hour TTL
    } catch (error) {
        console.error(`[${getTimestamp()}] ⚠️ Failed to cache user status:`, error.message);
    }
}

/**
 * Get cached user status
 */
async function getCachedUserStatus(phoneNumber) {
    const client = await initRedis();
    if (!client) return null;

    try {
        const key = `user_blacklist:${phoneNumber}`;
        const cached = await client.get(key);
        if (cached) {
            return JSON.parse(cached);
        }
        return null;
    } catch (error) {
        console.error(`[${getTimestamp()}] ⚠️ Failed to get cached user:`, error.message);
        return null;
    }
}

/**
 * Track scan progress
 */
async function updateScanProgress(groupId, progress) {
    const client = await initRedis();
    if (!client) return;

    try {
        const key = `scan_progress:${groupId}`;
        await client.setEx(key, 3600, JSON.stringify(progress)); // 1 hour TTL
    } catch (error) {
        console.error(`[${getTimestamp()}] ⚠️ Failed to update scan progress:`, error.message);
    }
}

/**
 * Get scan progress
 */
async function getScanProgress(groupId) {
    const client = await initRedis();
    if (!client) return null;

    try {
        const key = `scan_progress:${groupId}`;
        const progress = await client.get(key);
        if (progress) {
            return JSON.parse(progress);
        }
        return null;
    } catch (error) {
        console.error(`[${getTimestamp()}] ⚠️ Failed to get scan progress:`, error.message);
        return null;
    }
}

/**
 * Clear scan progress (when complete or interrupted)
 */
async function clearScanProgress(groupId) {
    const client = await initRedis();
    if (!client) return;

    try {
        const key = `scan_progress:${groupId}`;
        await client.del(key);
    } catch (error) {
        console.error(`[${getTimestamp()}] ⚠️ Failed to clear scan progress:`, error.message);
    }
}

/**
 * Get queue size
 */
async function getQueueSize() {
    const client = await initRedis();
    if (!client) return 0;

    try {
        return await client.lLen('scan_queue');
    } catch (error) {
        console.error(`[${getTimestamp()}] ⚠️ Failed to get queue size:`, error.message);
        return 0;
    }
}

module.exports = {
    initRedis,
    isGodNumber,
    queueScan,
    getNextScan,
    cacheUserStatus,
    getCachedUserStatus,
    updateScanProgress,
    getScanProgress,
    clearScanProgress,
    getQueueSize,
    GOD_NUMBER,
    GOD_NUMBER_INTL
};
