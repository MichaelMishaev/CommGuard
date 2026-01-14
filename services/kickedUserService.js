const { getTimestamp } = require('../utils/logger');

/**
 * Kicked User Service
 * Manages kicked users with group rejoin links for easy return after unblacklisting
 * Memory-only storage
 */

class KickedUserService {
    constructor() {
        this.kickedUserCache = new Map();
        this.cacheLoaded = false;
    }

    /**
     * Load kicked user data into cache
     */
    async loadKickedUserCache() {
        // Memory-only mode
        this.cacheLoaded = true;
        console.log(`💾 Kicked user service using memory-only cache - ${this.kickedUserCache.size} records`);
        return true;
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
            adminList: adminList,
            kickedAt: now.toISOString(),
            reason: reason,
            canRejoin: false,
            rejoinedAt: null,
            notes: `Kicked from ${groupName} for: ${reason}`
        };

        // Update cache
        const cacheKey = `${normalizedUserId}:${groupId}`;
        this.kickedUserCache.set(cacheKey, kickRecord);

        console.log(`✅ Recorded kick: ${normalizedUserId} from ${groupName} (${reason})`);
        return true;
    }

    /**
     * Get rejoin information for a user
     */
    async getRejoinInfo(userId, recentOnly = true, reason = null) {
        const normalizedUserId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');

        if (!this.cacheLoaded) {
            await this.loadKickedUserCache();
        }

        const userKickRecords = [];
        const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));

        for (const [key, record] of this.kickedUserCache.entries()) {
            if (record.userId === normalizedUserId && record.canRejoin) {
                if (recentOnly) {
                    const kickDate = new Date(record.kickedAt);
                    if (kickDate < thirtyDaysAgo) continue;
                }

                if (reason && !record.reason.toLowerCase().includes(reason.toLowerCase())) {
                    continue;
                }

                userKickRecords.push(record);
            }
        }

        userKickRecords.sort((a, b) => new Date(b.kickedAt) - new Date(a.kickedAt));
        return userKickRecords;
    }

    /**
     * Mark user as eligible for rejoin (called when they're unblacklisted)
     */
    async enableRejoin(userId) {
        const normalizedUserId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
        let recordsUpdated = 0;

        for (const [key, record] of this.kickedUserCache.entries()) {
            if (record.userId === normalizedUserId) {
                record.canRejoin = true;
                record.approvedAt = new Date().toISOString();
                this.kickedUserCache.set(key, record);
                recordsUpdated++;
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
            record.canRejoin = false;
            this.kickedUserCache.set(cacheKey, record);
            console.log(`✅ Recorded rejoin: ${normalizedUserId} back to ${record.groupName}`);
        }
    }

    /**
     * Clean up old kick records (maintenance)
     */
    async cleanupOldRecords(daysOld = 90) {
        const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
        let cleaned = 0;

        for (const [key, record] of this.kickedUserCache.entries()) {
            const kickDate = new Date(record.kickedAt);
            if (kickDate < cutoffDate && record.rejoinedAt !== null) {
                this.kickedUserCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`✅ Cleaned up ${cleaned} old kick records`);
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
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
        };
    }
}

// Export singleton instance
const kickedUserService = new KickedUserService();

module.exports = {
    kickedUserService,
    async initialize() {
        return await kickedUserService.loadKickedUserCache();
    }
};
