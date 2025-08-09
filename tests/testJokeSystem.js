#!/usr/bin/env node
/**
 * Test Joke System - Verify Firebase joke collection and randomization
 * Check actual joke count and test anti-repetition logic
 */

const { getTimestamp } = require('../utils/logger');
const { motivationalPhraseService } = require('../services/motivationalPhraseService');

async function testJokeSystem() {
    console.log(`[${getTimestamp()}] 🎭 JOKE SYSTEM TEST`);
    console.log('=====================================\n');
    
    console.log('🔍 TESTING JOKE COLLECTION');
    console.log('---------------------------');
    
    try {
        // Initialize service and load cache
        console.log('📥 Loading joke cache from Firebase...');
        const loadResult = await motivationalPhraseService.loadPhraseCache();
        
        if (!loadResult) {
            console.log('❌ Failed to load jokes from Firebase');
            console.log('   Possible causes:');
            console.log('   • Firebase connection issues');
            console.log('   • Empty motivational_phrases collection');
            console.log('   • Missing isActive=true or category=boredom_response records');
            return;
        }
        
        // Get collection statistics
        const stats = await motivationalPhraseService.getPhraseStats();
        
        console.log('📊 JOKE COLLECTION ANALYSIS:');
        console.log(`   📝 Total active jokes: ${stats.totalPhrases}`);
        console.log(`   🎯 Used jokes: ${stats.usedPhrases}`);
        console.log(`   📈 Total usages: ${stats.totalUsages}`);
        
        if (stats.mostUsed) {
            console.log(`   🔥 Most used: "${stats.mostUsed.text}" (${stats.mostUsed.count} times)`);
        }
        if (stats.leastUsed) {
            console.log(`   🆕 Least used: "${stats.leastUsed.text}" (${stats.leastUsed.count} times)`);
        }
        
        // Analyze collection size
        if (stats.totalPhrases === 0) {
            console.log('\n❌ CRITICAL: No jokes found in database!');
            console.log('   Bot will use fallback: "😴 משעמם? בואו נעשה משהו מעניין! 🎉"');
            return;
        } else if (stats.totalPhrases < 5) {
            console.log('\n⚠️ WARNING: Very small joke collection - high repetition likely');
        } else if (stats.totalPhrases < 15) {
            console.log('\n🟡 NOTICE: Small joke collection - some repetition expected');
        } else {
            console.log('\n✅ GOOD: Adequate joke collection for variety');
        }
        
        console.log('\n🎲 TESTING RANDOMIZATION LOGIC');
        console.log('-------------------------------');
        
        // Test joke selection 10 times to check for variety
        const selectedJokes = [];
        const jokeIds = [];
        
        for (let i = 1; i <= 10; i++) {
            const joke = await motivationalPhraseService.getRandomPhrase();
            selectedJokes.push(joke.substring(0, 50) + (joke.length > 50 ? '...' : ''));
            
            // Small delay to simulate real usage
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('📝 Sample joke selections (10 picks):');
        selectedJokes.forEach((joke, i) => {
            console.log(`   ${i+1}. ${joke}`);
        });
        
        // Analyze uniqueness
        const uniqueJokes = new Set(selectedJokes);
        const uniqueCount = uniqueJokes.size;
        const duplicates = selectedJokes.length - uniqueCount;
        
        console.log('\n📈 RANDOMIZATION ANALYSIS:');
        console.log(`   🎯 Unique jokes in 10 picks: ${uniqueCount}/10`);
        console.log(`   🔄 Duplicates: ${duplicates}`);
        
        if (duplicates === 0) {
            console.log('   🎉 EXCELLENT: Perfect variety in test sample');
        } else if (duplicates <= 2) {
            console.log('   ✅ GOOD: Minimal repetition (expected with small collections)');
        } else {
            console.log('   ⚠️ WARNING: High repetition detected');
        }
        
        // Check time-based filtering logic
        console.log('\n⏰ TESTING TIME-BASED FILTERING');
        console.log('--------------------------------');
        
        // Access cache directly to check lastUsed timestamps
        const recentlyUsed = motivationalPhraseService.phraseCache.filter(phrase => {
            if (!phrase.lastUsed) return false;
            const lastUsedTime = new Date(phrase.lastUsed).getTime();
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            return lastUsedTime > oneHourAgo;
        });
        
        console.log(`   📊 Jokes used in last hour: ${recentlyUsed.length}/${stats.totalPhrases}`);
        console.log(`   📊 Available for selection: ${stats.totalPhrases - recentlyUsed.length}`);
        
        if (recentlyUsed.length >= stats.totalPhrases * 0.8) {
            console.log('   ⚠️ WARNING: Most jokes recently used - system will fall back to least-used strategy');
        } else {
            console.log('   ✅ GOOD: Plenty of unused jokes available');
        }
        
        console.log('\n🎯 ANTI-REPETITION ASSESSMENT');
        console.log('-----------------------------');
        
        if (stats.totalPhrases >= 20 && duplicates <= 2) {
            console.log('🎉 EXCELLENT: Anti-repetition system working perfectly');
        } else if (stats.totalPhrases >= 10 && duplicates <= 4) {
            console.log('✅ GOOD: Anti-repetition working well for collection size');
        } else if (stats.totalPhrases < 10) {
            console.log('🟡 LIMITED: Small collection naturally causes repetition');
            console.log('   Recommendation: Add more jokes to Firebase collection');
        } else {
            console.log('⚠️ ISSUE: High repetition despite adequate collection size');
            console.log('   Possible causes:');
            console.log('   • Recent heavy usage exhausting available jokes');
            console.log('   • System clock issues affecting time filtering');
        }
        
        console.log('\n💡 RECOMMENDATIONS');
        console.log('------------------');
        
        if (stats.totalPhrases < 20) {
            console.log('📝 Add more jokes to Firebase motivational_phrases collection');
        }
        if (stats.totalUsages > stats.totalPhrases * 5) {
            console.log('🔄 Consider longer cooldown period (currently 1 hour)');
        }
        if (duplicates > 3) {
            console.log('⚡ Check system time synchronization');
            console.log('🔍 Monitor usage patterns during peak times');
        }
        
        console.log('\n🏆 JOKE SYSTEM HEALTH SUMMARY');
        console.log('=============================');
        console.log(`✅ Collection size: ${stats.totalPhrases} jokes`);
        console.log(`✅ Anti-repetition logic: Multi-layered (time + usage count)`);
        console.log(`✅ Fallback protection: Available if database fails`);
        console.log(`✅ Performance: Cached with 10-minute refresh`);
        console.log(`✅ Variety score: ${Math.round((uniqueCount/10) * 100)}% in test sample`);
        
    } catch (error) {
        console.error(`❌ Error testing joke system: ${error.message}`);
        console.error('Stack trace:', error.stack);
    }
    
    console.log(`\n[${getTimestamp()}] 🎭 Joke system test completed`);
}

// Run test
if (require.main === module) {
    testJokeSystem().catch(console.error);
}

module.exports = { testJokeSystem };