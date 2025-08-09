#!/usr/bin/env node
/**
 * Add New Jokes to Firebase - Add משעמם jokes to motivational_phrases collection
 */

const { getTimestamp } = require('../utils/logger');

async function addNewJokes() {
    console.log(`[${getTimestamp()}] 🎭 ADDING NEW JOKES TO FIREBASE`);
    console.log('=============================================\n');
    
    try {
        // Load Firebase
        const db = require('../firebaseConfig.js');
        if (!db || db.collection === undefined) {
            console.error('❌ Firebase not available');
            return false;
        }
        
        // New jokes to add
        const newJokes = [
            "השעמום שלך כל כך כבד, שהפלאפון שלך ביקש דרכון ועבר לגור באילת. 📵🏝️🛫",
            "משעמם לך? תתחיל למחוק תמונות – אולי תמצא את הרצון לחיות באלבום 2015. 🗑️📸💀",
            "הוואטסאפ שלך ריק מרוב שעמום, שגם הבוטים של הונאות ביטוח מחקו אותך מהאנשי קשר. 📱🙅‍♂️🤖",
            "יש לך כזה שקט בפלאפון, שגם הסוללה עושה לך טובה ונשארת 100% כל היום – כי אין על מה להתאמץ. 🔋😴👌",
            "השעמום שלך שבר שיא – אפילו הטלגרם שלך שלח לך הודעת \"עזוב אותי בשקט\". 😪📩🚫",
            "משעמם לך? נסה לדבר עם סירי… אולי גם היא תמליץ לך לצאת לטיול עם עצמך. 🤖📴🚶‍♂️",
            "הפיד שלך כל כך ריק, שאינסטגרם הציע לך לפתוח עמוד מעריצים… עליך. 📷🫠👑",
            "הגוגל שלך קפא, לא כי אין אינטרנט – פשוט כי גם הוא לא מצא סיבה שתשאל משהו. 🌐🛑🤷‍♂️",
            "השעמום אצלך כל כך חזק, שגם ה־AI של נטפליקס עזב אותך והתחיל לראות סדרה בלעדיך. 📺🤯🍿",
            "משעמם לך? תפתח את המחשבון, תכתוב 5318008 ותהפוך אותו – זה לפחות יצחיק אותך כמו בכיתה ז'. 🔢💬😜",
            "הטלפון שלך כל כך משועמם, שהוא שלח לך נוטיפיקציה: \"לך תדבר עם בן אדם אמיתי, תנסה\". 📱🐈🙃",
            "השעמום שלך גרם ליוטיוב להציע לך סרטון של חלזונות בתחרות מרוץ. 🎥🐌🏁",
            "מרוב שעמום, הפלאפון שלך עושה ריפרש לפיד, אבל חוזר עם הודעה: \"אחי, תפסיק, אין פה כלום.\" 📲🔄🚫",
            "משעמם לך? תתקשר למוקד של חברת סלולר – אולי לפחות המוזיקה בהמתנה תרקיד אותך. ☎️🎶🕺",
            "הסמארטפון שלך שוקל להגיש מועמדות ל\"מאסטר שף\" רק כדי לטעום משהו בחיים. 📱👨‍🍳🍴",
            "האייפון שלך פתח בעצמו חשבון בטינדר – בשביל להרגיש שיש לו חיבור למישהו. 🍎❤️📱",
            "השעמום אצלך כל כך עמוק, שגם הצ'ארג'ר נפל על הרצפה מרוב ייאוש. 🔌🥱💤",
            "בפעם הבאה שתרצה דרמה – פשוט תעדכן גרסה למערכת ההפעלה ותצפה לראות \"משהו השתבש\". 📱⚡🤦‍♂️",
            "הוואטסאפ שלך הציע: \"למה שלא תפתח קבוצה עם עצמך ותשלח ממים לעצמך?\" 📲😂🪞",
            "הפלאפון שלך שלח מייל: \"נא לא להפריע, אני באמצע שיעור שעמום מתקדם.\" 📧😴🎓"
        ];
        
        console.log(`🎯 Adding ${newJokes.length} new jokes to Firebase...`);
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < newJokes.length; i++) {
            const joke = newJokes[i];
            
            try {
                // Create joke document
                const jokeData = {
                    phrase: joke,
                    isActive: true,
                    category: 'boredom_response',
                    usageCount: 0,
                    lastUsed: null,
                    createdAt: new Date().toISOString(),
                    source: 'manual_addition_2025_01'
                };
                
                // Add to Firebase with auto-generated ID
                const docRef = await db.collection('motivational_phrases').add(jokeData);
                
                console.log(`✅ Added joke ${i + 1}/${newJokes.length}: ${docRef.id}`);
                console.log(`   Preview: "${joke.substring(0, 60)}..."`);
                successCount++;
                
                // Small delay to avoid overwhelming Firebase
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`❌ Failed to add joke ${i + 1}: ${error.message}`);
                console.error(`   Joke: "${joke.substring(0, 40)}..."`);
                errorCount++;
            }
        }
        
        console.log('\n📊 ADDITION SUMMARY:');
        console.log('====================');
        console.log(`✅ Successfully added: ${successCount} jokes`);
        console.log(`❌ Failed to add: ${errorCount} jokes`);
        console.log(`📝 Total processed: ${newJokes.length} jokes`);
        
        if (successCount > 0) {
            // Verify by checking total count
            try {
                const snapshot = await db.collection('motivational_phrases')
                    .where('isActive', '==', true)
                    .where('category', '==', 'boredom_response')
                    .get();
                
                const totalCount = snapshot.size;
                console.log(`🎭 Total active jokes in database: ${totalCount}`);
                console.log(`📈 Previous count was: ${totalCount - successCount}`);
                console.log(`🚀 New collection size: ${totalCount} jokes (${Math.round(successCount/totalCount*100)}% increase)`);
                
            } catch (verifyError) {
                console.warn('⚠️ Could not verify total count:', verifyError.message);
            }
        }
        
        console.log('\n🎯 NEXT STEPS:');
        console.log('==============');
        
        if (successCount > 0) {
            console.log('✅ New jokes added successfully to Firebase');
            console.log('✅ They will be available immediately for משעמם responses'); 
            console.log('✅ The bot\'s joke cache will refresh within 10 minutes');
            console.log('✅ Anti-repetition system will ensure variety');
            console.log('💡 Test by sending "משעמם" in a group chat');
        }
        
        if (errorCount > 0) {
            console.log(`⚠️ ${errorCount} jokes failed to add - check Firebase permissions`);
            console.log('💡 You may need to retry adding the failed jokes manually');
        }
        
        return successCount > 0;
        
    } catch (error) {
        console.error('❌ Error in joke addition process:', error.message);
        console.error('Stack trace:', error.stack);
        return false;
    }
}

// Run if called directly
if (require.main === module) {
    addNewJokes().then(success => {
        if (success) {
            console.log(`\n[${getTimestamp()}] 🎉 Joke addition completed successfully!`);
            process.exit(0);
        } else {
            console.log(`\n[${getTimestamp()}] ❌ Joke addition failed or incomplete`);
            process.exit(1);
        }
    }).catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { addNewJokes };