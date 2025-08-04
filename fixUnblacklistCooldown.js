#!/usr/bin/env node

/**
 * Fix Unblacklist Cooldown
 * Delete the correct record causing the cooldown issue
 */

const { getTimestamp } = require('./utils/logger');
const db = require('./firebaseConfig.js');

console.log(`
╔════════════════════════════════════════════════════╗
║            🔧 Fix Unblacklist Cooldown              ║
║                                                    ║
║  Deleting the correct record: "972555030746"       ║
║  (without + sign)                                   ║
╚════════════════════════════════════════════════════╝
`);

async function fixCooldownIssue() {
    console.log(`[${getTimestamp()}] 🔧 Fixing cooldown for +972555030746\n`);
    
    try {
        // The actual document ID causing the issue
        const docId = '972555030746';
        
        console.log(`🎯 Targeting document ID: "${docId}"`);
        
        // Get the document first to confirm it exists
        const docRef = db.collection('unblacklist_requests').doc(docId);
        const doc = await docRef.get();
        
        if (doc.exists) {
            const data = doc.data();
            console.log(`📋 Found record:`);
            console.log(`   Status: ${data.status}`);
            console.log(`   Requested at: ${data.requestedAt}`);
            console.log(`   Can request again: ${data.canRequestAgain}`);
            console.log(`   Original ID: ${data.originalId || 'N/A'}`);
            
            // Check cooldown status
            const now = Date.now();
            const canRequestAgain = new Date(data.canRequestAgain).getTime();
            const hoursLeft = Math.ceil((canRequestAgain - now) / (1000 * 60 * 60));
            
            if (now < canRequestAgain) {
                console.log(`   🚨 Currently in cooldown: ${hoursLeft} hours left`);
            } else {
                console.log(`   ✅ Cooldown already expired`);
            }
            
            // Delete the document
            console.log(`\n🗑️  Deleting document "${docId}"...`);
            await docRef.delete();
            console.log(`✅ Successfully deleted record`);
            
            // Verify deletion
            const checkDoc = await docRef.get();
            if (!checkDoc.exists) {
                console.log(`✅ Verified: Document no longer exists`);
            } else {
                console.log(`❌ Error: Document still exists after deletion`);
            }
            
        } else {
            console.log(`❌ Document "${docId}" not found`);
        }
        
        console.log(`\n🧪 Testing unblacklist service after fix:`);
        const unblacklistService = require('./services/unblacklistRequestService');
        
        // Test the exact format that would be used in real scenario
        const testInput = '972555030746@s.whatsapp.net';
        console.log(`   Testing input: "${testInput}"`);
        
        const result = await unblacklistService.canMakeRequest(testInput);
        console.log(`   Can request: ${result.canRequest}`);
        if (!result.canRequest) {
            console.log(`   Reason: ${result.reason}`);
            console.log(`   Hours left: ${result.hoursLeft || 'N/A'}`);
        }
        
    } catch (error) {
        console.error(`❌ Fix error:`, error);
    }
}

// Execute fix
fixCooldownIssue().then(() => {
    console.log(`\n✅ FIX COMPLETED!`);
    console.log(`🎯 User +972555030746 should now be able to send #free command`);
}).catch(console.error);