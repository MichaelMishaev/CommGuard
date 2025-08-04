#!/usr/bin/env node

/**
 * Debug Unblacklist Cooldown
 * Investigates why +972555030746 is still getting 24-hour error
 */

const { getTimestamp } = require('./utils/logger');
const db = require('./firebaseConfig.js');

console.log(`
╔════════════════════════════════════════════════════╗
║           🔍 Debug Unblacklist Cooldown             ║
║                                                    ║
║  Investigating why +972555030746 still gets        ║
║  24-hour cooldown error                            ║
╚════════════════════════════════════════════════════╝
`);

// Function to normalize user ID (same as in unblacklistRequestService)
function normalizeUserId(userId) {
    if (!userId) return null;
    
    // Remove @s.whatsapp.net suffix if present
    let normalized = userId.replace('@s.whatsapp.net', '');
    
    // Handle LID format (like 972555030746:16@lid)
    if (normalized.includes('@lid')) {
        normalized = normalized.split(':')[0];
    }
    
    return normalized;
}

async function debugCooldownIssue() {
    const phoneNumber = '+972555030746';
    console.log(`[${getTimestamp()}] 🔍 Debugging cooldown for ${phoneNumber}\n`);
    
    try {
        // Test different normalizations
        console.log('📞 Testing different phone number formats:');
        const formats = [
            phoneNumber,
            phoneNumber.replace('+', ''),
            phoneNumber + '@s.whatsapp.net',
            phoneNumber.replace('+', '') + '@s.whatsapp.net'
        ];
        
        for (const format of formats) {
            const normalized = normalizeUserId(format);
            console.log(`   Input: "${format}" → Normalized: "${normalized}"`);
            
            // Check if record exists in Firebase
            const docRef = db.collection('unblacklist_requests').doc(normalized);
            const doc = await docRef.get();
            
            if (doc.exists) {
                const data = doc.data();
                console.log(`   ⚠️  FOUND RECORD for "${normalized}":`);
                console.log(`      Status: ${data.status}`);
                console.log(`      Requested at: ${data.requestedAt}`);
                console.log(`      Can request again: ${data.canRequestAgain}`);
                
                // Check if still in cooldown
                const now = Date.now();
                const canRequestAgain = new Date(data.canRequestAgain).getTime();
                const hoursLeft = Math.ceil((canRequestAgain - now) / (1000 * 60 * 60));
                
                if (now < canRequestAgain) {
                    console.log(`      🚨 STILL IN COOLDOWN: ${hoursLeft} hours left`);
                } else {
                    console.log(`      ✅ Cooldown expired, should be able to request`);
                }
            } else {
                console.log(`   ✅ No record found for "${normalized}"`);
            }
        }
        
        console.log('\n🔍 Checking all unblacklist_requests documents:');
        const allDocs = await db.collection('unblacklist_requests').get();
        console.log(`   Total documents: ${allDocs.size}`);
        
        allDocs.forEach(doc => {
            const data = doc.data();
            const docId = doc.id;
            console.log(`   Document ID: "${docId}"`);
            console.log(`      Original ID: ${data.originalId || 'N/A'}`);
            console.log(`      Status: ${data.status}`);
            console.log(`      Can request again: ${data.canRequestAgain}`);
            
            // Check if this could be our user
            if (docId.includes('555030746') || (data.originalId && data.originalId.includes('555030746'))) {
                console.log(`      🎯 POTENTIAL MATCH for our test user!`);
                
                const now = Date.now();
                const canRequestAgain = new Date(data.canRequestAgain).getTime();
                const hoursLeft = Math.ceil((canRequestAgain - now) / (1000 * 60 * 60));
                
                if (now < canRequestAgain) {
                    console.log(`      🚨 THIS IS WHY USER GETS ERROR: ${hoursLeft} hours left`);
                    console.log(`      🧹 We need to delete this document: "${docId}"`);
                } else {
                    console.log(`      ✅ This record is expired, shouldn't block user`);
                }
            }
        });
        
        console.log('\n🧪 Testing unblacklist service directly:');
        const unblacklistService = require('./services/unblacklistRequestService');
        
        const testInputs = [
            phoneNumber + '@s.whatsapp.net',
            phoneNumber.replace('+', '') + '@s.whatsapp.net'
        ];
        
        for (const input of testInputs) {
            console.log(`   Testing input: "${input}"`);
            try {
                const result = await unblacklistService.canMakeRequest(input);
                console.log(`      Can request: ${result.canRequest}`);
                if (!result.canRequest) {
                    console.log(`      Reason: ${result.reason}`);
                    console.log(`      Hours left: ${result.hoursLeft || 'N/A'}`);
                }
            } catch (error) {
                console.log(`      Error: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error(`❌ Debug error:`, error);
    }
}

// Execute debug
debugCooldownIssue().catch(console.error);