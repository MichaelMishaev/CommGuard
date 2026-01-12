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

    const text = messageText.toLowerCase();
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

  // A) General Insults (Low-Medium severity)
  detectGeneralInsults(text) {
    const patterns = [
      // Classic insults
      { pattern: /מפגר|מפגרת|מפוגר|מ פ ג ר|מ\.פ\.ג\.ר/g, word: 'מפגר', score: 2 },
      { pattern: /לוזר|lozer|loozer/g, word: 'לוזר', score: 2 },
      { pattern: /דפוק|דפוקה|מטורף/g, word: 'דפוק', score: 2 },
      { pattern: /אידיוט|idiot/g, word: 'אידיוט', score: 1 },
      { pattern: /טמבל|טמבלה/g, word: 'טמבל', score: 1 },
      { pattern: /מסריח|מסריחה/g, word: 'מסריח', score: 2 },
      { pattern: /זבל|garbage|trash/g, word: 'זבל', score: 2 },
      { pattern: /דוחה|מגעיל/g, word: 'דוחה', score: 2 },
      { pattern: /פתטי|pathetic|cringe|קרינג/g, word: 'פתטי', score: 1 },
      { pattern: /מביך|embarrassing/g, word: 'מביך', score: 1 },
      { pattern: /שקרן|שקרנית|liar/g, word: 'שקרן', score: 1 },
      { pattern: /גנב|גנבת|thief/g, word: 'גנב', score: 2 },
    ];

    return this.matchPatterns(text, patterns);
  }

  // B) Sexual/Harassment (High severity)
  detectSexualHarassment(text) {
    const patterns = [
      // Note: Keeping this minimal and general - not listing explicit slurs
      { pattern: /זונה|whore|slut/g, word: 'זונה', score: 5 },
      { pattern: /בן זונה|בת זונה/g, word: 'בן/בת זונה', score: 5 },
      { pattern: /שרמוטה/g, word: 'שרמוטה', score: 5 },
      { pattern: /כלבה|bitch/g, word: 'כלבה', score: 3 },
    ];

    return this.matchPatterns(text, patterns);
  }

  // C) Social Exclusion (Medium-High severity)
  detectSocialExclusion(text) {
    const patterns = [
      { pattern: /אל תצרפו|לא לצרף/g, word: 'אל תצרפו', score: 4 },
      { pattern: /תעיפו|תוציאו מהקבוצה/g, word: 'תעיפו', score: 4 },
      { pattern: /חסום|חסמי|כולם לחסום/g, word: 'חסום', score: 3 },
      { pattern: /מי שמדבר איתו|מי שמדברת איתה/g, word: 'מי שמדבר איתו', score: 5 },
      { pattern: /אף אחד לא|כולם נגד/g, word: 'אף אחד לא/כולם נגד', score: 4 },
      { pattern: /נפסל|disqualified/g, word: 'נפסל', score: 3 },
      { pattern: /אנחנו לא רוצים אותך|אנחנו לא רוצים אותו/g, word: 'לא רוצים', score: 5 },
    ];

    return this.matchPatterns(text, patterns);
  }

  // D) Direct Threats (High severity)
  detectDirectThreats(text) {
    const patterns = [
      { pattern: /חכה לי|חכה חכה/g, word: 'חכה לי', score: 4 },
      { pattern: /אני אשבור אותך|אני מפרק אותך/g, word: 'אשבור אותך', score: 5 },
      { pattern: /אני אבוא אליך/g, word: 'אבוא אליך', score: 5 },
      { pattern: /אני אתפוס אותך/g, word: 'אתפוס אותך', score: 5 },
      { pattern: /ניפגש אחרי בית ספר|ניפגש בחוץ/g, word: 'ניפגש אחרי ביס', score: 5 },
      { pattern: /אני אדאג לך/g, word: 'אדאג לך', score: 4 },
      { pattern: /תזהר ממני|תזהרי ממני/g, word: 'תזהר ממני', score: 5 },
      { pattern: /אני אהרוג אותך|אני אמחק אותך/g, word: 'אהרוג/אמחק', score: 5 },
      { pattern: /אני ארביץ לך|אני אשבור לך/g, word: 'ארביץ/אשבור', score: 5 },
    ];

    return this.matchPatterns(text, patterns);
  }

  // E) Doxxing/Sextortion/Blackmail (High severity)
  detectPrivacyThreats(text) {
    const patterns = [
      { pattern: /יש לי צילום מסך|יש לי סקרינשוט/g, word: 'יש לי צילום מסך', score: 5 },
      { pattern: /אני מפרסם|אני שולח לכולם/g, word: 'אני מפרסם', score: 5 },
      { pattern: /אני שולח להורים|אני שולח למחנכת|אני שולח למנהל/g, word: 'שולח להורים', score: 5 },
      { pattern: /אם לא.*אז|אם לא תעשה/g, word: 'אם לא...אז (סחיטה)', score: 5 },
      { pattern: /תשלח לי בפרטי|שלח לי בפרטי/g, word: 'שלח לי בפרטי', score: 3 },
      { pattern: /תשלח תמונה ואז אמחק/g, word: 'תשלח תמונה ואמחק', score: 5 },
      { pattern: /כולם שלחו כבר/g, word: 'כולם שלחו כבר', score: 4 },
      { pattern: /אל תהיה ילד|אל תהיי ילדה/g, word: 'אל תהיה ילד', score: 3 },
      { pattern: /זה סוד בינינו/g, word: 'סוד בינינו', score: 4 },
    ];

    return this.matchPatterns(text, patterns);
  }

  // F) Privacy Invasion (High severity)
  detectPrivacyInvasion(text) {
    const patterns = [
      { pattern: /מה הכתובת שלך|תן כתובת/g, word: 'מה הכתובת', score: 5 },
      { pattern: /שלח מיקום|תשלח מיקום/g, word: 'שלח מיקום', score: 5 },
      { pattern: /יש לי את המספר של|יש לי ת'מספר/g, word: 'יש לי המספר', score: 5 },
      { pattern: /אני יודע איפה אתה גר|אני יודעת איפה את גרה/g, word: 'יודע איפה גר', score: 5 },
      { pattern: /יש לי תמונות|יש לי צילומים/g, word: 'יש לי תמונות', score: 5 },
    ];

    return this.matchPatterns(text, patterns);
  }

  // G) Public Humiliation (Medium-High severity)
  detectPublicHumiliation(text) {
    const patterns = [
      { pattern: /תעלה צילום|תעלו צילום/g, word: 'תעלה צילום', score: 4 },
      { pattern: /שלחו לכולם/g, word: 'שלחו לכולם', score: 4 },
      { pattern: /בואו נעשה עליו סטיקר|בואו נעשה עליה סטיקר/g, word: 'נעשה סטיקר', score: 4 },
      { pattern: /שימו אותו בסטטוס|שימו אותה בסטטוס/g, word: 'בסטטוס', score: 4 },
      { pattern: /תייגו את ההורים/g, word: 'תייגו ההורים', score: 5 },
      { pattern: /פתחתי עליו חשבון|פתחתי עליה חשבון/g, word: 'פתחתי חשבון', score: 5 },
      { pattern: /עשיתי פרופיל בשמו|עשיתי פרופיל בשמה/g, word: 'פרופיל בשמו', score: 5 },
      { pattern: /אני אשלח בשמך/g, word: 'אשלח בשמך', score: 5 },
      { pattern: /תראה מה כתבו בשם שלך/g, word: 'כתבו בשם שלך', score: 4 },
    ];

    return this.matchPatterns(text, patterns);
  }

  // H) Emoji Analysis
  analyzeEmojis(messageText) {
    const hits = [];
    let score = 0;

    // Mocking/Humiliation emojis
    const mockingEmojis = {
      '🤡': { name: 'clown', score: 2 },
      '💀': { name: 'skull (mocking)', score: 1 },
      '🙄': { name: 'eye roll', score: 1 },
      '😭': { name: 'crying (mocking)', score: 1 },
      '🤏': { name: 'small/pathetic', score: 2 },
      '🧠': { name: 'brain (sarcastic)', score: 1 },
    };

    // Disgust emojis
    const disgustEmojis = {
      '🗑️': { name: 'trash', score: 2 },
      '💩': { name: 'poop', score: 2 },
      '🤢': { name: 'nauseated', score: 2 },
      '🤮': { name: 'vomiting', score: 2 },
      '🐷': { name: 'pig', score: 2 },
      '🐀': { name: 'rat', score: 2 },
      '🪳': { name: 'cockroach', score: 2 },
    };

    // Threat emojis
    const threatEmojis = {
      '🔪': { name: 'knife', score: 5 },
      '🩸': { name: 'blood', score: 5 },
      '☠️': { name: 'skull and crossbones', score: 5 },
      '💣': { name: 'bomb', score: 5 },
      '🔫': { name: 'gun', score: 5 },
    };

    // Count emoji repetitions (🤡🤡🤡 = pile-on)
    const allEmojis = { ...mockingEmojis, ...disgustEmojis, ...threatEmojis };
    const emojiCounts = new Map();

    for (const [emoji, info] of Object.entries(allEmojis)) {
      const regex = new RegExp(emoji, 'g');
      const matches = messageText.match(regex);
      if (matches) {
        const count = matches.length;
        emojiCounts.set(emoji, count);

        // Triple emoji = pile-on behavior
        const multiplier = count >= 3 ? 2 : 1;
        const emojiScore = info.score * count * multiplier;

        hits.push({
          type: 'emoji',
          emoji: emoji,
          name: info.name,
          count: count,
          score: emojiScore
        });

        score += emojiScore;
      }
    }

    // Detect clapping hands pattern (👏...👏 = passive aggressive)
    const clappingPattern = /👏[^👏]{1,20}👏/g;
    if (clappingPattern.test(messageText)) {
      hits.push({
        type: 'emoji_pattern',
        pattern: 'clapping_emphasis',
        score: 3
      });
      score += 3;
    }

    return { hits, score };
  }

  /**
   * Hebrew text normalization to catch evasion tactics
   * Handles: letter swaps, spacing, punctuation, transliteration
   */
  normalizeHebrew(text) {
    let normalized = text;

    // Remove spaces between letters (מ פ ג ר → מפגר)
    normalized = normalized.replace(/([א-ת])\s+([א-ת])/g, '$1$2');

    // Remove punctuation between letters (מ.פ.ג.ר → מפגר)
    normalized = normalized.replace(/([א-ת])[.,\-_]+([א-ת])/g, '$1$2');

    // Common letter swaps in Hebrew
    const letterSwaps = [
      [/ע/g, 'א'], // ע ↔ א
      [/ת/g, 'ט'], // ת ↔ ט
      [/ק/g, 'כ'], // ק ↔ כ
      [/ש/g, 'ס'], // ש ↔ ס
      [/ף/g, 'פ'], // ף ↔ פ (final form)
      [/ץ/g, 'צ'], // ץ ↔ צ (final form)
    ];

    // Apply letter swaps
    // Note: This creates multiple variations, not a single normalized form
    // In production, you'd generate all permutations and check against lexicon

    return normalized;
  }

  /**
   * Helper: Match text against pattern array
   */
  matchPatterns(text, patterns) {
    const hits = [];
    let score = 0;

    for (const { pattern, word, score: patternScore } of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        const weight = this.weights.get(word) || 1.0;
        const weightedScore = patternScore * weight;

        hits.push({
          word,
          matches: matches.length,
          baseScore: patternScore,
          weightedScore
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
