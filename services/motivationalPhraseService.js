const { getTimestamp } = require('../utils/logger');

/**
 * Motivational Phrase Service
 * Manages funny responses for "boring" messages with usage tracking
 * Memory-only storage with built-in fallback phrases
 */

class MotivationalPhraseService {
    constructor() {
        this.phraseCache = [];
        this.cacheLoaded = false;
        this.lastCacheUpdate = 0;
        this.CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

        // Built-in fallback phrases for "boring" messages
        this.defaultPhrases = [
            "מישהו אמר משעמם? בואו נעשה משהו מטורף! 🎉",
            "משעמם? תעשו חיפוש בגוגל על 'הדברים המוזרים ביותר בעולם'",
            "למה משעמם? יש לנו קבוצה מלאה באנשים מעניינים!",
            "משעמם לך? ספר לנו בדיחה טובה!",
            "בוא נשחק משחק מילים! מי מתחיל?",
            "משעמם? תנסה לספור עד 100 בהודים 🤔",
            "אם משעמם לך, תתחיל לחשוב על החיים... או סתם תאכל משהו טעים 🍕",
            "משעמם? תכתוב שיר על הקבוצה!",
            "הנה אתגר: תגיד משהו נחמד על כל אחד בקבוצה!",
            "משעמם לך? תעשה 10 עליות שכיבה ותחזור 💪"
        ];
    }

    /**
     * Load phrases into cache
     */
    async loadPhraseCache() {
        // Use default phrases (memory-only mode)
        this.phraseCache = this.defaultPhrases.map((phrase, index) => ({
            id: `default_${index}`,
            phrase: phrase,
            usageCount: 0,
            lastUsed: null,
            isActive: true,
            category: 'boredom_response'
        }));

        this.cacheLoaded = true;
        this.lastCacheUpdate = Date.now();
        console.log(`✅ Loaded ${this.phraseCache.length} motivational phrases (built-in)`);
        return true;
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
            return "משעמם? בואו נעשה משהו מעניין!";
        }

        // Filter phrases that weren't used recently
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);

        let availablePhrases = this.phraseCache.filter(phrase => {
            if (!phrase.lastUsed) return true;
            const lastUsedTime = new Date(phrase.lastUsed).getTime();
            return lastUsedTime < oneHourAgo;
        });

        // If all phrases were used recently, use the least used ones
        if (availablePhrases.length === 0) {
            availablePhrases = [...this.phraseCache].sort((a, b) =>
                (a.usageCount || 0) - (b.usageCount || 0)
            ).slice(0, Math.ceil(this.phraseCache.length / 3));
        }

        // Pick random phrase from available ones
        const randomIndex = Math.floor(Math.random() * availablePhrases.length);
        const selectedPhrase = availablePhrases[randomIndex];

        console.log(`[${getTimestamp()}] Selected phrase: ${selectedPhrase.id} (used ${selectedPhrase.usageCount || 0} times)`);

        // Update usage tracking
        await this.updatePhraseUsage(selectedPhrase.id);

        return selectedPhrase.phrase;
    }

    /**
     * Update phrase usage statistics
     */
    async updatePhraseUsage(phraseId) {
        const now = new Date().toISOString();
        const cachedPhrase = this.phraseCache.find(p => p.id === phraseId);
        if (cachedPhrase) {
            cachedPhrase.lastUsed = now;
            cachedPhrase.usageCount = (cachedPhrase.usageCount || 0) + 1;
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
        const sortedByUsage = [...this.phraseCache].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
        const mostUsed = sortedByUsage[0];
        const leastUsed = sortedByUsage[sortedByUsage.length - 1];

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
    async initialize() {
        return await motivationalPhraseService.loadPhraseCache();
    }
};
