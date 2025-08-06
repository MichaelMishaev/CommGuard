#!/usr/bin/env node

/**
 * Add Additional Hebrew Jokes to Database
 * Adds 15 more Hebrew jokes to the motivational_phrases collection
 */

const { getTimestamp } = require('../utils/logger');

console.log(`
╔════════════════════════════════════════════════════╗
║       🎭 Adding More Hebrew Jokes to Database     ║
║                                                    ║
║           15 additional jokes being added...       ║
╚════════════════════════════════════════════════════╝
`);

const additionalJokes = [
    "אם היה לך שקל על כל פעם שמשעמם לך – היית יכול להרשות לעצמך מישהו שיבדר אותך. 💸🤹‍♂️",
    "הקירות בבית שלך כבר התחילו לגלגל עיניים. 🏠🙄",
    "משעמם לך? תנסה לבהות בקומקום עד שירתח. לפחות תוכל להתרגש מהצליל! ☕🔊",
    "בפעם הבאה שתרצה ריגוש, תבדוק אם חיברת את המטען נכון. 📱🔌",
    "אם השעמום שלך היה עמוד אינסטגרם, אפילו הבוטים היו מפסיקים לעקוב. 📸🚫",
    "הטלפון שלך משועמם — הוא שלח לעצמו הודעה לבדוק אם הכל בסדר. 📲✅",
    "אתה כל כך משעמם, שגם הג'וק מתחרט שנכנס אליך לדירה. 🪳🏃‍♂️",
    "הרשית לעצמך רגע של אקשן — הפכת את הכרית לצד הקר. 🛏️❄️",
    "משעמם לך? תכבה ותדליק שוב את הוויי-פיי — לפחות יקרה משהו. 🌐🔁",
    "היית מספר בדיחה, אבל אתה מפחד שתירדם באמצע. 💤😂",
    "היום קרה משהו מרגש: עברת לספה השנייה. 🛋️➡️🛋️",
    "אפילו הפופקורן שלך מייבש את עצמו. 🍿🫠",
    "יש לך כל כך הרבה שעמום, שאפילו ספרי טלפונים מרגישים אקשן. 📞😅",
    "כשהשעון שלך שואל \"מה השעה?\", הוא עונה לעצמו מרוב שיעמום. 🕑🤷‍♂️",
    "אפילו בינה מלאכותית משתעממת ממך — מזל שאני לא נעלבת! 🤖💔😜"
];

async function addAdditionalJokes() {
    console.log(`[${getTimestamp()}] 🚀 Starting to add ${additionalJokes.length} additional Hebrew jokes to database\n`);
    
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
        
        // Add each additional joke
        console.log(`\n📝 Adding additional jokes to database...\n`);
        
        for (let i = 0; i < additionalJokes.length; i++) {
            const joke = additionalJokes[i];
            
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
                    addedBy: 'admin_additional_batch',
                    tags: ['funny', 'boredom', 'hebrew', 'sarcastic', 'modern']
                };
                
                // Add to Firebase
                await db.collection('motivational_phrases').add(jokeDoc);
                
                // Show truncated joke for readability
                const truncatedJoke = joke.length > 60 ? joke.substring(0, 60) + '...' : joke;
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
        console.log(`📊 ADDITIONAL JOKES SUMMARY:`);
        console.log(`✅ Successfully added: ${addedCount} jokes`);
        console.log(`🔄 Skipped (duplicates): ${skippedCount} jokes`);
        console.log(`❌ Errors: ${errorCount} jokes`);
        console.log(`📋 Total processed: ${additionalJokes.length} jokes`);
        
        if (addedCount > 0) {
            console.log(`\n🎉 SUCCESS! Added ${addedCount} additional Hebrew jokes to the database!`);
            
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
║              🎭 ADDITIONAL JOKES SUCCESSFULLY ADDED! 🎉      ║
╠═══════════════════════════════════════════════════════════════╣
║  The bot now has ${addedCount} more Hebrew jokes!                 ║
║                                                               ║
║  🎯 Total joke database now contains 95+ witty responses     ║
║  ✅ Ready to respond to "משעמם" with even more variety!       ║
║  🎨 Modern references and emojis for engaging responses      ║
║  📱 Tech-savvy humor that users will love                    ║
╚═══════════════════════════════════════════════════════════════╝
            `);
        }
        
        return addedCount > 0;
        
    } catch (error) {
        console.error(`❌ Failed to add additional jokes to database:`, error.message);
        return false;
    }
}

// Run the additional joke addition
addAdditionalJokes().then(success => {
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