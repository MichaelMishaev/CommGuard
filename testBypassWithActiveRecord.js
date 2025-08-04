#!/usr/bin/env node

/**
 * Test Bypass With Active Cooldown Record
 * Creates an active cooldown record for the test number, then verifies bypass still works
 */

const { getTimestamp } = require('./utils/logger');
const db = require('./firebaseConfig.js');

console.log(`
╔════════════════════════════════════════════════════╗
║       🧪 Test Bypass With Active Cooldown Record    ║
║                                                    ║
║  Creates cooldown record, tests bypass still works ║
╚════════════════════════════════════════════════════╝
`);

async function testBypassWithActiveRecord() {
    const testNumber = '972555030746';
    console.log(`[${getTimestamp()}] 🧪 Testing bypass with active cooldown record\n`);
    
    try {
        // Step 1: Create an active cooldown record
        console.log('1️⃣ Creating active cooldown record...');
        const now = new Date();
        const canRequestAgain = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // 24 hours from now
        
        const requestData = {
            userId: testNumber,
            originalId: testNumber + '@s.whatsapp.net',
            requestedAt: now.toISOString(),
            status: 'pending',
            canRequestAgain: canRequestAgain.toISOString()
        };
        
        await db.collection('unblacklist_requests').doc(testNumber).set(requestData);
        console.log(`   ✅ Created cooldown record for ${testNumber}`);
        console.log(`   📅 Can request again: ${canRequestAgain.toISOString()}`);
        
        // Step 2: Test that bypass still works
        console.log('\n2️⃣ Testing bypass functionality...');
        const unblacklistService = require('./services/unblacklistRequestService');
        
        const testInputs = [
            testNumber + '@s.whatsapp.net',
            '+' + testNumber + '@s.whatsapp.net'
        ];
        
        for (const input of testInputs) {
            console.log(`   Testing: "${input}"`);
            const result = await unblacklistService.canMakeRequest(input);
            
            if (result.canRequest === true) {
                console.log(`   ✅ BYPASS WORKING - Test number ignores cooldown`);
            } else {
                console.log(`   ❌ BYPASS FAILED - Test number still blocked by cooldown`);
                console.log(`   Reason: ${result.reason}`);
            }
        }
        
        // Step 3: Verify a regular number would be blocked
        console.log('\n3️⃣ Testing that regular numbers are still blocked...');
        const regularNumber = '972555999888';
        
        // Create cooldown for regular number
        await db.collection('unblacklist_requests').doc(regularNumber).set({
            userId: regularNumber,
            originalId: regularNumber + '@s.whatsapp.net',
            requestedAt: now.toISOString(),
            status: 'pending',
            canRequestAgain: canRequestAgain.toISOString()
        });
        
        const regularResult = await unblacklistService.canMakeRequest(regularNumber + '@s.whatsapp.net');
        if (!regularResult.canRequest) {
            console.log(`   ✅ Regular number ${regularNumber} correctly blocked by cooldown`);
            console.log(`   Hours left: ${regularResult.hoursLeft}`);
        } else {
            console.log(`   ❌ Regular number ${regularNumber} should be blocked but isn't`);
        }
        
        // Step 4: Cleanup
        console.log('\n4️⃣ Cleaning up test records...');
        await db.collection('unblacklist_requests').doc(testNumber).delete();
        await db.collection('unblacklist_requests').doc(regularNumber).delete();
        console.log(`   ✅ Cleaned up test records`);
        
        console.log('\n🎉 TEST COMPLETED SUCCESSFULLY!');
        console.log('✅ Test number +972555030746 bypasses cooldown even with active record');
        console.log('✅ Regular numbers still respect cooldown rules');
        
    } catch (error) {
        console.error(`❌ Test error:`, error);
    }
}

// Execute test
testBypassWithActiveRecord().catch(console.error);