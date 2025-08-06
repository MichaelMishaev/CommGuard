#!/usr/bin/env node

/**
 * Add New Hebrew Jokes to Database
 * Adds 30 new Hebrew jokes to the motivational_phrases collection
 */

const { getTimestamp } = require('../utils/logger');

console.log(`
╔════════════════════════════════════════════════════╗
║       🎭 Adding New Hebrew Jokes to Database      ║
║                                                    ║
║           30 new jokes being added...              ║
╚════════════════════════════════════════════════════╝
`);

const newJokes = [
    "המציאו את המילה \"משעמם\" במיוחד בשבילך — וקיבלת זכויות יוצרים! 😂📜",
    "אתה כל כך משעמם, שהפסקול של חייך זה רק צליל של מקרר. 🧊🎶",
    "משעמם לך? נסה לשכנע את הכלב שלך ללמוד לדבר. לפחות הוא יתחמק ממך יפה! 🐶🗣️",
    "אם היה אפליקציה למדידת שעמום, היית מקבל נוטיפיקציה: \"שיא יומי חדש!\" 📱🥇",
    "יש אנשים שסופרים כבשים. אצלך גם הכבשים נרדמו. 🐑💤",
    "השעמום שלך יכול להיכנס לאולימפיאדה בענף \"לא לעשות כלום\". 🏅🛋️",
    "אם היה תחרות ייבוש צבע, היית המנצח. אפילו בלי להשתדל. 🎨👑",
    "בפעם הבאה שמישהו שואל \"מה חדש?\" תענה \"עדיין כלום, תודה ששאלת\". 🤷‍♂️⏰",
    "משעמם ברמות שאפילו הפיצה מזמינה את עצמה לבד. 🍕📞",
    "המצב אצלך כל כך שקט, שגם המקרר שומע הד. 🚪👂",
    "השעמום אצלך – כמו חשמל סטטי: לא רואים, אבל מרגישים. ⚡😅",
    "אם עוד קצת ישעמם לך, אפילו שומר המסך יתחיל לשדר נטפליקס. 🖥️🍿",
    "משעמם? תנסה ללמד זבוב ללכת ברוורס — זה לפחות יזוז מהר ממך. 🪰↩️",
    "תראה איזה שקט — אפילו האבק לא ממהר להתיישב אצלך! 🧹🏠",
    "המשעמם אצלך, אפילו הקפה הפסיק לעורר. ☕😴",
    "שעמום כזה עוד לא היה מאז שהמציאו את ההמתנה בטלפון. 📞⏳",
    "אם היה סולם שעמום, אתה כבר עלית על הסולם, ירדת ממנו, ונרדמת לידו. 🪜💤",
    "היה פעם אקשן אצלך, אבל הוא התייאש וברח לשכן. 🏃‍♂️🏡",
    "גם הגזע של הכלב שלך שינה מקצוע מרוב שעמום. 🐕‍🦺👔",
    "הבעיה אצלך זה לא השעמום – זה שאתה מתחיל להתרגל לזה. 😅🎭",
    "אתה כל כך משעמם, שגם החיפוש בגוגל אומר \"אין תוצאות\". 🔍❌",
    "ניסית פעם להמציא שיר על השעמום שלך? בטח יצא שקט ארוך... 🎤🤫",
    "אם עוד שנייה של שעמום, אפילו הכריות יתחילו לברוח מהמיטה. 🛏️🏃‍♀️",
    "יש לך כל כך הרבה זמן פנוי, שגם הזמן התחיל ללכת לאיבוד. ⏰🤪",
    "משעמם לך? תצא מהבית, אולי תיתקל במשהו מעניין – כמו שלולית! 🚶‍♂️💧",
    "אם תכתוב סדרה על החיים שלך, אפילו נטפליקס תבקש הפסקה. 🎬🚫",
    "השעמום אצלך עמוק כמו שיחה עם הבוט של הבנק. 🏦🤖",
    "גם הרוח השתעממה אצלך ועברה דירה. 🍃📦",
    "הייתי מציע לך תחביב, אבל אני פוחד שהוא יירדם אצלך. 🪁😆",
    "כשאתה מספר לשעון שלך שמשעמם — הוא עושה פרצוף. 🕒😐"
];

async function addJokesToDatabase() {
    console.log(`[${getTimestamp()}] 🚀 Starting to add ${newJokes.length} new Hebrew jokes to database\n`);
    
    try {
        // Initialize Firebase
        const db = require('../firebaseConfig.js');
        
        if (!db || db.collection === undefined) {
            console.error('❌ Firebase not available - cannot add jokes');
            return false;
        }
        
        console.log('✅ Firebase connection established');
        
        let addedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        
        // Get existing jokes to check for duplicates
        console.log('🔍 Checking existing jokes to avoid duplicates...');
        const existingJokes = new Set();
        
        try {
            const snapshot = await db.collection('motivational_phrases').get();
            snapshot.forEach(doc => {
                existingJokes.add(doc.data().phrase);
            });
            console.log(`📋 Found ${existingJokes.size} existing jokes in database`);
        } catch (error) {
            console.warn('⚠️ Could not load existing jokes, proceeding anyway:', error.message);
        }
        
        // Add each new joke
        console.log(`\n📝 Adding new jokes to database...\n`);
        
        for (let i = 0; i < newJokes.length; i++) {
            const joke = newJokes[i];
            
            try {
                // Check if joke already exists
                if (existingJokes.has(joke)) {
                    console.log(`${(i + 1).toString().padStart(2, '0')}. 🔄 SKIP: Joke already exists`);
                    skippedCount++;
                    continue;
                }
                
                // Create joke document
                const jokeDoc = {
                    phrase: joke,
                    language: 'hebrew',
                    category: 'boredom_response',
                    createdAt: new Date().toISOString(),
                    usageCount: 0,
                    lastUsed: null,
                    isActive: true,
                    addedBy: 'admin_batch_import',
                    tags: ['funny', 'boredom', 'hebrew', 'sarcastic']
                };
                
                // Add to Firebase
                await db.collection('motivational_phrases').add(jokeDoc);
                
                // Show truncated joke for readability
                const truncatedJoke = joke.length > 50 ? joke.substring(0, 50) + '...' : joke;
                console.log(`${(i + 1).toString().padStart(2, '0')}. ✅ ADDED: ${truncatedJoke}`);
                
                addedCount++;
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.log(`${(i + 1).toString().padStart(2, '0')}. ❌ ERROR: ${error.message}`);
                errorCount++;
            }
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 JOKE ADDITION SUMMARY:`);
        console.log(`✅ Successfully added: ${addedCount} jokes`);
        console.log(`🔄 Skipped (duplicates): ${skippedCount} jokes`);
        console.log(`❌ Errors: ${errorCount} jokes`);
        console.log(`📋 Total processed: ${newJokes.length} jokes`);
        
        if (addedCount > 0) {
            console.log(`\n🎉 SUCCESS! Added ${addedCount} new Hebrew jokes to the database!`);
            
            // Test the motivational phrase service
            console.log(`\n🧪 Testing updated joke system...`);
            try {
                const { motivationalPhraseService } = require('../services/motivationalPhraseService');
                
                // Force reload cache to include new jokes
                await motivationalPhraseService.loadPhraseCache();
                
                const testJoke = await motivationalPhraseService.getRandomPhrase();
                console.log(`✅ Test joke retrieved successfully:`);
                console.log(`   "${testJoke}"`);
                
                const stats = await motivationalPhraseService.getPhraseStats();
                console.log(`📊 Updated database stats:`);
                console.log(`   - Total phrases: ${stats.totalPhrases}`);
                console.log(`   - Active phrases: ${stats.activePhrases}`);
                console.log(`   - Hebrew phrases: ${stats.hebrewPhrases}`);
                
            } catch (testError) {
                console.log(`⚠️ Could not test joke system: ${testError.message}`);
            }
        }
        
        if (errorCount === 0 && addedCount > 0) {
            console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    🎭 JOKES SUCCESSFULLY ADDED! 🎉            ║
╠═══════════════════════════════════════════════════════════════╣
║  The bot now has ${addedCount} additional Hebrew jokes!           ║
║                                                               ║
║  ✅ Ready to respond to "משעמם" with fresh humor!             ║
║  🎯 All jokes include emojis and Hebrew wit                   ║
║  📊 Smart rotation prevents repetition                        ║
║  🔄 Usage tracking for analytics                              ║
╚═══════════════════════════════════════════════════════════════╝
            `);
        }
        
        return addedCount > 0;
        
    } catch (error) {
        console.error(`❌ Failed to add jokes to database:`, error.message);
        return false;
    }
}

// Run the joke addition
addJokesToDatabase().then(success => {
    if (success) {
        console.log('\n🚀 Database update completed successfully!');
        process.exit(0);
    } else {
        console.log('\n⚠️ Database update completed with issues.');
        process.exit(1);
    }
}).catch(error => {
    console.error('\n💥 Script crashed:', error.message);
    process.exit(1);
});