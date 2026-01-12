/**
 * Lexicon-Based Detection Service (Layer 1)
 * Fast, local keyword and pattern matching for Hebrew bullying detection
 * Includes emoji analysis, normalization, and multi-category threat detection
 */

class LexiconService {
  constructor() {
    this.initialized = false;
    this.weights = new Map(); // Dynamic weights updated by feedback loop
  }

  async initialize() {
    if (this.initialized) return;

    // Load dynamic weights from feedback service if available
    await this.loadWeights();

    this.initialized = true;
    console.log('✅ LexiconService initialized');
  }

  async loadWeights() {
    // Placeholder for feedback-based weight loading
    // Will be implemented by feedbackService.js
    this.weights.set('default', 1.0);
  }

  /**
   * Main detection method - analyzes message for bullying indicators
   * @param {string} messageText - The message to analyze
   * @returns {Object} - Detection results with hits, categories, and base score
   */
  detect(messageText) {
    if (!messageText || typeof messageText !== 'string') {
      return { hits: [], categories: [], baseScore: 0 };
    }

    // IMPORTANT: Use original text for detection (patterns already handle Hebrew)
    const text = messageText;
    const hits = [];
    const categories = new Set();
    let baseScore = 0;

    // A) General Insults (Low-Medium)
    const generalInsults = this.detectGeneralInsults(text);
    if (generalInsults.hits.length > 0) {
      hits.push(...generalInsults.hits);
      categories.add('general_insult');
      baseScore += generalInsults.score;
    }

    // B) Sexual/Harassment (High)
    const sexualHarassment = this.detectSexualHarassment(text);
    if (sexualHarassment.hits.length > 0) {
      hits.push(...sexualHarassment.hits);
      categories.add('sexual_harassment');
      baseScore += sexualHarassment.score;
    }

    // C) Social Exclusion (Medium-High)
    const socialExclusion = this.detectSocialExclusion(text);
    if (socialExclusion.hits.length > 0) {
      hits.push(...socialExclusion.hits);
      categories.add('social_exclusion');
      baseScore += socialExclusion.score;
    }

    // D) Direct Threats (High)
    const directThreats = this.detectDirectThreats(text);
    if (directThreats.hits.length > 0) {
      hits.push(...directThreats.hits);
      categories.add('direct_threat');
      baseScore += directThreats.score;
    }

    // E) Doxxing/Sextortion/Blackmail (High)
    const privacyThreats = this.detectPrivacyThreats(text);
    if (privacyThreats.hits.length > 0) {
      hits.push(...privacyThreats.hits);
      categories.add('privacy_threat');
      baseScore += privacyThreats.score;
    }

    // F) Privacy Invasion (High)
    const privacyInvasion = this.detectPrivacyInvasion(text);
    if (privacyInvasion.hits.length > 0) {
      hits.push(...privacyInvasion.hits);
      categories.add('privacy_invasion');
      baseScore += privacyInvasion.score;
    }

    // G) Public Humiliation (Medium-High)
    const publicHumiliation = this.detectPublicHumiliation(text);
    if (publicHumiliation.hits.length > 0) {
      hits.push(...publicHumiliation.hits);
      categories.add('public_humiliation');
      baseScore += publicHumiliation.score;
    }

    // H) Emoji Analysis
    const emojiAnalysis = this.analyzeEmojis(messageText); // Use original text for emojis
    if (emojiAnalysis.hits.length > 0) {
      hits.push(...emojiAnalysis.hits);
      categories.add('emoji_harassment');
      baseScore += emojiAnalysis.score;
    }

    return {
      hits,
      categories: Array.from(categories),
      baseScore,
      normalized: this.normalizeHebrew(text)
    };
  }

  // A) General Insults - Updated to match scoring system v2.0
  // Section 2.1: Direct Insult = +4 points
  detectGeneralInsults(text) {
    const patterns = [
      // Classic insults - ALL score 4 points (Direct Insult category)
      { pattern: /מפגר|מפגרת|מפוגר|מ פ ג ר|מ\.פ\.ג\.ר/g, word: 'מפגר', score: 4, category: 'general_insult' },
      { pattern: /טיפש|טיפשה|tipesh|tipsh/g, word: 'טיפש', score: 4, category: 'general_insult' },
      { pattern: /לוזר|lozer|loozer|loser/g, word: 'לוזר', score: 4, category: 'general_insult' },
      { pattern: /דפוק|דפוקה|מטורף/g, word: 'דפוק', score: 4, category: 'general_insult' },
      { pattern: /אידיוט|idiot/g, word: 'אידיוט', score: 4, category: 'general_insult' },
      { pattern: /טמבל|טמבלה/g, word: 'טמבל', score: 4, category: 'general_insult' },
      { pattern: /מסריח|מסריחה/g, word: 'מסריח', score: 4, category: 'general_insult' },
      { pattern: /זבל|garbage|trash/g, word: 'זבל', score: 4, category: 'general_insult' },
      { pattern: /דוחה|מגעיל/g, word: 'דוחה', score: 4, category: 'general_insult' },
      { pattern: /פתטי|pathetic|cringe|קרינג/g, word: 'פתטי', score: 4, category: 'general_insult' },
      { pattern: /מביך|embarrassing/g, word: 'מביך', score: 4, category: 'general_insult' },
      { pattern: /שקרן|שקרנית|liar/g, word: 'שקרן', score: 4, category: 'general_insult' },
      { pattern: /גנב|גנבת|thief/g, word: 'גנב', score: 4, category: 'general_insult' },
    ];

    return this.matchPatterns(text, patterns);
  }

  // B) Sexual/Harassment - Updated to match scoring system v2.0
  // Section 2.1: Sexual Threat/Coercion = +20 points (Critical)
  detectSexualHarassment(text) {
    const patterns = [
      // Note: These are critical threats - score 20 for sexual coercion
      { pattern: /זונה|whore|slut|zona/g, word: 'זונה', score: 20, category: 'sexual_harassment' },
      { pattern: /בן זונה|בת זונה|ben zona/g, word: 'בן/בת זונה', score: 20, category: 'sexual_harassment' },
      { pattern: /שרמוטה|sharmuta/g, word: 'שרמוטה', score: 20, category: 'sexual_harassment' },
      { pattern: /כלבה|bitch/g, word: 'כלבה', score: 16, category: 'sexual_harassment' },
      { pattern: /תשלח תמונה|send pic/g, word: 'תשלח תמונה', score: 20, category: 'sexual_harassment' },
    ];

    return this.matchPatterns(text, patterns);
  }

  // C) Social Exclusion - Updated to match scoring system v2.0
  // Section 2.1: Exclusion/Boycott = +10 points
  detectSocialExclusion(text) {
    const patterns = [
      { pattern: /אל תצרפו|לא לצרף|al tatzrfu/g, word: 'אל תצרפו', score: 10, category: 'social_exclusion' },
      { pattern: /תעיפו|תוציאו מהקבוצה|ta\'ifu/g, word: 'תעיפו', score: 10, category: 'social_exclusion' },
      { pattern: /חסום|חסמי|כולם לחסום/g, word: 'חסום', score: 10, category: 'social_exclusion' },
      { pattern: /מי שמדבר איתו|מי שמדברת איתה/g, word: 'מי שמדבר איתו', score: 10, category: 'social_exclusion' },
      { pattern: /אף אחד לא|כולם נגד/g, word: 'אף אחד לא/כולם נגד', score: 10, category: 'social_exclusion' },
      { pattern: /נפסל|disqualified/g, word: 'נפסל', score: 10, category: 'social_exclusion' },
      { pattern: /אנחנו לא רוצים אותך|אנחנו לא רוצים אותו/g, word: 'לא רוצים', score: 10, category: 'social_exclusion' },
    ];

    return this.matchPatterns(text, patterns);
  }

  // D) Direct Threats - Updated to match scoring system v2.0
  // Section 2.1: Violence Threat = +18 points (Critical)
  detectDirectThreats(text) {
    const patterns = [
      { pattern: /חכה לי|חכה חכה|chake li/g, word: 'חכה לי', score: 18, category: 'direct_threat' },
      { pattern: /אני אשבור אותך|אני מפרק אותך|ashbor/g, word: 'אשבור אותך', score: 18, category: 'direct_threat' },
      { pattern: /אני אבוא אליך/g, word: 'אבוא אליך', score: 18, category: 'direct_threat' },
      { pattern: /אני אתפוס אותך/g, word: 'אתפוס אותך', score: 18, category: 'direct_threat' },
      { pattern: /ניפגש אחרי בית ספר|ניפגש בחוץ|אחרי ביס/g, word: 'ניפגש אחרי ביס', score: 18, category: 'direct_threat' },
      { pattern: /אני אדאג לך/g, word: 'אדאג לך', score: 18, category: 'direct_threat' },
      { pattern: /תזהר ממני|תזהרי ממני/g, word: 'תזהר ממני', score: 18, category: 'direct_threat' },
      { pattern: /אני אהרוג אותך|אני אמחק אותך|aharog/g, word: 'אהרוג/אמחק', score: 20, category: 'direct_threat' },
      { pattern: /אני ארביץ לך|אני אשבור לך/g, word: 'ארביץ/אשבור', score: 18, category: 'direct_threat' },
    ];

    return this.matchPatterns(text, patterns);
  }

  // E) Doxxing/Sextortion/Blackmail - Updated to match scoring system v2.0
  // Section 2.1: Blackmail/Leak Threat = +14, Doxxing = +18 points
  detectPrivacyThreats(text) {
    const patterns = [
      { pattern: /יש לי צילום מסך|יש לי סקרינשוט/g, word: 'יש לי צילום מסך', score: 14, category: 'privacy_threat' },
      { pattern: /אני מפרסם|אני שולח לכולם/g, word: 'אני מפרסם', score: 14, category: 'privacy_threat' },
      { pattern: /אני שולח להורים|אני שולח למחנכת|אני שולח למנהל/g, word: 'שולח להורים', score: 14, category: 'privacy_threat' },
      { pattern: /אם לא.*אז|אם לא תעשה/g, word: 'אם לא...אז (סחיטה)', score: 14, category: 'privacy_threat' },
      { pattern: /תשלח לי בפרטי|שלח לי בפרטי/g, word: 'שלח לי בפרטי', score: 14, category: 'privacy_threat' },
      { pattern: /תשלח תמונה ואז אמחק/g, word: 'תשלח תמונה ואמחק', score: 20, category: 'sexual_harassment' },
      { pattern: /כולם שלחו כבר/g, word: 'כולם שלחו כבר', score: 14, category: 'privacy_threat' },
      { pattern: /אל תהיה ילד|אל תהיי ילדה/g, word: 'אל תהיה ילד', score: 14, category: 'privacy_threat' },
      { pattern: /זה סוד בינינו/g, word: 'סוד בינינו', score: 14, category: 'privacy_threat' },
    ];

    return this.matchPatterns(text, patterns);
  }

  // F) Privacy Invasion - Updated to match scoring system v2.0
  // Section 2.1: Doxxing/Privacy Threat = +18 points (Critical)
  detectPrivacyInvasion(text) {
    const patterns = [
      { pattern: /מה הכתובת שלך|תן כתובת/g, word: 'מה הכתובת', score: 18, category: 'privacy_invasion' },
      { pattern: /שלח מיקום|תשלח מיקום/g, word: 'שלח מיקום', score: 18, category: 'privacy_invasion' },
      { pattern: /יש לי את המספר של|יש לי ת'מספר/g, word: 'יש לי המספר', score: 18, category: 'privacy_invasion' },
      { pattern: /אני יודע איפה אתה גר|אני יודעת איפה את גרה/g, word: 'יודע איפה גר', score: 18, category: 'privacy_invasion' },
      { pattern: /יש לי תמונות|יש לי צילומים/g, word: 'יש לי תמונות', score: 18, category: 'privacy_invasion' },
    ];

    return this.matchPatterns(text, patterns);
  }

  // G) Public Humiliation - Updated to match scoring system v2.0
  // Section 2.1: Targeted Humiliation = +12 points
  detectPublicHumiliation(text) {
    const patterns = [
      { pattern: /תעלה צילום|תעלו צילום/g, word: 'תעלה צילום', score: 12, category: 'public_humiliation' },
      { pattern: /שלחו לכולם/g, word: 'שלחו לכולם', score: 12, category: 'public_humiliation' },
      { pattern: /בואו נעשה עליו סטיקר|בואו נעשה עליה סטיקר/g, word: 'נעשה סטיקר', score: 12, category: 'public_humiliation' },
      { pattern: /שימו אותו בסטטוס|שימו אותה בסטטוס/g, word: 'בסטטוס', score: 12, category: 'public_humiliation' },
      { pattern: /תייגו את ההורים/g, word: 'תייגו ההורים', score: 12, category: 'public_humiliation' },
      { pattern: /פתחתי עליו חשבון|פתחתי עליה חשבון/g, word: 'פתחתי חשבון', score: 12, category: 'public_humiliation' },
      { pattern: /עשיתי פרופיל בשמו|עשיתי פרופיל בשמה/g, word: 'פרופיל בשמו', score: 12, category: 'public_humiliation' },
      { pattern: /אני אשלח בשמך/g, word: 'אשלח בשמך', score: 12, category: 'public_humiliation' },
      { pattern: /תראה מה כתבו בשם שלך/g, word: 'כתבו בשם שלך', score: 12, category: 'public_humiliation' },
    ];

    return this.matchPatterns(text, patterns);
  }

  // H) Emoji Analysis - Updated to match scoring system v2.0
  // Section 2.1: Mocking Emojis = +3 points
  // Note: Emoji intensity (+2) is handled separately in scoringService
  analyzeEmojis(messageText) {
    const hits = [];
    let score = 0;

    // Mocking/Humiliation emojis - Score +3 per emoji (Section 2.1)
    const mockingEmojis = {
      '🤡': { name: 'clown', score: 3, category: 'emoji_harassment' },
      '💀': { name: 'skull (mocking)', score: 3, category: 'emoji_harassment' },
      '🙄': { name: 'eye roll', score: 3, category: 'emoji_harassment' },
      '😂': { name: 'laughing (mocking)', score: 3, category: 'emoji_harassment' },
      '🤏': { name: 'small/pathetic', score: 3, category: 'emoji_harassment' },
    };

    // Degrading comparison - Score +6 (Section 2.1)
    const disgustEmojis = {
      '🗑️': { name: 'trash', score: 6, category: 'emoji_harassment' },
      '💩': { name: 'poop', score: 6, category: 'emoji_harassment' },
      '🤢': { name: 'nauseated', score: 6, category: 'emoji_harassment' },
      '🤮': { name: 'vomiting', score: 6, category: 'emoji_harassment' },
      '🐷': { name: 'pig', score: 6, category: 'emoji_harassment' },
      '🐀': { name: 'rat', score: 6, category: 'emoji_harassment' },
      '🪳': { name: 'cockroach', score: 6, category: 'emoji_harassment' },
    };

    // Threat emojis - Critical category (would trigger floor rule)
    const threatEmojis = {
      '🔪': { name: 'knife', score: 18, category: 'direct_threat' },
      '🩸': { name: 'blood', score: 18, category: 'direct_threat' },
      '☠️': { name: 'skull and crossbones', score: 18, category: 'direct_threat' },
      '💣': { name: 'bomb', score: 18, category: 'direct_threat' },
      '🔫': { name: 'gun', score: 18, category: 'direct_threat' },
    };

    // Count emojis (but no multiplier for repetition - handled by hard cap)
    const allEmojis = { ...mockingEmojis, ...disgustEmojis, ...threatEmojis };

    for (const [emoji, info] of Object.entries(allEmojis)) {
      const regex = new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = messageText.match(regex);
      if (matches) {
        const count = matches.length;

        // Each emoji match gets its base score (no multiplier)
        // Hard cap (max 2 per category) will be applied by scoringService
        for (let i = 0; i < count; i++) {
          hits.push({
            type: 'emoji',
            emoji: emoji,
            name: info.name,
            count: 1,
            score: info.score,
            category: info.category
          });
          score += info.score;
        }
      }
    }

    // Detect clapping hands pattern (👏...👏 = passive aggressive) - Score +3
    const clappingPattern = /👏[^👏]{1,20}👏/g;
    if (clappingPattern.test(messageText)) {
      hits.push({
        type: 'emoji_pattern',
        pattern: 'clapping_emphasis',
        score: 3,
        category: 'emoji_harassment'
      });
      score += 3;
    }

    return { hits, score };
  }

  /**
   * Hebrew text normalization to catch evasion tactics
   * Handles: letter swaps, spacing, punctuation
   * Section 1.1 and 1.2 from scoring system doc
   */
  normalizeHebrew(text) {
    if (!text || typeof text !== 'string') return '';

    let normalized = text.toLowerCase();

    // 1.2 Spacing Evasion Removal (מ פ ג ר → מפגר)
    normalized = normalized.replace(/([א-ת])\s+([א-ת])/g, '$1$2');

    // Remove punctuation between letters (מ.פ.ג.ר → מפגר)
    normalized = normalized.replace(/([א-ת])[.,\-_]+([א-ת])/g, '$1$2');

    // 1.1 Letter Swap Normalization - normalize to single canonical form
    // This prevents kids from writing "עתה טיפש" instead of "אתה טיפש"
    const letterNormalization = [
      [/ע/g, 'א'], // ע → א (alef/ayin confusion)
      [/ת/g, 'ט'], // ת → ט (tet/tav confusion)
      [/ק/g, 'כ'], // ק → כ (kaf/qof confusion)
      [/ף/g, 'פ'], // ף → פ (final form)
      [/ץ/g, 'צ'], // ץ → צ (final form)
      [/ם/g, 'מ'], // ם → מ (final form)
      [/ן/g, 'נ'], // ן → נ (final form)
      [/ך/g, 'כ'], // ך → כ (final form)
    ];

    for (const [pattern, replacement] of letterNormalization) {
      normalized = normalized.replace(pattern, replacement);
    }

    // 1.4 Emoji Standardization
    normalized = normalized.replace(/[\u200d\u200c]/g, ''); // Remove zero-width joiners

    return normalized;
  }

  /**
   * Transliteration Detection
   * Maps English transliteration to Hebrew equivalents
   * Section 1.3 from scoring system doc
   */
  detectTransliteration(text) {
    if (!text || typeof text !== 'string') return text;

    let processed = text;

    // Transliteration map: English → Hebrew
    const transliterationMap = {
      // Insults
      'lozer': 'לוזר',
      'loozer': 'לוזר',
      'loser': 'לוזר',
      'metumtam': 'מטומטם',
      'metomtam': 'מטומטם',
      'sahi': 'סאחי',
      'sa7i': 'סאחי',
      'tipesh': 'טיפש',
      'tipsh': 'טיפש',
      'cringe': 'קרינג',
      'krinj': 'קרינג',

      // Sexual harassment (keeping minimal)
      'zona': 'זונה',
      'sharmuta': 'שרמוטה',
      'ben zona': 'בן זונה',
      'kusemek': 'כוסאמק',

      // Threats
      'chake li': 'חכה לי',
      'chake': 'חכה',
      'ashbor': 'אשבור',
      'aharog': 'אהרוג',

      // Exclusion
      'al tatzrfu': 'אל תצרפו',
      'ta\'ifu': 'תעיפו'
    };

    // Replace transliterations with Hebrew
    for (const [english, hebrew] of Object.entries(transliterationMap)) {
      const regex = new RegExp(english, 'gi');
      processed = processed.replace(regex, hebrew);
    }

    return processed;
  }

  /**
   * Helper: Match text against pattern array
   */
  matchPatterns(text, patterns) {
    const hits = [];
    let score = 0;

    for (const { pattern, word, score: patternScore, category } of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        const weight = this.weights.get(word) || 1.0;
        const weightedScore = patternScore * weight;

        hits.push({
          word,
          matches: matches.length,
          baseScore: patternScore,
          weightedScore,
          category: category || 'unknown'
        });

        score += weightedScore;
      }
    }

    return { hits, score };
  }

  /**
   * Update word weight based on feedback
   * Called by feedbackService.js
   */
  updateWeight(word, newWeight) {
    this.weights.set(word, newWeight);
  }

  /**
   * Get all current weights (for persistence)
   */
  getWeights() {
    return Object.fromEntries(this.weights);
  }
}

// Singleton instance
const lexiconService = new LexiconService();

module.exports = lexiconService;
