/**
 * Group Whitelist Service
 * Manages whitelisting of close friend groups to reduce false positives
 * Small groups with high interaction frequency get lower sensitivity
 */

const admin = require('firebase-admin');

class GroupWhitelistService {
  constructor() {
    this.initialized = false;
    this.whitelistedGroups = new Set();
    this.groupActivityTracking = new Map(); // groupId -> activity stats
    this.useFirebase = false;
  }

  async initialize() {
    if (this.initialized) return;

    // Try to connect to Firebase
    try {
      if (admin.apps.length > 0) {
        this.db = admin.firestore();
        this.whitelistRef = this.db.collection('bullywatch_whitelist');
        await this.loadFromFirebase();
        this.useFirebase = true;
        console.log('✅ GroupWhitelistService initialized with Firebase');
      } else {
        console.log('⚠️  GroupWhitelistService running in memory-only mode (Firebase not available)');
      }
    } catch (error) {
      console.log('⚠️  GroupWhitelistService: Firebase error, using memory-only mode:', error.message);
    }

    this.initialized = true;
  }

  /**
   * Load whitelisted groups from Firebase
   */
  async loadFromFirebase() {
    try {
      const snapshot = await this.whitelistRef.get();
      snapshot.forEach(doc => {
        this.whitelistedGroups.add(doc.id);
      });
      console.log(`📋 Loaded ${this.whitelistedGroups.size} whitelisted groups from Firebase`);
    } catch (error) {
      console.error('Error loading whitelisted groups from Firebase:', error);
    }
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

    if (this.useFirebase) {
      try {
        await this.whitelistRef.doc(groupId).set({
          whitelisted: true,
          reason,
          addedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Group ${groupId} added to whitelist in Firebase`);
      } catch (error) {
        console.error('Error adding group to Firebase whitelist:', error);
      }
    }

    console.log(`✅ Group ${groupId} whitelisted (${reason})`);
    return true;
  }

  /**
   * Remove group from whitelist
   */
  async unwhitelist(groupId) {
    this.whitelistedGroups.delete(groupId);

    if (this.useFirebase) {
      try {
        await this.whitelistRef.doc(groupId).delete();
        console.log(`✅ Group ${groupId} removed from whitelist in Firebase`);
      } catch (error) {
        console.error('Error removing group from Firebase whitelist:', error);
      }
    }

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
        // Small group with high interaction = likely friends
        console.log(`🤝 Detected close friend group: ${groupId} (${groupSize} members)`);
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
