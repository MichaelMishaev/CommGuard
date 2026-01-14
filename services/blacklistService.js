const fs = require('fs');

// Enhanced cache for blacklist with persistent storage
const blacklistCache = new Set();
let cacheLoaded = false;
let lastCacheUpdate = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours cache
const MEMORY_CACHE_FILE = './blacklist_cache.json';

// Load cache from local file first (fastest)
function loadLocalCache() {
    try {
        if (fs.existsSync(MEMORY_CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(MEMORY_CACHE_FILE, 'utf8'));
            if (Date.now() - data.timestamp < CACHE_DURATION) {
                data.blacklist.forEach(id => blacklistCache.add(id));
                lastCacheUpdate = data.timestamp;
                cacheLoaded = true;
                console.log(`✅ Loaded ${blacklistCache.size} blacklisted users from local cache`);
                return true;
            }
        }
    } catch (error) {
        console.log('📋 No valid local cache found, starting fresh');
    }
    return false;
}

// Save cache to local file
function saveLocalCache() {
    try {
        const data = {
            timestamp: Date.now(),
            blacklist: Array.from(blacklistCache)
        };
        fs.writeFileSync(MEMORY_CACHE_FILE, JSON.stringify(data), 'utf8');
    } catch (error) {
        console.warn('⚠️ Failed to save local cache:', error.message);
    }
}

// Load blacklist from local cache
async function loadBlacklistCache() {
    // Try local cache first
    if (loadLocalCache()) {
        return; // Successfully loaded from local cache
    }

    // Memory-only mode
    console.log('💾 Blacklist using memory-only cache');
    cacheLoaded = true;
}

// Check if a user is blacklisted
async function isBlacklisted(userId) {
    // Ensure userId is a string
    if (typeof userId !== 'string') {
        console.error('❌ isBlacklisted called with non-string userId:', userId);
        return false;
    }

    // Normalize the user ID
    const normalizedId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '');

    // Check cache
    if (cacheLoaded) {
        return blacklistCache.has(normalizedId) ||
            blacklistCache.has(userId) ||
            blacklistCache.has(`${normalizedId}@c.us`) ||
            blacklistCache.has(`${normalizedId}@s.whatsapp.net`);
    }

    return false;
}

// Add user to blacklist
async function addToBlacklist(userId, reason = '') {
    // Ensure userId is a string
    if (typeof userId !== 'string') {
        console.error('❌ addToBlacklist called with non-string userId:', userId);
        return false;
    }

    const normalizedId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');

    // SAFEGUARD 1: Never blacklist Israeli numbers
    if (normalizedId.startsWith('972') || normalizedId.startsWith('+972')) {
        console.warn(`⚠️ BLOCKED: Attempted to blacklist Israeli number ${normalizedId} - Israeli numbers are protected`);
        return false;
    }

    // SAFEGUARD 2: Never blacklist LID format IDs (encrypted privacy IDs, not real phone numbers)
    if (userId.includes('@lid') && normalizedId.length > 15) {
        console.warn(`⚠️ BLOCKED: Attempted to blacklist LID format ${normalizedId} - Use real phone number instead`);
        return false;
    }

    // SAFEGUARD 3: Never blacklist group IDs
    if (userId.includes('@g.us')) {
        console.warn(`⚠️ BLOCKED: Attempted to blacklist group ID ${normalizedId} - Groups cannot be blacklisted`);
        return false;
    }

    // SAFEGUARD 4: Require a reason for blacklisting
    if (!reason || reason.trim() === '') {
        console.warn(`⚠️ WARNING: Adding ${normalizedId} to blacklist without a reason - this should be avoided`);
        reason = 'No reason provided';
    }

    // Add to cache
    blacklistCache.add(normalizedId);
    blacklistCache.add(userId);

    // Save to local cache file
    saveLocalCache();
    console.log(`✅ Added ${normalizedId} to blacklist - Reason: ${reason}`);
    return true;
}

// Remove user from blacklist
async function removeFromBlacklist(userId) {
    // Ensure userId is a string
    if (typeof userId !== 'string') {
        console.error('❌ removeFromBlacklist called with non-string userId:', userId);
        return false;
    }

    const normalizedId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '');

    // Remove from cache
    blacklistCache.delete(normalizedId);
    blacklistCache.delete(userId);
    blacklistCache.delete(`${normalizedId}@c.us`);
    blacklistCache.delete(`${normalizedId}@s.whatsapp.net`);

    // Save to local cache file
    saveLocalCache();
    console.log(`✅ Removed ${normalizedId} from blacklist`);

    // Enable rejoin for this user
    try {
        const { kickedUserService } = require('./kickedUserService');
        await kickedUserService.enableRejoin(userId);
        console.log(`✅ Enabled rejoin links for ${normalizedId}`);
    } catch (error) {
        console.warn('⚠️ Failed to enable rejoin:', error.message);
    }

    return true;
}

module.exports = {
    loadBlacklistCache,
    isBlacklisted,
    addToBlacklist,
    removeFromBlacklist,
    blacklistCache
};
