/**
 * Lexicon-Based Detection Service (Layer 1)
 * Fast, local keyword and pattern matching for Hebrew bullying detection
 * Includes emoji analysis, normalization, and multi-category threat detection
 */

class LexiconService {
  constructor() {
    this.initialized = false;
    this.weights = new Map(); // Dynamic weights updated by feedback loop

    // Structured Lexicon Database (v2.0)
    // Format: { canonical, surfaceForms, category, score, displayName }
    this.lexiconDB = this.buildLexiconDatabase();
  }

  /**
   * Build structured lexicon database with surface forms
   * This makes it easy to add variants and maintain consistency
   */
  buildLexiconDatabase() {
    return {
      // SEXUAL/PROFANE TERMS (score: 16-20)
      sexual: [
        {
          canonical: 'זין',
          surfaceForms: ['זינ', 'זי.נ', 'זי נ'],
          compounds: ['חטיכטזינ', 'זינבאינ', 'יאזינ'],
          category: 'sexual_harassment',
          score: 16,
          displayName: 'זין/חתיכת זין/זין בעין',
          transliterations: ['dick', 'cock']
        },
        {
          canonical: 'כוס',
          surfaceForms: ['כוס', 'כו.ס', 'כו ס'],
          compounds: ['כוסאמא', 'כוסאמכ', 'כוסטמכ', 'כוסאמאמכ', 'כוסומו', 'כוסמכ'],
          category: 'sexual_harassment',
          score: 16,
          displayName: 'כוס/כוסאמא/כוסמק',
          transliterations: ['kusemek', 'kusemo', 'kusmak', 'cunt'],
          notes: 'Very common, includes Arabic-derived forms'
        },
        {
          canonical: 'בנזונה',
          surfaceForms: ['בנזונה', 'בטזונה', 'בנזונהה+', 'בניזונה', 'בניזונוט'],  // Added plurals
          category: 'sexual_harassment',
          score: 20,
          displayName: 'בן/בת זונה',
          transliterations: ['ben zona', 'bnei zonot'],
          notes: 'Son/daughter of whore - high severity'
        },
        {
          canonical: 'זונה',
          surfaceForms: ['זונה', 'זונוט'],  // Added plural: זונות → זונוט
          category: 'sexual_harassment',
          score: 20,
          displayName: 'זונה/זונות',
          transliterations: ['whore', 'slut', 'zona', 'whores']
        },
        {
          canonical: 'שרמוטה',
          surfaceForms: ['שרמוטה', 'שרמוטוט'],  // שרמוטה singular, שרמוטות → שרמוטוט (plural)
          category: 'sexual_harassment',
          score: 20,
          displayName: 'שרמוטה/שרמוטות',
          transliterations: ['sharmuta', 'sharmutas']
        },
        {
          canonical: 'להזדיינ',
          surfaceForms: ['לכלהזדיינ', 'להזדיינ'],
          category: 'sexual_harassment',
          score: 18,
          displayName: 'לך להזדיין',
          transliterations: ['go fuck yourself']
        },
        {
          canonical: 'בנכלב',
          surfaceForms: ['בנכלב', 'בטכלב', 'יאבנכלב', 'בניכלב', 'בניכלבימ'],  // Added plurals
          category: 'sexual_harassment',
          score: 16,
          displayName: 'בן/בת כלב',
          notes: 'Son/daughter of dog'
        },
        {
          canonical: 'זובי',
          surfaceForms: ['זובי'],
          category: 'sexual_harassment',
          score: 4,
          displayName: 'זובי',
          notes: 'Mild sexual insult'
        }
      ],

      // GENERAL INSULTS (score: 4-6)
      insults: [
        {
          canonical: 'מפגר',
          surfaceForms: ['מפגר', 'מפגרט', 'מפוגר', 'מפגרימ'],
          category: 'general_insult',
          score: 4,
          displayName: 'מפגר',
          prefix: 'יא',  // Can combine with יא prefix
          notes: 'Very common insult - retard'
        },
        {
          canonical: 'חרא',
          surfaceForms: ['חרא', 'חטיכטחרא'],
          category: 'general_insult',
          score: 4,
          displayName: 'חרא/חתיכת חרא',
          transliterations: ['shit', 'crap'],
          prefix: 'יא'
        },
        {
          canonical: 'חלאט',
          surfaceForms: ['חלאט', 'חלאטהמינהאנושי'],
          category: 'general_insult',
          score: 6,
          displayName: 'חלאת המין האנושי',
          notes: 'Scum of humanity - higher severity'
        },
        {
          canonical: 'מניאכ',
          surfaceForms: ['מניאכ', 'יאמניאכ'],
          category: 'general_insult',
          score: 4,
          displayName: 'מניאק',
          transliterations: ['maniac'],
          prefix: 'יא'
        },
        {
          canonical: 'ארס',
          surfaceForms: ['ארס', 'ארסיט'],
          category: 'general_insult',
          score: 4,
          displayName: 'ערס/ערסית',
          transliterations: ['aars'],
          notes: 'Social slang - thug/brash behavior'
        },
        {
          canonical: 'פרחה',
          surfaceForms: ['פרחה'],
          category: 'general_insult',
          score: 4,
          displayName: 'פרחה',
          transliterations: ['parcha'],
          notes: 'Gendered insult - shallow woman'
        }
      ],

      // ARABIC-DERIVED TERMS (very common in Israeli slang)
      // Note: כוסמק, שרמוטה, מניאק already in other sections
      arabic: [
        {
          canonical: 'כלב',
          surfaceForms: ['כלב', 'כלבה', 'יאכלב', 'כלבימ', 'כלבוט'],  // Added plurals: כלבים, כלבות
          category: 'general_insult',  // FIXED: Changed from sexual_harassment to general_insult
          score: 6,  // FIXED: Reduced from 12 to 6 (matches other general insults)
          displayName: 'כלב/כלבה/כלבים',
          transliterations: ['kalb', 'kalba', 'klabim'],
          notes: 'Arabic-derived - dog (insult), but literally means dog in Hebrew',
          contextSensitive: true  // NEW: Mark for context-sensitive detection
        }
      ],

      // RUSSIAN/IMMIGRANT SLANG (score: 4-6)
      immigrant: [
        {
          canonical: 'כיבינימט',
          surfaceForms: ['כיבינימט', 'כיבינימאט', 'כיבינמאט'],
          category: 'general_insult',
          score: 4,
          displayName: 'קיבינימט',
          transliterations: ['kibinemat', 'yob tvoyu mat'],
          notes: 'Russian curse - "damn it" / "fuck your mother"'
        },
        {
          canonical: 'בליאט',
          surfaceForms: ['בליאט', 'בליט'],
          category: 'general_insult',
          score: 4,
          displayName: 'בליאט',
          transliterations: ['blyat'],
          notes: 'Russian curse - very common in immigrant communities'
        },
        {
          canonical: 'חוי',
          surfaceForms: ['חוי', 'חויה'],
          category: 'general_insult',
          score: 4,
          displayName: 'חוי',
          transliterations: ['khui'],
          notes: 'Russian - dick'
        }
      ],

      // ENGLISH PROFANITY (score: 4)
      english: [
        {
          canonical: 'fuck',
          surfaceForms: ['fuck', 'fucking', 'fuckin', 'fucker'],
          hebrewSpelling: ['פאכ', 'פאקינג'],
          category: 'general_insult',
          score: 4,
          displayName: 'fuck/shit (English)',
          notes: 'Mixed in Hebrew chats'
        },
        {
          canonical: 'shit',
          surfaceForms: ['shit', 'shitty'],
          category: 'general_insult',
          score: 4,
          displayName: 'shit (English)'
        }
      ],

      // RELIGIOUS CURSES (score: 4-8)
      religious: [
        {
          canonical: 'ימחשמו',
          surfaceForms: ['ימחשמו', 'ימש'],
          category: 'religious_curse',
          score: 4,
          displayName: 'ימח שמו',
          transliterations: ['yimach shmo'],
          notes: 'May his name be erased'
        },
        {
          canonical: 'לאזאזל',
          surfaceForms: ['לכלאזאזל', 'לאזאזל'],
          category: 'religious_curse',
          score: 4,
          displayName: 'לך לעזאזל',
          transliterations: ['go to hell']
        },
        {
          canonical: 'שטמוט',
          surfaceForms: ['שטמוט', 'שיטוט', 'שימוט'],
          category: 'religious_curse',
          score: 8,
          displayName: 'שתמות',
          notes: 'That you die - higher severity'
        }
      ]
    };
  }

  async initialize() {
    if (this.initialized) return;

    // Load dynamic weights from feedback service if available
    await this.loadWeights();

    // Build comprehensive pattern cache from structured lexicon
    this.buildPatternCache();

    this.initialized = true;
    console.log('✅ LexiconService v2.1 initialized (Structured Lexicon with Morphology)');
  }

  /**
   * Build comprehensive pattern cache from structured lexicon
   * Handles prefix/suffix morphology automatically
   */
  buildPatternCache() {
    this.patternCache = {
      sexual: [],
      insults: [],
      arabic: [],
      immigrant: [],
      english: [],
      religious: []
    };

    // For each category in lexiconDB
    for (const [category, entries] of Object.entries(this.lexiconDB)) {
      for (const entry of entries) {
        const patterns = this.buildPatternsFromEntry(entry);
        this.patternCache[category].push(...patterns);
      }
    }
  }

  /**
   * Build all pattern variations from a lexicon entry
   * Handles: יא prefix, possessive suffixes, plurals, transliterations
   */
  buildPatternsFromEntry(entry) {
    const patterns = [];
    const allForms = new Set();

    // Add surface forms
    if (entry.surfaceForms) {
      entry.surfaceForms.forEach(form => allForms.add(form));
    }

    // Add compounds
    if (entry.compounds) {
      entry.compounds.forEach(form => allForms.add(form));
    }

    // Add transliterations
    if (entry.transliterations) {
      entry.transliterations.forEach(form => allForms.add(form));
    }

    // Add Hebrew spelling (for English words)
    if (entry.hebrewSpelling) {
      entry.hebrewSpelling.forEach(form => allForms.add(form));
    }

    // Generate יא prefix variants (very common pattern)
    if (entry.prefix === 'יא') {
      const prefixForms = new Set();
      allForms.forEach(form => {
        prefixForms.add('יא' + form);
      });
      prefixForms.forEach(form => allForms.add(form));
    }

    // Generate possessive suffix variants (שלך, שלו, שלי, שלה)
    if (entry.possessiveSuffixes !== false) {
      const possessiveForms = new Set();
      allForms.forEach(form => {
        // Only add possessives for Hebrew words (not transliterations)
        if (!/[a-z]/i.test(form)) {
          possessiveForms.add(form + 'שלכ');  // שלך → שלכ (normalized)
          possessiveForms.add(form + 'שלו');
          possessiveForms.add(form + 'שלי');
          possessiveForms.add(form + 'שלה');
        }
      });
      possessiveForms.forEach(form => allForms.add(form));
    }

    // Generate plural variants (ים, ות) for insults
    if (entry.pluralSuffixes !== false && entry.category === 'general_insult') {
      const pluralForms = new Set();
      allForms.forEach(form => {
        if (!/[a-z]/i.test(form)) {
          pluralForms.add(form + 'ימ');  // ים → ימ (normalized)
          pluralForms.add(form + 'וט');  // ות → וט (normalized)
        }
      });
      pluralForms.forEach(form => allForms.add(form));
    }

    // Build regex pattern from all forms
    const patternString = Array.from(allForms).join('|');

    return [{
      pattern: new RegExp(patternString, 'g'),
      word: entry.displayName,
      score: entry.score,
      category: entry.category,
      canonical: entry.canonical,
      notes: entry.notes
    }];
  }

  async loadWeights() {
    // Placeholder for feedback-based weight loading
    // Will be implemented by feedbackService.js
    this.weights.set('default', 1.0);
  }

  /**
   * Detect from structured lexicon (NEW v2.1)
   * Uses pattern cache with automatic morphology handling
   */
  detectFromStructuredLexicon(text) {
    const hits = [];
    const categories = new Set();
    let score = 0;

    if (!this.patternCache) return { hits, categories: [], score };

    // Check all categories
    for (const [categoryName, patterns] of Object.entries(this.patternCache)) {
      for (const patternObj of patterns) {
        const matches = text.match(patternObj.pattern);
        if (matches) {
          const weight = this.weights.get(patternObj.canonical) || 1.0;
          const weightedScore = patternObj.score * weight;

          hits.push({
            word: patternObj.word,
            canonical: patternObj.canonical,
            matches: matches.length,
            baseScore: patternObj.score,
            weightedScore,
            category: patternObj.category,
            source: 'structured_lexicon'
          });

          categories.add(patternObj.category);
          score += weightedScore;
        }
      }
    }

    return { hits, categories: Array.from(categories), score };
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

    // CRITICAL FIX: Normalize Hebrew BEFORE pattern matching (convert final letters ן→נ, ם→מ, etc.)
    const normalizedText = this.normalizeHebrew(messageText);
    const text = normalizedText;
    const hits = [];
    const categories = new Set();
    let baseScore = 0;

    // NEW: Check for narrative/descriptive context (reduces false positives)
    const narrativeContext = this.detectNarrativeContext(text);
    const narrativeDampener = narrativeContext.isNarrative ? 0.2 : 1.0; // 80% reduction if narrative
    if (narrativeContext.isNarrative) {
      console.log(`[LEXICON] 🎬 Narrative context detected: ${narrativeContext.pattern} (dampener: ${narrativeDampener})`);
    }

    // NEW: Check structured lexicon patterns (with morphology support)
    if (this.patternCache) {
      const structuredResults = this.detectFromStructuredLexicon(text);
      if (structuredResults.hits.length > 0) {
        // Apply narrative dampening to context-sensitive words (like כלב)
        const dampenedHits = structuredResults.hits.map(hit => {
          if (narrativeContext.isNarrative && hit.canonical === 'כלב') {
            return {
              ...hit,
              weightedScore: (hit.weightedScore || hit.baseScore) * narrativeDampener,
              dampenedBy: 'narrative_context'
            };
          }
          return hit;
        });

        hits.push(...dampenedHits);
        structuredResults.categories.forEach(cat => categories.add(cat));
        // Recalculate score with dampened hits
        baseScore += dampenedHits.reduce((sum, hit) => sum + (hit.weightedScore || hit.baseScore || 0), 0);
      }
    }

    // A) General Insults (Low-Medium) - LEGACY patterns
    const generalInsults = this.detectGeneralInsults(text);
    if (generalInsults.hits.length > 0) {
      hits.push(...generalInsults.hits);
      categories.add('general_insult');
      baseScore += generalInsults.score;
    }

    // B) Sexual/Harassment (High) - LEGACY patterns
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

    // I) Self-Harm Detection (CRITICAL - highest priority)
    const selfHarm = this.detectSelfHarm(text);
    if (selfHarm.hits.length > 0) {
      hits.push(...selfHarm.hits);
      categories.add('self_harm');
      baseScore += selfHarm.score;
    }

    // J) Religious Curses (Medium severity)
    const religiousCurses = this.detectReligiousCurses(text);
    if (religiousCurses.hits.length > 0) {
      hits.push(...religiousCurses.hits);
      categories.add('religious_curse');
      baseScore += religiousCurses.score;
    }

    // DEDUPLICATION: Remove duplicate hits from structured + legacy patterns
    // Keep the hit with the highest score for each canonical form
    const deduplicatedHits = this.deduplicateHits(hits);
    const deduplicatedScore = deduplicatedHits.reduce((sum, hit) => sum + (hit.weightedScore || hit.score || 0), 0);

    return {
      hits: deduplicatedHits,
      categories: Array.from(categories),
      baseScore: deduplicatedScore,
      normalized: text // Already normalized at the top of detect()
    };
  }

  /**
   * Deduplicate hits to avoid double-counting from structured + legacy patterns
   * Keeps the highest-scoring hit for each unique word
   */
  deduplicateHits(hits) {
    const hitMap = new Map();

    for (const hit of hits) {
      // Normalize the word field for deduplication
      // "זין/חתיכת זין/זין בעין" → "זין" (first part before slash)
      // This ensures variants map to same canonical key
      let word = hit.word || hit.canonical || 'unknown';
      const normalizedKey = word.split('/')[0].trim();  // Take first word before slash

      const score = hit.weightedScore || hit.score || 0;

      if (!hitMap.has(normalizedKey) || score > (hitMap.get(normalizedKey).weightedScore || hitMap.get(normalizedKey).score || 0)) {
        hitMap.set(normalizedKey, hit);
      }
    }

    return Array.from(hitMap.values());
  }

  // A) General Insults - Updated to match scoring system v2.0
  // Section 2.1: Direct Insult = +4 points
  detectGeneralInsults(text) {
    const patterns = [
      // Classic insults - ALL score 4 points (Direct Insult category)
      { pattern: /מפגר|מפגרט|מפוגר|מפגרימ/g, word: 'מפגר', score: 4, category: 'general_insult' },
      { pattern: /טיפש|טיפשה|טיפשימ|tipesh|tipsh/g, word: 'טיפש', score: 4, category: 'general_insult' },
      { pattern: /לוזר|lozer|loozer|loser/g, word: 'לוזר', score: 4, category: 'general_insult' },
      { pattern: /דפוכ|דפוכה|מטורפ|מטורפימ/g, word: 'דפוק', score: 4, category: 'general_insult' },
      { pattern: /אידיוט|idiot/g, word: 'אידיוט', score: 4, category: 'general_insult' },
      { pattern: /טמבל|טמבלה/g, word: 'טמבל', score: 4, category: 'general_insult' },
      { pattern: /מסריח|מסריחה/g, word: 'מסריח', score: 4, category: 'general_insult' },
      { pattern: /זבל|חטיכטחרא|garbage|trash/g, word: 'זבל/חתיכת חרא', score: 4, category: 'general_insult' },
      { pattern: /דוחה|מגאיל/g, word: 'דוחה', score: 4, category: 'general_insult' },
      { pattern: /פטטי|pathetic|cringe|כרינג/g, word: 'פתטי', score: 4, category: 'general_insult' },
      { pattern: /מביכ|embarrassing/g, word: 'מביך', score: 4, category: 'general_insult' },
      { pattern: /שכרנ|שכרניט|liar/g, word: 'שקרן', score: 4, category: 'general_insult' },
      { pattern: /גנב|גנבט|thief/g, word: 'גנב', score: 4, category: 'general_insult' },
      // NEW: Scum/filth variations (normalized forms)
      { pattern: /חרא|shit|crap/g, word: 'חרא', score: 4, category: 'general_insult' },
      { pattern: /חלאט|חלאטהמינהאנושי/g, word: 'חלאת המין האנושי', score: 6, category: 'general_insult' },
      { pattern: /מניאכ|יאמניאכ|maniac/g, word: 'מניאק', score: 4, category: 'general_insult' },
      { pattern: /כיבינימט|כיבינימאט|kibinemת/g, word: 'קיבינימט (Russian)', score: 4, category: 'general_insult' },
      { pattern: /fuck|fucking|shit|fuckin|fucker/g, word: 'fuck/shit (English)', score: 4, category: 'general_insult' },
      { pattern: /פאכ|פאקינג/g, word: 'פאק (Hebrew spelling)', score: 4, category: 'general_insult' },
      // NEW: Social slang & derogatory labels (class/gender-based insults)
      { pattern: /ארס|ארסיט|aars/g, word: 'ערס/ערסית (thug/brash)', score: 4, category: 'general_insult' },
      { pattern: /פרחה|parcha/g, word: 'פרחה (shallow woman)', score: 4, category: 'general_insult' },
    ];

    return this.matchPatterns(text, patterns);
  }

  // B) Sexual/Harassment - Updated to match scoring system v2.0
  // Section 2.1: Sexual Threat/Coercion = +20 points (Critical)
  detectSexualHarassment(text) {
    const patterns = [
      // Note: These are critical threats - score 20 for sexual coercion
      // EXPANDED: Added ALL conjugations - נאנוס (we will rape), אנוס (rape!), תאנס (you will rape)
      { pattern: /לאנוס|אונס|אנס|נאנוס|אנוס|טאנס|אניאנס|נאנוסאוטכ|צריכלאנוס/g, word: 'לאנוס/אנס/אונס/נאנוס', score: 20, category: 'sexual_harassment' },
      { pattern: /זונה|whore|slut|zona/g, word: 'זונה', score: 20, category: 'sexual_harassment' },
      { pattern: /בנזונה|בטזונה|בנזונהה+|ben\s*zona/g, word: 'בן/בת זונה', score: 20, category: 'sexual_harassment' },
      { pattern: /שרמוכה|sharmuta/g, word: 'שרמוטה', score: 20, category: 'sexual_harassment' },
      { pattern: /כלבה|bitch/g, word: 'כלבה', score: 16, category: 'sexual_harassment' },
      { pattern: /זינ|חטיכטזינ|יאזינ|זינבאינ|dick|cock/g, word: 'זין/חתיכת זין/זין בעין', score: 16, category: 'sexual_harassment' },
      // NEW: כוס variations (VERY common, many spellings) - includes Arabic-derived forms
      { pattern: /כוס|כוסאמא|כוסאמכ|כוסטמכ|כוסאמאמכ|כוסומו|כוסמכ|kusemek|kusemo|kusmak|cunt/g, word: 'כוס/כוסאמא/כוסמק', score: 16, category: 'sexual_harassment' },
      { pattern: /בנכלב|בטכלב|יאבנכלב/g, word: 'בן/בת כלב/יא בן כלב', score: 16, category: 'sexual_harassment' },
      { pattern: /לכלהזדיינ|להזדיינ|go\s*fuck\s*yourself/g, word: 'לך להזדיין (go fuck yourself)', score: 18, category: 'sexual_harassment' },
      { pattern: /זובי/g, word: 'זובי (mild insult)', score: 4, category: 'sexual_harassment' },
      { pattern: /טשלחטמונה|send\s*pic/g, word: 'תשלח תמונה', score: 20, category: 'sexual_harassment' },
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
  // Note: Using \s* for optional spaces AND regular letter forms (not final forms) since normalizeHebrew converts finals
  detectDirectThreats(text) {
    const patterns = [
      { pattern: /חכה\s*לי|חכה\s*חכה|chake\s*li/g, word: 'חכה לי', score: 18, category: 'direct_threat' },
      { pattern: /אני\s*אשבור\s*אוטכ|נשבור\s*אוטכ|אשבור|נשבור|ashbor/g, word: 'אשבור/נשבור אותך', score: 18, category: 'direct_threat' },
      { pattern: /אני\s*אבוא\s*אליכ|נבוא\s*אליכ/g, word: 'אבוא/נבוא אליך', score: 18, category: 'direct_threat' },
      { pattern: /אני\s*אטפוס\s*אוטכ|נטפוס\s*אוטכ/g, word: 'אתפוס/נתפוס אותך', score: 18, category: 'direct_threat' },
      { pattern: /ניפגש\s*אחרי\s*ביט\s*ספר|ניפגש\s*בחוצ|אחרי\s*ביס/g, word: 'ניפגש אחרי ביס', score: 18, category: 'direct_threat' },
      { pattern: /אני\s*אדאג\s*לכ|נדאג\s*לכ/g, word: 'אדאג/נדאג לך', score: 18, category: 'direct_threat' },
      { pattern: /טזהר\s*ממני|טזהרי\s*ממני/g, word: 'תזהר ממני', score: 18, category: 'direct_threat' },
      // EXPANDED: ALL murder/kill conjugations - נרצח, נהרוג, רוצח, הורג
      { pattern: /להרוג|אהרוג|נהרוג|הורג|רוצח|נרצח|רצח|אני\s*אהרוג|נרצח\s*אוטכ|צריכ\s*להרוג|aharog/g, word: 'להרוג/אהרוג/נהרוג/נרצח/רצח', score: 20, category: 'direct_threat' },
      { pattern: /ארביצ|נרביצ|להרביצ|אשבור\s*לכ|נשבור\s*לכ/g, word: 'ארביץ/נרביץ/אשבור', score: 18, category: 'direct_threat' },
      { pattern: /אטה\s*מט|אט\s*מט|טמוט|you.*dead/g, word: 'אתה מת/תמות (you\'re dead)', score: 18, category: 'direct_threat' },
      // NEW: לקרוע/נקרע במכות (tear apart with beatings)
      { pattern: /לכרוע|נכרע|אכרע|כרוע\s*אוטכ|במכוט|מכוט|לכרוע\s*במכוט/g, word: 'לקרוע/נקרע במכות', score: 20, category: 'direct_threat' },
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

  // I) Self-Harm Detection - CRITICAL
  // Section 2.1: Self-Harm/Suicide = +20 points (CRITICAL - requires immediate intervention)
  // Using \s* for optional spaces AND regular letter forms (not final forms) since normalizeHebrew converts finals
  detectSelfHarm(text) {
    const patterns = [
      { pattern: /להטאבד|מטאבד|אטאבד|אני\s*אטאבד|אני\s*מטאבד|רוצה\s*להטאבד/g, word: 'להתאבד/מתאבד/אתאבד', score: 20, category: 'self_harm' },
      { pattern: /רוצה\s*למוט|אני\s*רוצה\s*למוט|מוטב\s*למוט/g, word: 'רוצה למות', score: 20, category: 'self_harm' },
      { pattern: /אני\s*הולכ\s*למוט|אני\s*אמוט/g, word: 'אני אמות', score: 20, category: 'self_harm' },
      { pattern: /לחטוכ\s*אט\s*אצמי|אחטוכ\s*אט\s*אצמי/g, word: 'לחתוך עצמי', score: 20, category: 'self_harm' },
      { pattern: /איןלי\s*סיבה\s*לחיוט|אין\s*טאמ\s*לחיוט/g, word: 'אין טעם לחיות', score: 20, category: 'self_harm' },
      { pattern: /מוטב\s*שלא\s*הייטי\s*נולד|מוטב\s*שלא\s*הייטי\s*כיימ/g, word: 'מוטב שלא הייתי', score: 20, category: 'self_harm' },
    ];

    return this.matchPatterns(text, patterns);
  }

  // J) Religious Curses - Medium severity
  // Common in Israeli culture, score 4 points (same as general insults)
  detectReligiousCurses(text) {
    const patterns = [
      { pattern: /ימחשמו|ימש|yimach\s*shmo/g, word: 'ימח שמו (may his name be erased)', score: 4, category: 'religious_curse' },
      { pattern: /לכלאזאזל|לאזאזל|go\s*to\s*hell/g, word: 'לך לעזאזל', score: 4, category: 'religious_curse' },
      { pattern: /שטמוט|שיטוט|שימוט/g, word: 'שתמות (that you die)', score: 8, category: 'religious_curse' },
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
   * Handles: letter swaps, spacing, punctuation, repeated letters
   * Section 1.1 and 1.2 from scoring system doc
   */
  normalizeHebrew(text) {
    if (!text || typeof text !== 'string') return '';

    let normalized = text.toLowerCase();

    // STEP 1: Normalize final forms FIRST (before spacing/punctuation removal)
    // This ensures ן, ם, ך, ף, ץ are converted to regular forms for consistent matching
    const finalFormNormalization = [
      [/ף/g, 'פ'], // ף → פ (final form)
      [/ץ/g, 'צ'], // ץ → צ (final form)
      [/ם/g, 'מ'], // ם → מ (final form)
      [/ן/g, 'נ'], // ן → נ (final form)
      [/ך/g, 'כ'], // ך → כ (final form)
    ];

    for (const [pattern, replacement] of finalFormNormalization) {
      normalized = normalized.replace(pattern, replacement);
    }

    // STEP 2: Remove ALL spacing/punctuation evasion (ז.י.נ → זין, ז י נ → זין)
    // Simplified approach: keep only Hebrew letters, remove everything else between them
    // This handles multi-character evasion like "ז...י...נ" or "ז  י  נ"
    while (/([א-ת])[\s.,\-_]+([א-ת])/.test(normalized)) {
      normalized = normalized.replace(/([א-ת])[\s.,\-_]+([א-ת])/g, '$1$2');
    }

    // STEP 3: Collapse repeated letters (חראאאא → חרא)
    normalized = normalized.replace(/([א-ת])\1{2,}/g, '$1');

    // STEP 4: Letter Swap Normalization (prevent עתה → אתה confusion)
    const letterSwapNormalization = [
      [/ע/g, 'א'], // ע → א (alef/ayin confusion)
      [/ת/g, 'ט'], // ת → ט (tet/tav confusion)
      [/ק/g, 'כ'], // ק → כ (kaf/qof confusion)
    ];

    for (const [pattern, replacement] of letterSwapNormalization) {
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
   * NEW: Detect narrative/descriptive context to reduce false positives
   * Returns { isNarrative: boolean, pattern: string, confidence: number }
   */
  detectNarrativeContext(text) {
    // Narrative indicators (storytelling, describing events)
    const narrativePatterns = [
      { pattern: /ראיטי\s*(בסרכ|בחדשוט|בטיקטוכ|ביוטיוב|בפייסבוכ)/g, name: 'ראיתי ב...' },
      { pattern: /שמאטי\s*(ש|אטאזו|על|על)/g, name: 'שמעתי ש...' },
      { pattern: /כראטי\s*(ש|על|אטאזו)/g, name: 'קראתי ש...' },
      { pattern: /ספרו\s*לי\s*(ש|על)/g, name: 'ספרו לי ש...' },
      { pattern: /סיפרו\s*לי\s*(ש|על)/g, name: 'סיפרו לי ש...' },
      { pattern: /מסופר\s*(ש|על)/g, name: 'מסופר ש...' },
      { pattern: /איכ\s*\w+\s*מט/g, name: 'איך X מת (narrative death)' },
      { pattern: /היה\s*פאמ/g, name: 'היה פעם (once upon a time)' },
    ];

    for (const { pattern, name } of narrativePatterns) {
      if (pattern.test(text)) {
        return { isNarrative: true, pattern: name, confidence: 0.9 };
      }
    }

    // Literal animal context (NOT used as insult)
    const animalContextPatterns = [
      { pattern: /כלב\s*(מט|רצ|ישנ|אוכל|שוכב|זזי)/g, name: 'literal dog actions' },
      { pattern: /חטול\s*(מט|רצ|ישנ|אוכל|שוכב|זזי)/g, name: 'literal cat actions' },
      { pattern: /חיה\s*(מט|רצ|ישנ|אוכל|שוכב|זזי)/g, name: 'literal animal actions' },
    ];

    for (const { pattern, name } of animalContextPatterns) {
      if (pattern.test(text)) {
        return { isNarrative: true, pattern: name, confidence: 0.85 };
      }
    }

    return { isNarrative: false, pattern: null, confidence: 0 };
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
