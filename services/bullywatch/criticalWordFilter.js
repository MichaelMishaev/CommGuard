/**
 * Critical Word Filter (Layer -1)
 * Local, instant filter for known high-severity Hebrew profanity/threats
 *
 * Purpose: NEVER waste AI API calls on words we KNOW are harmful
 * Cost: FREE (local regex matching)
 * Speed: <1ms (instant)
 *
 * This runs BEFORE all other layers (even nano pre-filter)
 */

class CriticalWordFilter {
  constructor() {
    // CRITICAL: These words ALWAYS trigger alerts, no AI needed
    // User feedback: "never filter that word!! why??" - referring to זונה
    this.criticalWords = [
      // Prostitute/whore insults (HIGH severity)
      'זונה', 'זונוט', 'בנזונה', 'בטזונה', 'זונות',

      // Mental disability slurs
      'מפגר', 'מפגרת', 'מפגרים', 'מפגרות',

      // Death threats
      'תמות', 'תמותי', 'למות', 'שתמות',

      // Suicide/self-harm
      'להתאבד', 'אתאבד', 'התאבדות', 'תתאבד',

      // Rape/sexual violence
      'לאנוס', 'אנוס', 'אונס', 'אנוסה', 'תאנס',

      // Murder/kill
      'להרוג', 'ארצח', 'לרצוח', 'תהרוג', 'ארצח אותך',

      // Extreme violence verbs
      'לשבור', 'תשבר', 'להרביץ', 'תהרביץ',

      // Son of a bitch variations
      'בן זונה', 'בן של זונה', 'בת זונה'
    ];

    // Compile regex patterns for fast matching
    this.patterns = this.criticalWords.map(word => {
      // Escape special regex characters
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match with optional spaces between letters (to catch "מ פ ג ר")
      const withSpaces = escaped.split('').join('\\s*');
      return new RegExp(withSpaces, 'gi');
    });

    this.stats = {
      totalChecks: 0,
      criticalWordFound: 0,
      passedToNextLayer: 0
    };
  }

  /**
   * Fast local check: Does message contain critical words?
   * @param {Object} message - Message object with text
   * @returns {Object} - { isCritical, word, normalizedText }
   */
  checkMessage(message) {
    this.stats.totalChecks++;

    const messageText = message.text || message.body || '';

    // Skip empty or very short messages
    if (messageText.length < 3) {
      this.stats.passedToNextLayer++;
      return {
        isCritical: false,
        reason: 'Message too short'
      };
    }

    // Normalize text: remove spaces, lowercase
    const normalizedText = messageText.replace(/\s+/g, '').toLowerCase();

    // Check each critical word
    for (let i = 0; i < this.criticalWords.length; i++) {
      const word = this.criticalWords[i];
      const pattern = this.patterns[i];

      if (pattern.test(normalizedText)) {
        this.stats.criticalWordFound++;

        return {
          isCritical: true,
          word: word,
          normalizedText: normalizedText,
          originalText: messageText,
          matchedPattern: pattern.toString(),
          severity: 'CRITICAL',
          score: 100, // Maximum score - skip all AI layers
          reason: `Contains critical Hebrew profanity: "${word}"`,
          action: {
            type: 'alert',
            alertAdmin: true,
            deleteMessage: false, // Monitor mode respects this
            description: `Critical word detected: ${word} (local filter)`
          }
        };
      }
    }

    // No critical words found - pass to next layer
    this.stats.passedToNextLayer++;
    return {
      isCritical: false,
      reason: 'No critical words found'
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    const total = this.stats.totalChecks;
    return {
      totalChecks: total,
      criticalWordFound: this.stats.criticalWordFound,
      passedToNextLayer: this.stats.passedToNextLayer,
      percentages: {
        criticalRate: total > 0 ? (this.stats.criticalWordFound / total * 100).toFixed(1) + '%' : '0%',
        passRate: total > 0 ? (this.stats.passedToNextLayer / total * 100).toFixed(1) + '%' : '0%'
      }
    };
  }

  /**
   * Add new critical word (for dynamic updates)
   */
  addCriticalWord(word) {
    if (!this.criticalWords.includes(word)) {
      this.criticalWords.push(word);

      // Recompile patterns
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const withSpaces = escaped.split('').join('\\s*');
      this.patterns.push(new RegExp(withSpaces, 'gi'));

      console.log(`✅ Added critical word: ${word}`);
    }
  }

  /**
   * Remove critical word
   */
  removeCriticalWord(word) {
    const index = this.criticalWords.indexOf(word);
    if (index !== -1) {
      this.criticalWords.splice(index, 1);
      this.patterns.splice(index, 1);
      console.log(`⛔ Removed critical word: ${word}`);
    }
  }

  /**
   * Get list of all critical words (for admin review)
   */
  getCriticalWords() {
    return [...this.criticalWords];
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalChecks: 0,
      criticalWordFound: 0,
      passedToNextLayer: 0
    };
    console.log('📊 Critical word filter stats reset');
  }
}

// Singleton instance
const criticalWordFilter = new CriticalWordFilter();

module.exports = criticalWordFilter;
