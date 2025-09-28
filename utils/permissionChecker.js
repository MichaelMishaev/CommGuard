// Permission checker utility for detailed bot admin verification
const { getTimestamp, advancedLogger } = require('./logger');

class PermissionChecker {
    constructor() {
        this.permissionCache = new Map();
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    }

    // Get cached permission check or perform new check
    async checkBotPermissions(sock, groupId) {
        const cacheKey = groupId;
        const cached = this.permissionCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            return cached.permissions;
        }

        try {
            const permissions = await this.performPermissionCheck(sock, groupId);
            this.permissionCache.set(cacheKey, {
                permissions,
                timestamp: Date.now()
            });
            return permissions;
        } catch (error) {
            console.error(`Failed to check permissions for ${groupId}:`, error.message);
            return {
                isAdmin: false,
                canDeleteMessages: false,
                canKickUsers: false,
                error: error.message
            };
        }
    }

    // Perform detailed permission check
    async performPermissionCheck(sock, groupId) {
        try {
            // Get group metadata
            const groupMetadata = await sock.groupMetadata(groupId);
            const botId = sock.user.id;

            // Find bot in participants
            const botParticipant = groupMetadata.participants.find(p => p.id === botId);

            if (!botParticipant) {
                return {
                    isAdmin: false,
                    canDeleteMessages: false,
                    canKickUsers: false,
                    error: 'Bot not found in group participants'
                };
            }

            // Check admin status
            const isAdmin = botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin';
            const isSuperAdmin = botParticipant.admin === 'superadmin';

            // In WhatsApp, admins can delete messages and kick users
            // Only group creators (superadmin) and admins have these permissions
            const canDeleteMessages = isAdmin || isSuperAdmin;
            const canKickUsers = isAdmin || isSuperAdmin;

            const permissions = {
                isAdmin,
                isSuperAdmin,
                canDeleteMessages,
                canKickUsers,
                adminLevel: botParticipant.admin || 'participant',
                groupName: groupMetadata.subject || 'Unknown Group',
                participantCount: groupMetadata.participants.length,
                botId: botId
            };

            console.log(`[${getTimestamp()}] 🔍 Permission check for ${groupId}:`);
            console.log(`   Group: ${permissions.groupName}`);
            console.log(`   Bot Admin: ${isAdmin ? '✅ Yes' : '❌ No'} (${permissions.adminLevel})`);
            console.log(`   Can Delete: ${canDeleteMessages ? '✅ Yes' : '❌ No'}`);
            console.log(`   Can Kick: ${canKickUsers ? '✅ Yes' : '❌ No'}`);

            return permissions;

        } catch (error) {
            throw error;
        }
    }

    // Log permission issues with context
    logPermissionIssue(action, groupId, permissions, additionalContext = {}) {
        const issue = {
            action,
            groupId,
            botPermissions: permissions,
            context: additionalContext,
            timestamp: getTimestamp()
        };

        console.error(`[${issue.timestamp}] 🚫 PERMISSION ISSUE: ${action}`);
        console.error(`   Group: ${permissions.groupName || groupId}`);
        console.error(`   Bot Admin: ${permissions.isAdmin ? 'Yes' : 'No'}`);
        console.error(`   Can Delete: ${permissions.canDeleteMessages ? 'Yes' : 'No'}`);
        console.error(`   Can Kick: ${permissions.canKickUsers ? 'Yes' : 'No'}`);

        // Log to advanced logger for tracking
        advancedLogger.logPermissionError(action, groupId, {
            message: `Bot lacks ${action} permission`,
            botAdminStatus: permissions.isAdmin,
            canDeleteMessages: permissions.canDeleteMessages,
            canKickUsers: permissions.canKickUsers,
            adminLevel: permissions.adminLevel
        });
    }

    // Clear cache for a specific group (use after permission changes)
    clearCache(groupId) {
        this.permissionCache.delete(groupId);
    }

    // Clear all cached permissions
    clearAllCache() {
        this.permissionCache.clear();
        console.log(`[${getTimestamp()}] 🧹 Cleared all permission cache`);
    }

    // Get permission statistics
    getStats() {
        const stats = {
            cachedGroups: this.permissionCache.size,
            cacheEntries: []
        };

        for (const [groupId, entry] of this.permissionCache.entries()) {
            const age = Date.now() - entry.timestamp;
            stats.cacheEntries.push({
                groupId,
                permissions: entry.permissions,
                ageMs: age,
                isExpired: age > this.CACHE_DURATION
            });
        }

        return stats;
    }
}

// Export singleton instance
const permissionChecker = new PermissionChecker();
module.exports = permissionChecker;