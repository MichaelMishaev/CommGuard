// Configuration for bCommGuard Bot

module.exports = {
  // Admin phone numbers for receiving alerts and notifications
  // Format: Country code + number (without + or @s.whatsapp.net)
  // Example: '1234567890' for US (+1) 234-567-890
  // Example: '972555555555' for Israel (+972) 55-555-5555
  ADMIN_PHONE: process.env.ADMIN_PHONE || '972544345287', // YOUR phone to control the bot
  ALERT_PHONE: process.env.ALERT_PHONE || '972544345287', // Phone to receive kick alerts
  ADMIN_LID: process.env.ADMIN_LID || '171012763213843', // Admin LID format (for multi-device accounts)
  
  // Bot settings
  BOT_NAME: 'CommGuard Bot',
  
  // Rate limiting
  MESSAGE_DELETE_DELAY: 200, // ms between message deletions
  KICK_COOLDOWN: 10000, // 10 seconds cooldown between kicks for same user
  
  // Features
  FEATURES: {
    INVITE_LINK_DETECTION: true,
    AUTO_KICK_BLACKLISTED: true, // Re-enabled with minimal Firebase usage
    FIREBASE_INTEGRATION: true, // Re-enabled with optimizations
    RESTRICT_COUNTRY_CODES: true, // Auto-kick +1 and +6 numbers
    BYPASS_BOT_ADMIN_CHECK: true, // Workaround for LID format bot detection issues
    AUTO_TRANSLATION: false, // Auto-translate non-Hebrew replies to Hebrew
    STEALTH_MODE: true, // Enable human-like behavior to avoid detection
    RANDOMIZE_RESPONSES: true, // Use varied message responses
    SIMULATE_TYPING: true, // Show typing indicators before messages

    // Anti-Bullying System (#bullywatch)
    BULLYWATCH_ENABLED: true, // Enable bullying detection system
    BULLYWATCH_MONITOR_MODE: true, // CRITICAL: Start in monitor mode (no auto-deletions)
    BULLYWATCH_GPT_ANALYSIS: true, // Use GPT for ambiguous cases (requires OPENAI_API_KEY)
  },
  
  // Regex patterns
  PATTERNS: {
    INVITE_LINK: /https?:\/\/(chat\.)?whatsapp\.com\/(chat\/)?([A-Za-z0-9]{6,})/gi,
    PHONE_NUMBER: /^\d{10,15}$/,
  },

  // Stealth mode settings (to avoid WhatsApp detection)
  STEALTH: {
    // Browser identification (more generic)
    BROWSER: ['Chrome', 'Desktop', '110.0.0.0'],

    // Human-like delays
    MIN_ACTION_DELAY: 2000, // 2 seconds minimum delay
    MAX_ACTION_DELAY: 6000, // 6 seconds maximum delay
    DELETE_MESSAGE_DELAY: 1500, // delay before deleting messages

    // Typing simulation
    WORDS_PER_MINUTE: 45, // average typing speed
    MAX_TYPING_DURATION: 8000, // max typing time in ms

    // Rate limiting
    MAX_ACTIONS_PER_HOUR: 15, // max bot actions per chat per hour
    MAX_ACTIONS_PER_MINUTE: 2, // max bot actions per chat per minute

    // Presence simulation
    PRESENCE_UPDATE_CHANCE: 0.8, // 80% chance to show typing
    RANDOM_DELAYS: true, // add random variations to all delays
  },

  // Anti-Bullying System (#bullywatch) Configuration
  BULLYWATCH: {
    // Scoring thresholds
    THRESHOLDS: {
      SAFE: 4,         // 0-4: No action
      MONITOR: 10,     // 5-10: Log for weekly digest
      ALERT: 15,       // 11-15: Alert admin immediately (GPT analysis triggered)
      HIGH_RISK: 16,   // 16+: High risk (auto-action if monitor mode disabled)
    },

    // GPT Analysis settings
    GPT: {
      CONTEXT_WINDOW_SIZE: 5, // Number of messages before/after (total 11 with current)
      MAX_CALLS_PER_HOUR: 20, // Rate limit per user
      MODEL: 'gpt-4-turbo-preview', // OpenAI model to use
    },

    // Friend group detection (auto-whitelist)
    FRIEND_GROUP: {
      MAX_SIZE: 10, // Groups smaller than this may be friend groups
      MIN_PARTICIPATION: 0.8, // 80% of members must be active to qualify
    },

    // Temporal analysis settings
    TEMPORAL: {
      PILE_ON_THRESHOLD: 3, // 3+ users targeting same person = pile-on
      VELOCITY_THRESHOLD: 5, // 5+ messages in 5 minutes = spike
      MESSAGE_HISTORY_SIZE: 500, // Keep last N messages per group
      MESSAGE_HISTORY_TIME: 24 * 60 * 60 * 1000, // 24 hours
    },

    // Alert settings
    ALERTS: {
      WEEKLY_DIGEST: true, // Send weekly digest of MONITOR-level flags
      IMMEDIATE_ALERT_THRESHOLD: 15, // Alert admin immediately at this score
      INCLUDE_CONTEXT_IN_ALERT: true, // Include surrounding messages in alert
    },
  },

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};