/**
 * Global Ban Tracker Service
 * Tracks which groups have been processed for a user's global ban
 * This allows batching operations to prevent Meta bans
 */

const db = require('../firebaseConfig.js');
const { jidKey } = require('../utils/jidUtils');

/**
 * Get list of groups already processed for a user
 * @param {string} userId - User JID
 * @returns {Array<string>} List of group IDs already processed
 */
async function getProcessedGroups(userId) {
    try {
        const jid = jidKey(userId);
        if (!jid) return [];

        const doc = await db.collection('global_ban_tracker').doc(jid).get();
        if (!doc.exists) return [];

        const data = doc.data();
        return data.processedGroups || [];
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

        const doc = await db.collection('global_ban_tracker').doc(jid).get();
        let processedGroups = [];

        if (doc.exists) {
            const data = doc.data();
            processedGroups = data.processedGroups || [];
        }

        // Add new groups (avoid duplicates)
        const updatedGroups = [...new Set([...processedGroups, ...groupIds])];

        await db.collection('global_ban_tracker').doc(jid).set({
            processedGroups: updatedGroups,
            lastUpdated: Date.now(),
            totalProcessed: updatedGroups.length
        });

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

        await db.collection('global_ban_tracker').doc(jid).delete();
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

        const doc = await db.collection('global_ban_tracker').doc(jid).get();
        if (!doc.exists) {
            return {
                isTracked: false,
                processedGroups: [],
                totalProcessed: 0
            };
        }

        const data = doc.data();
        return {
            isTracked: true,
            processedGroups: data.processedGroups || [],
            totalProcessed: data.totalProcessed || 0,
            lastUpdated: data.lastUpdated
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
