/**
 * Temporal Analysis Service (Layer 2)
 * Detects pile-on behavior, message velocity spikes, victim silencing
 * Tracks group dynamics and harassment patterns over time
 */

class TemporalAnalysisService {
  constructor() {
    this.initialized = false;
    this.groupMessageHistory = new Map(); // groupId -> message array
    this.userActivity = new Map(); // userId -> activity metadata
    this.targetingPatterns = new Map(); // targetUserId -> targeting events
    this.maxHistorySize = 500; // Keep last 500 messages per group
    this.maxHistoryTime = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  }

  async initialize() {
    if (this.initialized) return;

    // Clean up old data periodically (every hour)
    setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000);

    this.initialized = true;
    console.log('✅ TemporalAnalysisService initialized');
  }

  /**
   * Track a new message and analyze temporal patterns
   * @param {Object} message - Message object
   * @param {string} groupId - Group ID
   * @param {number} baseScore - Score from lexicon analysis
   * @returns {Object} - Temporal analysis results
   */
  analyzeMessage(message, groupId, baseScore) {
    const timestamp = Date.now();
    const senderId = message.sender;

    // Store message in history
    this.storeMessage(groupId, {
      id: message.id,
      sender: senderId,
      timestamp,
      baseScore,
      text: message.text || '',
      quotedMessage: message.quotedMessage || null
    });

    // Analyze patterns
    const pileOnScore = this.detectPileOn(groupId, senderId, timestamp);
    const velocityScore = this.detectMessageVelocity(groupId, timestamp);
    const silencingScore = this.detectVictimSilencing(groupId, senderId, timestamp);
    const targetingScore = this.detectTargetedHarassment(groupId, message, timestamp);

    // Calculate total temporal score
    const temporalScore = pileOnScore + velocityScore + silencingScore + targetingScore;

    // Update user activity
    this.updateUserActivity(senderId, groupId, timestamp);

    return {
      temporalScore,
      breakdown: {
        pileOn: pileOnScore,
        velocity: velocityScore,
        silencing: silencingScore,
        targeting: targetingScore
      },
      patterns: this.getRecentPatterns(groupId, timestamp)
    };
  }

  /**
   * Detect pile-on behavior: multiple users targeting one person
   * Score: +5 if 3+ different users target same person in 5 minutes
   * Score: +10 if 5+ different users (severe pile-on)
   */
  detectPileOn(groupId, senderId, timestamp) {
    const history = this.getRecentMessages(groupId, 5 * 60 * 1000); // Last 5 minutes
    if (history.length < 3) return 0;

    // Find messages that are replies or mention someone
    const targetedMessages = history.filter(msg =>
      msg.quotedMessage || this.containsMention(msg.text)
    );

    if (targetedMessages.length === 0) return 0;

    // Group by target
    const targetCounts = new Map();
    for (const msg of targetedMessages) {
      const target = msg.quotedMessage?.sender || this.extractMention(msg.text);
      if (target) {
        const senders = targetCounts.get(target) || new Set();
        senders.add(msg.sender);
        targetCounts.set(target, senders);
      }
    }

    // Check if any target is being attacked by multiple people
    let maxAttackers = 0;
    for (const [target, attackers] of targetCounts) {
      if (attackers.size > maxAttackers) {
        maxAttackers = attackers.size;
      }
    }

    if (maxAttackers >= 5) {
      console.log(`🚨 Severe pile-on detected: ${maxAttackers} users targeting same person`);
      return 10;
    } else if (maxAttackers >= 3) {
      console.log(`⚠️  Pile-on detected: ${maxAttackers} users targeting same person`);
      return 5;
    }

    return 0;
  }

  /**
   * Detect message velocity spikes
   * Score: +3 if 5+ messages in 5 minutes with negative sentiment
   * Score: +5 if 10+ messages in 5 minutes
   */
  detectMessageVelocity(groupId, timestamp) {
    const history = this.getRecentMessages(groupId, 5 * 60 * 1000); // Last 5 minutes
    const messageCount = history.length;

    // Count messages with negative scores
    const negativeMessages = history.filter(msg => msg.baseScore > 0);

    if (messageCount >= 10 && negativeMessages.length >= 5) {
      console.log(`🚨 High velocity spike: ${messageCount} messages (${negativeMessages.length} negative)`);
      return 5;
    } else if (messageCount >= 5 && negativeMessages.length >= 3) {
      console.log(`⚠️  Message velocity spike: ${messageCount} messages`);
      return 3;
    }

    return 0;
  }

  /**
   * Detect victim silencing: previously active user goes silent after harassment
   * Score: +5 if target user was active but stopped messaging after harassment
   */
  detectVictimSilencing(groupId, senderId, timestamp) {
    const history = this.getRecentMessages(groupId, 30 * 60 * 1000); // Last 30 minutes
    if (history.length < 5) return 0;

    // Find messages targeting specific users
    const targetedUsers = new Set();
    const harassmentTime = new Map(); // userId -> last harassment timestamp

    for (const msg of history) {
      if (msg.baseScore > 3) { // Message has harassment indicators
        const target = msg.quotedMessage?.sender || this.extractMention(msg.text);
        if (target && target !== senderId) {
          targetedUsers.add(target);
          harassmentTime.set(target, Math.max(harassmentTime.get(target) || 0, msg.timestamp));
        }
      }
    }

    // Check if any targeted user went silent
    let silencingScore = 0;
    for (const targetUser of targetedUsers) {
      const lastHarassment = harassmentTime.get(targetUser);
      const userActivity = this.userActivity.get(targetUser);

      if (userActivity && userActivity.groupId === groupId) {
        const wasActive = userActivity.messageCount > 5; // User was active
        const timeSinceHarassment = timestamp - lastHarassment;
        const timeSinceLastMessage = timestamp - userActivity.lastMessageTime;

        // User was active, got harassed, and went silent for 10+ minutes
        if (wasActive && timeSinceHarassment > 10 * 60 * 1000 && timeSinceLastMessage > 10 * 60 * 1000) {
          console.log(`🚨 Victim silencing detected: User ${targetUser} went silent after harassment`);
          silencingScore = 5;
          break;
        }
      }
    }

    return silencingScore;
  }

  /**
   * Detect targeted harassment: same person repeatedly targeted
   * Score: +3 per targeting event (max +9)
   */
  detectTargetedHarassment(groupId, message, timestamp) {
    const target = message.quotedMessage?.sender || this.extractMention(message.text);
    if (!target) return 0;

    // Track targeting events
    const key = `${groupId}:${target}`;
    const events = this.targetingPatterns.get(key) || [];

    // Add new event
    events.push({
      timestamp,
      sender: message.sender,
      score: message.baseScore || 0
    });

    // Keep only last 30 minutes
    const cutoff = timestamp - 30 * 60 * 1000;
    const recentEvents = events.filter(e => e.timestamp > cutoff);
    this.targetingPatterns.set(key, recentEvents);

    // Score based on frequency
    const targetingScore = Math.min(recentEvents.length * 3, 9);

    if (recentEvents.length >= 3) {
      console.log(`⚠️  Repeated targeting: ${target} targeted ${recentEvents.length} times`);
    }

    return targetingScore;
  }

  /**
   * Get recent patterns for context
   */
  getRecentPatterns(groupId, timestamp) {
    const history = this.getRecentMessages(groupId, 15 * 60 * 1000); // Last 15 minutes

    return {
      totalMessages: history.length,
      negativeMessages: history.filter(m => m.baseScore > 0).length,
      uniqueSenders: new Set(history.map(m => m.sender)).size,
      averageScore: history.reduce((sum, m) => sum + m.baseScore, 0) / Math.max(history.length, 1)
    };
  }

  /**
   * Store message in group history
   */
  storeMessage(groupId, message) {
    if (!this.groupMessageHistory.has(groupId)) {
      this.groupMessageHistory.set(groupId, []);
    }

    const history = this.groupMessageHistory.get(groupId);
    history.push(message);

    // Keep only last N messages
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Get recent messages within time window
   */
  getRecentMessages(groupId, timeWindowMs) {
    const history = this.groupMessageHistory.get(groupId) || [];
    const cutoff = Date.now() - timeWindowMs;
    return history.filter(msg => msg.timestamp > cutoff);
  }

  /**
   * Update user activity tracking
   */
  updateUserActivity(userId, groupId, timestamp) {
    const activity = this.userActivity.get(userId) || {
      groupId,
      messageCount: 0,
      lastMessageTime: 0
    };

    activity.messageCount++;
    activity.lastMessageTime = timestamp;
    this.userActivity.set(userId, activity);
  }

  /**
   * Check if text contains mention (simple heuristic)
   */
  containsMention(text) {
    // Look for patterns like @user or addressing someone
    return /@\d+/.test(text) || /אתה|את|יא/.test(text);
  }

  /**
   * Extract mention from text
   */
  extractMention(text) {
    const match = text.match(/@(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Cleanup old data to prevent memory leaks
   */
  cleanupOldData() {
    const cutoff = Date.now() - this.maxHistoryTime;

    // Clean message history
    for (const [groupId, history] of this.groupMessageHistory) {
      const filtered = history.filter(msg => msg.timestamp > cutoff);
      if (filtered.length === 0) {
        this.groupMessageHistory.delete(groupId);
      } else {
        this.groupMessageHistory.set(groupId, filtered);
      }
    }

    // Clean targeting patterns
    for (const [key, events] of this.targetingPatterns) {
      const filtered = events.filter(e => e.timestamp > cutoff);
      if (filtered.length === 0) {
        this.targetingPatterns.delete(key);
      } else {
        this.targetingPatterns.set(key, filtered);
      }
    }

    console.log(`🧹 Cleaned up old temporal data (groups: ${this.groupMessageHistory.size}, patterns: ${this.targetingPatterns.size})`);
  }

  /**
   * Get context for GPT analysis (5-7 messages before and after)
   */
  getContextWindow(groupId, messageId, windowSize = 5) {
    const history = this.groupMessageHistory.get(groupId) || [];
    const messageIndex = history.findIndex(m => m.id === messageId);

    if (messageIndex === -1) {
      return { before: [], current: null, after: [] };
    }

    const start = Math.max(0, messageIndex - windowSize);
    const end = Math.min(history.length, messageIndex + windowSize + 1);

    return {
      before: history.slice(start, messageIndex),
      current: history[messageIndex],
      after: history.slice(messageIndex + 1, end)
    };
  }

  /**
   * Generate harassment report for a group
   */
  generateReport(groupId, timeRangeMs = 24 * 60 * 60 * 1000) {
    const history = this.getRecentMessages(groupId, timeRangeMs);
    const now = Date.now();

    // Analyze messages
    const negativeMessages = history.filter(m => m.baseScore > 3);
    const senders = new Map();
    const targets = new Map();

    for (const msg of negativeMessages) {
      // Count senders
      senders.set(msg.sender, (senders.get(msg.sender) || 0) + 1);

      // Count targets
      const target = msg.quotedMessage?.sender || this.extractMention(msg.text);
      if (target) {
        targets.set(target, (targets.get(target) || 0) + 1);
      }
    }

    // Sort by frequency
    const topSenders = Array.from(senders.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topTargets = Array.from(targets.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      timeRange: timeRangeMs,
      totalMessages: history.length,
      negativeMessages: negativeMessages.length,
      negativePercentage: (negativeMessages.length / Math.max(history.length, 1) * 100).toFixed(1),
      topSenders,
      topTargets,
      severity: this.calculateSeverity(negativeMessages.length, history.length),
      timestamp: now
    };
  }

  /**
   * Calculate overall severity
   */
  calculateSeverity(negativeCount, totalCount) {
    const percentage = negativeCount / Math.max(totalCount, 1);

    if (percentage > 0.3) return 'CRITICAL'; // 30%+ negative
    if (percentage > 0.15) return 'HIGH'; // 15%+ negative
    if (percentage > 0.05) return 'MEDIUM'; // 5%+ negative
    return 'LOW';
  }
}

// Singleton instance
const temporalAnalysisService = new TemporalAnalysisService();

module.exports = temporalAnalysisService;
