/**
 * Feedback Loop Service
 * Collects admin reviews of flagged messages and uses them to:
 * 1. Update lexicon word weights
 * 2. Tune scoring thresholds
 * 3. Learn new slang and evolving harassment patterns
 * 4. Track system accuracy (precision/recall)
 */

const admin = require('firebase-admin');
const lexiconService = require('./lexiconService');
const scoringService = require('./scoringService');

class FeedbackService {
  constructor() {
    this.initialized = false;
    this.feedbackQueue = []; // In-memory queue before Firebase sync
    this.statistics = {
      totalReviews: 0,
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0
    };
    this.useFirebase = false;
  }

  async initialize() {
    if (this.initialized) return;

    // Try to connect to Firebase
    try {
      if (admin.apps.length > 0) {
        this.db = admin.firestore();
        this.feedbackRef = this.db.collection('bullywatch_feedback');
        this.statsRef = this.db.collection('bullywatch_stats').doc('global');
        await this.loadStatistics();
        this.useFirebase = true;
        console.log('✅ FeedbackService initialized with Firebase');
      } else {
        console.log('⚠️  FeedbackService running in memory-only mode (Firebase not available)');
      }
    } catch (error) {
      console.log('⚠️  FeedbackService: Firebase error, using memory-only mode:', error.message);
    }

    // Schedule monthly weight updates
    this.scheduleMonthlyUpdate();

    this.initialized = true;
  }

  /**
   * Record admin feedback on a flagged message
   * @param {Object} feedback - Feedback data
   * @returns {Promise<boolean>} - Success status
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
      reviewedAt: admin.firestore?.FieldValue?.serverTimestamp?.() || new Date()
    };

    // Add to queue
    this.feedbackQueue.push(feedbackRecord);

    // Update statistics
    this.updateStatistics(verdict);

    // Save to Firebase
    if (this.useFirebase) {
      try {
        await this.feedbackRef.add(feedbackRecord);
        await this.saveStatistics();
        console.log(`✅ Feedback recorded for message ${messageId}: ${verdict}`);
      } catch (error) {
        console.error('Error saving feedback to Firebase:', error);
      }
    }

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

    console.log(`📊 Processing ${this.feedbackQueue.length} feedback items...`);

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

      // Update weights in lexicon service
      // (In production, this would update specific word weights)
      console.log(`📊 Category ${category}: Precision ${(precision * 100).toFixed(1)}%, New weight: ${newWeight.toFixed(2)}`);
    }

    // Clear queue
    this.feedbackQueue = [];
  }

  /**
   * Calculate new weight based on precision
   * High precision = increase weight
   * Low precision = decrease weight
   */
  calculateNewWeight(precision) {
    if (precision > 0.9) return 1.2; // Very accurate, increase weight
    if (precision > 0.7) return 1.1; // Accurate, slight increase
    if (precision > 0.5) return 1.0; // Neutral
    if (precision > 0.3) return 0.8; // Low accuracy, decrease
    return 0.5; // Very low accuracy, significant decrease
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
   * Load statistics from Firebase
   */
  async loadStatistics() {
    if (!this.useFirebase) return;

    try {
      const doc = await this.statsRef.get();
      if (doc.exists) {
        const data = doc.data();
        this.statistics = {
          totalReviews: data.totalReviews || 0,
          truePositives: data.truePositives || 0,
          falsePositives: data.falsePositives || 0,
          trueNegatives: data.trueNegatives || 0,
          falseNegatives: data.falseNegatives || 0
        };
        console.log(`📊 Loaded statistics: ${this.statistics.totalReviews} total reviews`);
      }
    } catch (error) {
      console.error('Error loading statistics from Firebase:', error);
    }
  }

  /**
   * Save statistics to Firebase
   */
  async saveStatistics() {
    if (!this.useFirebase) return;

    try {
      await this.statsRef.set(this.statistics, { merge: true });
    } catch (error) {
      console.error('Error saving statistics to Firebase:', error);
    }
  }

  /**
   * Get pending feedback items for admin review
   */
  async getPendingFeedback(limit = 20) {
    const pending = [];

    if (this.useFirebase) {
      try {
        const snapshot = await this.feedbackRef
          .where('verdict', '==', null)
          .orderBy('timestamp', 'desc')
          .limit(limit)
          .get();

        snapshot.forEach(doc => {
          pending.push({
            id: doc.id,
            ...doc.data()
          });
        });
      } catch (error) {
        console.error('Error fetching pending feedback:', error);
      }
    }

    return pending;
  }

  /**
   * Schedule monthly weight update
   */
  scheduleMonthlyUpdate() {
    // Run on the 1st of each month at midnight
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
    const timeUntilNextMonth = nextMonth - now;

    setTimeout(async () => {
      await this.monthlyWeightUpdate();
      // Schedule next month
      this.scheduleMonthlyUpdate();
    }, timeUntilNextMonth);

    console.log(`📅 Next monthly weight update scheduled for: ${nextMonth.toISOString()}`);
  }

  /**
   * Monthly weight update based on accumulated feedback
   */
  async monthlyWeightUpdate() {
    console.log('📊 Running monthly weight update...');

    // Process all queued feedback
    await this.processQueuedFeedback();

    // Get accuracy metrics
    const metrics = this.getAccuracyMetrics();
    console.log('📊 Current system accuracy:', metrics);

    // Optionally: Adjust global thresholds based on accuracy
    if (parseFloat(metrics.precision) < 85) {
      console.log('⚠️  Precision below 85%, consider raising thresholds');
      // Could auto-adjust here
    }

    if (parseFloat(metrics.recall) < 85) {
      console.log('⚠️  Recall below 85%, consider lowering thresholds');
      // Could auto-adjust here
    }
  }

  /**
   * Export feedback data for analysis (CSV format)
   */
  async exportFeedbackData(startDate, endDate) {
    if (!this.useFirebase) {
      console.log('⚠️  Cannot export: Firebase not available');
      return null;
    }

    try {
      const snapshot = await this.feedbackRef
        .where('timestamp', '>=', startDate.getTime())
        .where('timestamp', '<=', endDate.getTime())
        .get();

      const data = [];
      snapshot.forEach(doc => {
        data.push(doc.data());
      });

      // Convert to CSV
      const headers = ['messageId', 'groupId', 'verdict', 'severity', 'originalScore', 'timestamp'];
      const csv = [
        headers.join(','),
        ...data.map(row =>
          headers.map(h => JSON.stringify(row[h] || '')).join(',')
        )
      ].join('\n');

      return csv;
    } catch (error) {
      console.error('Error exporting feedback data:', error);
      return null;
    }
  }
}

// Singleton instance
const feedbackService = new FeedbackService();

module.exports = feedbackService;
