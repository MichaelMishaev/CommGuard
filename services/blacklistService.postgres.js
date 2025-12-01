// PostgreSQL-based blacklist service (replaces Firebase)
const { getBlacklistedUsers, blacklistUser, unblacklistUser, getUserByPhone } = require('../database/groupService');
const { getTimestamp } = require('../utils/logger');

// In-memory cache for performance (syncs with PostgreSQL)
const blacklistCache = new Set();
let cacheLoaded = false;

/**
 * Load blacklist from PostgreSQL into memory cache
 */
async function loadBlacklistCache() {
    try {
        console.log(`[${getTimestamp()}] 📋 Loading blacklist from PostgreSQL...`);

        const blacklistedUsers = await getBlacklistedUsers();
        blacklistCache.clear();

        for (const user of blacklistedUsers) {
            blacklistCache.add(user.phone_number);
            if (user.lid) {
                blacklistCache.add(user.lid);
                blacklistCache.add(`${user.lid}@lid`);
            }
            // Add variations
            blacklistCache.add(`${user.phone_number}@s.whatsapp.net`);
            blacklistCache.add(`${user.phone_number}@c.us`);
        }

        cacheLoaded = true;
        console.log(`[${getTimestamp()}] ✅ Loaded ${blacklistedUsers.length} blacklisted users from PostgreSQL`);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error loading blacklist cache:`, error.message);
        cacheLoaded = true; // Set to true anyway to prevent infinite retry
    }
}

/**
 * Check if a user is blacklisted
 * @param {string} userId - User ID (phone number or LID format)
 * @returns {Promise<boolean>} True if blacklisted
 */
async function isBlacklisted(userId) {
    // Normalize the user ID
    const normalizedId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');

    // Check cache first (fast)
    if (cacheLoaded) {
        const cached = blacklistCache.has(normalizedId) ||
                      blacklistCache.has(userId) ||
                      blacklistCache.has(`${normalizedId}@c.us`) ||
                      blacklistCache.has(`${normalizedId}@s.whatsapp.net`) ||
                      blacklistCache.has(`${normalizedId}@lid`);

        if (cached) return true;
    }

    // Fallback to PostgreSQL if cache not loaded
    try {
        const user = await getUserByPhone(normalizedId);
        if (user && user.is_blacklisted) {
            // Update cache
            blacklistCache.add(normalizedId);
            blacklistCache.add(userId);
            return true;
        }
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error checking blacklist:`, error.message);
    }

    return false;
}

/**
 * Add user to blacklist
 * @param {string} userId - User ID (phone number or LID format)
 * @param {string} reason - Reason for blacklisting
 * @returns {Promise<boolean>} Success status
 */
async function addToBlacklist(userId, reason = '') {
    const normalizedId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');

    try {
        // Add to PostgreSQL
        await blacklistUser(normalizedId, reason);

        // Update cache
        blacklistCache.add(normalizedId);
        blacklistCache.add(userId);
        blacklistCache.add(`${normalizedId}@s.whatsapp.net`);
        blacklistCache.add(`${normalizedId}@c.us`);

        console.log(`[${getTimestamp()}] ✅ Added ${normalizedId} to blacklist (PostgreSQL)`);
        return true;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error adding to blacklist:`, error.message);
        return false;
    }
}

/**
 * Remove user from blacklist
 * @param {string} userId - User ID (phone number or LID format)
 * @returns {Promise<boolean>} Success status
 */
async function removeFromBlacklist(userId) {
    const normalizedId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');

    try {
        // Remove from PostgreSQL
        await unblacklistUser(normalizedId);

        // Remove from cache
        blacklistCache.delete(normalizedId);
        blacklistCache.delete(userId);
        blacklistCache.delete(`${normalizedId}@s.whatsapp.net`);
        blacklistCache.delete(`${normalizedId}@c.us`);
        blacklistCache.delete(`${normalizedId}@lid`);

        console.log(`[${getTimestamp()}] ✅ Removed ${normalizedId} from blacklist (PostgreSQL)`);
        return true;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error removing from blacklist:`, error.message);
        return false;
    }
}

/**
 * Get all blacklisted users
 * @returns {Promise<Array>} List of blacklisted users
 */
async function getAllBlacklisted() {
    try {
        return await getBlacklistedUsers();
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error getting blacklisted users:`, error.message);
        return [];
    }
}

module.exports = {
    loadBlacklistCache,
    isBlacklisted,
    addToBlacklist,
    removeFromBlacklist,
    getAllBlacklisted,
    blacklistCache  // Export for #blklst command
};
