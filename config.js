// Configuration for bCommGuard Bot

module.exports = {
  // Admin phone numbers for receiving alerts and notifications
  // Format: Country code + number (without + or @s.whatsapp.net)
  // Example: '1234567890' for US (+1) 234-567-890
  // Example: '972555555555' for Israel (+972) 55-555-5555
  ADMIN_PHONE: process.env.ADMIN_PHONE || '972544345287', // YOUR phone to control the bot
  ALERT_PHONE: process.env.ALERT_PHONE || '972544345287', // Phone to receive kick alerts
  
  // Bot settings
  BOT_NAME: 'CommGuard Bot',
  
  // Rate limiting
  MESSAGE_DELETE_DELAY: 200, // ms between message deletions
  KICK_COOLDOWN: 10000, // 10 seconds cooldown between kicks for same user
  
  // Features
  FEATURES: {
    INVITE_LINK_DETECTION: true,
    AUTO_KICK_BLACKLISTED: true,
    FIREBASE_INTEGRATION: true, // Enable Firebase integration
    RESTRICT_COUNTRY_CODES: true, // Auto-kick +1 and +6 numbers
    BYPASS_BOT_ADMIN_CHECK: true, // Workaround for LID format bot detection issues
    AUTO_TRANSLATION: false, // Auto-translate non-Hebrew replies to Hebrew
    STEALTH_MODE: true, // Enable human-like behavior to avoid detection
    RANDOMIZE_RESPONSES: true, // Use varied message responses
    SIMULATE_TYPING: true, // Show typing indicators before messages
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

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};