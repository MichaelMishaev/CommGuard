/**
 * Bullywatch Main Orchestrator
 * Coordinates all anti-bullying services and provides simple API for message handler
 *
 * Usage:
 *   const bullywatch = require('./services/bullywatch');
 *   await bullywatch.initialize();
 *   const result = await bullywatch.analyzeMessage(message, groupId);
 */

const config = require('../../config');
const criticalWordFilter = require('./criticalWordFilter'); // Layer -1: Local critical word filter
const nanoPreFilterService = require('./nanoPreFilterService');
const scoringService = require('./scoringService');
const gptAnalysisService = require('./gptAnalysisService');
const feedbackService = require('./feedbackService');
const groupWhitelistService = require('./groupWhitelistService');
const reportGenerator = require('./reportGenerator');

class BullywatchOrchestrator {
  constructor() {
    this.initialized = false;
    this.enabled = config.FEATURES.BULLYWATCH_ENABLED;
    this.monitorMode = config.FEATURES.BULLYWATCH_MONITOR_MODE;
    this.gptEnabled = config.FEATURES.BULLYWATCH_GPT_ANALYSIS;
    this.nanoPreFilterEnabled = config.FEATURES.BULLYWATCH_NANO_PREFILTER || true;
    this.enabledGroups = new Set(); // Groups with #bullywatch tag
  }

  /**
   * Initialize all bullywatch services
   */
  async initialize() {
    if (this.initialized) return;

    if (!this.enabled) {
      console.log('⚠️  Bullywatch is disabled in config');
      return;
    }

    console.log('🚀 Initializing Bullywatch Anti-Bullying System...');

    try {
      // Initialize all services
      if (this.nanoPreFilterEnabled) {
        await nanoPreFilterService.initialize();
      }

      await scoringService.initialize();
      await feedbackService.initialize();
      await groupWhitelistService.initialize();
      await reportGenerator.initialize();

      if (this.gptEnabled) {
        await gptAnalysisService.initialize();
      }

      this.initialized = true;
      console.log(`✅ Bullywatch initialized (Monitor Mode: ${this.monitorMode ? 'ON' : 'OFF'}, Nano Pre-Filter: ${this.nanoPreFilterEnabled ? 'ON' : 'OFF'})`);
    } catch (error) {
      console.error('❌ Error initializing Bullywatch:', error);
      this.enabled = false;
    }
  }

  /**
   * Check if group has #bullywatch enabled
   */
  isGroupEnabled(groupId, groupSubject = '') {
    // Check if group has #bullywatch tag in description/subject
    return groupSubject.toLowerCase().includes('#bullywatch') ||
           this.enabledGroups.has(groupId);
  }

  /**
   * Enable bullywatch for a specific group
   */
  enableGroup(groupId) {
    this.enabledGroups.add(groupId);
    console.log(`✅ Bullywatch enabled for group ${groupId}`);
  }

  /**
   * Disable bullywatch for a specific group
   */
  disableGroup(groupId) {
    this.enabledGroups.delete(groupId);
    console.log(`⛔ Bullywatch disabled for group ${groupId}`);
  }

  /**
   * Main analysis method - analyzes a message for bullying indicators
   * @param {Object} message - WhatsApp message object
   * @param {string} groupId - Group ID
   * @param {Object} metadata - Additional context (groupSize, groupSubject, etc.)
   * @returns {Object} - Analysis results with action recommendations
   */
  async analyzeMessage(message, groupId, metadata = {}) {
    if (!this.initialized || !this.enabled) {
      return this.createEmptyResult();
    }

    // NOTE: We trust the caller (index.js) already checked if monitoring is enabled
    // via database OR hashtag. No need for redundant check here.
    // This fixes the bug where database-enabled groups weren't in the in-memory Set.

    try {
      // Layer -1: Local Critical Word Filter (FIRST - no AI needed)
      // User requirement: "save the word זונה as local filter. make it first filter"
      const criticalCheck = criticalWordFilter.checkMessage(message);

      if (criticalCheck.isCritical) {
        // INSTANT ALERT - no need for any AI analysis
        return {
          analyzed: true,
          score: criticalCheck.score, // 100 (max)
          severity: criticalCheck.severity, // 'CRITICAL'
          action: criticalCheck.action,
          details: {
            criticalWordFilter: criticalCheck,
            word: criticalCheck.word,
            skippedLayers: ['nano', 'lexicon', 'temporal', 'scoring', 'gpt']
          },
          metadata: {
            fastPath: true,
            localFilterOnly: true,
            processingTimeMs: 0
          }
        };
      }

      // Layer 0: Multi-Model Ensemble Voting (Nano + Sentiment in parallel)
      // Defense in depth: ALWAYS runs lexicon after ensemble check
      let ensembleResult = null;
      if (this.nanoPreFilterEnabled) {
        const ensembleService = require('./ensembleService');
        ensembleResult = await ensembleService.parallelClassify(message, groupId);

        // CRITICAL: If models disagree, escalate to GPT-5-mini immediately
        if (ensembleResult.shouldEscalateToMini) {
          const gptResult = await gptAnalysisService.analyzeWithContext(message, groupId, {
            totalScore: 13, // Ambiguous range triggers GPT
            reason: ensembleResult.reason,
            votes: ensembleResult.votes,
            modelDisagreement: true
          });

          return {
            analyzed: true,
            score: gptResult.adjustedScore || 13,
            severity: gptResult.severity || 'ALERT',
            action: this.determineFinalAction({
              totalScore: gptResult.adjustedScore,
              action: gptResult.action
            }, gptResult),
            details: {
              ensembleVoting: ensembleResult,
              gptAnalysis: gptResult,
              escalationReason: 'Model disagreement detected'
            },
            metadata: {
              fastPath: false,
              ensembleEscalation: true,
              processingTimeMs: ensembleResult.processingTimeMs
            }
          };
        }
      }

      // Layer 1: ALWAYS run Lexicon check (defense in depth)
      // CRITICAL FIX: Even if ensemble says "safe", lexicon can catch patterns AI missed
      const lexiconService = require('./lexiconService');
      const lexiconResult = lexiconService.detect(message.text || message.body || '');

      // NEW: AI-based narrative context detection (more reliable than regex)
      // If lexicon scores high (15+), check if it's narrative context (movie/news/story)
      let narrativeCheck = null;
      if (lexiconResult.baseScore >= 15 && this.nanoPreFilterEnabled) {
        const nanoPreFilterService = require('./nanoPreFilterService');
        narrativeCheck = await nanoPreFilterService.checkNarrativeContext(
          message.text || message.body || ''
        );

        // If GPT-5-nano confirms narrative context, apply 80% dampening
        if (narrativeCheck.isNarrative && narrativeCheck.confidence > 0.7) {
          const originalScore = lexiconResult.baseScore;
          lexiconResult.baseScore = Math.round(originalScore * 0.2); // 80% dampening
          lexiconResult.narrativeDampened = true;
          lexiconResult.originalScore = originalScore;
          console.log(`[BULLYWATCH] 🎬 AI detected narrative context (${narrativeCheck.reason}): ${originalScore} → ${lexiconResult.baseScore}`);
        }
      }

      // If ensemble said "safe" BUT lexicon found critical words, override ensemble
      if (ensembleResult && ensembleResult.shouldSkipScoring && lexiconResult.baseScore === 0) {
        // Both ensemble AND lexicon say safe - only then can we skip heavy scoring
        return {
          analyzed: true,
          score: 0,
          severity: 'SAFE',
          action: {
            type: 'none',
            description: 'Ensemble (Nano+Sentiment) + Lexicon: All confirmed safe',
            alertAdmin: false,
            deleteMessage: false
          },
          details: {
            ensembleVoting: ensembleResult,
            lexiconCheck: lexiconResult,
            narrativeCheck: narrativeCheck,
            skippedLayers: ['temporal', 'scoring', 'gpt'] // Skipped temporal/scoring, NOT lexicon
          },
          metadata: {
            fastPath: true,
            processingTimeMs: ensembleResult?.processingTimeMs || 0,
            defenseInDepth: 'ensemble + lexicon both verified'
          }
        };
      }

      // Continue to full scoring (nano flagged OR lexicon flagged)
      // Layer 1-3: Lexicon + Temporal + Scoring
      // Pass dampened lexicon result to scoring service to preserve narrative dampening
      const scoringMetadata = {
        ...metadata,
        lexiconResult: lexiconResult // Includes narrative dampening if applied
      };
      const scoreResult = await scoringService.scoreMessage(message, groupId, scoringMetadata);

      // Layer 4: GPT Analysis (only for ambiguous cases)
      let gptResult = null;
      if (this.gptEnabled && scoreResult.action.requiresGPTAnalysis) {
        gptResult = await gptAnalysisService.analyzeWithContext(message, groupId, scoreResult);

        // Adjust score based on GPT analysis
        if (gptResult.analyzed) {
          scoreResult.totalScore = gptResult.adjustedScore;
          scoreResult.gptAnalysis = gptResult;
        }
      }

      // Determine final action based on monitor mode
      const finalAction = this.determineFinalAction(scoreResult, gptResult);

      return {
        analyzed: true,
        score: scoreResult.totalScore,
        severity: scoreResult.severity,
        action: finalAction,
        details: {
          ensembleVoting: ensembleResult, // Multi-model voting results (nano + sentiment)
          breakdown: scoreResult.breakdown,
          categories: scoreResult.details.categories,
          lexiconHits: scoreResult.details.lexiconHits,
          temporalPatterns: scoreResult.details.temporalPatterns,
          gptAnalysis: gptResult
        },
        metadata: scoreResult.metadata
      };
    } catch (error) {
      console.error('Error in bullywatch analysis:', error);
      return this.createEmptyResult();
    }
  }

  /**
   * Determine final action based on monitor mode and scoring
   */
  determineFinalAction(scoreResult, gptResult) {
    const action = { ...scoreResult.action };

    // In monitor mode, NEVER auto-delete
    if (this.monitorMode) {
      action.deleteMessage = false;
      action.warnUser = false;
      action.banUser = false;
    }

    // If GPT says it's banter, downgrade action
    if (gptResult && gptResult.isBanter && gptResult.gptConfidence > 0.7) {
      action.type = 'log';
      action.description = 'GPT classified as friendly banter';
      action.alertAdmin = false;
      action.deleteMessage = false;
    }

    // If GPT confirms harassment with high confidence, upgrade
    if (gptResult && gptResult.isHarassment && gptResult.gptConfidence > 0.8) {
      action.alertAdmin = true;
      action.description = 'GPT confirmed harassment with high confidence';
    }

    return action;
  }

  /**
   * Record admin feedback on a flagged message
   */
  async recordFeedback(feedback) {
    return await feedbackService.recordFeedback(feedback);
  }

  /**
   * Generate harassment report for a group
   */
  async generateReport(groupId, timeRangeMs) {
    return await reportGenerator.generateGroupReport(groupId, timeRangeMs);
  }

  /**
   * Generate weekly digest for multiple groups
   */
  async generateWeeklyDigest(groupIds) {
    return await reportGenerator.generateWeeklyDigest(groupIds);
  }

  /**
   * Format report for WhatsApp message
   */
  formatReportForWhatsApp(report) {
    return reportGenerator.formatReportForWhatsApp(report);
  }

  /**
   * Whitelist a friend group (reduce sensitivity)
   */
  async whitelistGroup(groupId, reason) {
    return await groupWhitelistService.whitelist(groupId, reason);
  }

  /**
   * Remove group from whitelist
   */
  async unwhitelistGroup(groupId) {
    return await groupWhitelistService.unwhitelist(groupId);
  }

  /**
   * Get system accuracy metrics
   */
  getAccuracyMetrics() {
    return feedbackService.getAccuracyMetrics();
  }

  /**
   * Get nano pre-filter statistics
   */
  getNanoStats() {
    if (!this.nanoPreFilterEnabled || !this.initialized) {
      return null;
    }
    return nanoPreFilterService.getStats();
  }

  /**
   * Get status information
   */
  getStatus() {
    return {
      enabled: this.enabled,
      initialized: this.initialized,
      monitorMode: this.monitorMode,
      gptEnabled: this.gptEnabled,
      nanoPreFilterEnabled: this.nanoPreFilterEnabled,
      enabledGroups: Array.from(this.enabledGroups),
      accuracy: this.initialized ? feedbackService.getAccuracyMetrics() : null,
      nanoStats: this.getNanoStats()
    };
  }

  /**
   * Create empty result (no action needed)
   */
  createEmptyResult() {
    return {
      analyzed: false,
      score: 0,
      severity: 'SAFE',
      action: {
        type: 'none',
        description: 'Bullywatch not enabled for this group',
        alertAdmin: false,
        deleteMessage: false
      },
      details: {},
      metadata: {}
    };
  }
}

// Singleton instance
const bullywatch = new BullywatchOrchestrator();

module.exports = bullywatch;
