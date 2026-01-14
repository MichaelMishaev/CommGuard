/**
 * Nano Logging Service
 * Logs all GPT-5-nano decisions for training and analysis
 *
 * Purpose:
 * 1. Create training dataset for future own-model development
 * 2. Analyze nano accuracy vs. actual outcomes (after admin review)
 * 3. Identify patterns nano misses (false negatives/positives)
 * 4. Continuous improvement through feedback loop
 *
 * Memory-only storage with Redis fallback
 */

const crypto = require('crypto');

class NanoLoggingService {
    constructor() {
        this.initialized = false;
        this.redis = null;
        this.useRedis = false;

        // In-memory storage
        this.memoryLog = [];
        this.maxMemoryEntries = 10000;

        // AI Error tracking
        this.aiErrors = [];
        this.maxAIErrors = 1000;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Try Redis
            try {
                const Redis = require('ioredis');
                this.redis = new Redis({
                    host: process.env.REDIS_HOST || 'localhost',
                    port: process.env.REDIS_PORT || 6379,
                    password: process.env.REDIS_PASSWORD,
                    retryStrategy: (times) => {
                        if (times > 3) return null;
                        return Math.min(times * 50, 2000);
                    }
                });

                await this.redis.ping();
                this.useRedis = true;
                console.log('✅ NanoLoggingService using Redis');
            } catch (redisError) {
                console.log('⚠️  Redis not available for nano logging, using memory');
            }

            if (!this.useRedis) {
                console.log('⚠️  NanoLoggingService using in-memory storage (not persistent)');
            }

            this.initialized = true;
        } catch (error) {
            console.error('Error initializing NanoLoggingService:', error);
            this.initialized = true;
        }
    }

    /**
     * Log nano decision (async, non-blocking)
     */
    async logDecision(logEntry) {
        if (!this.initialized) {
            console.warn('NanoLoggingService not initialized, skipping log');
            return;
        }

        try {
            const entry = this.createLogEntry(logEntry);

            setImmediate(async () => {
                try {
                    if (this.useRedis) {
                        await this.logToRedis(entry);
                    } else {
                        this.logToMemory(entry);
                    }
                } catch (error) {
                    console.error('Error logging nano decision:', error);
                    this.logToMemory(entry);
                }
            });

        } catch (error) {
            console.error('Error creating nano log entry:', error);
        }
    }

    /**
     * Create privacy-safe log entry
     */
    createLogEntry(data) {
        const {
            messageText,
            sender,
            groupId,
            nanoVerdict,
            nanoConfidence,
            nanoReason,
            nanoCategories,
            finalScore,
            finalSeverity,
            finalAction,
            processingTimeMs,
            aiRequest,
            aiResponse
        } = data;

        return {
            messageHash: this.hashText(messageText),
            messageLength: messageText ? messageText.length : 0,
            messagePreview: messageText ? messageText.substring(0, 20) + '...' : '',
            senderHash: this.hashText(sender),
            groupHash: this.hashText(groupId),
            nanoVerdict: nanoVerdict,
            nanoConfidence: nanoConfidence,
            nanoReason: nanoReason,
            nanoCategories: nanoCategories || [],
            finalScore: finalScore || null,
            finalSeverity: finalSeverity || null,
            finalAction: finalAction || null,
            aiRequest: aiRequest || null,
            aiResponse: aiResponse || null,
            timestamp: Date.now(),
            date: new Date().toISOString(),
            processingTimeMs: processingTimeMs || 0,
            humanReview: null,
            actuallyHarmful: null,
            notes: null
        };
    }

    /**
     * Hash text for privacy (SHA-256)
     */
    hashText(text) {
        if (!text) return null;
        return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
    }

    /**
     * Log to Redis (as sorted set for time-based queries)
     */
    async logToRedis(entry) {
        try {
            const key = 'nano_decisions';
            const score = entry.timestamp;
            const value = JSON.stringify(entry);

            await this.redis.zadd(key, score, value);

            // Keep only last 30 days
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            await this.redis.zremrangebyscore(key, 0, thirtyDaysAgo);

        } catch (error) {
            console.error('Error writing to Redis:', error);
            throw error;
        }
    }

    /**
     * Log to memory (fallback)
     */
    logToMemory(entry) {
        this.memoryLog.push(entry);

        if (this.memoryLog.length > this.maxMemoryEntries) {
            this.memoryLog.shift();
        }
    }

    /**
     * Update entry with human review feedback
     */
    async updateWithFeedback(messageHash, feedback) {
        if (!this.initialized) return;

        const update = {
            humanReview: feedback.verdict,
            actuallyHarmful: feedback.verdict === 'harmful',
            notes: feedback.notes || null,
            reviewedAt: Date.now(),
            reviewedBy: feedback.adminId || null
        };

        try {
            if (this.useRedis) {
                const key = 'nano_decisions';
                const entries = await this.redis.zrange(key, 0, -1);

                for (const entryStr of entries) {
                    const entry = JSON.parse(entryStr);
                    if (entry.messageHash === messageHash) {
                        const updated = { ...entry, ...update };
                        await this.redis.zrem(key, entryStr);
                        await this.redis.zadd(key, entry.timestamp, JSON.stringify(updated));
                    }
                }
            } else {
                const entry = this.memoryLog.find(e => e.messageHash === messageHash);
                if (entry) {
                    Object.assign(entry, update);
                }
            }
        } catch (error) {
            console.error('Error updating nano decision with feedback:', error);
        }
    }

    /**
     * Get statistics for analysis
     */
    async getStatistics(timeRangeMs = 24 * 60 * 60 * 1000) {
        if (!this.initialized) return null;

        const since = Date.now() - timeRangeMs;
        let entries = [];

        try {
            if (this.useRedis) {
                const key = 'nano_decisions';
                const entryStrs = await this.redis.zrangebyscore(key, since, '+inf');
                entries = entryStrs.map(str => JSON.parse(str));
            } else {
                entries = this.memoryLog.filter(e => e.timestamp > since);
            }

            return this.calculateStats(entries);
        } catch (error) {
            console.error('Error getting nano statistics:', error);
            return null;
        }
    }

    /**
     * Calculate statistics from entries
     */
    calculateStats(entries) {
        const total = entries.length;
        if (total === 0) return null;

        const stats = {
            totalDecisions: total,
            safe: entries.filter(e => e.nanoVerdict === 'safe').length,
            harmful: entries.filter(e => e.nanoVerdict === 'harmful').length,
            ambiguous: entries.filter(e => e.nanoVerdict === 'ambiguous').length,
            reviewed: entries.filter(e => e.humanReview !== null).length,
            truePositives: 0,
            falsePositives: 0,
            trueNegatives: 0,
            falseNegatives: 0,
            avgConfidence: 0,
            avgProcessingTime: 0
        };

        let confidenceSum = 0;
        let timeSum = 0;

        for (const entry of entries) {
            confidenceSum += entry.nanoConfidence || 0;
            timeSum += entry.processingTimeMs || 0;

            if (entry.humanReview !== null) {
                const nanoSaidHarmful = entry.nanoVerdict === 'harmful';
                const actuallyHarmful = entry.actuallyHarmful === true;

                if (nanoSaidHarmful && actuallyHarmful) stats.truePositives++;
                if (nanoSaidHarmful && !actuallyHarmful) stats.falsePositives++;
                if (!nanoSaidHarmful && !actuallyHarmful) stats.trueNegatives++;
                if (!nanoSaidHarmful && actuallyHarmful) stats.falseNegatives++;
            }
        }

        stats.avgConfidence = (confidenceSum / total).toFixed(3);
        stats.avgProcessingTime = Math.round(timeSum / total);

        const totalReviewed = stats.reviewed;
        if (totalReviewed > 0) {
            stats.accuracy = (
                (stats.truePositives + stats.trueNegatives) / totalReviewed * 100
            ).toFixed(1) + '%';

            stats.precision = stats.truePositives + stats.falsePositives > 0
                ? ((stats.truePositives / (stats.truePositives + stats.falsePositives)) * 100).toFixed(1) + '%'
                : 'N/A';

            stats.recall = stats.truePositives + stats.falseNegatives > 0
                ? ((stats.truePositives / (stats.truePositives + stats.falseNegatives)) * 100).toFixed(1) + '%'
                : 'N/A';
        }

        return stats;
    }

    /**
     * Export training data (for building own model)
     */
    async exportTrainingData(limit = 10000) {
        if (!this.initialized) return [];

        try {
            let entries = [];

            if (this.useRedis) {
                const key = 'nano_decisions';
                const entryStrs = await this.redis.zrevrange(key, 0, limit - 1);
                entries = entryStrs
                    .map(str => JSON.parse(str))
                    .filter(e => e.humanReview !== null);
            } else {
                entries = this.memoryLog
                    .filter(e => e.humanReview !== null)
                    .slice(0, limit);
            }

            return entries.map(e => ({
                messagePreview: e.messagePreview,
                messageLength: e.messageLength,
                nanoVerdict: e.nanoVerdict,
                nanoConfidence: e.nanoConfidence,
                nanoCategories: e.nanoCategories,
                label: e.actuallyHarmful ? 'harmful' : 'safe',
                timestamp: e.timestamp,
                notes: e.notes
            }));

        } catch (error) {
            console.error('Error exporting training data:', error);
            return [];
        }
    }

    /**
     * Get entries for manual review
     */
    async getPotentialFalseNegatives(limit = 100) {
        if (!this.initialized) return [];

        try {
            let entries = [];

            if (this.useRedis) {
                const key = 'nano_decisions';
                const entryStrs = await this.redis.zrange(key, 0, -1);
                entries = entryStrs
                    .map(str => JSON.parse(str))
                    .filter(e => e.nanoVerdict === 'safe' && e.finalScore > 10)
                    .slice(0, limit);
            } else {
                entries = this.memoryLog
                    .filter(e => e.nanoVerdict === 'safe' && e.finalScore > 10)
                    .slice(0, limit);
            }

            return entries;
        } catch (error) {
            console.error('Error getting potential false negatives:', error);
            return [];
        }
    }

    /**
     * Log AI API errors
     */
    async logAIError(errorData) {
        const errorEntry = {
            timestamp: Date.now(),
            date: new Date().toISOString(),
            model: errorData.model || 'unknown',
            errorType: errorData.errorType || 'unknown',
            errorMessage: errorData.errorMessage || 'No message',
            errorCode: errorData.errorCode || null,
            requestPayload: errorData.requestPayload || null,
            stackTrace: errorData.stackTrace || null,
            groupId: errorData.groupId || null,
            messagePreview: errorData.messagePreview || null
        };

        this.aiErrors.push(errorEntry);
        if (this.aiErrors.length > this.maxAIErrors) {
            this.aiErrors.shift();
        }

        console.error('AI API ERROR:', {
            model: errorEntry.model,
            error: errorEntry.errorMessage,
            code: errorEntry.errorCode,
            timestamp: errorEntry.date
        });

        // Async write to Redis if available
        if (this.useRedis) {
            setImmediate(async () => {
                try {
                    const key = 'ai_errors';
                    const score = errorEntry.timestamp;
                    const value = JSON.stringify(errorEntry);
                    await this.redis.zadd(key, score, value);

                    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                    await this.redis.zremrangebyscore(key, 0, sevenDaysAgo);
                } catch (error) {
                    console.error('Error logging AI error to Redis:', error);
                }
            });
        }
    }

    /**
     * Get recent AI errors
     */
    getRecentAIErrors(limit = 50) {
        return this.aiErrors.slice(-limit).reverse();
    }
}

// Singleton instance
const nanoLoggingService = new NanoLoggingService();

module.exports = nanoLoggingService;
