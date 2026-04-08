/**
 * Global Ban Tracker Service
 * Tracks which groups have been processed for a user's global ban
 * Uses in-memory Map + JSON file cache (Firebase was removed)
 */

const fs = require('fs');
const { jidKey } = require('../utils/jidUtils');

const CACHE_FILE = './global_ban_tracker_cache.json';
const AUTO_CLEANUP_MS = 60 * 60 * 1000; // 1 hour

// In-memory store: Map<userJid, { processedGroups: string[], lastUpdated: number }>
const tracker = new Map();

// Load from file on startup
function loadFromFile() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            const now = Date.now();
            for (const [key, value] of Object.entries(data)) {
                // Skip entries older than 1 hour
                if (value.lastUpdated && (now - value.lastUpdated) < AUTO_CLEANUP_MS) {
                    tracker.set(key, value);
                }
            }
            console.log(`✅ Loaded ${tracker.size} global ban tracking entries from cache`);
        }
    } catch (error) {
        console.error('⚠️ Failed to load global ban tracker cache:', error.message);
    }
}

function saveToFile() {
    try {
        const data = {};
        for (const [key, value] of tracker.entries()) {
            data[key] = value;
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf8');
    } catch (error) {
        console.error('⚠️ Failed to save global ban tracker cache:', error.message);
    }
}

// Purge entries older than 1 hour
function purgeStale() {
    const now = Date.now();
    let purged = 0;
    for (const [key, value] of tracker.entries()) {
        if (value.lastUpdated && (now - value.lastUpdated) >= AUTO_CLEANUP_MS) {
            tracker.delete(key);
            purged++;
        }
    }
    if (purged > 0) {
        console.log(`🧹 Purged ${purged} stale global ban tracking entries`);
        saveToFile();
    }
}

// Load cache on module load
loadFromFile();

// Auto-cleanup every 15 minutes
setInterval(purgeStale, 15 * 60 * 1000);

/**
 * Get list of groups already processed for a user
 * @param {string} userId - User JID
 * @returns {Array<string>} List of group IDs already processed
 */
async function getProcessedGroups(userId) {
    try {
        const jid = jidKey(userId);
        if (!jid) return [];

        const entry = tracker.get(jid);
        if (!entry) return [];

        return entry.processedGroups || [];
    } catch (error) {
        console.error('❌ Failed to get processed groups:', error.message);
        return [];
    }
}

/**
 * Add groups to the processed list for a user
 * @param {string} userId - User JID
 * @param {Array<string>} groupIds - Group IDs to mark as processed
 */
async function addProcessedGroups(userId, groupIds) {
    try {
        const jid = jidKey(userId);
        if (!jid) return false;

        const entry = tracker.get(jid) || { processedGroups: [] };
        const existing = entry.processedGroups || [];

        // Add new groups (avoid duplicates)
        const updatedGroups = [...new Set([...existing, ...groupIds])];

        tracker.set(jid, {
            processedGroups: updatedGroups,
            lastUpdated: Date.now(),
            totalProcessed: updatedGroups.length
        });

        saveToFile();

        console.log(`✅ Tracked ${groupIds.length} processed groups for ${jid}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to add processed groups:', error.message);
        return false;
    }
}

/**
 * Clear tracking for a user (when ban is complete or cancelled)
 * @param {string} userId - User JID
 */
async function clearTracking(userId) {
    try {
        const jid = jidKey(userId);
        if (!jid) return false;

        tracker.delete(jid);
        saveToFile();

        console.log(`✅ Cleared tracking for ${jid}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to clear tracking:', error.message);
        return false;
    }
}

/**
 * Get tracking summary for a user
 * @param {string} userId - User JID
 * @returns {Object} Summary of tracking status
 */
async function getTrackingSummary(userId) {
    try {
        const jid = jidKey(userId);
        if (!jid) return null;

        const entry = tracker.get(jid);
        if (!entry) {
            return {
                isTracked: false,
                processedGroups: [],
                totalProcessed: 0
            };
        }

        return {
            isTracked: true,
            processedGroups: entry.processedGroups || [],
            totalProcessed: entry.totalProcessed || 0,
            lastUpdated: entry.lastUpdated
        };
    } catch (error) {
        console.error('❌ Failed to get tracking summary:', error.message);
        return null;
    }
}

module.exports = {
    getProcessedGroups,
    addProcessedGroups,
    clearTracking,
    getTrackingSummary
};
