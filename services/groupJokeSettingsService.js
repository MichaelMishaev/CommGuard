/**
 * Group Joke Settings Service
 * Manages per-group משעמם joke enable/disable settings
 */

const config = require('../config');
const { getTimestamp } = require('../utils/logger');

class GroupJokeSettingsService {
    constructor() {
        this.cache = new Map(); // In-memory cache for performance
        this.isInitialized = false;
        this.db = null;
    }

    /**
     * Initialize the service with Firebase if available
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            if (config.FEATURES.FIREBASE_INTEGRATION) {
                const db = require('../firebaseConfig.js');
                if (db && db.collection) {
                    this.db = db;
                    console.log(`[${getTimestamp()}] 🎭 Group joke settings service initialized with Firebase`);
                } else {
                    console.log(`[${getTimestamp()}] ⚠️ Firebase not available - using memory-only joke settings`);
                }
            } else {
                console.log(`[${getTimestamp()}] ⚠️ Firebase disabled - using memory-only joke settings`);
            }
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Error initializing joke settings service:`, error.message);
        }

        this.isInitialized = true;
    }

    /**
     * Check if jokes are enabled for a specific group
     * @param {string} groupId - WhatsApp group ID
     * @returns {Promise<boolean>} - True if jokes enabled, false if disabled
     */
    async areJokesEnabled(groupId) {
        await this.initialize();

        // Check cache first
        if (this.cache.has(groupId)) {
            return this.cache.get(groupId).jokes_enabled;
        }

        // Default to enabled if no setting found
        let jokesEnabled = true;

        try {
            if (this.db) {
                const doc = await this.db.collection('group_joke_settings').doc(groupId).get();
                if (doc.exists) {
                    const data = doc.data();
                    jokesEnabled = data.jokes_enabled !== false; // Default to true
                    
                    // Cache the result
                    this.cache.set(groupId, data);
                }
            }
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Error checking joke settings for ${groupId}:`, error.message);
            // Return default (enabled) on error
        }

        return jokesEnabled;
    }

    /**
     * Set joke status for a specific group
     * @param {string} groupId - WhatsApp group ID
     * @param {boolean} enabled - True to enable, false to disable
     * @param {string} adminPhone - Phone number of admin making change
     * @param {string} groupName - Name of the group (for logging)
     * @returns {Promise<boolean>} - Success status
     */
    async setJokesEnabled(groupId, enabled, adminPhone, groupName = 'Unknown') {
        await this.initialize();

        const setting = {
            groupId: groupId,
            jokes_enabled: enabled,
            updated_at: new Date().toISOString(),
            updated_by: adminPhone,
            group_name: groupName
        };

        try {
            // Update Firebase if available
            if (this.db) {
                await this.db.collection('group_joke_settings').doc(groupId).set(setting, { merge: true });
                console.log(`[${getTimestamp()}] ✅ Joke settings updated in Firebase: ${groupName} → ${enabled ? 'Enabled' : 'Disabled'}`);
            }

            // Update cache
            this.cache.set(groupId, setting);

            console.log(`[${getTimestamp()}] 🎭 Jokes ${enabled ? 'enabled' : 'disabled'} for group: ${groupName} (${groupId})`);
            return true;

        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Error updating joke settings for ${groupId}:`, error.message);
            
            // Still update cache even if Firebase fails
            this.cache.set(groupId, setting);
            return false;
        }
    }

    /**
     * Get joke settings for a specific group
     * @param {string} groupId - WhatsApp group ID
     * @returns {Promise<Object>} - Group joke settings object
     */
    async getGroupSettings(groupId) {
        await this.initialize();

        // Check cache first
        if (this.cache.has(groupId)) {
            return this.cache.get(groupId);
        }

        // Try Firebase
        try {
            if (this.db) {
                const doc = await this.db.collection('group_joke_settings').doc(groupId).get();
                if (doc.exists) {
                    const data = doc.data();
                    this.cache.set(groupId, data);
                    return data;
                }
            }
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Error fetching group settings:`, error.message);
        }

        // Return default settings
        const defaultSettings = {
            groupId: groupId,
            jokes_enabled: true,
            updated_at: null,
            updated_by: null,
            group_name: 'Unknown'
        };

        return defaultSettings;
    }

    /**
     * Get statistics about joke settings across all groups
     * @returns {Promise<Object>} - Statistics object
     */
    async getJokeSettingsStats() {
        await this.initialize();

        const stats = {
            total_groups: 0,
            enabled_groups: 0,
            disabled_groups: 0,
            cache_size: this.cache.size,
            firebase_available: !!this.db
        };

        try {
            if (this.db) {
                const snapshot = await this.db.collection('group_joke_settings').get();
                stats.total_groups = snapshot.size;
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.jokes_enabled !== false) {
                        stats.enabled_groups++;
                    } else {
                        stats.disabled_groups++;
                    }
                });
            } else {
                // Count from cache only
                stats.total_groups = this.cache.size;
                for (const [groupId, settings] of this.cache) {
                    if (settings.jokes_enabled !== false) {
                        stats.enabled_groups++;
                    } else {
                        stats.disabled_groups++;
                    }
                }
            }
        } catch (error) {
            console.error(`[${getTimestamp()}] ❌ Error fetching joke settings stats:`, error.message);
        }

        return stats;
    }

    /**
     * Clear cache for a specific group (force reload from Firebase)
     * @param {string} groupId - WhatsApp group ID
     */
    clearCache(groupId) {
        this.cache.delete(groupId);
        console.log(`[${getTimestamp()}] 🗑️ Cleared joke settings cache for group: ${groupId}`);
    }

    /**
     * Clear all cache (force reload from Firebase)
     */
    clearAllCache() {
        this.cache.clear();
        console.log(`[${getTimestamp()}] 🗑️ Cleared all joke settings cache`);
    }
}

// Export singleton instance
const groupJokeSettingsService = new GroupJokeSettingsService();
module.exports = groupJokeSettingsService;