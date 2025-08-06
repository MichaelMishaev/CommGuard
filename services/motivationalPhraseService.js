const db = require('../firebaseConfig.js');
const admin = require('firebase-admin');
const { getTimestamp } = require('../utils/logger');

/**
 * Motivational Phrase Service
 * Manages funny responses for "משעמם" messages with usage tracking
 */

class MotivationalPhraseService {
    constructor() {
        this.phraseCache = [];
        this.cacheLoaded = false;
        this.lastCacheUpdate = 0;
        this.CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
    }

    /**
     * Load phrases from Firebase into cache
     */
    async loadPhraseCache() {
        if (!db || db.collection === undefined) {
            console.warn('⚠️ Firebase not available - motivational phrases disabled');
            return false;
        }

        try {
            const snapshot = await db.collection('motivational_phrases')
                .where('isActive', '==', true)
                .where('category', '==', 'boredom_response')
                .get();
            
            this.phraseCache = [];
            snapshot.forEach(doc => {
                this.phraseCache.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            this.cacheLoaded = true;
            this.lastCacheUpdate = Date.now();
            console.log(`✅ Loaded ${this.phraseCache.length} motivational phrases into cache`);
            return true;
        } catch (error) {
            console.error('❌ Error loading phrase cache:', error.message);
            return false;
        }
    }

    /**
     * Get a random phrase, avoiding recently used ones
     */
    async getRandomPhrase() {
        // Refresh cache if needed
        if (!this.cacheLoaded || (Date.now() - this.lastCacheUpdate) > this.CACHE_DURATION) {
            await this.loadPhraseCache();
        }

        if (this.phraseCache.length === 0) {
            console.warn('⚠️ No phrases available in cache');
            return "😴 משעמם? בואו נעשה משהו מעניין! 🎉";
        }

        // Filter phrases that weren't used recently (prefer less used ones)
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        
        let availablePhrases = this.phraseCache.filter(phrase => {
            if (!phrase.lastUsed) return true; // Never used
            const lastUsedTime = new Date(phrase.lastUsed).getTime();
            return lastUsedTime < oneHourAgo; // Not used in last hour
        });

        // If all phrases were used recently, use the least used ones
        if (availablePhrases.length === 0) {
            // Sort by usage count (ascending) and take the least used
            availablePhrases = [...this.phraseCache].sort((a, b) => 
                (a.usageCount || 0) - (b.usageCount || 0)
            ).slice(0, Math.ceil(this.phraseCache.length / 3)); // Top 1/3 least used
        }

        // Pick random phrase from available ones
        const randomIndex = Math.floor(Math.random() * availablePhrases.length);
        const selectedPhrase = availablePhrases[randomIndex];
        
        console.log(`[${getTimestamp()}] 🎭 Selected phrase: ${selectedPhrase.id} (used ${selectedPhrase.usageCount || 0} times)`);
        
        // Update usage tracking
        await this.updatePhraseUsage(selectedPhrase.id);
        
        return selectedPhrase.phrase;
    }

    /**
     * Update phrase usage statistics
     */
    async updatePhraseUsage(phraseId) {
        if (!db || db.collection === undefined) {
            console.warn('⚠️ Firebase not available - usage tracking skipped');
            return;
        }

        try {
            const now = new Date().toISOString();
            await db.collection('motivational_phrases').doc(phraseId).update({
                lastUsed: now,
                usageCount: admin.firestore.FieldValue.increment(1)
            });

            // Update local cache too
            const cachedPhrase = this.phraseCache.find(p => p.id === phraseId);
            if (cachedPhrase) {
                cachedPhrase.lastUsed = now;
                cachedPhrase.usageCount = (cachedPhrase.usageCount || 0) + 1;
            }

            console.log(`✅ Updated usage for phrase ${phraseId}`);
        } catch (error) {
            console.error('❌ Error updating phrase usage:', error.message);
        }
    }

    /**
     * Get usage statistics for admin
     */
    async getPhraseStats() {
        if (!this.cacheLoaded) {
            await this.loadPhraseCache();
        }

        const totalPhrases = this.phraseCache.length;
        const usedPhrases = this.phraseCache.filter(p => p.usageCount > 0).length;
        const totalUsages = this.phraseCache.reduce((sum, p) => sum + (p.usageCount || 0), 0);
        const mostUsed = this.phraseCache.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))[0];
        const leastUsed = this.phraseCache.sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0))[0];

        return {
            totalPhrases,
            usedPhrases,
            totalUsages,
            mostUsed: mostUsed ? { text: mostUsed.phrase.substring(0, 50) + '...', count: mostUsed.usageCount || 0 } : null,
            leastUsed: leastUsed ? { text: leastUsed.phrase.substring(0, 50) + '...', count: leastUsed.usageCount || 0 } : null
        };
    }
}

// Export singleton instance
const motivationalPhraseService = new MotivationalPhraseService();

module.exports = {
    motivationalPhraseService,
    // Initialize on module load
    async initialize() {
        return await motivationalPhraseService.loadPhraseCache();
    }
};