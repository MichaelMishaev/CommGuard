/**
 * Nano Logging Service
 * Logs all GPT-5-nano decisions to database for training and analysis
 *
 * Purpose:
 * 1. Create training dataset for future own-model development
 * 2. Analyze nano accuracy vs. actual outcomes (after admin review)
 * 3. Identify patterns nano misses (false negatives/positives)
 * 4. Continuous improvement through feedback loop
 *
 * Data Stored:
 * - Message hash (for privacy - not full text)
 * - Nano verdict + confidence
 * - Actual outcome (from admin feedback)
 * - Timestamp, group ID, sender hash
 * - Final score (from lexicon/scoring if applicable)
 */

const crypto = require('crypto');

class NanoLoggingService {
  constructor() {
    this.initialized = false;
    this.db = null;
    this.redis = null;
    this.useFirebase = false;
    this.useRedis = false;

    // In-memory fallback (if DB unavailable)
    this.memoryLog = [];
    this.maxMemoryEntries = 10000;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Try Firebase first
      try {
        const admin = require('firebase-admin');
        if (admin.apps.length > 0) {
          this.db = admin.firestore();
          this.useFirebase = true;
          console.log('✅ NanoLoggingService using Firebase');
        }
      } catch (fbError) {
        console.log('⚠️  Firebase not available for nano logging');
      }

      // Try Redis as backup
      if (!this.useFirebase) {
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
          console.log('⚠️  Redis not available for nano logging');
        }
      }

      // Fallback to memory
      if (!this.useFirebase && !this.useRedis) {
        console.log('⚠️  NanoLoggingService using in-memory storage (not persistent)');
      }

      this.initialized = true;
    } catch (error) {
      console.error('Error initializing NanoLoggingService:', error);
      this.initialized = true; // Initialize anyway with memory fallback
    }
  }

  /**
   * Log nano decision (async, non-blocking)
   * @param {Object} logEntry - Nano decision details
   */
  async logDecision(logEntry) {
    if (!this.initialized) {
      console.warn('NanoLoggingService not initialized, skipping log');
      return;
    }

    try {
      // Create log entry with privacy considerations
      const entry = this.createLogEntry(logEntry);

      // Async write (non-blocking)
      // Use setImmediate to avoid blocking message processing
      setImmediate(async () => {
        try {
          if (this.useFirebase) {
            await this.logToFirebase(entry);
          } else if (this.useRedis) {
            await this.logToRedis(entry);
          } else {
            this.logToMemory(entry);
          }
        } catch (error) {
          console.error('Error logging nano decision:', error);
          // Fallback to memory on error
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
      // Privacy: Hash instead of full text
      messageHash: this.hashText(messageText),
      messageLength: messageText ? messageText.length : 0,
      messagePreview: messageText ? messageText.substring(0, 20) + '...' : '', // First 20 chars only

      // Hashed identifiers
      senderHash: this.hashText(sender),
      groupHash: this.hashText(groupId),

      // Nano decision
      nanoVerdict: nanoVerdict,
      nanoConfidence: nanoConfidence,
      nanoReason: nanoReason,
      nanoCategories: nanoCategories || [],

      // Actual outcome (from scoring layers)
      finalScore: finalScore || null,
      finalSeverity: finalSeverity || null,
      finalAction: finalAction || null,

      // FULL AI REQUEST/RESPONSE (for training)
      aiRequest: aiRequest || null,
      aiResponse: aiResponse || null,

      // Metadata
      timestamp: Date.now(),
      date: new Date().toISOString(),
      processingTimeMs: processingTimeMs || 0,

      // For future training
      humanReview: null, // Will be updated after admin feedback
      actuallyHarmful: null, // true/false after review
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
   * Log to Firebase
   */
  async logToFirebase(entry) {
    try {
      const collection = this.db.collection('nano_decisions');
      await collection.add(entry);
    } catch (error) {
      console.error('Error writing to Firebase:', error);
      throw error;
    }
  }

  /**
   * Log to Redis (as sorted set for time-based queries)
   */
  async logToRedis(entry) {
    try {
      const key = 'nano_decisions';
      const score = entry.timestamp;
      const value = JSON.stringify(entry);

      // Add to sorted set (sorted by timestamp)
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

    // Keep only last N entries
    if (this.memoryLog.length > this.maxMemoryEntries) {
      this.memoryLog.shift();
    }
  }

  /**
   * Update entry with human review feedback
   * @param {string} messageHash - Hash of the message
   * @param {Object} feedback - Admin feedback
   */
  async updateWithFeedback(messageHash, feedback) {
    if (!this.initialized) return;

    const update = {
      humanReview: feedback.verdict, // 'safe' | 'harmful' | 'ambiguous'
      actuallyHarmful: feedback.verdict === 'harmful',
      notes: feedback.notes || null,
      reviewedAt: Date.now(),
      reviewedBy: feedback.adminId || null
    };

    try {
      if (this.useFirebase) {
        const collection = this.db.collection('nano_decisions');
        const snapshot = await collection.where('messageHash', '==', messageHash).get();

        snapshot.forEach(async (doc) => {
          await doc.ref.update(update);
        });
      } else if (this.useRedis) {
        // For Redis, we need to update the JSON in sorted set
        const key = 'nano_decisions';
        const entries = await this.redis.zrange(key, 0, -1);

        for (const entryStr of entries) {
          const entry = JSON.parse(entryStr);
          if (entry.messageHash === messageHash) {
            const updated = { ...entry, ...update };

            // Remove old, add updated
            await this.redis.zrem(key, entryStr);
            await this.redis.zadd(key, entry.timestamp, JSON.stringify(updated));
          }
        }
      } else {
        // Memory fallback
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
      if (this.useFirebase) {
        const collection = this.db.collection('nano_decisions');
        const snapshot = await collection.where('timestamp', '>', since).get();
        entries = snapshot.docs.map(doc => doc.data());
      } else if (this.useRedis) {
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

      // Nano verdicts
      safe: entries.filter(e => e.nanoVerdict === 'safe').length,
      harmful: entries.filter(e => e.nanoVerdict === 'harmful').length,
      ambiguous: entries.filter(e => e.nanoVerdict === 'ambiguous').length,

      // Accuracy (if human review available)
      reviewed: entries.filter(e => e.humanReview !== null).length,
      truePositives: 0,  // Nano said harmful, actually harmful
      falsePositives: 0, // Nano said harmful, actually safe
      trueNegatives: 0,  // Nano said safe, actually safe
      falseNegatives: 0, // Nano said safe, actually harmful

      // Performance
      avgConfidence: 0,
      avgProcessingTime: 0
    };

    // Calculate accuracy metrics
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

    // Calculate accuracy percentage
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
   * @param {number} limit - Max entries to export
   * @returns {Array} - Training examples in format for ML
   */
  async exportTrainingData(limit = 10000) {
    if (!this.initialized) return [];

    try {
      let entries = [];

      if (this.useFirebase) {
        const collection = this.db.collection('nano_decisions');
        const snapshot = await collection
          .where('humanReview', '!=', null) // Only reviewed entries
          .limit(limit)
          .get();
        entries = snapshot.docs.map(doc => doc.data());
      } else if (this.useRedis) {
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

      // Convert to ML training format
      return entries.map(e => ({
        // Features (input)
        messagePreview: e.messagePreview,
        messageLength: e.messageLength,
        nanoVerdict: e.nanoVerdict,
        nanoConfidence: e.nanoConfidence,
        nanoCategories: e.nanoCategories,

        // Label (output) - ground truth from human review
        label: e.actuallyHarmful ? 'harmful' : 'safe',

        // Metadata
        timestamp: e.timestamp,
        notes: e.notes
      }));

    } catch (error) {
      console.error('Error exporting training data:', error);
      return [];
    }
  }

  /**
   * Get entries for manual review (nano said safe, but scoring flagged)
   */
  async getPotentialFalseNegatives(limit = 100) {
    if (!this.initialized) return [];

    try {
      let entries = [];

      if (this.useFirebase) {
        const collection = this.db.collection('nano_decisions');
        const snapshot = await collection
          .where('nanoVerdict', '==', 'safe')
          .where('finalScore', '>', 10) // But scoring flagged it
          .limit(limit)
          .get();
        entries = snapshot.docs.map(doc => doc.data());
      } else if (this.useRedis) {
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
}

// Singleton instance
const nanoLoggingService = new NanoLoggingService();

module.exports = nanoLoggingService;
