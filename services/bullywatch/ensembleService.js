/**
 * Ensemble Service - Multi-Model Voting for Bullying Detection
 *
 * Runs GPT-5-nano and Sentiment Analysis Service in parallel, uses voting logic
 * to determine consensus. Escalates to GPT-5-mini on disagreement.
 *
 * Benefits:
 * - 5-10% reduction in false negatives
 * - Cost: +$3/month (sentiment API calls)
 * - Speed: Same (parallel execution)
 * - Accuracy: Higher confidence in verdicts
 *
 * Redis Storage:
 * - Disagreements: Redis list (ensemble:disagreements) with TTL
 * - Lexicon suggestions: Redis sorted set (ensemble:lexicon_suggestions)
 * - Feedback: Redis hash (ensemble:feedback:{id})
 */

const nanoPreFilterService = require('./nanoPreFilterService');
const sentimentAnalysisService = require('../sentimentAnalysisService');
const nanoLoggingService = require('./nanoLoggingService');
const { getTimestamp } = require('../../utils/logger');

// Redis keys
const REDIS_KEYS = {
  DISAGREEMENTS: 'ensemble:disagreements',
  LEXICON_SUGGESTIONS: 'ensemble:lexicon_suggestions',
  FEEDBACK: 'ensemble:feedback', // Hash prefix
  STATS: 'ensemble:stats'
};

// TTL configurations
const TTL = {
  DISAGREEMENT_LOG: 7 * 24 * 60 * 60,  // 7 days
  FEEDBACK: 30 * 24 * 60 * 60,         // 30 days
  STATS: 24 * 60 * 60                  // 24 hours
};

class EnsembleService {
  constructor() {
    this.initialized = false;
    this.redisAvailable = false;

    // In-memory fallback stats (always available)
    this.memoryStats = {
      totalCalls: 0,
      bothAgree: 0,
      disagreements: 0,
      escalatedToMini: 0,
      consensusSafe: 0,
      consensusHarmful: 0
    };
  }

  /**
   * Get Redis client (with graceful fallback)
   */
  getRedis() {
    try {
      const { getRedis, isRedisConnected } = require('../redisService');
      if (isRedisConnected()) {
        this.redisAvailable = true;
        return getRedis();
      }
    } catch (error) {
      // Redis not available, use memory-only mode
    }
    this.redisAvailable = false;
    return null;
  }

  async initialize() {
    if (this.initialized) return;

    // Initialize both services
    await nanoPreFilterService.initialize();
    // sentimentAnalysisService initializes on first use

    // Test Redis connection
    const redis = this.getRedis();
    if (redis) {
      console.log(`[${getTimestamp()}] ✅ EnsembleService initialized (Multi-Model Voting + Redis)`);

      // Load stats from Redis if available
      await this.loadStatsFromRedis();
    } else {
      console.log(`[${getTimestamp()}] ⚠️  EnsembleService initialized (Memory-only mode - Redis unavailable)`);
    }

    this.initialized = true;
  }

  /**
   * Load statistics from Redis
   */
  async loadStatsFromRedis() {
    try {
      const redis = this.getRedis();
      if (!redis) return;

      const statsData = await redis.hgetall(REDIS_KEYS.STATS);

      if (statsData && Object.keys(statsData).length > 0) {
        this.memoryStats = {
          totalCalls: parseInt(statsData.totalCalls) || 0,
          bothAgree: parseInt(statsData.bothAgree) || 0,
          disagreements: parseInt(statsData.disagreements) || 0,
          escalatedToMini: parseInt(statsData.escalatedToMini) || 0,
          consensusSafe: parseInt(statsData.consensusSafe) || 0,
          consensusHarmful: parseInt(statsData.consensusHarmful) || 0
        };
        console.log(`[${getTimestamp()}] 📥 Loaded ensemble stats from Redis`);
      }
    } catch (error) {
      console.error(`[${getTimestamp()}] ⚠️  Failed to load stats from Redis:`, error.message);
    }
  }

  /**
   * Save statistics to Redis (atomic)
   */
  async saveStatsToRedis() {
    try {
      const redis = this.getRedis();
      if (!redis) return;

      await redis.hmset(REDIS_KEYS.STATS, {
        totalCalls: this.memoryStats.totalCalls,
        bothAgree: this.memoryStats.bothAgree,
        disagreements: this.memoryStats.disagreements,
        escalatedToMini: this.memoryStats.escalatedToMini,
        consensusSafe: this.memoryStats.consensusSafe,
        consensusHarmful: this.memoryStats.consensusHarmful,
        lastUpdated: new Date().toISOString()
      });

      // Set TTL
      await redis.expire(REDIS_KEYS.STATS, TTL.STATS);
    } catch (error) {
      console.error(`[${getTimestamp()}] ⚠️  Failed to save stats to Redis:`, error.message);
    }
  }

  /**
   * Run nano + sentiment in parallel, return consensus verdict
   * @param {Object} message - Message object with text, sender, etc.
   * @param {string} groupId - Group ID for context
   * @returns {Object} - Consensus result with voting details
   */
  async parallelClassify(message, groupId) {
    if (!this.initialized) await this.initialize();

    const startTime = Date.now();
    const messageText = message.text || message.body || '';

    // Run both models in PARALLEL
    const [nanoResult, sentimentResult] = await Promise.all([
      nanoPreFilterService.quickCheck(message, groupId),
      this.callSentimentSafely(messageText)
    ]);

    const processingTime = Date.now() - startTime;

    // Update stats (memory + Redis)
    this.memoryStats.totalCalls++;
    await this.incrementStat('totalCalls');

    // Convert sentiment result to standardized verdict
    const nanoVerdict = nanoResult.verdict; // 'safe' | 'harmful' | 'ambiguous'
    const sentimentVerdict = this.parseSentimentVerdict(sentimentResult);

    // Voting Logic:
    // 1. Both agree "safe" → SAFE (skip heavy scoring)
    // 2. Both agree "harmful" → HARMFUL (continue to scoring)
    // 3. DISAGREEMENT → ESCALATE to GPT-5-mini
    // 4. Either "ambiguous" → CONTINUE to scoring layers

    // Case 1: Both models agree it's SAFE
    if (nanoVerdict === 'safe' && sentimentVerdict === 'safe') {
      this.memoryStats.bothAgree++;
      this.memoryStats.consensusSafe++;
      await this.incrementStat('bothAgree');
      await this.incrementStat('consensusSafe');

      return {
        consensus: 'safe',
        confidence: Math.min(nanoResult.confidence || 0.9, sentimentResult.confidence || 0.9),
        shouldEscalateToMini: false,
        shouldSkipScoring: true, // Both say safe → skip scoring
        votes: {
          nano: { verdict: 'safe', confidence: nanoResult.confidence },
          sentiment: { verdict: 'safe', confidence: sentimentResult.confidence }
        },
        reason: 'Both models agree: safe',
        processingTime
      };
    }

    // Case 2: Both models agree it's HARMFUL
    if (nanoVerdict === 'harmful' && sentimentVerdict === 'harmful') {
      this.memoryStats.bothAgree++;
      this.memoryStats.consensusHarmful++;
      await this.incrementStat('bothAgree');
      await this.incrementStat('consensusHarmful');

      return {
        consensus: 'harmful',
        confidence: Math.max(nanoResult.confidence || 0.7, sentimentResult.confidence || 0.7),
        shouldEscalateToMini: false,
        shouldSkipScoring: false, // Continue to scoring layers
        votes: {
          nano: { verdict: 'harmful', confidence: nanoResult.confidence },
          sentiment: { verdict: 'harmful', confidence: sentimentResult.confidence }
        },
        reason: 'Both models agree: harmful',
        processingTime
      };
    }

    // Case 3: DISAGREEMENT → Escalate to GPT-5-mini for tiebreaker
    if (nanoVerdict !== sentimentVerdict &&
        nanoVerdict !== 'ambiguous' &&
        sentimentVerdict !== 'ambiguous') {
      this.memoryStats.disagreements++;
      this.memoryStats.escalatedToMini++;
      await this.incrementStat('disagreements');
      await this.incrementStat('escalatedToMini');

      // Log the disagreement (for training data analysis)
      await this.logDisagreement(messageText, nanoResult, sentimentResult, groupId);

      return {
        consensus: 'ambiguous',
        confidence: 0.5,
        shouldEscalateToMini: true, // KEY: Trigger GPT-5-mini
        shouldSkipScoring: false,
        votes: {
          nano: { verdict: nanoVerdict, confidence: nanoResult.confidence },
          sentiment: { verdict: sentimentVerdict, confidence: sentimentResult.confidence }
        },
        reason: `Model disagreement - nano: ${nanoVerdict}, sentiment: ${sentimentVerdict}`,
        processingTime
      };
    }

    // Case 4: At least one model says "ambiguous" → Continue to scoring
    return {
      consensus: nanoVerdict === 'ambiguous' ? sentimentVerdict : nanoVerdict,
      confidence: 0.6,
      shouldEscalateToMini: false,
      shouldSkipScoring: false, // Continue to scoring layers
      votes: {
        nano: { verdict: nanoVerdict, confidence: nanoResult.confidence },
        sentiment: { verdict: sentimentVerdict, confidence: sentimentResult.confidence }
      },
      reason: 'One model ambiguous - continue to scoring',
      processingTime
    };
  }

  /**
   * Increment a stat atomically in Redis
   */
  async incrementStat(statName) {
    try {
      const redis = this.getRedis();
      if (!redis) return;

      await redis.hincrby(REDIS_KEYS.STATS, statName, 1);
    } catch (error) {
      // Silent fail - stats are not critical
    }
  }

  /**
   * Call sentiment analysis service with error handling
   */
  async callSentimentSafely(messageText) {
    try {
      const result = await sentimentAnalysisService.analyzeMessage(messageText);
      return {
        isBullying: result.isBullying || false,
        confidence: result.confidence || 0.5,
        categories: result.categories || [],
        raw: result
      };
    } catch (error) {
      console.error('⚠️  Sentiment analysis failed, falling back:', error.message);
      // Graceful fallback: Return ambiguous verdict
      return {
        isBullying: null,
        confidence: 0,
        categories: [],
        error: error.message
      };
    }
  }

  /**
   * Parse sentiment result to standardized verdict
   */
  parseSentimentVerdict(sentimentResult) {
    if (sentimentResult.error) {
      return 'ambiguous'; // Error → treat as uncertain
    }

    if (sentimentResult.isBullying === null) {
      return 'ambiguous';
    }

    if (sentimentResult.isBullying === true) {
      return 'harmful';
    }

    // isBullying === false
    return 'safe';
  }

  /**
   * Log disagreements for training data analysis
   * Stores in Redis list (LPUSH with TTL) + in-memory logging service
   */
  async logDisagreement(messageText, nanoResult, sentimentResult, groupId) {
    const disagreementLog = {
      messagePreview: messageText.substring(0, 50),
      messageHash: this.hashText(messageText),
      groupId: groupId,
      nanoVerdict: nanoResult.verdict,
      nanoConfidence: nanoResult.confidence,
      nanoReason: nanoResult.reason,
      sentimentVerdict: this.parseSentimentVerdict(sentimentResult),
      sentimentConfidence: sentimentResult.confidence,
      sentimentCategories: sentimentResult.categories,
      timestamp: Date.now()
    };

    // Store in Redis list (for later analysis)
    try {
      const redis = this.getRedis();
      if (redis) {
        const logEntry = JSON.stringify(disagreementLog);

        // LPUSH to prepend (newest first)
        await redis.lpush(REDIS_KEYS.DISAGREEMENTS, logEntry);

        // Trim to last 1000 entries (prevent unbounded growth)
        await redis.ltrim(REDIS_KEYS.DISAGREEMENTS, 0, 999);

        // Set TTL on list (refresh on each write)
        await redis.expire(REDIS_KEYS.DISAGREEMENTS, TTL.DISAGREEMENT_LOG);
      }
    } catch (error) {
      console.error(`[${getTimestamp()}] ⚠️  Failed to log disagreement to Redis:`, error.message);
    }

    // Also log to nano logging service (already has logging infrastructure)
    await nanoLoggingService.logDecision({
      messageText: messageText,
      sender: 'ensemble-disagreement',
      groupId: groupId,
      nanoVerdict: nanoResult.verdict,
      nanoConfidence: nanoResult.confidence,
      nanoReason: `DISAGREEMENT: ${JSON.stringify(disagreementLog)}`,
      nanoCategories: [],
      finalScore: null,
      finalSeverity: 'ESCALATED_TO_MINI',
      finalAction: 'escalate',
      processingTimeMs: 0
    });
  }

  /**
   * Get recent disagreements from Redis
   * @param {number} limit - Number of recent disagreements to fetch
   * @returns {Array} Array of disagreement logs
   */
  async getRecentDisagreements(limit = 50) {
    try {
      const redis = this.getRedis();
      if (!redis) {
        return { available: false, reason: 'Redis not available' };
      }

      // Get recent disagreements (0 = newest, -1 = oldest)
      const logs = await redis.lrange(REDIS_KEYS.DISAGREEMENTS, 0, limit - 1);

      const parsed = logs.map(log => {
        try {
          return JSON.parse(log);
        } catch (e) {
          return null;
        }
      }).filter(log => log !== null);

      return {
        available: true,
        count: parsed.length,
        logs: parsed
      };
    } catch (error) {
      console.error(`[${getTimestamp()}] ⚠️  Failed to fetch disagreements:`, error.message);
      return { available: false, reason: error.message };
    }
  }

  /**
   * Add lexicon suggestion based on disagreement patterns
   * Uses Redis sorted set (score = confidence/priority)
   */
  async addLexiconSuggestion(word, score, reason) {
    try {
      const redis = this.getRedis();
      if (!redis) return;

      const suggestion = {
        word: word,
        score: score,
        reason: reason,
        addedAt: Date.now()
      };

      const suggestionKey = `${word}:${this.hashText(reason)}`;
      const suggestionValue = JSON.stringify(suggestion);

      // Add to sorted set (score = priority)
      await redis.zadd(REDIS_KEYS.LEXICON_SUGGESTIONS, score, suggestionValue);

      console.log(`[${getTimestamp()}] 📝 Added lexicon suggestion: "${word}" (score: ${score})`);
    } catch (error) {
      console.error(`[${getTimestamp()}] ⚠️  Failed to add lexicon suggestion:`, error.message);
    }
  }

  /**
   * Get top lexicon suggestions from Redis sorted set
   * @param {number} limit - Number of suggestions to fetch
   * @returns {Array} Top suggestions sorted by score
   */
  async getTopLexiconSuggestions(limit = 20) {
    try {
      const redis = this.getRedis();
      if (!redis) {
        return { available: false, reason: 'Redis not available' };
      }

      // Get highest scoring suggestions (ZREVRANGE = descending order)
      const suggestions = await redis.zrevrange(
        REDIS_KEYS.LEXICON_SUGGESTIONS,
        0,
        limit - 1,
        'WITHSCORES'
      );

      // Parse results (alternating: value, score, value, score...)
      const parsed = [];
      for (let i = 0; i < suggestions.length; i += 2) {
        try {
          const data = JSON.parse(suggestions[i]);
          const score = parseFloat(suggestions[i + 1]);
          parsed.push({ ...data, score });
        } catch (e) {
          // Skip malformed entries
        }
      }

      return {
        available: true,
        count: parsed.length,
        suggestions: parsed
      };
    } catch (error) {
      console.error(`[${getTimestamp()}] ⚠️  Failed to fetch lexicon suggestions:`, error.message);
      return { available: false, reason: error.message };
    }
  }

  /**
   * Store feedback for a disagreement case
   * Uses Redis hash with TTL
   */
  async storeFeedback(messageHash, feedback) {
    try {
      const redis = this.getRedis();
      if (!redis) return;

      const feedbackKey = `${REDIS_KEYS.FEEDBACK}:${messageHash}`;

      const feedbackData = {
        messageHash: messageHash,
        verdict: feedback.verdict, // 'true_positive' | 'false_positive' | 'uncertain'
        severity: feedback.severity, // 'low' | 'medium' | 'high'
        notes: feedback.notes || '',
        reviewedBy: feedback.reviewedBy || 'admin',
        reviewedAt: Date.now()
      };

      // Store as hash
      await redis.hmset(feedbackKey, feedbackData);

      // Set TTL
      await redis.expire(feedbackKey, TTL.FEEDBACK);

      console.log(`[${getTimestamp()}] 📋 Stored feedback for message: ${messageHash}`);
    } catch (error) {
      console.error(`[${getTimestamp()}] ⚠️  Failed to store feedback:`, error.message);
    }
  }

  /**
   * Get feedback for a specific message
   */
  async getFeedback(messageHash) {
    try {
      const redis = this.getRedis();
      if (!redis) {
        return { available: false, reason: 'Redis not available' };
      }

      const feedbackKey = `${REDIS_KEYS.FEEDBACK}:${messageHash}`;
      const feedback = await redis.hgetall(feedbackKey);

      if (!feedback || Object.keys(feedback).length === 0) {
        return { available: true, found: false };
      }

      return {
        available: true,
        found: true,
        feedback: feedback
      };
    } catch (error) {
      console.error(`[${getTimestamp()}] ⚠️  Failed to get feedback:`, error.message);
      return { available: false, reason: error.message };
    }
  }

  /**
   * Hash text for privacy (same as nanoLoggingService)
   */
  hashText(text) {
    const crypto = require('crypto');
    if (!text) return null;
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
  }

  /**
   * Get ensemble statistics (from memory)
   */
  getStats() {
    const total = this.memoryStats.totalCalls;

    return {
      totalCalls: total,
      bothAgree: this.memoryStats.bothAgree,
      disagreements: this.memoryStats.disagreements,
      escalatedToMini: this.memoryStats.escalatedToMini,
      consensusSafe: this.memoryStats.consensusSafe,
      consensusHarmful: this.memoryStats.consensusHarmful,
      percentages: {
        agreement: total > 0 ? (this.memoryStats.bothAgree / total * 100).toFixed(1) + '%' : '0%',
        disagreement: total > 0 ? (this.memoryStats.disagreements / total * 100).toFixed(1) + '%' : '0%',
        escalationRate: total > 0 ? (this.memoryStats.escalatedToMini / total * 100).toFixed(1) + '%' : '0%'
      },
      expectedDisagreementRate: '5-15% (healthy range)',
      currentHealth: this.assessHealth(),
      redisAvailable: this.redisAvailable
    };
  }

  /**
   * Assess health of ensemble system
   */
  assessHealth() {
    const disagreementRate = this.memoryStats.totalCalls > 0
      ? (this.memoryStats.disagreements / this.memoryStats.totalCalls * 100)
      : 0;

    if (disagreementRate < 5) {
      return {
        status: 'excellent',
        message: 'Models are highly aligned'
      };
    } else if (disagreementRate >= 5 && disagreementRate <= 15) {
      return {
        status: 'healthy',
        message: 'Normal disagreement rate, ensemble working as expected'
      };
    } else if (disagreementRate > 15 && disagreementRate <= 30) {
      return {
        status: 'warning',
        message: 'Higher than expected disagreement - consider prompt tuning'
      };
    } else {
      return {
        status: 'critical',
        message: 'Very high disagreement - one model may be misconfigured'
      };
    }
  }

  /**
   * Reset statistics (for testing/monitoring)
   * Clears both memory and Redis
   */
  async resetStats() {
    this.memoryStats = {
      totalCalls: 0,
      bothAgree: 0,
      disagreements: 0,
      escalatedToMini: 0,
      consensusSafe: 0,
      consensusHarmful: 0
    };

    // Clear Redis stats
    try {
      const redis = this.getRedis();
      if (redis) {
        await redis.del(REDIS_KEYS.STATS);
        console.log(`[${getTimestamp()}] 📊 Ensemble stats reset (memory + Redis)`);
      } else {
        console.log(`[${getTimestamp()}] 📊 Ensemble stats reset (memory only)`);
      }
    } catch (error) {
      console.error(`[${getTimestamp()}] ⚠️  Failed to reset Redis stats:`, error.message);
    }
  }

  /**
   * Clear all disagreement logs (useful for testing)
   */
  async clearDisagreements() {
    try {
      const redis = this.getRedis();
      if (!redis) {
        return { success: false, reason: 'Redis not available' };
      }

      await redis.del(REDIS_KEYS.DISAGREEMENTS);
      console.log(`[${getTimestamp()}] 🗑️  Cleared all disagreement logs`);

      return { success: true };
    } catch (error) {
      console.error(`[${getTimestamp()}] ⚠️  Failed to clear disagreements:`, error.message);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Clear all lexicon suggestions
   */
  async clearLexiconSuggestions() {
    try {
      const redis = this.getRedis();
      if (!redis) {
        return { success: false, reason: 'Redis not available' };
      }

      await redis.del(REDIS_KEYS.LEXICON_SUGGESTIONS);
      console.log(`[${getTimestamp()}] 🗑️  Cleared all lexicon suggestions`);

      return { success: true };
    } catch (error) {
      console.error(`[${getTimestamp()}] ⚠️  Failed to clear suggestions:`, error.message);
      return { success: false, reason: error.message };
    }
  }
}

// Singleton instance
const ensembleService = new EnsembleService();

module.exports = ensembleService;
