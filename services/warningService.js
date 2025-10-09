const db = require('../firebaseConfig.js');
const { getTimestamp } = require('../utils/logger');

/**
 * Warning Service
 * Manages user warnings for invite links - first warning, second strike kicks
 */

class WarningService {
    constructor() {
        this.warningCache = new Map();
        this.cacheLoaded = false;
        this.WARNING_EXPIRY_DAYS = 7; // Warnings expire after 7 days
    }

    /**
     * Load warning data from Firebase into cache
     */
    async loadWarningCache() {
        // MEMORY-ONLY MODE - Firebase disabled for warnings (cost reduction)
        this.cacheLoaded = true;
        console.log('💾 Warning system using memory-only cache (Firebase disabled)');
        return true;

        /* FIREBASE READS DISABLED FOR WARNINGS - Cost reduction
        if (!db || db.collection === undefined) {
            console.warn('⚠️ Firebase not available - warning system disabled');
            return false;
        }

        try {
            const snapshot = await db.collection('user_warnings').get();
            this.warningCache.clear();

            snapshot.forEach(doc => {
                this.warningCache.set(doc.id, doc.data());
            });

            this.cacheLoaded = true;
            console.log(`✅ Loaded ${this.warningCache.size} warning records into cache`);
            return true;
        } catch (error) {
            console.error('❌ Error loading warning cache:', error.message);
            return false;
        }
        */
    }

    /**
     * Check if user should be warned or kicked for invite link violation
     * @param {string} userId - WhatsApp user ID
     * @param {string} groupId - WhatsApp group ID
     * @returns {Object} - { action: 'warn'|'kick', warningCount: number, isFirstWarning: boolean }
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
     * @param {string} userId - WhatsApp user ID
     * @param {string} groupId - WhatsApp group ID
     * @param {string} groupName - Group name
     * @param {string} inviteLink - The invite link that caused the violation
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
        console.log(`⚠️ Warning recorded: ${normalizedUserId} in ${groupName} (Count: ${warningRecord.warningCount}) [memory-only]`);
        return true;

        /* FIREBASE WRITES DISABLED FOR WARNINGS - Cost reduction
        if (!db || db.collection === undefined) {
            console.warn('⚠️ Firebase not available - warning saved in memory only');
            return true;
        }

        try {
            await db.collection('user_warnings').doc(warningKey).set(warningRecord);
            console.log(`⚠️ Warning recorded: ${normalizedUserId} in ${groupName} (Count: ${warningRecord.warningCount})`);
            return true;
        } catch (error) {
            console.error('❌ Error recording warning:', error.message);
            return false;
        }
        */
    }

    /**
     * Clear warnings for a user when they're kicked or leave voluntarily
     * @param {string} userId - WhatsApp user ID
     * @param {string} groupId - WhatsApp group ID (optional - if not provided, clears all warnings for user)
     */
    async clearWarnings(userId, groupId = null) {
        const normalizedUserId = userId.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
        
        if (groupId) {
            // Clear warning for specific group
            const warningKey = `${normalizedUserId}:${groupId}`;
            this.warningCache.delete(warningKey);
            console.log(`✅ Cleared warning for ${normalizedUserId} in group ${groupId} [memory-only]`);

            /* FIREBASE DELETES DISABLED FOR WARNINGS - Cost reduction
            if (db && db.collection) {
                try {
                    await db.collection('user_warnings').doc(warningKey).delete();
                    console.log(`✅ Cleared warning for ${normalizedUserId} in group ${groupId}`);
                } catch (error) {
                    console.error('❌ Error clearing warning:', error.message);
                }
            }
            */
        } else {
            // Clear all warnings for user
            const keysToDelete = [];
            for (const [key, record] of this.warningCache.entries()) {
                if (record.userId === normalizedUserId) {
                    keysToDelete.push(key);
                }
            }

            // Delete from cache
            keysToDelete.forEach(key => this.warningCache.delete(key));
            console.log(`✅ Cleared ${keysToDelete.length} warnings for ${normalizedUserId} [memory-only]`);

            /* FIREBASE DELETES DISABLED FOR WARNINGS - Cost reduction
            if (db && db.collection) {
                const batch = db.batch();
                keysToDelete.forEach(key => {
                    const docRef = db.collection('user_warnings').doc(key);
                    batch.delete(docRef);
                });

                try {
                    await batch.commit();
                    console.log(`✅ Cleared ${keysToDelete.length} warnings for ${normalizedUserId}`);
                } catch (error) {
                    console.error('❌ Error clearing warnings:', error.message);
                }
            }
            */
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
            // Remove from cache
            expiredKeys.forEach(key => this.warningCache.delete(key));
            console.log(`🧹 Cleaned up ${expiredKeys.length} expired warnings [memory-only]`);

            /* FIREBASE DELETES DISABLED FOR WARNINGS - Cost reduction
            if (db && db.collection) {
                const batch = db.batch();
                expiredKeys.forEach(key => {
                    const docRef = db.collection('user_warnings').doc(key);
                    batch.delete(docRef);
                });

                try {
                    await batch.commit();
                    console.log(`🧹 Cleaned up ${expiredKeys.length} expired warnings`);
                } catch (error) {
                    console.error('❌ Error cleaning up warnings:', error.message);
                }
            }
            */
        }
    }

    /**
     * Get warning statistics for admin
     */
    async getWarningStats() {
        if (!this.cacheLoaded) {
            await this.loadWarningCache();
        }

        // Clean up expired warnings first
        await this.cleanupExpiredWarnings();

        const totalWarnings = this.warningCache.size;
        const groupStats = new Map();
        let expiringSoon = 0;

        const oneDayFromNow = new Date(Date.now() + (24 * 60 * 60 * 1000));

        for (const record of this.warningCache.values()) {
            const groupName = record.groupName;
            groupStats.set(groupName, (groupStats.get(groupName) || 0) + 1);

            // Count warnings expiring within 24 hours
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
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
        };
    }

    /**
     * Get warnings for a specific user (admin command)
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
    // Initialize on module load
    async initialize() {
        return await warningService.loadWarningCache();
    }
};