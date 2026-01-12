/**
 * GPT Analysis Service (Layer 4)
 * Context-aware AI analysis for ambiguous cases (score 11-15)
 * Uses 5-7 message context window to distinguish banter from harassment
 */

const OpenAI = require('openai');
const temporalAnalysisService = require('./temporalAnalysisService');

class GPTAnalysisService {
  constructor() {
    this.initialized = false;
    this.openai = null;
    this.rateLimiter = new Map(); // userId -> last call timestamp
    this.maxCallsPerHour = 20;
    this.contextWindowSize = 5; // 5 messages before and after (total 11 with current)
  }

  async initialize() {
    if (this.initialized) return;

    // Initialize OpenAI
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log('⚠️  OPENAI_API_KEY not found - GPT analysis disabled');
      return;
    }

    this.openai = new OpenAI({
      apiKey: apiKey
    });

    this.initialized = true;
    console.log('✅ GPTAnalysisService initialized');
  }

  /**
   * Analyze message with GPT-4 using context window
   * Only called for ambiguous cases (score 11-15)
   */
  async analyzeWithContext(message, groupId, scoreData) {
    if (!this.initialized || !this.openai) {
      return {
        analyzed: false,
        reason: 'GPT service not available',
        adjustedScore: scoreData.totalScore
      };
    }

    // Check rate limit
    if (!this.checkRateLimit(message.sender)) {
      return {
        analyzed: false,
        reason: 'Rate limit exceeded',
        adjustedScore: scoreData.totalScore
      };
    }

    try {
      // Get context window (5 messages before and after)
      const context = temporalAnalysisService.getContextWindow(
        groupId,
        message.id,
        this.contextWindowSize
      );

      // Build conversation context for GPT
      const conversationContext = this.buildConversationContext(context);

      // Call GPT-4
      const gptResponse = await this.callGPT(conversationContext, scoreData);

      // Update rate limiter
      this.updateRateLimit(message.sender);

      return {
        analyzed: true,
        gptVerdict: gptResponse.verdict,
        gptConfidence: gptResponse.confidence,
        gptExplanation: gptResponse.explanation,
        adjustedScore: gptResponse.adjustedScore,
        isBanter: gptResponse.verdict === 'banter',
        isHarassment: gptResponse.verdict === 'harassment'
      };
    } catch (error) {
      console.error('Error in GPT analysis:', error);
      return {
        analyzed: false,
        reason: error.message,
        adjustedScore: scoreData.totalScore
      };
    }
  }

  /**
   * Build conversation context for GPT
   */
  buildConversationContext(context) {
    const messages = [];

    // Add messages before
    context.before.forEach((msg, index) => {
      messages.push({
        position: `before_${index + 1}`,
        sender: this.anonymizeSender(msg.sender),
        text: msg.text,
        timestamp: new Date(msg.timestamp).toISOString()
      });
    });

    // Add current message (the flagged one)
    if (context.current) {
      messages.push({
        position: 'current',
        sender: this.anonymizeSender(context.current.sender),
        text: context.current.text,
        timestamp: new Date(context.current.timestamp).toISOString(),
        flagged: true
      });
    }

    // Add messages after
    context.after.forEach((msg, index) => {
      messages.push({
        position: `after_${index + 1}`,
        sender: this.anonymizeSender(msg.sender),
        text: msg.text,
        timestamp: new Date(msg.timestamp).toISOString()
      });
    });

    return messages;
  }

  /**
   * Anonymize sender IDs for privacy
   */
  anonymizeSender(senderId) {
    // Convert to anonymous labels (User A, User B, etc.)
    const hash = senderId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const letter = String.fromCharCode(65 + (hash % 26)); // A-Z
    return `User ${letter}`;
  }

  /**
   * Call GPT-4 for analysis
   */
  async callGPT(conversationContext, scoreData) {
    const systemPrompt = `You are an expert in detecting online harassment and bullying in Hebrew WhatsApp groups, particularly among teenagers.

Your task is to analyze a conversation and determine if a flagged message is:
1. HARASSMENT - genuine bullying, threats, or harmful behavior
2. BANTER - friendly joking between friends
3. AMBIGUOUS - unclear, need more context

Context:
- This is a Hebrew WhatsApp group conversation
- The flagged message scored ${scoreData.totalScore} on automated detection (11-15 range = ambiguous)
- Categories detected: ${scoreData.details.categories.join(', ')}

Consider:
- Are participants friends joking around, or is this hostile?
- Is there a power imbalance or targeting of one person?
- What's the overall tone of the conversation?
- Are there signs of distress from the target?

Respond in JSON format:
{
  "verdict": "harassment" | "banter" | "ambiguous",
  "confidence": 0.0-1.0,
  "explanation": "brief explanation in Hebrew",
  "adjustedScore": number (adjust original score based on context)
}`;

    const userPrompt = `Conversation context (${conversationContext.length} messages):

${conversationContext.map(msg => {
  const flag = msg.flagged ? ' ⚠️ FLAGGED' : '';
  return `[${msg.position}] ${msg.sender}: ${msg.text}${flag}`;
}).join('\n')}

Original automated score: ${scoreData.totalScore}
Detected categories: ${scoreData.details.categories.join(', ')}

Is the flagged message harassment or banter?`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent analysis
      max_tokens: 500
    });

    const response = JSON.parse(completion.choices[0].message.content);

    return {
      verdict: response.verdict || 'ambiguous',
      confidence: response.confidence || 0.5,
      explanation: response.explanation || 'No explanation provided',
      adjustedScore: response.adjustedScore || scoreData.totalScore
    };
  }

  /**
   * Check if user is within rate limit
   */
  checkRateLimit(userId) {
    const now = Date.now();
    const lastCall = this.rateLimiter.get(userId) || 0;
    const hourAgo = now - 60 * 60 * 1000;

    // Reset if more than an hour has passed
    if (lastCall < hourAgo) {
      this.rateLimiter.delete(userId);
      return true;
    }

    // Count calls in last hour
    const callsInLastHour = Array.from(this.rateLimiter.values())
      .filter(timestamp => timestamp > hourAgo).length;

    return callsInLastHour < this.maxCallsPerHour;
  }

  /**
   * Update rate limiter after successful call
   */
  updateRateLimit(userId) {
    this.rateLimiter.set(userId, Date.now());

    // Clean up old entries
    const hourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, timestamp] of this.rateLimiter.entries()) {
      if (timestamp < hourAgo) {
        this.rateLimiter.delete(id);
      }
    }
  }

  /**
   * Get rate limit status for a user
   */
  getRateLimitStatus(userId) {
    const now = Date.now();
    const lastCall = this.rateLimiter.get(userId);

    if (!lastCall) {
      return {
        canCall: true,
        callsRemaining: this.maxCallsPerHour,
        resetTime: null
      };
    }

    const hourAgo = now - 60 * 60 * 1000;
    const callsInLastHour = Array.from(this.rateLimiter.values())
      .filter(timestamp => timestamp > hourAgo).length;

    return {
      canCall: callsInLastHour < this.maxCallsPerHour,
      callsRemaining: Math.max(0, this.maxCallsPerHour - callsInLastHour),
      resetTime: new Date(lastCall + 60 * 60 * 1000)
    };
  }

  /**
   * Set context window size (for testing/tuning)
   */
  setContextWindowSize(size) {
    this.contextWindowSize = Math.max(1, Math.min(10, size));
    console.log(`📊 GPT context window size set to ${this.contextWindowSize}`);
  }
}

// Singleton instance
const gptAnalysisService = new GPTAnalysisService();

module.exports = gptAnalysisService;
