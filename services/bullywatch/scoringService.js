/**
 * Scoring Service (Layer 3)
 * Context-aware scoring that combines lexicon + temporal analysis
 * Applies scoring rules and determines action thresholds
 */

const lexiconService = require('./lexiconService');
const temporalAnalysisService = require('./temporalAnalysisService');
const groupWhitelistService = require('./groupWhitelistService');

class ScoringService {
  constructor() {
    this.initialized = false;
    this.thresholds = {
      SAFE: 4,
      MONITOR: 10,
      ALERT: 15,
      HIGH_RISK: 16
    };
  }

  async initialize() {
    if (this.initialized) return;

    await lexiconService.initialize();
    await temporalAnalysisService.initialize();
    await groupWhitelistService.initialize();

    this.initialized = true;
    console.log('✅ ScoringService initialized');
  }

  /**
   * Main scoring method - analyzes message and returns comprehensive score
   * @param {Object} message - WhatsApp message object
   * @param {string} groupId - Group ID
   * @param {Object} metadata - Additional context (groupSize, etc.)
   * @returns {Object} - Complete scoring results
   */
  async scoreMessage(message, groupId, metadata = {}) {
    const messageText = message.text || message.caption || '';
    if (!messageText) {
      return this.createEmptyScore();
    }

    // Layer 1: Lexicon detection
    const lexiconResult = lexiconService.detect(messageText);
    let baseScore = lexiconResult.baseScore;

    // Layer 2: Temporal analysis
    const temporalResult = temporalAnalysisService.analyzeMessage(
      message,
      groupId,
      baseScore
    );

    // Combine base + temporal
    let totalScore = baseScore + temporalResult.temporalScore;

    // Apply context modifiers
    totalScore += this.analyzePersonalAddress(messageText);
    totalScore += this.analyzeViolentVerbs(messageText);
    totalScore += this.analyzeExclusionLanguage(messageText);
    totalScore += this.analyzeMockingEmojis(messageText);

    // Check for friend group whitelist (reduces score)
    const whitelistMultiplier = await groupWhitelistService.getScoreMultiplier(
      groupId,
      metadata.groupSize || 0
    );
    totalScore *= whitelistMultiplier;

    // Determine severity level
    const severity = this.determineSeverity(totalScore);

    // Determine required action
    const action = this.determineAction(totalScore, severity);

    return {
      totalScore: Math.round(totalScore),
      severity,
      action,
      breakdown: {
        lexicon: baseScore,
        temporal: temporalResult.temporalScore,
        contextModifiers: totalScore - baseScore - temporalResult.temporalScore,
        whitelistMultiplier
      },
      details: {
        lexiconHits: lexiconResult.hits,
        categories: lexiconResult.categories,
        temporalPatterns: temporalResult.breakdown,
        recentPatterns: temporalResult.patterns
      },
      metadata: {
        groupId,
        messageId: message.id,
        sender: message.sender,
        timestamp: Date.now()
      }
    };
  }

  /**
   * Context Modifier: Personal Address
   * +2 if message directly addresses someone (אתה/את/יא...)
   */
  analyzePersonalAddress(text) {
    const addressPatterns = [
      /\bאתה\b/,
      /\bאת\b/,
      /\bיא\b/,
      /\bהוא\b/,
      /\bהיא\b/,
      /@\d+/, // WhatsApp mention
    ];

    for (const pattern of addressPatterns) {
      if (pattern.test(text)) {
        return 2;
      }
    }

    return 0;
  }

  /**
   * Context Modifier: Violent Verbs
   * +2 for violent action verbs
   */
  analyzeViolentVerbs(text) {
    const violentVerbs = [
      /להרביץ/,
      /לשבור/,
      /להרוג/,
      /למחוק/,
      /לפרק/,
      /לאזוב/,
      /להכות/,
      /לדפוק/,
    ];

    let score = 0;
    for (const verb of violentVerbs) {
      if (verb.test(text)) {
        score += 2;
        break; // Only count once
      }
    }

    return score;
  }

  /**
   * Context Modifier: Exclusion Language
   * +3 for group exclusion patterns (כולם/אף אחד/מי ש...)
   */
  analyzeExclusionLanguage(text) {
    const exclusionPatterns = [
      /כולם(?:\s+(?:נגד|לא|שונאים))/,
      /אף אחד(?:\s+(?:לא|שונא))/,
      /מי ש(?:מדבר|מתקרב|עוזר)/,
      /תעיפו|תוציאו/,
    ];

    for (const pattern of exclusionPatterns) {
      if (pattern.test(text)) {
        return 3;
      }
    }

    return 0;
  }

  /**
   * Context Modifier: Mocking Emoji Count
   * +1 if 3+ mocking emojis detected
   */
  analyzeMockingEmojis(text) {
    const mockingEmojis = ['🤡', '💀', '🙄', '😭', '🤏'];
    let count = 0;

    for (const emoji of mockingEmojis) {
      const matches = text.match(new RegExp(emoji, 'g'));
      if (matches) {
        count += matches.length;
      }
    }

    return count >= 3 ? 1 : 0;
  }

  /**
   * Determine severity level from score
   */
  determineSeverity(score) {
    if (score <= this.thresholds.SAFE) return 'SAFE';
    if (score <= this.thresholds.MONITOR) return 'MONITOR';
    if (score <= this.thresholds.ALERT) return 'ALERT';
    return 'HIGH_RISK';
  }

  /**
   * Determine required action based on score and severity
   */
  determineAction(score, severity) {
    switch (severity) {
      case 'SAFE':
        return {
          type: 'none',
          description: 'No action required'
        };

      case 'MONITOR':
        return {
          type: 'log',
          description: 'Log for weekly digest',
          alertAdmin: false,
          deleteMessage: false
        };

      case 'ALERT':
        return {
          type: 'alert',
          description: 'Notify admin immediately',
          alertAdmin: true,
          deleteMessage: false,
          requiresGPTAnalysis: true // Ambiguous range, needs GPT
        };

      case 'HIGH_RISK':
        return {
          type: 'high_risk',
          description: 'High risk - alert and potentially auto-action',
          alertAdmin: true,
          deleteMessage: false, // Will be true if MONITOR_MODE = false
          requiresGPTAnalysis: false, // Clear violation
          recommendAutoAction: true
        };

      default:
        return {
          type: 'unknown',
          description: 'Unknown severity'
        };
    }
  }

  /**
   * Get scoring thresholds (for configuration)
   */
  getThresholds() {
    return { ...this.thresholds };
  }

  /**
   * Update scoring thresholds (for tuning)
   */
  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    console.log('📊 Updated scoring thresholds:', this.thresholds);
  }

  /**
   * Create empty score result
   */
  createEmptyScore() {
    return {
      totalScore: 0,
      severity: 'SAFE',
      action: {
        type: 'none',
        description: 'No content to analyze'
      },
      breakdown: {
        lexicon: 0,
        temporal: 0,
        contextModifiers: 0,
        whitelistMultiplier: 1.0
      },
      details: {
        lexiconHits: [],
        categories: [],
        temporalPatterns: {},
        recentPatterns: {}
      },
      metadata: {}
    };
  }

  /**
   * Generate summary statistics for a group
   */
  async generateGroupStats(groupId, timeRangeMs = 24 * 60 * 60 * 1000) {
    const report = temporalAnalysisService.generateReport(groupId, timeRangeMs);
    const whitelistStatus = await groupWhitelistService.isWhitelisted(groupId);

    return {
      ...report,
      whitelisted: whitelistStatus,
      thresholds: this.thresholds
    };
  }
}

// Singleton instance
const scoringService = new ScoringService();

module.exports = scoringService;
