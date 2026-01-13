// services/sentimentAnalysisConfig.js
// Configuration constants for sentiment analysis service

/**
 * Sentiment Analysis Configuration
 * Centralized constants for security, performance, and cost control
 */
module.exports = {
    // Budget Control
    DAILY_BUDGET_USD: 1.00,                    // Maximum spending per day

    // Rate Limiting (Anti-Abuse)
    MAX_CALLS_PER_MINUTE: 10,                  // Prevent burst attacks
    MIN_CALL_INTERVAL_MS: 1000,                // 1 second between calls
    MAX_TIMESTAMPS_STORED: 1000,               // Memory safety limit

    // GPT API Configuration
    MODEL: 'gpt-4.1-nano',                     // GPT-4.1-nano: Fast, cheap, non-reasoning
    MAX_OUTPUT_TOKENS: 500,                    // Sufficient for JSON response
    API_TIMEOUT_MS: 5000,                      // 5 seconds (was 15s)
    TEMPERATURE: 0.3,                          // Low temperature for consistent structured output

    // GPT Pricing (as of 2026)
    // Source: https://openai.com/index/introducing-gpt-5-for-developers/
    INPUT_COST_PER_1M_TOKENS: 0.25,           // $0.25 per 1M input tokens
    OUTPUT_COST_PER_1M_TOKENS: 2.0,           // $2.00 per 1M output tokens

    // Input Sanitization
    MAX_INPUT_LENGTH: 500,                     // Maximum characters per input field

    // Conversation Context
    CONTEXT_WINDOW_SIZE: 5,                    // Last N messages for context
    CONTEXT_TTL_SECONDS: 300,                  // 5 minutes (realistic conversation pace)

    // Alert Mapping (for delete command)
    ALERT_MAPPING_TTL_SECONDS: 86400,          // 24 hours

    // Redis Keys
    REDIS_KEY_COSTS: 'sentiment_costs',        // sentiment_costs:{date}
    REDIS_KEY_CONTEXT: 'group_context',        // group_context:{chatId}
    REDIS_KEY_ALERT_MAP: 'alert_to_original',  // alert_to_original:{alertId}

    // Cost Tracking Persistence
    COST_EXPIRY_BUFFER_HOURS: 1,               // Keep costs 1 hour past midnight

    // Structured Output Schema (Prompt Injection Prevention)
    // FIX: Changed "name" to "type" for Chat Completions API compatibility
    RESPONSE_SCHEMA: {
        type: "json_schema",
        json_schema: {
            name: "bullying_analysis",
            strict: true,
            schema: {
                type: "object",
                properties: {
                    isBullying: {
                        type: "boolean",
                        description: "True if message contains bullying directed at real people"
                    },
                    severity: {
                        type: "string",
                        enum: ["none", "mild", "moderate", "severe"],
                        description: "Severity level of bullying"
                    },
                    confidence: {
                        type: "number",
                        minimum: 0,
                        maximum: 100,
                        description: "Confidence percentage (0-100)"
                    },
                    category: {
                        type: "string",
                        enum: [
                            "direct_insult",
                            "body_shaming",
                            "threats",
                            "exclusion",
                            "manipulation",
                            "sexual_harassment",
                            "cyberbullying",
                            "none"
                        ],
                        description: "Primary category of bullying"
                    },
                    explanation: {
                        type: "string",
                        maxLength: 200,
                        description: "Brief explanation of why this is/isn't bullying"
                    },
                    emotionalImpact: {
                        type: "string",
                        maxLength: 200,
                        description: "Description of potential emotional harm"
                    },
                    recommendation: {
                        type: "string",
                        enum: ["keep_monitoring", "alert_admin", "immediate_action"],
                        description: "Recommended action level"
                    }
                },
                required: ["isBullying", "severity", "confidence", "category", "explanation", "emotionalImpact", "recommendation"],
                additionalProperties: false
            }
        }
    }
};
