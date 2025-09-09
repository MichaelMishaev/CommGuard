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
  },
  
  // Regex patterns
  PATTERNS: {
    INVITE_LINK: /https?:\/\/(chat\.)?whatsapp\.com\/(chat\/)?([A-Za-z0-9]{6,})/gi,
    PHONE_NUMBER: /^\d{10,15}$/,
  },
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};