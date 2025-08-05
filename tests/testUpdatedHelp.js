#!/usr/bin/env node

/**
 * Test Updated Help Command
 * Verify that help includes new joke features
 */

const { getTimestamp } = require('../utils/logger');

console.log(`
╔════════════════════════════════════════════════════╗
║          📚 Testing Updated Help Command            ║
║                                                    ║
║     Verifying joke features are documented         ║
╚════════════════════════════════════════════════════╝
`);

async function testUpdatedHelp() {
    console.log(`[${getTimestamp()}] 🧪 Testing updated help command\n`);
    
    let passed = 0;
    let failed = 0;
    
    try {
        const fs = require('fs');
        const commandHandlerContent = fs.readFileSync('./services/commandHandler.js', 'utf8');
        
        // Test 1: Check if joke features are mentioned in help
        console.log('1️⃣ Checking joke features in help text...');
        
        const hasJokeStatsCommand = commandHandlerContent.includes('#jokestats');
        const hasAntiBoredomFeature = commandHandlerContent.includes('Anti-Boredom System');
        const hasJokeUsageExample = commandHandlerContent.includes('משעמם');
        const hasEntertainmentSection = commandHandlerContent.includes('Entertainment Commands');
        
        if (hasJokeStatsCommand && hasAntiBoredomFeature && hasJokeUsageExample && hasEntertainmentSection) {
            console.log('   ✅ All joke features documented in help');
            console.log('   - #jokestats command: ✅');
            console.log('   - Anti-Boredom System: ✅');
            console.log('   - Usage example: ✅');
            console.log('   - Entertainment section: ✅');
            passed++;
        } else {
            console.log('   ❌ Some joke features missing from help');
            console.log(`   - #jokestats command: ${hasJokeStatsCommand ? '✅' : '❌'}`);
            console.log(`   - Anti-Boredom System: ${hasAntiBoredomFeature ? '✅' : '❌'}`);
            console.log(`   - Usage example: ${hasJokeUsageExample ? '✅' : '❌'}`);
            console.log(`   - Entertainment section: ${hasEntertainmentSection ? '✅' : '❌'}`);
            failed++;
        }
        
        // Test 2: Check both detailed and regular help
        console.log('\n2️⃣ Checking help text coverage...');
        
        // Count occurrences to ensure both help texts are updated
        const jokeStatsOccurrences = (commandHandlerContent.match(/#jokestats/g) || []).length;
        const antiBoredomOccurrences = (commandHandlerContent.match(/Anti-Boredom/g) || []).length;
        
        if (jokeStatsOccurrences >= 2 && antiBoredomOccurrences >= 2) {
            console.log('   ✅ Features documented in both help versions');
            console.log(`   - #jokestats mentions: ${jokeStatsOccurrences}`);
            console.log(`   - Anti-Boredom mentions: ${antiBoredomOccurrences}`);
            passed++;
        } else {
            console.log('   ❌ Features not documented in all help versions');
            console.log(`   - #jokestats mentions: ${jokeStatsOccurrences} (expected: ≥2)`);
            console.log(`   - Anti-Boredom mentions: ${antiBoredomOccurrences} (expected: ≥2)`);
            failed++;
        }
        
        // Test 3: Check if help explains the feature clearly
        console.log('\n3️⃣ Checking feature explanations...');
        
        const hasHebrewJokesExplanation = commandHandlerContent.includes('Hebrew jokes');
        const hasSmartRotationMention = commandHandlerContent.includes('Smart rotation') || 
                                       commandHandlerContent.includes('usage tracking');
        const hasUsageStatsMention = commandHandlerContent.includes('usage statistics');
        
        if (hasHebrewJokesExplanation && hasSmartRotationMention && hasUsageStatsMention) {
            console.log('   ✅ Clear feature explanations provided');
            console.log('   - Hebrew jokes mentioned: ✅');
            console.log('   - Smart features mentioned: ✅');
            console.log('   - Statistics mentioned: ✅');
            passed++;
        } else {
            console.log('   ❌ Feature explanations could be clearer');
            console.log(`   - Hebrew jokes mentioned: ${hasHebrewJokesExplanation ? '✅' : '❌'}`);
            console.log(`   - Smart features mentioned: ${hasSmartRotationMention ? '✅' : '❌'}`);
            console.log(`   - Statistics mentioned: ${hasUsageStatsMention ? '✅' : '❌'}`);
            failed++;
        }
        
        // Test 4: Verify help command structure is intact
        console.log('\n4️⃣ Checking help command structure...');
        
        const hasHandleHelp = commandHandlerContent.includes('async handleHelp(msg)');
        const hasPrivateChatCheck = commandHandlerContent.includes('isPrivateChat');
        const hasAdminCheck = commandHandlerContent.includes('isAdminPhone');
        
        if (hasHandleHelp && hasPrivateChatCheck && hasAdminCheck) {
            console.log('   ✅ Help command structure preserved');
            passed++;
        } else {
            console.log('   ❌ Help command structure may be damaged');
            failed++;
        }
        
    } catch (error) {
        console.error(`❌ Test error:`, error.message);
        failed++;
    }
    
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);
    
    if (failed === 0) {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    ✅ ALL TESTS PASSED                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Help Command Successfully Updated                            ║
║                                                               ║
║  📚 New documentation includes:                                ║
║  • #jokestats command in Advanced Commands                   ║
║  • Anti-Boredom System in Auto-Protection Features          ║
║  • Entertainment Commands section                            ║
║  • Usage examples for joke triggers                          ║
║  • Clear explanations of Hebrew jokes feature               ║
║  • Smart rotation and usage tracking mentions               ║
╚═══════════════════════════════════════════════════════════════╝
        `);
        
        console.log(`📋 *What users will see in #help:*`);
        console.log(`• New #jokestats command listed in Advanced Commands`);
        console.log(`• Anti-Boredom System listed as auto-protection feature`);
        console.log(`• Usage example: "Any message with 'משעמם' → Bot responds with humor"`);
        console.log(`• Feature description: "Hebrew jokes, smart rotation, usage tracking"`);
        
    } else {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    ❌ SOME TESTS FAILED                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Help command may not be fully updated                       ║
╚═══════════════════════════════════════════════════════════════╝
        `);
    }
    
    return { passed, failed };
}

console.log('Running help command update tests...\n');

testUpdatedHelp().catch(console.error);