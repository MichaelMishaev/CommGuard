const db = require('../firebaseConfig.js');
const { getTimestamp } = require('../utils/logger');

/**
 * Kicked User Service
 * Manages kicked users with group rejoin links for easy return after unblacklisting
 */

class KickedUserService {
    constructor() {
        this.kickedUserCache = new Map();
        this.cacheLoaded = false;
    }

    /**
     * Load kicked user data from Firebase into cache
     */
    async loadKickedUserCache() {
        if (!db || db.collection === undefined) {
            console.warn('⚠️ Firebase not available - kicked user tracking disabled');
            return false;
        }

        try {
            const snapshot = await db.collection('kicked_users').get();
            this.kickedUserCache.clear();
            
            snapshot.forEach(doc => {
                this.kickedUserCache.set(doc.id, doc.data());
            });
            
            this.cacheLoaded = true;
            console.log(`✅ Loaded ${this.kickedUserCache.size} kicked user records into cache`);
            return true;
        } catch (error) {
            console.error('❌ Error loading kicked user cache:', error.message);
            return false;
        }
    }

    /**
     * Record a kicked user with their group information for easy rejoin
     */
    async recordKickedUser(userId, groupId, groupName, groupInviteLink, reason = 'Unknown', adminList = []) {
        const normalizedUserId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
        const now = new Date();

        const kickRecord = {
            userId: normalizedUserId,
            originalId: userId,
            groupId: groupId,
            groupName: groupName,
            groupInviteLink: groupInviteLink,
            adminList: adminList, // Store admin IDs and names
            kickedAt: now.toISOString(),
            reason: reason,
            canRejoin: false, // Will be set to true when unblacklisted
            rejoinedAt: null,
            notes: `Kicked from ${groupName} for: ${reason}`
        };

        // Update cache
        const cacheKey = `${normalizedUserId}:${groupId}`;
        this.kickedUserCache.set(cacheKey, kickRecord);

        // Save to Firebase if available
        if (!db || db.collection === undefined) {
            console.warn('⚠️ Firebase not available - kick record created in memory only');
            return true;
        }

        try {
            await db.collection('kicked_users').doc(cacheKey).set(kickRecord);
            console.log(`✅ Recorded kick: ${normalizedUserId} from ${groupName} (${reason})`);
            return true;
        } catch (error) {
            console.error('❌ Error recording kicked user:', error.message);
            return false;
        }
    }

    /**
     * Get rejoin information for a user
     * @param {string} userId - User ID
     * @param {boolean} recentOnly - Only return recent kicks (last 30 days)
     * @param {string} reason - Filter by specific kick reason
     */
    async getRejoinInfo(userId, recentOnly = true, reason = null) {
        const normalizedUserId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
        
        if (!this.cacheLoaded) {
            await this.loadKickedUserCache();
        }

        // Find all kick records for this user
        const userKickRecords = [];
        const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
        
        for (const [key, record] of this.kickedUserCache.entries()) {
            if (record.userId === normalizedUserId && record.canRejoin) {
                // Filter by time if requested
                if (recentOnly) {
                    const kickDate = new Date(record.kickedAt);
                    if (kickDate < thirtyDaysAgo) continue;
                }
                
                // Filter by reason if specified
                if (reason && !record.reason.toLowerCase().includes(reason.toLowerCase())) {
                    continue;
                }
                
                userKickRecords.push(record);
            }
        }

        // Sort by most recent kicks first
        userKickRecords.sort((a, b) => new Date(b.kickedAt) - new Date(a.kickedAt));

        return userKickRecords;
    }

    /**
     * Mark user as eligible for rejoin (called when they're unblacklisted)
     */
    async enableRejoin(userId) {
        const normalizedUserId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
        let recordsUpdated = 0;

        // Update all records for this user
        for (const [key, record] of this.kickedUserCache.entries()) {
            if (record.userId === normalizedUserId) {
                record.canRejoin = true;
                this.kickedUserCache.set(key, record);

                // Update Firebase
                if (db && db.collection) {
                    try {
                        await db.collection('kicked_users').doc(key).update({
                            canRejoin: true,
                            approvedAt: new Date().toISOString()
                        });
                        recordsUpdated++;
                    } catch (error) {
                        console.error('❌ Error updating kick record:', error.message);
                    }
                }
            }
        }

        console.log(`✅ Enabled rejoin for ${normalizedUserId} (${recordsUpdated} groups)`);
        return recordsUpdated > 0;
    }

    /**
     * Record when user rejoins a group
     */
    async recordRejoin(userId, groupId) {
        const normalizedUserId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
        const cacheKey = `${normalizedUserId}:${groupId}`;

        if (this.kickedUserCache.has(cacheKey)) {
            const record = this.kickedUserCache.get(cacheKey);
            record.rejoinedAt = new Date().toISOString();
            record.canRejoin = false; // Reset for future kicks
            this.kickedUserCache.set(cacheKey, record);

            // Update Firebase
            if (db && db.collection) {
                try {
                    await db.collection('kicked_users').doc(cacheKey).update({
                        rejoinedAt: record.rejoinedAt,
                        canRejoin: false
                    });
                    console.log(`✅ Recorded rejoin: ${normalizedUserId} back to ${record.groupName}`);
                } catch (error) {
                    console.error('❌ Error recording rejoin:', error.message);
                }
            }
        }
    }

    /**
     * Clean up old kick records (maintenance)
     */
    async cleanupOldRecords(daysOld = 90) {
        if (!db || db.collection === undefined) {
            console.warn('⚠️ Firebase not available - cleanup skipped');
            return;
        }

        try {
            const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
            const snapshot = await db.collection('kicked_users')
                .where('kickedAt', '<', cutoffDate.toISOString())
                .where('rejoinedAt', '!=', null)
                .get();

            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            console.log(`✅ Cleaned up ${snapshot.size} old kick records`);
        } catch (error) {
            console.error('❌ Error cleaning up kick records:', error.message);
        }
    }

    /**
     * Get statistics for admin
     */
    async getKickStats() {
        if (!this.cacheLoaded) {
            await this.loadKickedUserCache();
        }

        const totalKicks = this.kickedUserCache.size;
        let canRejoin = 0;
        let hasRejoined = 0;
        const groupStats = new Map();

        for (const record of this.kickedUserCache.values()) {
            if (record.canRejoin) canRejoin++;
            if (record.rejoinedAt) hasRejoined++;

            const groupName = record.groupName;
            groupStats.set(groupName, (groupStats.get(groupName) || 0) + 1);
        }

        return {
            totalKicks,
            canRejoin,
            hasRejoined,
            pendingApproval: totalKicks - canRejoin - hasRejoined,
            topGroups: Array.from(groupStats.entries())
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
        };
    }
}

// Export singleton instance
const kickedUserService = new KickedUserService();

module.exports = {
    kickedUserService,
    // Initialize on module load
    async initialize() {
        return await kickedUserService.loadKickedUserCache();
    }
};