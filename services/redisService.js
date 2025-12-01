// services/redisService.js
// Redis service for caching, rate limiting, and temporary data

const Redis = require('ioredis');
const { getTimestamp } = require('../utils/logger');

let redisClient = null;
let isConnected = false;

/**
 * Initialize Redis connection
 * @param {Object|string} config - Redis configuration object or connection URL
 * @returns {Redis} Redis client
 */
function initRedis(config = {}) {
    if (redisClient) {
        console.log(`[${getTimestamp()}] 📦 Redis already initialized`);
        return redisClient;
    }

    // Support Railway REDIS_URL or individual parameters
    const redisUrl = typeof config === 'string' ? config :
                     config.url || process.env.REDIS_URL;

    if (redisUrl) {
        // Use connection URL (Railway style)
        console.log(`[${getTimestamp()}] 🔌 Connecting to Redis via URL...`);

        redisClient = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            tls: redisUrl.includes('rediss://') ? {} : undefined  // Enable TLS for rediss://
        });
    } else {
        // Use individual parameters (self-hosted style)
        const redisConfig = {
            host: config.host || process.env.REDIS_HOST || 'localhost',
            port: config.port || process.env.REDIS_PORT || 6379,
            password: config.password || process.env.REDIS_PASSWORD || undefined,
            db: config.db || 0,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3
        };

        console.log(`[${getTimestamp()}] 🔌 Connecting to Redis at ${redisConfig.host}:${redisConfig.port}...`);

        redisClient = new Redis(redisConfig);
    }

    redisClient.on('connect', () => {
        console.log(`[${getTimestamp()}] ✅ Redis connected successfully`);
        isConnected = true;
    });

    redisClient.on('error', (err) => {
        console.error(`[${getTimestamp()}] ❌ Redis error:`, err.message);
        isConnected = false;
    });

    redisClient.on('close', () => {
        console.log(`[${getTimestamp()}] 🔌 Redis connection closed`);
        isConnected = false;
    });

    return redisClient;
}

/**
 * Get Redis client
 * @returns {Redis} Redis client
 */
function getRedis() {
    if (!redisClient) {
        throw new Error('Redis not initialized. Call initRedis() first.');
    }
    return redisClient;
}

/**
 * Check if Redis is connected
 * @returns {boolean} Connection status
 */
function isRedisConnected() {
    return isConnected && redisClient !== null;
}

/**
 * Close Redis connection
 */
async function closeRedis() {
    if (redisClient) {
        console.log(`[${getTimestamp()}] 🔌 Closing Redis connection...`);
        await redisClient.quit();
        redisClient = null;
        isConnected = false;
        console.log(`[${getTimestamp()}] ✅ Redis connection closed`);
    }
}

// =============================================================================
// BLACKLIST CACHE (Fast Lookup)
// =============================================================================

/**
 * Cache blacklisted user in Redis
 * @param {string} phoneNumber - Phone number
 * @param {number} ttl - Time to live in seconds (default: 24 hours)
 */
async function cacheBlacklistedUser(phoneNumber, ttl = 86400) {
    if (!isRedisConnected()) return;

    try {
        await redisClient.setex(`blacklist:${phoneNumber}`, ttl, '1');
        console.log(`[${getTimestamp()}] 📦 Cached blacklisted user: ${phoneNumber}`);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to cache blacklist:`, error.message);
    }
}

/**
 * Check if user is blacklisted (from cache)
 * @param {string} phoneNumber - Phone number
 * @returns {Promise<boolean>} True if blacklisted
 */
async function isBlacklistedCached(phoneNumber) {
    if (!isRedisConnected()) return false;

    try {
        const exists = await redisClient.exists(`blacklist:${phoneNumber}`);
        return exists === 1;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to check blacklist cache:`, error.message);
        return false;
    }
}

/**
 * Remove user from blacklist cache
 * @param {string} phoneNumber - Phone number
 */
async function removeFromBlacklistCache(phoneNumber) {
    if (!isRedisConnected()) return;

    try {
        await redisClient.del(`blacklist:${phoneNumber}`);
        console.log(`[${getTimestamp()}] 📦 Removed from blacklist cache: ${phoneNumber}`);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to remove from cache:`, error.message);
    }
}

// =============================================================================
// RATE LIMITING
// =============================================================================

/**
 * Check if action is rate limited
 * @param {string} key - Unique identifier (e.g., userId, groupId, action)
 * @param {number} limit - Maximum actions allowed
 * @param {number} windowSeconds - Time window in seconds
 * @returns {Promise<boolean>} True if rate limited
 */
async function isRateLimited(key, limit = 5, windowSeconds = 60) {
    if (!isRedisConnected()) return false;

    try {
        const rateLimitKey = `ratelimit:${key}`;
        const current = await redisClient.incr(rateLimitKey);

        if (current === 1) {
            // First request, set expiry
            await redisClient.expire(rateLimitKey, windowSeconds);
        }

        if (current > limit) {
            console.log(`[${getTimestamp()}] ⏱️  Rate limit exceeded for: ${key} (${current}/${limit})`);
            return true;
        }

        return false;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Rate limit check failed:`, error.message);
        return false;
    }
}

/**
 * Get remaining rate limit
 * @param {string} key - Unique identifier
 * @param {number} limit - Maximum actions allowed
 * @returns {Promise<number>} Remaining actions
 */
async function getRateLimitRemaining(key, limit = 5) {
    if (!isRedisConnected()) return limit;

    try {
        const current = await redisClient.get(`ratelimit:${key}`);
        const remaining = Math.max(0, limit - (parseInt(current) || 0));
        return remaining;
    } catch (error) {
        return limit;
    }
}

// =============================================================================
// KICK COOLDOWNS
// =============================================================================

/**
 * Set kick cooldown for user
 * @param {string} userId - User ID
 * @param {number} seconds - Cooldown duration in seconds
 */
async function setKickCooldown(userId, seconds = 10) {
    if (!isRedisConnected()) return;

    try {
        await redisClient.setex(`cooldown:kick:${userId}`, seconds, Date.now().toString());
        console.log(`[${getTimestamp()}] ⏱️  Kick cooldown set for ${userId} (${seconds}s)`);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to set cooldown:`, error.message);
    }
}

/**
 * Check if user is in kick cooldown
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if in cooldown
 */
async function isInKickCooldown(userId) {
    if (!isRedisConnected()) return false;

    try {
        const exists = await redisClient.exists(`cooldown:kick:${userId}`);
        return exists === 1;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to check cooldown:`, error.message);
        return false;
    }
}

// =============================================================================
// MUTE TIMERS
// =============================================================================

/**
 * Set user mute with expiration
 * @param {string} userId - User ID
 * @param {number} minutes - Mute duration in minutes
 */
async function setMuteTimer(userId, minutes = 30) {
    if (!isRedisConnected()) return;

    try {
        const seconds = minutes * 60;
        const expiryTime = Date.now() + (seconds * 1000);
        await redisClient.setex(`mute:${userId}`, seconds, expiryTime.toString());
        console.log(`[${getTimestamp()}] 🔇 User ${userId} muted for ${minutes} minutes`);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to set mute:`, error.message);
    }
}

/**
 * Check if user is muted
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if muted
 */
async function isMuted(userId) {
    if (!isRedisConnected()) return false;

    try {
        const exists = await redisClient.exists(`mute:${userId}`);
        return exists === 1;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to check mute:`, error.message);
        return false;
    }
}

/**
 * Unmute user
 * @param {string} userId - User ID
 */
async function unmute(userId) {
    if (!isRedisConnected()) return;

    try {
        await redisClient.del(`mute:${userId}`);
        console.log(`[${getTimestamp()}] 🔊 User ${userId} unmuted`);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to unmute:`, error.message);
    }
}

// =============================================================================
// GENERAL CACHE (LRU for PostgreSQL queries)
// =============================================================================

/**
 * Cache data with expiration
 * @param {string} key - Cache key
 * @param {any} value - Data to cache (will be JSON stringified)
 * @param {number} ttl - Time to live in seconds
 */
async function cache(key, value, ttl = 300) {
    if (!isRedisConnected()) return;

    try {
        const serialized = JSON.stringify(value);
        await redisClient.setex(`cache:${key}`, ttl, serialized);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to cache data:`, error.message);
    }
}

/**
 * Get cached data
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} Cached data or null
 */
async function getCached(key) {
    if (!isRedisConnected()) return null;

    try {
        const data = await redisClient.get(`cache:${key}`);
        if (!data) return null;
        return JSON.parse(data);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to get cached data:`, error.message);
        return null;
    }
}

/**
 * Delete cached data
 * @param {string} key - Cache key
 */
async function deleteCached(key) {
    if (!isRedisConnected()) return;

    try {
        await redisClient.del(`cache:${key}`);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to delete cache:`, error.message);
    }
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Get Redis memory usage and statistics
 * @returns {Promise<Object>} Redis stats
 */
async function getRedisStats() {
    if (!isRedisConnected()) return null;

    try {
        const info = await redisClient.info('memory');
        const dbSize = await redisClient.dbsize();

        // Parse memory info
        const lines = info.split('\r\n');
        const stats = {};
        lines.forEach(line => {
            const parts = line.split(':');
            if (parts.length === 2) {
                stats[parts[0]] = parts[1];
            }
        });

        return {
            usedMemory: stats.used_memory_human,
            peakMemory: stats.used_memory_peak_human,
            totalKeys: dbSize,
            connected: isConnected
        };
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to get Redis stats:`, error.message);
        return null;
    }
}

module.exports = {
    // Connection
    initRedis,
    getRedis,
    isRedisConnected,
    closeRedis,

    // Blacklist cache
    cacheBlacklistedUser,
    isBlacklistedCached,
    removeFromBlacklistCache,

    // Rate limiting
    isRateLimited,
    getRateLimitRemaining,

    // Kick cooldowns
    setKickCooldown,
    isInKickCooldown,

    // Mute timers
    setMuteTimer,
    isMuted,
    unmute,

    // General cache
    cache,
    getCached,
    deleteCached,

    // Statistics
    getRedisStats
};
