/**
 * GPT-5-Nano Pre-Filter Service (Layer 0)
 * Fast, cheap initial filter to catch obvious false positives
 * Runs BEFORE lexicon to improve UX and reduce alert fatigue
 *
 * Purpose: Prevent false positives like "I saw in a movie..." from triggering alerts
 * Cost: ~$0.00001 per message (5x cheaper than GPT-5-mini)
 * Speed: 20-50ms (fast enough for real-time)
 */

const OpenAI = require('openai');
const nanoLoggingService = require('./nanoLoggingService');

class NanoPreFilterService {
  constructor() {
    this.initialized = false;
    this.openai = null;
    this.rateLimiter = new Map(); // userId -> timestamps array
    this.maxCallsPerMinute = 100; // High limit since nano is cheap

    // Statistics for tuning
    this.stats = {
      totalCalls: 0,
      clearlySafe: 0,
      potentiallyHarmful: 0,
      ambiguous: 0,
      errors: 0
    };
  }

  async initialize() {
    if (this.initialized) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log('⚠️  OPENAI_API_KEY not found - Nano pre-filter disabled');
      return;
    }

    this.openai = new OpenAI({
      apiKey: apiKey
    });

    // Initialize logging service
    await nanoLoggingService.initialize();

    this.initialized = true;
    console.log('✅ NanoPreFilterService initialized (GPT-5-nano)');
  }

  /**
   * Quick pre-filter check: Is this message clearly safe or potentially harmful?
   * @param {Object} message - Message object with text, sender, etc.
   * @param {string} groupId - Group ID for context
   * @returns {Object} - { verdict: 'safe'|'harmful'|'ambiguous', confidence, shouldSkipScoring }
   */
  async quickCheck(message, groupId) {
    if (!this.initialized || !this.openai) {
      return {
        verdict: 'ambiguous',
        confidence: 0,
        shouldSkipScoring: false,
        reason: 'Nano service not available'
      };
    }

    // Check rate limit
    if (!this.checkRateLimit(message.sender)) {
      return {
        verdict: 'ambiguous',
        confidence: 0,
        shouldSkipScoring: false,
        reason: 'Rate limit exceeded'
      };
    }

    try {
      const messageText = message.text || message.body || '';
      const startTime = Date.now();

      // Skip empty or very short messages
      if (messageText.length < 5) {
        return {
          verdict: 'safe',
          confidence: 1.0,
          shouldSkipScoring: true,
          reason: 'Too short to be harmful'
        };
      }

      // CRITICAL SAFETY CHECK: Never skip scoring for known high-severity words
      // GPT-5-nano sometimes incorrectly classifies these as "safe"
      const criticalWords = [
        'זונה', 'זונוט', 'בנזונה', 'בטזונה',  // Prostitute/whore insults
        'מפגר', 'מפגרת', 'מפגרים',  // Retard
        'תמות', 'תמותי', 'למות',  // Death threats
        'להתאבד', 'אתאבד', 'התאבדות',  // Suicide
        'לאנוס', 'אנוס', 'אונס',  // Rape
        'להרוג', 'ארצח', 'לרצוח'  // Murder/kill
      ];

      const normalizedText = messageText.replace(/\s+/g, '').toLowerCase();
      const containsCriticalWord = criticalWords.some(word => normalizedText.includes(word));

      if (containsCriticalWord) {
        return {
          verdict: 'harmful',
          confidence: 1.0,
          shouldSkipScoring: false,  // NEVER skip scoring for critical words
          reason: 'Contains critical high-severity word - must be scored by lexicon',
          categories: ['critical_word_override']
        };
      }

      // Call GPT-5-nano for quick classification (with full logging)
      const nanoResponse = await this.callNano(messageText, {
        sender: message.sender,
        groupId: groupId,
        timestamp: message.timestamp || Date.now()
      });

      const processingTime = Date.now() - startTime;

      // Update stats
      this.stats.totalCalls++;
      this.stats[nanoResponse.verdict === 'safe' ? 'clearlySafe' :
                 nanoResponse.verdict === 'harmful' ? 'potentiallyHarmful' : 'ambiguous']++;

      // Update rate limiter
      this.updateRateLimit(message.sender);

      // Log decision (async, non-blocking)
      nanoLoggingService.logDecision({
        messageText: messageText,
        sender: message.sender,
        groupId: groupId,
        nanoVerdict: nanoResponse.verdict,
        nanoConfidence: nanoResponse.confidence,
        nanoReason: nanoResponse.reason,
        nanoCategories: nanoResponse.categories || [],
        processingTimeMs: processingTime,
        aiRequest: nanoResponse.aiRequest, // Full GPT request
        aiResponse: nanoResponse.aiResponse // Full GPT response
      });

      return {
        verdict: nanoResponse.verdict,
        confidence: nanoResponse.confidence,
        shouldSkipScoring: nanoResponse.verdict === 'safe' && nanoResponse.confidence > 0.85,
        reason: nanoResponse.reason,
        categories: nanoResponse.categories || []
      };
    } catch (error) {
      console.error('Error in nano pre-filter:', error);
      this.stats.errors++;

      // On error, fail open (continue to scoring)
      return {
        verdict: 'ambiguous',
        confidence: 0,
        shouldSkipScoring: false,
        reason: `Error: ${error.message}`
      };
    }
  }

  /**
   * Call GPT-5-nano for quick safe/harmful classification
   * @param {string} messageText - Message text to classify
   * @param {Object} metadata - Sender, groupId, timestamp (for logging)
   * @returns {Object} - Verdict + full AI request/response for logging
   */
  async callNano(messageText, metadata = {}) {
    const systemPrompt = `You are a fast bullying detector for Hebrew WhatsApp groups of teenagers.

Your ONLY job is to quickly classify messages into 3 categories:
1. SAFE - Clearly harmless (normal chat, homework, movies, jokes between friends)
2. HARMFUL - Potentially bullying, threats, harassment, or exclusion
3. AMBIGUOUS - Unclear, needs deeper analysis

CRITICAL: Be VERY conservative with HARMFUL classification.
- Movie/TV discussions = SAFE
- Homework help = SAFE
- Sports/games = SAFE
- Friend jokes (no target) = SAFE
- Sharing links/memes = SAFE

Only mark HARMFUL if you see:
- Direct insults targeting a person
- Threats of violence
- Sexual harassment
- Social exclusion ("don't invite X")
- Doxxing/privacy violations

Respond in JSON ONLY:
{
  "verdict": "safe" | "harmful" | "ambiguous",
  "confidence": 0.0-1.0,
  "reason": "brief explanation in English",
  "categories": ["category1", "category2"] // if harmful
}`;

    const userPrompt = `Hebrew message to classify:
"${messageText}"

Is this SAFE, HARMFUL, or AMBIGUOUS?`;

    const requestPayload = {
      model: 'gpt-5-nano',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      // Note: GPT-5-nano only supports default temperature (1), cannot customize
      max_completion_tokens: 150, // Short responses only (GPT-5 uses max_completion_tokens)
      reasoning_effort: 'low', // Fast responses (GPT-5 parameter)
      verbosity: 'low' // Concise (GPT-5 parameter)
    };

    const completion = await this.openai.chat.completions.create(requestPayload);

    const response = JSON.parse(completion.choices[0].message.content);

    return {
      verdict: response.verdict || 'ambiguous',
      confidence: response.confidence || 0.5,
      reason: response.reason || 'No reason provided',
      categories: response.categories || [],

      // Full AI request/response for logging
      aiRequest: {
        model: requestPayload.model,
        systemPrompt: systemPrompt,
        userPrompt: userPrompt,
        temperature: requestPayload.temperature,
        maxCompletionTokens: requestPayload.max_completion_tokens,
        timestamp: Date.now()
      },
      aiResponse: {
        rawResponse: completion.choices[0].message.content,
        finishReason: completion.choices[0].finish_reason,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0
        },
        model: completion.model,
        timestamp: Date.now()
      }
    };
  }

  /**
   * Check if user is within rate limit
   */
  checkRateLimit(userId) {
    const now = Date.now();
    const minuteAgo = now - 60 * 1000;

    // Get or create user's timestamp array
    let timestamps = this.rateLimiter.get(userId) || [];

    // Remove old timestamps
    timestamps = timestamps.filter(ts => ts > minuteAgo);

    // Check if under limit
    if (timestamps.length >= this.maxCallsPerMinute) {
      return false;
    }

    return true;
  }

  /**
   * Update rate limiter after successful call
   */
  updateRateLimit(userId) {
    const now = Date.now();
    const minuteAgo = now - 60 * 1000;

    // Get or create user's timestamp array
    let timestamps = this.rateLimiter.get(userId) || [];

    // Remove old timestamps and add new one
    timestamps = timestamps.filter(ts => ts > minuteAgo);
    timestamps.push(now);

    this.rateLimiter.set(userId, timestamps);

    // Cleanup old users (every 100 calls)
    if (this.stats.totalCalls % 100 === 0) {
      this.cleanupRateLimiter();
    }
  }

  /**
   * Clean up old rate limiter entries
   */
  cleanupRateLimiter() {
    const minuteAgo = Date.now() - 60 * 1000;

    for (const [userId, timestamps] of this.rateLimiter.entries()) {
      const recentTimestamps = timestamps.filter(ts => ts > minuteAgo);

      if (recentTimestamps.length === 0) {
        this.rateLimiter.delete(userId);
      } else {
        this.rateLimiter.set(userId, recentTimestamps);
      }
    }
  }

  /**
   * Get statistics for monitoring and tuning
   */
  getStats() {
    const total = this.stats.totalCalls;

    return {
      totalCalls: total,
      clearlySafe: this.stats.clearlySafe,
      potentiallyHarmful: this.stats.potentiallyHarmful,
      ambiguous: this.stats.ambiguous,
      errors: this.stats.errors,
      percentages: {
        safe: total > 0 ? (this.stats.clearlySafe / total * 100).toFixed(1) + '%' : '0%',
        harmful: total > 0 ? (this.stats.potentiallyHarmful / total * 100).toFixed(1) + '%' : '0%',
        ambiguous: total > 0 ? (this.stats.ambiguous / total * 100).toFixed(1) + '%' : '0%'
      },
      estimatedMonthlyCost: this.estimateMonthlyCost()
    };
  }

  /**
   * Estimate monthly cost based on current usage
   */
  estimateMonthlyCost() {
    const avgTokensPerCall = 200; // Conservative estimate
    const costPerMillion = 0.05; // $0.05/M input tokens for nano
    const costPerCall = (avgTokensPerCall / 1000000) * costPerMillion;
    const callsPerDay = this.stats.totalCalls; // Assuming stats since start of day
    const monthlyCallsEstimate = callsPerDay * 30;
    const monthlyCost = monthlyCallsEstimate * costPerCall;

    return `$${monthlyCost.toFixed(2)}/month (estimated)`;
  }

  /**
   * Reset statistics (for testing)
   */
  resetStats() {
    this.stats = {
      totalCalls: 0,
      clearlySafe: 0,
      potentiallyHarmful: 0,
      ambiguous: 0,
      errors: 0
    };
    console.log('📊 Nano pre-filter stats reset');
  }
}

// Singleton instance
const nanoPreFilterService = new NanoPreFilterService();

module.exports = nanoPreFilterService;
