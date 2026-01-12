// services/offensiveWordsDatabase_ENHANCED.js
// ENHANCED offensive words database for bullying detection
// Updated: January 2026 based on latest cyberbullying research
// Sources: Cyberbullying Research Center, Hebrew offensive language taxonomy, Israeli Gen Z slang

/**
 * HEBREW OFFENSIVE WORDS - Expanded based on 2025 research
 * Categories: bullying, body shaming, sexual harassment, threats, discrimination, modern slang
 */
const OFFENSIVE_WORDS_HEBREW = [
    // Core bullying terms (original)
    'מפגר', 'מטומטם', 'דביל', 'אידיוט', 'טיפש', 'מטורלל',
    'זבל', 'חרא', 'מגעיל', 'נבל', 'שקרן', 'מניאק',
    'משוגע', 'חולה', 'פסיכי', 'סתום', 'תסתום', 'תשתוק',

    // Extended bullying (from research)
    'פרייר', 'פראייר', 'לוזר', 'כושל', 'כישלון', 'תרמיל',
    'מפסיד', 'עלוב', 'אומלל', 'מסכן', 'ביש', 'רע',
    'גרוע', 'גועל', 'דוחה', 'מתועב', 'מרושע',

    // Threats and violence (original + new)
    'לך תמות', 'תעוף', 'תיעלם', 'אף אחד לא רוצה אותך',
    'כולם שונאים אותך', 'אתה חרא', 'את חרא', 'מטומטמת',
    'אהרוג', 'אהרוג אותך', 'אחטוף', 'אפגע', 'אלך',
    'תמות', 'תסבול', 'אתה מת', 'את מתה', 'אזיין אותך',
    'אנצח אותך', 'אכה אותך', 'אמחק אותך', 'אשרוף',
    'אנקום', 'תשלם', 'תראה מה יקרה', 'אני אדאג שתסבול',
    'תתאבד', 'עשה לעצמך טובה ומת', 'העולם יהיה טוב יותר בלעדיך',

    // Body shaming (original + expanded)
    'שמן', 'שמנה', 'דק', 'דקה', 'מכוער', 'מכוערת',
    'מוגבל', 'נכה', 'פיצוץ', 'פצצה', 'עצם', 'כישלון',
    'מפלצת', 'דוחה', 'שמנמן', 'שמנמנה', 'עודף משקל',
    'רזה', 'רזה מדי', 'עצמות', 'שלד', 'פיל', 'חזיר',
    'פרה', 'לוויתן', 'קיפוד', 'מכשפה', 'זומבי',
    'פצע', 'מפחיד', 'מזעזע', 'נוראי', 'איום',

    // Sexual harassment (original + variants)
    'זונה', 'שרמוטה', 'כלבה', 'בן זונה', 'בת זונה',
    'זין', 'כוס', 'מזדיין', 'מזדיינת', 'שרמוטון',
    'קרווה', 'קרוע', 'פאקינג', 'מזדיין', 'יא קוקסינל',
    'סקס', 'לזיין', 'מזיין', 'נרקמן', 'נרקמנית',
    'שרמוטה זולה', 'כלבה מזוינת', 'בן של זונה',
    'ילד זונה', 'ילדת זונה', 'פושעת', 'מומחית',

    // Discrimination & ethnic slurs (from Israeli context)
    'ערס', 'ערסה', 'אשכנזי חרא', 'מזרחי חרא', 'רוסי חרא',
    'אמריקאי חרא', 'פשוט תחזור לארץ שלך', 'חזור לארצך',
    'פליט', 'זר', 'לא שלנו', 'תיקים', 'ארסים',
    'פרחחים', 'חאפרים', 'מוזרח', 'אשכנז', 'גרוזיני',

    // Social exclusion (original + new)
    'אף אחד לא אוהב אותך', 'כולם שונאים', 'אין לך חברים',
    'בודד', 'לוזר', 'מנודה', 'אף אחד לא רוצה אותך',
    'תעזוב', 'לך מפה', 'אף אחד לא רוצה אותך כאן',
    'אתה לא שייך', 'את לא שייכת', 'אף אחד לא מדבר איתך',
    'כולם מדברים עליך', 'אתה בדיחה', 'את בושה',
    'מביך', 'מבייש', 'חרפה', 'אסון', 'טעות',

    // Modern Israeli slang (2025 research findings)
    'באסה', 'מניאק', 'מאניאק', 'גבר מת', 'מתה',
    'איזה פס', 'פאסט', 'קטע', 'ווטפאק', 'ואטפאק',
    'חארות', 'חארטה', 'פאנץ', 'זבל של אדם',
    'אפס', 'אפסולוטי', 'סתום פה', 'סתום ת\'פה',

    // Mental health slurs
    'משוגע', 'משוגעת', 'חולה נפש', 'פסיכי', 'פסיכית',
    'שפוצץ לך', 'לא תקין', 'לא תקינה', 'צריך עזרה',
    'לבית משוגעים', 'פגוע', 'פגועה', 'מטורף',
    'שפוי', 'מופרע', 'מופרעת', 'לא תקין בראש',

    // Combination phrases
    'אתה לא שווה כלום', 'את לא שווה כלום',
    'אף אחד לא יתגעגע אליך', 'טוב שאתה מת',
    'הייתי רוצה שתמות', 'העולם יהיה טוב יותר בלעדיך',
];

/**
 * ENGLISH OFFENSIVE WORDS - Expanded with cyberbullying research 2025
 * Categories: bullying, body shaming, sexual harassment, threats, modern acronyms
 */
const OFFENSIVE_WORDS_ENGLISH = [
    // Core bullying (original)
    'stupid', 'idiot', 'moron', 'dumb', 'retard', 'loser',
    'worthless', 'pathetic', 'disgusting', 'ugly', 'freak',
    'weirdo', 'creep', 'psycho', 'crazy', 'insane', 'sick',
    'nobody likes you', 'everyone hates you', 'kill yourself',
    'kys', 'go die', 'you should die', 'waste of space',

    // Extended bullying (from teen cyberbullying research)
    'jerk', 'jerks', 'nerds', 'nerd', 'dork', 'geek',
    'failure', 'reject', 'outcast', 'nobody', 'nothing',
    'joke', 'laughingstock', 'embarrassment', 'shame', 'disgrace',
    'trash', 'garbage', 'scum', 'filth', 'dirt',

    // Body shaming (original + expanded)
    'fat', 'fatass', 'fatty', 'whale', 'pig', 'cow',
    'skinny', 'skeleton', 'bones', 'anorexic', 'disgusting',
    'hideous', 'monster', 'gross', 'repulsive', 'obese',
    'chubby', 'overweight', 'underweight', 'too fat', 'too skinny',
    'fatso', 'porky', 'tubby', 'lard', 'blubber',
    'twig', 'stick', 'toothpick', 'rail', 'beanpole',
    'beast', 'ogre', 'troll', 'gargoyle', 'horror',

    // Sexual harassment (original + variants)
    'bitch', 'whore', 'slut', 'hoe', 'prostitute', 'thot',
    'fuck you', 'fucking', 'fucker', 'motherfucker', 'asshole',
    'dickhead', 'cunt', 'pussy', 'cock', 'dick',
    'suck my', 'blow me', 'get fucked', 'fuck off',
    'skank', 'tramp', 'ho', 'hoe', 'slag',
    'pervert', 'creeper', 'perv', 'sleaze', 'slimeball',

    // Threats and violence (original + new)
    'kill you', 'hurt you', 'beat you', 'destroy you',
    'fuck you up', 'mess you up', 'kick your ass',
    'i will kill', 'gonna kill', 'youre dead', 'you\'re dead',
    'watch your back', 'better watch out', 'youll pay',
    'i\'ll get you', 'you\'ll regret', 'wait until', 'after school',
    'beat your ass', 'pound you', 'smash you', 'wreck you',
    'end you', 'finish you', 'take you out', 'take you down',

    // Modern cyberbullying phrases (2025 research)
    'no one likes you', 'everyone hates you', 'nobody wants you',
    'you have no friends', 'friendless loser', 'forever alone',
    'do us all a favor', 'the world would be better without you',
    'you should disappear', 'go away and never come back',
    'attention whore', 'drama queen', 'pick me',

    // Cyberbullying acronyms (from 2025 glossary)
    'gcad', 'get cancer and die', 'foad', 'fuck off and die',
    'fugly', 'fucking ugly', 'ihml', 'i hate my life',
    'kms', 'kill myself', 'kys', 'kill yourself',
    'pos', 'piece of shit', 'gtfo', 'get the fuck out',
    'stfu', 'shut the fuck up', 'fml', 'fuck my life',

    // Discrimination/slurs (partial - add as appropriate)
    'terrorist', 'go back to your country', 'illegal', 'immigrant',
    'foreigner', 'outsider', 'alien', 'stranger',

    // Social exclusion (expanded)
    'nobody wants you', 'no one likes you', 'everyone hates you',
    'you have no friends', 'friendless', 'loner', 'outcast',
    'leave', 'get out', 'go away', 'not wanted', 'dont belong',
    'you dont belong', 'nobody cares', 'no one cares about you',
    'unfriend', 'blocked', 'blocked you', 'dont talk to me',
    'youre blocked', 'dead to me', 'invisible', 'irrelevant',

    // Mental health slurs
    'retarded', 'mental', 'psycho', 'crazy', 'insane',
    'schizo', 'autistic', 'aspie', 'special ed', 'slow',
    'damaged', 'messed up', 'need help', 'get therapy',
    'psychotic', 'demented', 'disturbed', 'unhinged',

    // Combination phrases
    'piece of shit', 'pos', 'trash', 'garbage', 'scum',
    'waste', 'failure', 'disappointment', 'mistake', 'accident',
    'unwanted', 'unlovable', 'broken', 'defective', 'inferior',
    'worthless trash', 'complete failure', 'total loser',
    'absolute joke', 'walking disaster', 'human garbage',

    // Suicide-related (critical to catch)
    'commit suicide', 'do it', 'just do it already',
    'end it', 'end yourself', 'off yourself',
    '13th reason', 'your 13th reason', 'reason 13',
    'jump', 'jump off', 'hang yourself', 'overdose',
];

/**
 * COMBINED LIST
 */
const ALL_OFFENSIVE_WORDS = [
    ...OFFENSIVE_WORDS_HEBREW,
    ...OFFENSIVE_WORDS_ENGLISH
];

/**
 * Get all offensive words
 * @returns {Array<string>} All offensive words
 */
function getAllWords() {
    return ALL_OFFENSIVE_WORDS;
}

/**
 * Get Hebrew offensive words only
 * @returns {Array<string>} Hebrew offensive words
 */
function getHebrewWords() {
    return OFFENSIVE_WORDS_HEBREW;
}

/**
 * Get English offensive words only
 * @returns {Array<string>} English offensive words
 */
function getEnglishWords() {
    return OFFENSIVE_WORDS_ENGLISH;
}

/**
 * Get word count statistics
 * @returns {object} Word count by language
 */
function getStats() {
    return {
        hebrew: OFFENSIVE_WORDS_HEBREW.length,
        english: OFFENSIVE_WORDS_ENGLISH.length,
        total: ALL_OFFENSIVE_WORDS.length,
        version: '2.0 - Enhanced (January 2026)',
        sources: [
            'Cyberbullying Research Center 2025',
            'Hebrew Offensive Language Taxonomy (BERT)',
            'Israeli Gen Z Slang 2025',
            'Teen Cyberbullying Words Database'
        ]
    };
}

module.exports = {
    OFFENSIVE_WORDS_HEBREW,
    OFFENSIVE_WORDS_ENGLISH,
    ALL_OFFENSIVE_WORDS,
    getAllWords,
    getHebrewWords,
    getEnglishWords,
    getStats
};
