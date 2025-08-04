#!/usr/bin/env node

/**
 * Check Current State
 * Check the current state of user 972555030746
 */

const { getTimestamp } = require('./utils/logger');
const db = require('./firebaseConfig.js');

console.log(`
╔════════════════════════════════════════════════════╗
║              📋 Check Current State                 ║
║                                                    ║
║  Current status of user 972555030746               ║
╚════════════════════════════════════════════════════╝
`);

async function checkCurrentState() {
    const testNumber = '972555030746';
    console.log(`[${getTimestamp()}] 📋 Checking current state for ${testNumber}\n`);
    
    try {
        // Check blacklist status
        console.log('🔍 Blacklist Status:');
        const blacklistQuery = await db.collection('blacklist').where('phone', '==', testNumber).get();
        
        if (!blacklistQuery.empty) {
            console.log(`   ❌ User IS blacklisted`);
            blacklistQuery.forEach(doc => {
                const data = doc.data();
                console.log(`      Reason: ${data.reason || 'Unknown'}`);
                console.log(`      Added: ${data.addedAt || 'Unknown'}`);
            });
        } else {
            console.log(`   ✅ User is NOT blacklisted`);
        }
        
        // Check unblacklist request status
        console.log('\n🔍 Unblacklist Request Status:');
        const docRef = db.collection('unblacklist_requests').doc(testNumber);
        const doc = await docRef.get();
        
        if (doc.exists) {
            const data = doc.data();
            console.log(`   📋 Request exists:`);
            console.log(`      Status: ${data.status}`);
            console.log(`      Requested: ${data.requestedAt}`);
            console.log(`      Admin response: ${data.adminResponse || 'None'}`);
            console.log(`      Responded at: ${data.respondedAt || 'None'}`);
            console.log(`      Responded by: ${data.respondedBy || 'None'}`);
        } else {
            console.log(`   ℹ️  No unblacklist request record exists`);
        }
        
        // Test what would happen if user sends #free now
        console.log('\n🔍 Testing #free command eligibility:');
        const unblacklistService = require('./services/unblacklistRequestService');
        
        const canRequest = await unblacklistService.canMakeRequest(testNumber + '@s.whatsapp.net');
        console.log(`   Can make request: ${canRequest.canRequest}`);
        if (!canRequest.canRequest) {
            console.log(`   Reason: ${canRequest.reason}`);
        }
        
        console.log('\n📋 SUMMARY:');
        if (!blacklistQuery.empty) {
            console.log('   🚨 User is still blacklisted - they need admin approval');
        } else {
            console.log('   ✅ User is not blacklisted - they can rejoin groups');
        }
        
        if (doc.exists && doc.data().status === 'approved') {
            console.log('   ✅ Admin has approved their request');
        } else if (doc.exists && doc.data().status === 'pending') {
            console.log('   ⏳ Request is still pending admin approval');
        } else {
            console.log('   ℹ️  No active unblacklist request');
        }
        
        console.log('\n💡 RECOMMENDED ACTIONS:');
        console.log('1. User should try sending #free to the bot');
        console.log('2. Admin should respond with: yes 972555030746');
        console.log('3. Check bot logs for any error messages');
        console.log('4. Verify user has not blocked the bot');
        
    } catch (error) {
        console.error(`❌ Error:`, error);
    }
}

// Execute check
checkCurrentState().catch(console.error);