// services/offensiveWordsDatabase.js
// Global offensive words database for bullying detection
// Includes: slurs, harassment terms, bullying keywords
// Languages: Hebrew, English

/**
 * Hebrew offensive words for bullying detection
 * Categories: bullying, body shaming, sexual harassment, threats
 */
const OFFENSIVE_WORDS_HEBREW = [
    // Bullying terms
    'מפגר', 'מטומטם', 'דביל', 'אידיוט', 'טיפש', 'מטורלל',
    'זבל', 'חרא', 'מגעיל', 'נבל', 'שקרן', 'מניאק',
    'משוגע', 'חולה', 'פסיכי', 'סתום', 'תסתום', 'תשתוק',
    'לך תמות', 'תעוף', 'תיעלם', 'אף אחד לא רוצה אותך',
    'כולם שונאים אותך', 'אתה חרא', 'את חרא', 'מטומטמת',

    // Body shaming
    'שמן', 'שמנה', 'דק', 'דקה', 'מכוער', 'מכוערת',
    'מוגבל', 'נכה', 'פיצוץ', 'פצצה', 'עצם', 'כישלון',
    'מפלצת', 'דוחה', 'שמנמן', 'שמנמנה', 'עודף משקל',
    'רזה', 'רזה מדי', 'עצמות', 'שלד',

    // Sexual harassment
    'זונה', 'שרמוטה', 'כלבה', 'בן זונה', 'בת זונה',
    'זין', 'כוס', 'מזדיין', 'מזדיינת', 'שרמוטון',
    'קרווה', 'קרוע', 'פאקינג', 'מזדיין', 'יא קוקסינל',
    'סקס', 'לזיין', 'מזיין', 'נרקמן', 'נרקמנית',

    // Threats and violence
    'אהרוג', 'להרוג', 'להרוג אותך', 'להתאבד', 'אתאבד', 'רוצה למות', 'רוצה להתאבד', 'אהרוג אותך', 'אחטוף', 'אפגע', 'אלך',
    'תמות', 'תסבול', 'אתה מת', 'את מתה', 'אזיין אותך',
    'אנצח אותך', 'אכה אותך', 'אמחק אותך', 'אשרוף',
    'אנקום', 'תשלם', 'תראה מה יקרה', 'אני אדאג שתסבול',

    // Sexual assault threats (CRITICAL)
    'אנסח', 'אנסח אותך', 'אאנס', 'אאנס אותך', 'לאנוס',
    'אנסה', 'אנסה אותך', 'אונס', 'אונסת',

    // Physical violence threats (CRITICAL)
    'לפוצץ', 'אפוצץ', 'אפוצץ אותך', 'לפוצץ אותך',
    'אפגיע', 'אפגיע בך', 'אפגע בך', 'אתקוף', 'אתקוף אותך',
    'אשבור', 'אשבור לך', 'אשבור אותך', 'אריב', 'אריב אותך',
    'אמחץ', 'אמחץ אותך', 'אהכה', 'אכה', 'אדפוק', 'אדפוק אותך',

    // Discrimination
    'ערס', 'ערסה', 'אשכנזי חרא', 'מזרחי חרא', 'רוסי חרא',
    'אמריקאי חרא', 'פשוט תחזור לארץ שלך', 'חזור לארצך',
    'פליט', 'זר', 'לא שלנו', 'תיקים',

    // Social exclusion
    'אף אחד לא אוהב אותך', 'כולם שונאים', 'אין לך חברים',
    'בודד', 'לוזר', 'מנודה', 'אף אחד לא רוצה אותך',
    'תעזוב', 'לך מפה', 'אף אחד לא רוצה אותך כאן',
    'אתה לא שייך', 'את לא שייכת',

    // Slang and variants
    'לעזאזל', 'כוסאמק', 'בן שרמוטה', 'קוקסינל', 'אחי סתום',
    'תסגור ת\'פה', 'יא מטומטם', 'יא דביל', 'יא טיפש',
    'זדיין', 'פאקד', 'מסריח', 'מסריחה', 'מלכלך',

    // Mental health slurs
    'משוגע', 'משוגעת', 'חולה נפש', 'פסיכי', 'פסיכית',
    'שפוצץ לך', 'לא תקין', 'לא תקינה', 'צריך עזרה',
    'לבית משוגעים', 'פגוע', 'פגועה'
];

/**
 * English offensive words for bullying detection
 * Categories: bullying, body shaming, sexual harassment, threats
 */
const OFFENSIVE_WORDS_ENGLISH = [
    // Bullying
    'stupid', 'idiot', 'moron', 'dumb', 'retard', 'loser',
    'worthless', 'pathetic', 'disgusting', 'ugly', 'freak',
    'weirdo', 'creep', 'psycho', 'crazy', 'insane', 'sick',
    'nobody likes you', 'everyone hates you', 'kill yourself',
    'kys', 'go die', 'you should die', 'waste of space',

    // Body shaming
    'fat', 'fatass', 'fatty', 'whale', 'pig', 'cow',
    'skinny', 'skeleton', 'bones', 'anorexic', 'disgusting',
    'hideous', 'monster', 'gross', 'repulsive', 'obese',
    'chubby', 'overweight', 'underweight', 'too fat', 'too skinny',

    // Sexual harassment
    'bitch', 'whore', 'slut', 'hoe', 'prostitute', 'thot',
    'fuck you', 'fucking', 'fucker', 'motherfucker', 'asshole',
    'dickhead', 'cunt', 'pussy', 'cock', 'dick',
    'suck my', 'blow me', 'get fucked', 'fuck off',

    // Threats and violence
    'kill you', 'hurt you', 'beat you', 'destroy you',
    'fuck you up', 'mess you up', 'kick your ass',
    'i will kill', 'gonna kill', 'youre dead', 'you\'re dead',
    'watch your back', 'better watch out', 'youll pay',
    'i\'ll get you', 'you\'ll regret', 'wait until', 'after school',

    // Discrimination/slurs
    'ni**er', 'ni**a', 'faggot', 'fag', 'dyke', 'tranny',
    'terrorist', 'go back to your country', 'illegal', 'immigrant',
    'wetback', 'spic', 'gook', 'chink', 'kike', 'towelhead',

    // Social exclusion
    'nobody wants you', 'no one likes you', 'everyone hates you',
    'you have no friends', 'friendless', 'loner', 'outcast',
    'leave', 'get out', 'go away', 'not wanted', 'dont belong',
    'you dont belong', 'nobody cares', 'no one cares about you',

    // Mental health slurs
    'retarded', 'mental', 'psycho', 'crazy', 'insane',
    'schizo', 'autistic', 'aspie', 'special ed', 'slow',
    'damaged', 'messed up', 'need help', 'get therapy',

    // Additional variants
    'piece of shit', 'pos', 'trash', 'garbage', 'scum',
    'waste', 'failure', 'disappointment', 'mistake', 'accident',
    'unwanted', 'unlovable', 'broken', 'defective', 'inferior'
];

/**
 * Combined list of all offensive words
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
        total: ALL_OFFENSIVE_WORDS.length
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
