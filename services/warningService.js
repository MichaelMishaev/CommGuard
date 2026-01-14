const { getTimestamp } = require('../utils/logger');

/**
 * Warning Service
 * Manages user warnings for invite links - first warning, second strike kicks
 * Memory-only storage
 */

class WarningService {
    constructor() {
        this.warningCache = new Map();
        this.cacheLoaded = false;
        this.WARNING_EXPIRY_DAYS = 7; // Warnings expire after 7 days
    }

    /**
     * Load warning data into cache
     */
    async loadWarningCache() {
        // Memory-only mode
        this.cacheLoaded = true;
        console.log('💾 Warning system using memory-only cache');
        return true;
    }

    /**
     * Check if user should be warned or kicked for invite link violation
     */
    async checkInviteLinkViolation(userId, groupId) {
        const normalizedUserId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');

        if (!this.cacheLoaded) {
            await this.loadWarningCache();
        }

        // Clean up expired warnings first
        await this.cleanupExpiredWarnings();

        // Check current warning count for this user in this group
        const warningKey = `${normalizedUserId}:${groupId}`;
        const existingWarning = this.warningCache.get(warningKey);

        if (!existingWarning) {
            // First violation - give warning
            return {
                action: 'warn',
                warningCount: 0,
                isFirstWarning: true
            };
        } else {
            // Check if warning is still valid (not expired)
            const warningDate = new Date(existingWarning.lastWarned);
            const expiryDate = new Date(warningDate.getTime() + (this.WARNING_EXPIRY_DAYS * 24 * 60 * 60 * 1000));

            if (new Date() > expiryDate) {
                // Warning expired - treat as first violation
                return {
                    action: 'warn',
                    warningCount: 0,
                    isFirstWarning: true
                };
            } else {
                // Second violation within warning period - kick
                return {
                    action: 'kick',
                    warningCount: existingWarning.warningCount,
                    isFirstWarning: false
                };
            }
        }
    }

    /**
     * Record a warning for a user
     */
    async recordWarning(userId, groupId, groupName, inviteLink) {
        const normalizedUserId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
        const warningKey = `${normalizedUserId}:${groupId}`;
        const now = new Date();

        const warningRecord = {
            userId: normalizedUserId,
            originalId: userId,
            groupId: groupId,
            groupName: groupName,
            inviteLink: inviteLink,
            lastWarned: now.toISOString(),
            warningCount: 1,
            expiresAt: new Date(now.getTime() + (this.WARNING_EXPIRY_DAYS * 24 * 60 * 60 * 1000)).toISOString(),
            createdAt: now.toISOString()
        };

        // Update existing warning if it exists
        const existingWarning = this.warningCache.get(warningKey);
        if (existingWarning) {
            warningRecord.warningCount = existingWarning.warningCount + 1;
            warningRecord.createdAt = existingWarning.createdAt;
        }

        // Update cache
        this.warningCache.set(warningKey, warningRecord);
        console.log(`⚠️ Warning recorded: ${normalizedUserId} in ${groupName} (Count: ${warningRecord.warningCount})`);
        return true;
    }

    /**
     * Clear warnings for a user
     */
    async clearWarnings(userId, groupId = null) {
        const normalizedUserId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');

        if (groupId) {
            // Clear warning for specific group
            const warningKey = `${normalizedUserId}:${groupId}`;
            this.warningCache.delete(warningKey);
            console.log(`✅ Cleared warning for ${normalizedUserId} in group ${groupId}`);
        } else {
            // Clear all warnings for user
            const keysToDelete = [];
            for (const [key, record] of this.warningCache.entries()) {
                if (record.userId === normalizedUserId) {
                    keysToDelete.push(key);
                }
            }

            keysToDelete.forEach(key => this.warningCache.delete(key));
            console.log(`✅ Cleared ${keysToDelete.length} warnings for ${normalizedUserId}`);
        }
    }

    /**
     * Clean up expired warnings
     */
    async cleanupExpiredWarnings() {
        const now = new Date();
        const expiredKeys = [];

        for (const [key, record] of this.warningCache.entries()) {
            const expiryDate = new Date(record.expiresAt);
            if (now > expiryDate) {
                expiredKeys.push(key);
            }
        }

        if (expiredKeys.length > 0) {
            expiredKeys.forEach(key => this.warningCache.delete(key));
            console.log(`🧹 Cleaned up ${expiredKeys.length} expired warnings`);
        }
    }

    /**
     * Get warning statistics for admin
     */
    async getWarningStats() {
        if (!this.cacheLoaded) {
            await this.loadWarningCache();
        }

        await this.cleanupExpiredWarnings();

        const totalWarnings = this.warningCache.size;
        const groupStats = new Map();
        let expiringSoon = 0;

        const oneDayFromNow = new Date(Date.now() + (24 * 60 * 60 * 1000));

        for (const record of this.warningCache.values()) {
            const groupName = record.groupName;
            groupStats.set(groupName, (groupStats.get(groupName) || 0) + 1);

            const expiryDate = new Date(record.expiresAt);
            if (expiryDate <= oneDayFromNow) {
                expiringSoon++;
            }
        }

        return {
            totalActiveWarnings: totalWarnings,
            expiringSoon,
            warningExpiryDays: this.WARNING_EXPIRY_DAYS,
            topGroups: Array.from(groupStats.entries())
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
        };
    }

    /**
     * Get warnings for a specific user
     */
    async getUserWarnings(userId) {
        const normalizedUserId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');

        if (!this.cacheLoaded) {
            await this.loadWarningCache();
        }

        const userWarnings = [];
        for (const [key, record] of this.warningCache.entries()) {
            if (record.userId === normalizedUserId) {
                userWarnings.push(record);
            }
        }

        return userWarnings.sort((a, b) => new Date(b.lastWarned) - new Date(a.lastWarned));
    }
}

// Export singleton instance
const warningService = new WarningService();

module.exports = {
    warningService,
    async initialize() {
        return await warningService.loadWarningCache();
    }
};
