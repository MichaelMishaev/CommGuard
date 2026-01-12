/**
 * Scoring Service (Layer 3) - PRODUCTION READY v2.0
 * Implements EXACT formula from docs/behaviorAnalyse/scoringSystem.md
 *
 * Formula: finalScore = (baseScore + addOns) × targeting × publicShaming × friendGroup + behaviorPoints
 * Then apply critical floor rule and round to nearest integer
 */

const lexiconService = require('./lexiconService');
const temporalAnalysisService = require('./temporalAnalysisService');
const groupWhitelistService = require('./groupWhitelistService');

class ScoringService {
  constructor() {
    this.initialized = false;

    // Updated thresholds to match scoring system doc
    this.thresholds = {
      GREEN_MAX: 9,        // 1-9: Safe
      YELLOW_MAX: 17,      // 10-17: Monitor
      RED1_MAX: 29,        // 18-29: DELETE + Alert
      RED2_MAX: 44,        // 30-44: DELETE + Alert Parents + Temp Mute
      RED3_MIN: 45         // 45+: DELETE + Alert All + Auto-Ban
    };

    // Sender violation history for behavior points
    this.senderHistory = new Map(); // senderId -> violation array

    // Category mapping to new system
    this.categoryMapping = {
      'sexual_harassment': 'sexual_threat',
      'direct_threat': 'violence_threat',
      'privacy_threat': 'doxxing',
      'privacy_invasion': 'doxxing',
      'general_insult': 'direct_insult',
      'social_exclusion': 'exclusion',
      'public_humiliation': 'targeted_humiliation',
      'emoji_harassment': 'mocking_emojis'
    };
  }

  async initialize() {
    if (this.initialized) return;

    await lexiconService.initialize();
    await temporalAnalysisService.initialize();
    await groupWhitelistService.initialize();

    // Cleanup sender history every hour
    setInterval(() => {
      this.cleanupSenderHistory();
    }, 60 * 60 * 1000);

    this.initialized = true;
    console.log('✅ ScoringService v2.0 initialized (Production Formula)');
  }

  /**
   * Main scoring method - implements EXACT 5-phase formula
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

    console.log(`\n[SCORING DEBUG] Analyzing: "${messageText.substring(0, 50)}"`);

    // PHASE 1: Pre-Processing (Normalization)
    const normalizedText = lexiconService.normalizeHebrew(messageText);
    const transliteratedText = lexiconService.detectTransliteration(normalizedText);
    console.log(`[SCORING DEBUG] Normalized: "${normalizedText.substring(0, 50)}"`);

    // PHASE 2: Base Scoring
    const lexiconResult = lexiconService.detect(transliteratedText);
    const baseScore = this.applyHardCap(lexiconResult);
    console.log(`[SCORING DEBUG] Lexicon hits: ${lexiconResult.hits.length}, baseScore: ${baseScore}`);

    // PHASE 3: Context Modifiers
    let addOns = 0;
    let targetingMultiplier = 1.0;
    let publicShamingMultiplier = 1.0;

    // 3.1 Targeting Multiplier (×1.5) - use NORMALIZED text for pattern matching
    if (this.hasTargeting(normalizedText)) {
      targetingMultiplier = 1.5;
    }

    // 3.2 Public-Shaming Multiplier (×1.3) - use NORMALIZED text
    if (this.hasPublicShaming(normalizedText)) {
      publicShamingMultiplier = 1.3;
    }

    // 3.3 Emoji Intensity Add-On (+2) - use ORIGINAL text for emojis
    if (this.hasEmojiIntensity(messageText)) {
      addOns += 2;
    }

    // Calculate score with context modifiers (multiplicative stacking)
    let scoreWithContext = (baseScore + addOns) * targetingMultiplier * publicShamingMultiplier;

    // 3.4 Friend Group Dampener (×0.5)
    const friendGroupMultiplier = await groupWhitelistService.getScoreMultiplier(
      groupId,
      metadata.groupSize || 0
    );
    scoreWithContext *= friendGroupMultiplier;

    // PHASE 4: Behavior Points (AFTER multipliers)
    const behaviorPoints = await this.calculateBehaviorPoints(message, groupId);
    let finalScore = scoreWithContext + behaviorPoints;

    // PHASE 5: Critical Floor Rule
    const hasCriticalCategory = this.hasCriticalCategory(lexiconResult.categories);
    if (hasCriticalCategory) {
      finalScore = Math.max(finalScore, 20); // Force minimum RED-1
    }

    // Round to nearest integer
    finalScore = Math.round(finalScore);

    // Determine severity and action
    const severity = this.determineSeverity(finalScore);
    const action = this.determineAction(finalScore, severity, lexiconResult.categories);

    console.log(`[SCORING DEBUG] Final score: ${finalScore}, severity: ${severity}, alertAdmin: ${action.alertAdmin}`);
    console.log(`[SCORING DEBUG] Categories: ${lexiconResult.categories.join(', ')}`);

    // Store violation for behavior tracking
    this.storeSenderViolation(message.sender, finalScore, severity);

    return {
      totalScore: finalScore,
      severity,
      action,
      breakdown: {
        baseScore,
        addOns,
        targetingMultiplier,
        publicShamingMultiplier,
        friendGroupMultiplier,
        scoreBeforeBehavior: Math.round(scoreWithContext),
        behaviorPoints,
        hasCriticalCategory,
        formula: `(${baseScore} + ${addOns}) × ${targetingMultiplier} × ${publicShamingMultiplier} × ${friendGroupMultiplier} + ${behaviorPoints} = ${finalScore}`
      },
      details: {
        lexiconHits: lexiconResult.hits,
        categories: lexiconResult.categories.map(c => this.categoryMapping[c] || c),
        hasTargeting: targetingMultiplier > 1.0,
        hasPublicShaming: publicShamingMultiplier > 1.0,
        hasEmojiIntensity: addOns > 0,
        normalizedText: transliteratedText
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
   * Apply Hard Cap Rule: Max 2 matches per category, max 3 categories
   * Implements section 2.2 and 2.3 from scoring system doc
   */
  applyHardCap(lexiconResult) {
    // Group hits by category
    const categoryHits = new Map();

    for (const hit of lexiconResult.hits) {
      // Determine category from hit
      const category = this.determineCategoryFromHit(hit);
      if (!categoryHits.has(category)) {
        categoryHits.set(category, []);
      }
      categoryHits.get(category).push(hit);
    }

    // Apply max 2 matches per category
    const cappedScores = new Map();
    for (const [category, hits] of categoryHits) {
      const topHits = hits
        .sort((a, b) => (b.weightedScore || b.score || 0) - (a.weightedScore || a.score || 0))
        .slice(0, 2); // Max 2 per category

      const categoryScore = topHits.reduce((sum, hit) => sum + (hit.weightedScore || hit.score || 0), 0);
      cappedScores.set(category, categoryScore);
    }

    // Apply max 3 categories (take top 3 by score)
    const topCategories = Array.from(cappedScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Sum the top 3 categories
    const totalScore = topCategories.reduce((sum, [cat, score]) => sum + score, 0);

    return totalScore;
  }

  /**
   * Determine category from hit object
   */
  determineCategoryFromHit(hit) {
    if (hit.type === 'emoji') return 'emoji_harassment';
    if (hit.category) return hit.category;
    if (hit.word) {
      // Infer from word - simplified mapping
      if (['זונה', 'שרמוטה', 'בן זונה'].some(w => hit.word.includes(w))) return 'sexual_harassment';
      if (['חכה לי', 'אשבור', 'אהרוג'].some(w => hit.word.includes(w))) return 'direct_threat';
      if (['יש לי צילום', 'אני מפרסם'].some(w => hit.word.includes(w))) return 'privacy_threat';
      if (['אל תצרפו', 'תעיפו'].some(w => hit.word.includes(w))) return 'social_exclusion';
      return 'general_insult';
    }
    return 'unknown';
  }

  /**
   * Check for targeting (×1.5 multiplier) - Section 3.1
   * FIXED: Added כמוך (like you), שלך (yours), and other targeting forms
   */
  hasTargeting(text) {
    // Normalized forms: כמוך→כמוכ, שלך→שלכ, אתה→אטה, etc.
    return /אטה|אט|הוא|היא|אטמ|אטנ|כמוכ|שלכ|יא@/.test(text);
  }

  /**
   * Check for public shaming (×1.3 multiplier) - Section 3.2
   * Uses NORMALIZED forms (ת→ט, ם→מ)
   */
  hasPublicShaming(text) {
    return /כולמ|לכולמ|טראו|שלחו/.test(text);
  }

  /**
   * Check for emoji intensity (+2 add-on) - Section 3.3
   */
  hasEmojiIntensity(text) {
    const mockingEmojis = (text.match(/🤡|🙄|💀|😂/g) || []).length;
    const clapPattern = /👏\w+👏/;
    return mockingEmojis >= 3 || clapPattern.test(text);
  }

  /**
   * Calculate Behavior Points (Phase 4) - Section 4
   */
  async calculateBehaviorPoints(message, groupId) {
    let points = 0;
    const senderId = message.sender;
    const now = Date.now();

    // 4.1 Repeat Offender (same sender)
    const history = this.getSenderHistory(senderId);

    // +3 if sender had 🟡/🔴 in last 60 min
    const yellowOrRedIn60Min = history.filter(v =>
      (v.severity === 'YELLOW' || v.severity.startsWith('RED')) &&
      (now - v.timestamp < 60 * 60 * 1000)
    );
    if (yellowOrRedIn60Min.length > 0) points += 3;

    // +6 if sender had 🔴 in last 24 hours
    const redIn24Hours = history.filter(v =>
      v.severity.startsWith('RED') &&
      (now - v.timestamp < 24 * 60 * 60 * 1000)
    );
    if (redIn24Hours.length > 0) points += 6;

    // +10 if sender had 3+ 🟡 in last 7 days
    const yellowIn7Days = history.filter(v =>
      v.severity === 'YELLOW' &&
      (now - v.timestamp < 7 * 24 * 60 * 60 * 1000)
    );
    if (yellowIn7Days.length >= 3) points += 10;

    // 4.2 Pile-On Detection (multi-user attack)
    const pileOnResult = await temporalAnalysisService.detectPileOn(groupId, senderId, now);
    if (pileOnResult.isPileOn && !pileOnResult.isFirstAttacker) {
      points += 8; // ONLY 2nd+ attackers get +8
    }

    // 4.3 Harassment Persistence (same sender → same victim)
    const targetingResult = await temporalAnalysisService.detectTargetedHarassment(groupId, message, now);
    if (targetingResult.count === 2) points += 4;
    if (targetingResult.count >= 3) points += 7;

    return points;
  }

  /**
   * Check if message has critical category (triggers floor rule)
   */
  hasCriticalCategory(categories) {
    const criticalCategories = ['sexual_threat', 'violence_threat', 'self_harm', 'doxxing',
                                'sexual_harassment', 'direct_threat', 'privacy_threat', 'privacy_invasion'];
    return categories.some(cat => {
      const mapped = this.categoryMapping[cat] || cat;
      return criticalCategories.includes(mapped);
    });
  }

  /**
   * Determine severity tier from score - Section 6.1
   */
  determineSeverity(score) {
    if (score <= this.thresholds.GREEN_MAX) return 'SAFE';      // 1-9
    if (score <= this.thresholds.YELLOW_MAX) return 'YELLOW';   // 10-17
    if (score <= this.thresholds.RED1_MAX) return 'RED-1';      // 18-29
    if (score <= this.thresholds.RED2_MAX) return 'RED-2';      // 30-44
    return 'RED-3';                                              // 45+
  }

  /**
   * Determine required action based on severity - Section 6.1
   * @param {number} score - Final score
   * @param {string} severity - Severity tier (SAFE, YELLOW, RED-1, RED-2, RED-3)
   * @param {Array} categories - Categories detected (to check for self_harm)
   */
  determineAction(score, severity, categories = []) {
    const config = require('../../config');
    const monitorMode = config.FEATURES?.BULLYWATCH_MONITOR_MODE !== false; // Default true

    // CRITICAL: Self-harm NEVER gets deleted - requires immediate intervention
    const isSelfHarm = categories.includes('self_harm');

    if (isSelfHarm) {
      return {
        type: 'self_harm_alert',
        description: '🚨 SELF-HARM DETECTED - IMMEDIATE INTERVENTION REQUIRED',
        alertAdmin: true,
        deleteMessage: false, // NEVER delete - could prevent life-saving intervention
        sendGroupMessage: false, // Don't send group message - handle privately
        recommendCounselorContact: true,
        recommendParentContact: true,
        urgencyLevel: 'CRITICAL',
        interventionRequired: true
      };
    }

    switch (severity) {
      case 'SAFE':
        return {
          type: 'log',
          description: 'Log only (store: score, categories, sender, messageId, timestamp)',
          alertAdmin: false,
          deleteMessage: false,
          sendGroupMessage: false
        };

      case 'YELLOW':
        return {
          type: 'alert',
          description: 'Alert admin + send group reminder (no naming)',
          alertAdmin: true,
          deleteMessage: false,
          sendGroupMessage: true,
          groupMessage: '🟡 תזכורת: שומרים על שיח מכבד בקבוצה.\nגם כשלא מסכימים, מדברים בכבוד. תודה 🙏',
          requiresGPTAnalysis: score >= 11 && score <= 15 // Ambiguous range
        };

      case 'RED-1':
        return {
          type: 'delete_and_alert',
          description: 'Delete message + alert admin + send group policy notice',
          alertAdmin: true,
          deleteMessage: !monitorMode, // Only delete if NOT in monitor mode
          sendGroupMessage: !monitorMode,
          groupMessage: '🔴 הודעה הוסרה עקב הפרת כללי הקבוצה (איומים/הטרדה/פגיעה בפרטיות).\nזו קבוצה בית-ספרית שמחויבת לסביבה בטוחה.\nהמשך הפרות יטופלו בהסלמה בהתאם למדיניות.'
        };

      case 'RED-2':
        return {
          type: 'delete_alert_parents_mute',
          description: 'Delete + alert admin (recommend parents) + temp mute 60 min + escalation notice',
          alertAdmin: true,
          deleteMessage: !monitorMode,
          sendGroupMessage: !monitorMode,
          tempMute: !monitorMode,
          muteDuration: 60 * 60 * 1000, // 60 minutes
          groupMessage: '🔴 משתמש הושתק זמנית (60 דקות) עקב הפרה חמורה.\nהורים יקבלו התראה. המשך הפרות יגרום להסרה מהקבוצה.',
          recommendParentContact: true
        };

      case 'RED-3':
        return {
          type: 'delete_alert_all_ban',
          description: 'CRITICAL: Delete + alert all stakeholders + auto-ban + police report recommendation',
          alertAdmin: true,
          deleteMessage: !monitorMode,
          sendGroupMessage: !monitorMode,
          autoBan: !monitorMode,
          groupMessage: '🔴 משתמש הוסר מהקבוצה עקב הפרה קריטית של כללי הבטיחות.\nהרשויות המתאימות יקבלו דיווח בהתאם לחומרת ההפרה.',
          recommendParentContact: true,
          recommendSchoolContact: true,
          recommendPoliceReport: true
        };

      default:
        return {
          type: 'unknown',
          description: 'Unknown severity'
        };
    }
  }

  /**
   * Get sender violation history
   */
  getSenderHistory(senderId) {
    return this.senderHistory.get(senderId) || [];
  }

  /**
   * Store sender violation for behavior tracking
   */
  storeSenderViolation(senderId, score, severity) {
    if (!this.senderHistory.has(senderId)) {
      this.senderHistory.set(senderId, []);
    }

    const history = this.senderHistory.get(senderId);
    history.push({
      timestamp: Date.now(),
      score,
      severity
    });

    // Keep only last 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const filtered = history.filter(v => v.timestamp > cutoff);
    this.senderHistory.set(senderId, filtered);
  }

  /**
   * Cleanup old sender history
   */
  cleanupSenderHistory() {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const [senderId, history] of this.senderHistory) {
      const filtered = history.filter(v => v.timestamp > cutoff);
      if (filtered.length === 0) {
        this.senderHistory.delete(senderId);
      } else {
        this.senderHistory.set(senderId, filtered);
      }
    }

    console.log(`🧹 Cleaned up sender history (${this.senderHistory.size} senders tracked)`);
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
        baseScore: 0,
        addOns: 0,
        targetingMultiplier: 1.0,
        publicShamingMultiplier: 1.0,
        friendGroupMultiplier: 1.0,
        scoreBeforeBehavior: 0,
        behaviorPoints: 0,
        hasCriticalCategory: false,
        formula: '(0 + 0) × 1.0 × 1.0 × 1.0 + 0 = 0'
      },
      details: {
        lexiconHits: [],
        categories: [],
        hasTargeting: false,
        hasPublicShaming: false,
        hasEmojiIntensity: false,
        normalizedText: ''
      },
      metadata: {}
    };
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
}

// Singleton instance
const scoringService = new ScoringService();

module.exports = scoringService;
