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
  // Updated to match scoring system v2.0 (docs/behaviorAnalyse/scoringSystem.md)
  BULLYWATCH: {
    // Scoring thresholds (Section 6.1 from scoring system doc)
    THRESHOLDS: {
      GREEN_MAX: 9,        // 1-9: Safe (log only)
      YELLOW_MAX: 17,      // 10-17: Monitor (alert admin + group reminder)
      RED1_MAX: 29,        // 18-29: Delete + alert
      RED2_MAX: 44,        // 30-44: Delete + alert parents + temp mute
      RED3_MIN: 45,        // 45+: Delete + alert all + auto-ban
    },

    // Behavior scoring (Section 4 from scoring system doc)
    BEHAVIOR: {
      REPEAT_OFFENDER_60MIN: 3,   // +3 points if yellow/red in last 60 min
      REPEAT_OFFENDER_24HR: 6,     // +6 points if red in last 24 hours
      REPEAT_OFFENDER_7DAYS: 10,   // +10 points if 3+ yellow in last 7 days
      PILE_ON_BONUS: 8,            // +8 points for 2nd+ attacker in pile-on (NOT 1st)
      HARASSMENT_2ND_HIT: 4,       // +4 points for 2nd targeting of same victim
      HARASSMENT_3RD_HIT: 7,       // +7 points for 3rd+ targeting of same victim
    },

    // Context modifiers (Section 3 from scoring system doc)
    MODIFIERS: {
      TARGETING_MULTIPLIER: 1.5,        // ×1.5 if direct address (אתה, את, etc.)
      PUBLIC_SHAMING_MULTIPLIER: 1.3,   // ×1.3 if public amplification (כולם, תראו)
      EMOJI_INTENSITY_ADDON: 2,         // +2 if 3+ mocking emojis or clapping pattern
      FRIEND_GROUP_MULTIPLIER: 0.5,     // ×0.5 for whitelisted friend groups
    },

    // GPT Analysis settings (Section 3.3 - for ambiguous cases)
    GPT: {
      ENABLED: true,
      SCORE_RANGE: [11, 15], // Only analyze scores in this range (ambiguous YELLOW)
      CONTEXT_WINDOW_SIZE: 6, // 5-7 messages before/after for context
      MAX_CALLS_PER_HOUR: 20, // Rate limit to control costs
      MODEL: 'gpt-4-turbo-preview', // OpenAI model
    },

    // Friend group detection (Section 3.4)
    FRIEND_GROUP: {
      MAX_SIZE: 10, // Groups <10 members may be friend groups
      MIN_MESSAGES_PER_DAY: 100, // High interaction frequency
      MIN_PARTICIPATION: 0.8, // 80% of members must be active
      REQUIRES_ADMIN_WHITELIST: true, // Admin must explicitly whitelist
    },

    // Temporal analysis settings (Section 4.2, 4.3)
    TEMPORAL: {
      PILE_ON_WINDOW: 10 * 60 * 1000, // 10 minutes for pile-on detection
      PILE_ON_MIN_ATTACKERS: 2, // 2+ different users = pile-on
      HARASSMENT_WINDOW: 30 * 60 * 1000, // 30 minutes for repeat harassment
      MESSAGE_HISTORY_SIZE: 500, // Keep last N messages per group
      MESSAGE_HISTORY_TIME: 24 * 60 * 60 * 1000, // 24 hours
    },

    // Alert settings
    ALERTS: {
      WEEKLY_DIGEST: true, // Send weekly digest of SAFE/MONITOR flags
      INCLUDE_CONTEXT: true, // Include surrounding messages in alerts
      SEND_TO_ADMIN: true, // Send to ADMIN_PHONE from config
    },

    // Feedback loop settings (Section 10.2)
    FEEDBACK: {
      ENABLED: true,
      DECAY_INTERVAL: 30 * 24 * 60 * 60 * 1000, // 30 days for lexicon weight updates
      MIN_FEEDBACK_COUNT: 10, // Require 10+ reviews before updating weights
    },
  },

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};