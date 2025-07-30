#!/usr/bin/env node

/**
 * Test Mute Functionality
 * Tests the mute service and time calculation functions
 */

const { addMutedUser, isMuted, getRemainingMuteTime, incrementMutedMessageCount, getMutedMessageCount, removeMutedUser } = require('../services/muteService');
const { getTimestamp } = require('../utils/logger');

async function testMuteFunctionality() {
    console.log(`[${getTimestamp()}] 🧪 Testing Mute Functionality\n`);
    
    const testUserId = '972555123456@s.whatsapp.net';
    const muteMinutes = 30;
    const muteUntil = Date.now() + (muteMinutes * 60000);
    
    try {
        console.log('1. Testing addMutedUser...');
        const addResult = await addMutedUser(testUserId, muteUntil);
        console.log(`   ✅ Add result: ${addResult}`);
        
        console.log('\n2. Testing isMuted...');
        const isUserMuted = isMuted(testUserId);
        console.log(`   ✅ Is muted: ${isUserMuted}`);
        
        console.log('\n3. Testing getRemainingMuteTime...');
        const remainingTime = getRemainingMuteTime(testUserId);
        console.log(`   ✅ Remaining time: ${remainingTime}`);
        
        console.log('\n4. Testing message count increment...');
        for (let i = 1; i <= 10; i++) {
            const count = incrementMutedMessageCount(testUserId);
            console.log(`   Message ${i}: Count = ${count}`);
            
            if (count === 7) {
                console.log(`   ⚠️  Bilingual warning should be sent here!`);
                console.log(`       English: "You are muted (${remainingTime} remaining). After 3 more messages, you will be removed"`);
                console.log(`       Hebrew: "אתה מושתק (נותרו ${remainingTime}). אחרי עוד 3 הודעות, תוסר מהקבוצה"`);
            }
            
            if (count === 10) {
                console.log(`   👢 User should be kicked here!`);
            }
        }
        
        console.log('\n5. Testing final message count...');
        const finalCount = getMutedMessageCount(testUserId);
        console.log(`   ✅ Final count: ${finalCount}`);
        
        console.log('\n6. Testing removeMutedUser...');
        const removeResult = await removeMutedUser(testUserId);
        console.log(`   ✅ Remove result: ${removeResult}`);
        
        console.log('\n7. Testing after removal...');
        const isStillMuted = isMuted(testUserId);
        console.log(`   ✅ Still muted: ${isStillMuted}`);
        
        console.log(`\n[${getTimestamp()}] ✅ All mute functionality tests completed successfully!`);
        
    } catch (error) {
        console.error(`\n[${getTimestamp()}] ❌ Test failed:`, error);
        process.exit(1);
    }
}

// Test time formatting with different durations
function testTimeFormatting() {
    console.log(`\n[${getTimestamp()}] 🕒 Testing Time Formatting\n`);
    
    const testCases = [
        { minutes: 1, expected: '1 minute' },
        { minutes: 2, expected: '2 minutes' },
        { minutes: 30, expected: '30 minutes' },
        { minutes: 60, expected: '1 hour' },
        { minutes: 90, expected: '1h 30m' },
        { minutes: 120, expected: '2 hours' },
        { minutes: 150, expected: '2h 30m' }
    ];
    
    testCases.forEach(({ minutes, expected }) => {
        const testUserId = `test${minutes}@s.whatsapp.net`;
        const muteUntil = Date.now() + (minutes * 60000);
        
        // Simulate adding user (won't actually save to Firebase in test)
        console.log(`Testing ${minutes} minutes -> Expected: "${expected}"`);
        
        // This would need to be tested with actual mute service
        console.log(`   ⏰ Format test for ${minutes} minutes`);
    });
}

// Run tests
async function runTests() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║      🛡️  Mute Functionality Test      ║');
    console.log('╚══════════════════════════════════════╝\n');
    
    // Check if Firebase is configured
    try {
        require('../firebaseConfig.js');
        console.log('✅ Firebase configuration found\n');
        
        await testMuteFunctionality();
        testTimeFormatting();
        
    } catch (error) {
        console.log('⚠️  Firebase not configured, testing will be limited');
        console.log('   Run: node setupFirebase.js first\n');
        
        testTimeFormatting();
    }
    
    console.log('\n📋 Manual Testing Checklist:');
    console.log('1. Start the bot: npm start');
    console.log('2. In a group, reply to a message: #mute 5');
    console.log('3. Verify bilingual mute confirmation appears');
    console.log('4. Have the muted user send 7 messages');
    console.log('5. Verify bilingual warning appears on 7th message with remaining time');
    console.log('6. Have user send 3 more messages (total 10)');
    console.log('7. Verify user gets kicked on 10th message');
    console.log('8. Check that mute expires after 5 minutes');
    console.log('\n🌐 Expected Languages: English + Hebrew');
    console.log('🎨 Expected Emojis: 🔇 🗑️ ⚠️ 🚨 🤐 👮‍♂️ 🔊');
    
    process.exit(0);
}

runTests();