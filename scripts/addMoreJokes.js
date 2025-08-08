/**
 * Add More Hebrew Jokes
 * Adds 30+ new Hebrew jokes for "משעמם" responses with usage tracking
 */

const db = require('../firebaseConfig.js');
const { getTimestamp } = require('../utils/logger');

console.log(`╔════════════════════════════════════════════════════════╗`);
console.log(`║   Adding 30+ new Hebrew jokes for "משעמם" responses     ║`);
console.log(`╚════════════════════════════════════════════════════════╝`);

// New collection of 30 Hebrew jokes
const newJokes = [
    "מי שימציא אפליקציה שמגרשת שעמום — חייב להשתמש בתמונה שלך בתור לוגו! 😂📱",
    "הצלחת לשעמם אפילו את \"היי סירי\", עכשיו היא רק עושה עצמה לא שומעת. 🍏🤫",
    "משעמם אצלך כל כך, שהספונג'ה ברח מהדלי ועבר לדירה של השכנים. 🧽🏃‍♀️",
    "אפילו המקרר שלך חורק כדי להרגיש קצת אקשן בבית. 🧊🎤",
    "הכיסא שלך ביקש יום חופש. 🪑✈️",
    "השלט שלך התחיל לזפזפ בעצמו, רק שלא תיגע בו יותר. 📺🤖",
    "הענן בגוגל נהיה אבק אצלך. ☁️➡️🌪️",
    "גם הווייז שלך אמר \"הגעת ליעד: כלום\". 🚗📍",
    "משעמם לך? תנסה להפעיל את המיקרוגל על קציצות ולרוץ מסביב לשולחן עד שזה מוכן! 🍲🏃‍♂️",
    "הפלאפון שלך ביקש לדבר עם נציג שירות – סתם לשבור שגרה. 📞😂",
    "המשעמם אצלך, שגם האור בחדר עשה דימר מרוב עייפות. 💡😴",
    "תשקול לפתוח ערוץ יוטיוב: \"ריאלטי של שעמום\" – פרק 1: \"אני נושם\". 📹😆",
    "הצלחת להבריח אפילו את היתושים – הם עפו לחפש מסיבה. 🦟🎉",
    "אתה כל כך משעמם, שגם הדומינו נופל לאט אצלך. 🟦🐢",
    "הצמחים אצלך בבית כבר מזמן מגדלים אותך. 🪴👶",
    "השעון שלך מתקתק ברוורס — מרוב שלא קורה כלום. 🕰️🔄",
    "הג'וק במטבח שם לך פתק: \"חוזר כשיהיה מעניין\". 🪳📝",
    "אם תכתוב אוטוביוגרפיה על השעמום שלך – אפילו העכבר של המחשב יעבור עמוד לבד. 📖🖱️",
    "פעם אחת היה אקשן – זה היה כשפיהקת פעמיים ברצף. 🥱🥱",
    "הפוך שלך כל כך רדום, שגם קפאין מוותר מראש. ☕😵",
    "משעמם לך? נסה לנשוף על חלון ולצייר זקן לסבתא שלך על האדים. 🪟👵",
    "הברווזונים באגם מתאמנים כדי לשבור את השיא שלך בשעמום. 🦆🏆",
    "אפילו הרחפן שלך לא מצליח להמריא מאזור השעמום. 🚁🙅‍♂️",
    "אם תמשיך להשתעמם ככה, תתחיל לצפות בוידאו של \"ייבוש בטון\" ביוטיוב. 🏗️⏳",
    "הקפצת לי כל כך הרבה שעמום, שהביצה במקרר ביקשה להיבקע בעצמה מרוב שיעמום. 🥚💥",
    "ביקשת פעם מהשלט להעביר ערוץ — הוא התעלף ביד שלך. 📺😵",
    "הפח בבית שלך קרא לעצמו \"הפח של חלומות שבוזבזו\". 🗑️😅",
    "יש לך כל כך הרבה שעמום — גם הספר \"מלחמה ושלום\" התקצר אצלך. 📚✂️",
    "הציפורים בבוקר שותקות אצלך, שלא להפריע לשעמום. 🐦🤫",
    "בפעם הבאה שמשעמם לך, תנסה להתחרות עם קיר – מי מצליח להיראות יותר עסוק. 🧱🆚😑"
];

async function addNewJokesToDatabase() {
    console.log(`\n[${getTimestamp()}] 🎭 Starting to add new jokes to database...\n`);

    try {
        const collection = db.collection('motivational_phrases');
        
        // Check how many jokes we currently have
        const existingJokes = await collection.where('trigger', '==', 'משעמם').get();
        console.log(`📊 Current jokes in database: ${existingJokes.size}`);
        console.log(`➕ Adding ${newJokes.length} new jokes...\n`);
        
        let addedCount = 0;
        let skippedCount = 0;
        
        for (let i = 0; i < newJokes.length; i++) {
            const joke = newJokes[i];
            
            // Check if joke already exists
            const duplicateCheck = await collection
                .where('trigger', '==', 'משעמם')
                .where('text', '==', joke)
                .get();
                
            if (duplicateCheck.empty) {
                // Add new joke
                const jokeData = {
                    text: joke,
                    trigger: 'משעמם',
                    category: 'humor',
                    language: 'hebrew',
                    usageCount: 0,
                    lastUsed: null,
                    createdAt: new Date().toISOString(),
                    addedBy: 'manual_script',
                    version: 'v2_expansion'
                };
                
                await collection.add(jokeData);
                console.log(`✅ Added joke ${i + 1}/${newJokes.length}: "${joke.substring(0, 50)}..."`);
                addedCount++;
            } else {
                console.log(`⏭️  Skipped duplicate ${i + 1}/${newJokes.length}: "${joke.substring(0, 30)}..."`);
                skippedCount++;
            }
        }
        
        // Final count
        const finalCount = await collection.where('trigger', '==', 'משעמם').get();
        
        console.log(`\n╔════════════════════════════════════════════════════════╗`);
        console.log(`║                   📊 ADDITION COMPLETE                 ║`);
        console.log(`╠════════════════════════════════════════════════════════╣`);
        console.log(`║  ✅ Successfully added: ${addedCount.toString().padStart(2)} jokes                    ║`);
        console.log(`║  ⏭️  Skipped duplicates: ${skippedCount.toString().padStart(2)} jokes                   ║`);
        console.log(`║  📊 Total jokes in database: ${finalCount.size.toString().padStart(3)} jokes            ║`);
        console.log(`║                                                        ║`);
        console.log(`║  🎭 Features:                                           ║`);
        console.log(`║  • Modern Hebrew humor with emojis                     ║`);
        console.log(`║  • Smart rotation system avoids repeats               ║`);
        console.log(`║  • Usage tracking and statistics                      ║`);
        console.log(`║  • Responds to "משעמם" messages automatically           ║`);
        console.log(`╚════════════════════════════════════════════════════════╝`);
        
        console.log(`\n💡 *Test the new jokes:*`);
        console.log(`  1. Send a message containing "משעמם" in any group`);
        console.log(`  2. Bot will respond with a random joke (including new ones!)`);
        console.log(`  3. Use #jokestats to see usage statistics`);
        
        console.log(`\n🎉 *Sample new jokes added:*`);
        console.log(`  • "מי שימציא אפליקציה שמגרשת שעמום — חייב להשתמש בתמונה שלך בתור לוגו! 😂📱"`);
        console.log(`  • "השלט שלך התחיל לזפזפ בעצמו, רק שלא תיגע בו יותר. 📺🤖"`);
        console.log(`  • "הג'וק במטבח שם לך פתק: 'חוזר כשיהיה מעניין'. 🪳📝"`);
        
    } catch (error) {
        console.error(`❌ Error adding jokes to database:`, error);
        console.log(`\n📝 *Manual fallback:* If Firebase is unavailable, jokes can be added`);
        console.log(`   directly to the motivationalPhraseService.js file.`);
    }
}

// Run the script
addNewJokesToDatabase().then(() => {
    console.log(`\n🚀 Script completed at ${getTimestamp()}`);
    process.exit(0);
}).catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
});