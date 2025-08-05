#!/usr/bin/env node

/**
 * Add Motivational Phrases to Firebase
 * Adds funny responses for "משעמם" messages with usage tracking
 */

const db = require('../firebaseConfig.js');
const { getTimestamp } = require('../utils/logger');

console.log(`
╔════════════════════════════════════════════════════╗
║        📚 Adding Motivational Phrases to DB        ║
║                                                    ║
║   Adding 50 Hebrew jokes for "משעמם" responses     ║
╚════════════════════════════════════════════════════╝
`);

const motivationalPhrases = [
    "אם משעמם לך, סימן שאתה עומד לגלות כישרון חדש: נודניק מדופלם! 😏🎉",
    "אל תדאג, גם לשעמום יש סוף. קוראים לזה \"אוכל\". 🍕🍫",
    "השעמום שלך כל כך כבד, שאפילו נטפליקס מזיעה. 📺💦",
    "כשמשעמם, המציאו את הפיג'מה — שיהיה בנוח לבהות בתקרה! 🛏️👀",
    "משעמם? תספר לעצמך בדיחה. אם תצחק – אתה מוכשר! 😂🤡",
    "תזכור: מי שמשתעמם הוא גאון בפוטנציה... או זקוק לשנ\"צ. 🤓💤",
    "יש אנשים שמשעמם להם. יש כאלה שממציאים מחדש את הטינדר כל שעה. 📱🔥",
    "גם לשעמום שלך מגיע לייק. תן לו! 👍😆",
    "משעמם? סימן שהמוח שלך על מצב \"טעינה\". 🔋🧠",
    "אם משעמם לך — אולי זה הזמן לארגן את הגרביים לפי גובה. 🧦📏",
    "מי שמשעמם לו, חייב להודות: לפחות לא משעמם לבזבז זמן על שטויות. 🤷‍♂️⏳",
    "השעמום הוא סבתא של ההשראה — רק תן לה נשיקה והיא תביא רעיון. 😘💡",
    "מי שמשעמם לו — שיקום! אבל לאט, שלא תתעייף. 🐢🙃",
    "כשמשעמם, כדאי לנסות לצייר עיגול מושלם ביד חופשית. זה יעסיק אותך לעד! ✏️🌀",
    "אל תיבהל מהשעמום. הוא רק בודק אם אתה עדיין כאן. 👀🔍",
    "השעמום שלך עשה לי פיהוק מרחוק. תתעורר! 😴😮‍💨",
    "תזכור: כל רגע של שעמום מקרב אותך לפרס הנובל... או לעוד סדרה. 🏆📺",
    "משעמם? תכתוב \"משעמם לי\" עשר פעמים הפוך — ותגלה שלא משעמם! 🔄😜",
    "אם משעמם — קח נייר, קפל אותו, המצא מטוס, תטיס לחלון. ריפוי בעיסוק! ✈️🪟",
    "שעמום הוא הסימן שליקום יש הפתעה בדרך. סבלנות – זה בדרך אליך! 🪄🎁",
    "משעמם לך? אולי תנסה סוף סוף לסיים לקרוא את ההוראות של המיקרוגל. 📖🍿",
    "אם היית עוד יותר משעמם – היית מועמד רשמי לפרס נובל לשעמום. 🥱🏅",
    "כנראה אפילו החתול שלך מפהק ממך. 🐱😼",
    "משעמם לך? תבדוק אולי גם החברים שלך סובלים – ממך! 😆📞",
    "השעמום שלך כל כך מדבק, שאפילו הזבובים מתאמצים לעוף רחוק. 🪰🏃‍♂️",
    "וואו, משעמם לך? תיזהר שלא תשתעמם מהשעמום שלך. 🚨😴",
    "אם היה אולימפיאדה בשעמום – היית שוב מפסיד, כי היית נרדם בשלב המוקדמות. 😪🥇",
    "השעמום שלך כל כך גדול – אפילו הפלאפון שלך מתייאש ומכבה את עצמו. 📱🛑",
    "משעמם לך? תנסה לחשוב על משהו מעניין – או שפשוט תמשיך לא להבריק. 💭🦥",
    "אפילו סדרה על ייבוש צבע נשמעת סוערת ליד מה שאתה עובר. 🎨🚱",
    "השעמום שלך גורם לפקיד דואר להרגיש אקשן. 🏤💥",
    "אפילו פקק של יום חמישי בצהריים קורה בו יותר מאצלך עכשיו. 🚗🚦",
    "אם היה גביע לשעמום, היית מפספס את הגמר כי נרדמת. 🏆💤",
    "אפשר לעשות עליך סרט דוקומנטרי: \"איש השעמום – הסיפור האמיתי\". 🎬🤫",
    "משעמם לך? מזל שהדופק שלך עדיין עובד. 💓🔊",
    "אפילו הוייפיי שלך קולט פחות משעמום כזה. 📶😒",
    "השעמום שלך כל כך אפור, שהעננים יוצאים לחפש צבע. 🌫️🌈",
    "גם חיפושית מתה היתה מוצאת אצלך פחות שעמום. 🪲☠️",
    "אם עוד טיפה ישעמם לך, תתחיל לדבר עם העציצים – והם יתעלמו. 🪴🙈",
    "משעמם לך? אולי תכתוב על זה פוסט... ותחכה שלייק אחד יגיע. 📝👍",
    "אפילו רובוטים מרגישים יותר אנושיים כרגע. 🤖❤️",
    "השעמום שלך עושה גוגל על \"מה עושים כשמשעמם\". 🌐🙃",
    "אם תמשיך כך, אפילו הסטיקר של \"משעמם לי\" יעבור קבוצה. 🏃‍♀️📲",
    "אתה כל כך משעמם, שגם השלט של המזגן איבד עניין. ❄️🥱",
    "יוטיוב הציע לך לצפות בפרסומות במקום בתוכן. ▶️📢",
    "משעמם לך? כנראה שזה עונש על משהו שעשית בגלגול קודם. 🔮😅",
    "עם כישרון כזה לשעמום, תוכל להיות מרצה בהפסקת חשמל. 💡🗣️",
    "אפילו קפיצת ראש לבריכה ריקה נראית מסעירה לעומת המצב שלך. 🏊‍♂️🕳️",
    "הפינגווינים באנטארקטיקה מקנאים בשקט אצלך. 🐧❄️",
    "מדענים חוקרים את השעמום שלך – כדי לדעת מה לא לעשות. 👨‍🔬🔬"
];

async function addPhrasesToDatabase() {
    if (!db || db.collection === undefined) {
        console.error('❌ Firebase not available - cannot add phrases');
        return;
    }

    console.log(`[${getTimestamp()}] 📝 Adding ${motivationalPhrases.length} motivational phrases to Firebase...\n`);

    let added = 0;
    let failed = 0;

    try {
        const batch = db.batch();
        const collection = db.collection('motivational_phrases');

        for (let i = 0; i < motivationalPhrases.length; i++) {
            const phrase = motivationalPhrases[i];
            const docRef = collection.doc(); // Auto-generate ID

            const phraseData = {
                id: docRef.id,
                text: phrase,
                type: 'funny_response',
                language: 'hebrew',
                trigger: 'משעמם',
                addedAt: new Date().toISOString(),
                lastUsed: null,
                usageCount: 0,
                active: true,
                category: 'boredom_response'
            };

            batch.set(docRef, phraseData);
            console.log(`${i + 1}. Added: "${phrase.substring(0, 50)}..."`);
        }

        // Commit the batch
        await batch.commit();
        added = motivationalPhrases.length;

        console.log(`\n✅ Successfully added ${added} phrases to Firebase!`);

        // Verify the addition
        const snapshot = await collection.where('trigger', '==', 'משעמם').get();
        console.log(`✅ Verification: Found ${snapshot.size} phrases in database`);

    } catch (error) {
        console.error('❌ Error adding phrases to database:', error.message);
        failed = motivationalPhrases.length;
    }

    console.log(`\n📊 Results: ${added} added, ${failed} failed`);

    if (added > 0) {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    ✅ PHRASES ADDED SUCCESSFULLY               ║
╠═══════════════════════════════════════════════════════════════╣
║  Collection: motivational_phrases                             ║
║  Trigger: משעמם                                                ║
║  Count: ${String(added).padStart(2)} phrases                                        ║
║  Features: Usage tracking, last used date                    ║
╚═══════════════════════════════════════════════════════════════╝
        `);
    }

    return { added, failed };
}

// Run the script
console.log('Starting phrase addition in 2 seconds...\n');

setTimeout(() => {
    addPhrasesToDatabase().catch(console.error);
}, 2000);