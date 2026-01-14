/**
 * Group Whitelist Service
 * Manages whitelisting of close friend groups to reduce false positives
 * Small groups with high interaction frequency get lower sensitivity
 *
 * Memory-only storage
 */

class GroupWhitelistService {
    constructor() {
        this.initialized = false;
        this.whitelistedGroups = new Set();
        this.groupActivityTracking = new Map(); // groupId -> activity stats
    }

    async initialize() {
        if (this.initialized) return;

        console.log('✅ GroupWhitelistService initialized (memory-only mode)');
        this.initialized = true;
    }

    /**
     * Check if group is whitelisted
     */
    async isWhitelisted(groupId) {
        return this.whitelistedGroups.has(groupId);
    }

    /**
     * Add group to whitelist
     */
    async whitelist(groupId, reason = 'Manual whitelist') {
        this.whitelistedGroups.add(groupId);
        console.log(`✅ Group ${groupId} whitelisted (${reason})`);
        return true;
    }

    /**
     * Remove group from whitelist
     */
    async unwhitelist(groupId) {
        this.whitelistedGroups.delete(groupId);
        console.log(`✅ Group ${groupId} removed from whitelist`);
        return true;
    }

    /**
     * Get score multiplier for a group
     * - Whitelisted groups: 0.5x (lower sensitivity)
     * - Small active groups (<10 members, high interaction): 0.5x
     * - Regular groups: 1.0x
     */
    async getScoreMultiplier(groupId, groupSize = 0) {
        // Explicit whitelist
        if (this.whitelistedGroups.has(groupId)) {
            return 0.5;
        }

        // Automatic detection of close friend groups
        if (groupSize > 0 && groupSize < 10) {
            const activity = this.groupActivityTracking.get(groupId);
            if (activity && this.isHighInteractionGroup(activity, groupSize)) {
                console.log(`Detected close friend group: ${groupId} (${groupSize} members)`);
                return 0.5;
            }
        }

        return 1.0;
    }

    /**
     * Track group activity to detect close friend groups
     */
    trackActivity(groupId, messageCount, uniqueSenders, timeWindow = 24 * 60 * 60 * 1000) {
        const activity = this.groupActivityTracking.get(groupId) || {
            messageCount: 0,
            uniqueSenders: new Set(),
            lastUpdate: Date.now()
        };

        activity.messageCount += messageCount;
        uniqueSenders.forEach(sender => activity.uniqueSenders.add(sender));
        activity.lastUpdate = Date.now();

        this.groupActivityTracking.set(groupId, activity);

        // Clean up old data
        this.cleanupOldActivity(timeWindow);
    }

    /**
     * Determine if group has high interaction (friend group indicator)
     * Heuristic: >80% of members actively messaging
     */
    isHighInteractionGroup(activity, groupSize) {
        if (groupSize === 0) return false;

        const participationRate = activity.uniqueSenders.size / groupSize;
        return participationRate > 0.8;
    }

    /**
     * Get all whitelisted groups
     */
    getWhitelistedGroups() {
        return Array.from(this.whitelistedGroups);
    }

    /**
     * Clean up old activity data
     */
    cleanupOldActivity(maxAge = 7 * 24 * 60 * 60 * 1000) {
        const now = Date.now();
        const cutoff = now - maxAge;

        for (const [groupId, activity] of this.groupActivityTracking) {
            if (activity.lastUpdate < cutoff) {
                this.groupActivityTracking.delete(groupId);
            }
        }
    }

    /**
     * Get group activity stats (for admin dashboard)
     */
    getActivityStats(groupId) {
        const activity = this.groupActivityTracking.get(groupId);
        if (!activity) {
            return null;
        }

        return {
            messageCount: activity.messageCount,
            activeSenders: activity.uniqueSenders.size,
            lastUpdate: activity.lastUpdate
        };
    }
}

// Singleton instance
const groupWhitelistService = new GroupWhitelistService();

module.exports = groupWhitelistService;
