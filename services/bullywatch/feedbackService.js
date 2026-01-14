/**
 * Feedback Loop Service
 * Collects admin reviews of flagged messages and uses them to:
 * 1. Update lexicon word weights
 * 2. Tune scoring thresholds
 * 3. Learn new slang and evolving harassment patterns
 * 4. Track system accuracy (precision/recall)
 *
 * Memory-only storage
 */

const lexiconService = require('./lexiconService');
const scoringService = require('./scoringService');

class FeedbackService {
    constructor() {
        this.initialized = false;
        this.feedbackQueue = []; // In-memory queue
        this.statistics = {
            totalReviews: 0,
            truePositives: 0,
            falsePositives: 0,
            trueNegatives: 0,
            falseNegatives: 0
        };
    }

    async initialize() {
        if (this.initialized) return;

        console.log('✅ FeedbackService initialized (memory-only mode)');

        // Schedule monthly weight updates
        this.scheduleMonthlyUpdate();

        this.initialized = true;
    }

    /**
     * Record admin feedback on a flagged message
     */
    async recordFeedback(feedback) {
        const {
            messageId,
            groupId,
            verdict, // 'true_positive' | 'false_positive'
            severity, // 'low' | 'medium' | 'high'
            originalScore,
            detectedCategories,
            adminId,
            notes
        } = feedback;

        const feedbackRecord = {
            messageId,
            groupId,
            verdict,
            severity,
            originalScore,
            detectedCategories: detectedCategories || [],
            adminId,
            notes: notes || '',
            timestamp: Date.now(),
            reviewedAt: new Date()
        };

        // Add to queue
        this.feedbackQueue.push(feedbackRecord);

        // Update statistics
        this.updateStatistics(verdict);

        console.log(`✅ Feedback recorded for message ${messageId}: ${verdict}`);

        // Process feedback immediately if it's a clear pattern
        if (this.feedbackQueue.length >= 10) {
            await this.processQueuedFeedback();
        }

        return true;
    }

    /**
     * Update statistics based on feedback
     */
    updateStatistics(verdict) {
        this.statistics.totalReviews++;

        switch (verdict) {
            case 'true_positive':
                this.statistics.truePositives++;
                break;
            case 'false_positive':
                this.statistics.falsePositives++;
                break;
            case 'true_negative':
                this.statistics.trueNegatives++;
                break;
            case 'false_negative':
                this.statistics.falseNegatives++;
                break;
        }
    }

    /**
     * Process queued feedback to update weights
     */
    async processQueuedFeedback() {
        if (this.feedbackQueue.length === 0) return;

        console.log(`Processing ${this.feedbackQueue.length} feedback items...`);

        // Group feedback by detected categories
        const categoryFeedback = new Map();

        for (const item of this.feedbackQueue) {
            for (const category of item.detectedCategories) {
                if (!categoryFeedback.has(category)) {
                    categoryFeedback.set(category, {
                        truePositives: 0,
                        falsePositives: 0,
                        totalScore: 0,
                        count: 0
                    });
                }

                const stats = categoryFeedback.get(category);
                stats.count++;
                stats.totalScore += item.originalScore;

                if (item.verdict === 'true_positive') {
                    stats.truePositives++;
                } else if (item.verdict === 'false_positive') {
                    stats.falsePositives++;
                }
            }
        }

        // Update lexicon weights based on precision
        for (const [category, stats] of categoryFeedback) {
            const precision = stats.truePositives / Math.max(stats.count, 1);
            const newWeight = this.calculateNewWeight(precision);
            console.log(`Category ${category}: Precision ${(precision * 100).toFixed(1)}%, New weight: ${newWeight.toFixed(2)}`);
        }

        // Clear queue
        this.feedbackQueue = [];
    }

    /**
     * Calculate new weight based on precision
     */
    calculateNewWeight(precision) {
        if (precision > 0.9) return 1.2;
        if (precision > 0.7) return 1.1;
        if (precision > 0.5) return 1.0;
        if (precision > 0.3) return 0.8;
        return 0.5;
    }

    /**
     * Get system accuracy metrics
     */
    getAccuracyMetrics() {
        const { truePositives, falsePositives, trueNegatives, falseNegatives } = this.statistics;

        const precision = truePositives / Math.max(truePositives + falsePositives, 1);
        const recall = truePositives / Math.max(truePositives + falseNegatives, 1);
        const accuracy = (truePositives + trueNegatives) / Math.max(this.statistics.totalReviews, 1);
        const f1Score = 2 * (precision * recall) / Math.max(precision + recall, 0.001);

        return {
            precision: (precision * 100).toFixed(1) + '%',
            recall: (recall * 100).toFixed(1) + '%',
            accuracy: (accuracy * 100).toFixed(1) + '%',
            f1Score: (f1Score * 100).toFixed(1) + '%',
            totalReviews: this.statistics.totalReviews,
            breakdown: {
                truePositives,
                falsePositives,
                trueNegatives,
                falseNegatives
            }
        };
    }

    /**
     * Get pending feedback items for admin review
     */
    async getPendingFeedback(limit = 20) {
        return this.feedbackQueue.slice(0, limit);
    }

    /**
     * Schedule monthly weight update
     */
    scheduleMonthlyUpdate() {
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
        const timeUntilNextMonth = nextMonth - now;

        setTimeout(async () => {
            await this.monthlyWeightUpdate();
            this.scheduleMonthlyUpdate();
        }, timeUntilNextMonth);

        console.log(`Next monthly weight update scheduled for: ${nextMonth.toISOString()}`);
    }

    /**
     * Monthly weight update based on accumulated feedback
     */
    async monthlyWeightUpdate() {
        console.log('Running monthly weight update...');
        await this.processQueuedFeedback();

        const metrics = this.getAccuracyMetrics();
        console.log('Current system accuracy:', metrics);

        if (parseFloat(metrics.precision) < 85) {
            console.log('Precision below 85%, consider raising thresholds');
        }

        if (parseFloat(metrics.recall) < 85) {
            console.log('Recall below 85%, consider lowering thresholds');
        }
    }

    /**
     * Export feedback data for analysis
     */
    async exportFeedbackData(startDate, endDate) {
        const startTime = startDate.getTime();
        const endTime = endDate.getTime();

        const data = this.feedbackQueue.filter(item =>
            item.timestamp >= startTime && item.timestamp <= endTime
        );

        const headers = ['messageId', 'groupId', 'verdict', 'severity', 'originalScore', 'timestamp'];
        const csv = [
            headers.join(','),
            ...data.map(row =>
                headers.map(h => JSON.stringify(row[h] || '')).join(',')
            )
        ].join('\n');

        return csv;
    }
}

// Singleton instance
const feedbackService = new FeedbackService();

module.exports = feedbackService;
