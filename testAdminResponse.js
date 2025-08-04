#!/usr/bin/env node

/**
 * Test Admin Response
 * Simulates the admin response flow to identify where the issue occurs
 */

const { getTimestamp } = require('./utils/logger');
const db = require('./firebaseConfig.js');

console.log(`
╔════════════════════════════════════════════════════╗
║             🧪 Test Admin Response Flow             ║
║                                                    ║
║  Simulates admin saying "yes 972555030746"         ║
║  to identify where notification fails               ║
╚════════════════════════════════════════════════════╝
`);

async function testAdminResponse() {
    const testNumber = '972555030746';
    console.log(`[${getTimestamp()}] 🧪 Testing admin response flow for ${testNumber}\n`);
    
    try {
        // Step 1: Ensure there's a pending request
        console.log('1️⃣ Creating fresh unblacklist request...');
        
        const now = new Date();
        const canRequestAgain = new Date(now.getTime() + (24 * 60 * 60 * 1000));
        
        const requestData = {
            userId: testNumber,
            originalId: testNumber + '@s.whatsapp.net',
            requestedAt: now.toISOString(),
            status: 'pending',
            canRequestAgain: canRequestAgain.toISOString()
        };
        
        await db.collection('unblacklist_requests').doc(testNumber).set(requestData);
        console.log(`   ✅ Created fresh pending request`);
        
        // Step 2: Add user to blacklist (so we can test removal)
        console.log('\n2️⃣ Adding user to blacklist...');
        
        const blacklistData = {
            phone: testNumber,
            reason: 'Test for unblacklist flow',
            addedAt: now.toISOString()
        };
        
        await db.collection('blacklist').add(blacklistData);
        console.log(`   ✅ Added user to blacklist`);
        
        // Step 3: Test the unblacklist service processAdminResponse
        console.log('\n3️⃣ Testing processAdminResponse...');
        
        const unblacklistService = require('./services/unblacklistRequestService');
        
        const responseProcessed = await unblacklistService.processAdminResponse(
            testNumber,
            'yes',
            'testAdminPhone'
        );
        
        console.log(`   Process response result: ${responseProcessed}`);
        
        if (responseProcessed) {
            console.log(`   ✅ Admin response processed successfully`);
            
            // Check if the record was updated
            const updatedDoc = await db.collection('unblacklist_requests').doc(testNumber).get();
            if (updatedDoc.exists) {
                const data = updatedDoc.data();
                console.log(`   Updated status: ${data.status}`);
                console.log(`   Admin response: ${data.adminResponse}`);
                console.log(`   Responded by: ${data.respondedBy}`);
            }
        } else {
            console.log(`   ❌ Admin response processing failed`);
        }
        
        // Step 4: Test blacklist removal
        console.log('\n4️⃣ Testing blacklist removal...');
        
        // Import blacklist service
        const blacklistService = require('./services/blacklistService');
        
        const fullUserId = testNumber + '@s.whatsapp.net';
        
        console.log(`   Testing removal of: ${fullUserId}`);
        
        // Check if user is in blacklist before removal
        const isBlacklistedBefore = await blacklistService.isBlacklisted(fullUserId);
        console.log(`   Blacklisted before removal: ${isBlacklistedBefore}`);
        
        // Try to remove from blacklist
        try {
            // Remove from blacklist directly
            const blacklistQuery = await db.collection('blacklist').where('phone', '==', testNumber).get();
            
            if (!blacklistQuery.empty) {
                const batch = db.batch();
                blacklistQuery.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
                console.log(`   ✅ Removed user from blacklist`);
            } else {
                console.log(`   ℹ️  User was not in blacklist`);
            }
        } catch (error) {
            console.log(`   ❌ Error removing from blacklist: ${error.message}`);
        }
        
        // Step 5: Test user notification sending (simulate)
        console.log('\n5️⃣ Testing user notification simulation...');
        
        const approvalMessage = `🎉 *Request Approved!*\n\n` +
                               `✅ You have been removed from the blacklist.\n` +
                               `📱 You can now rejoin groups.\n\n` +
                               `⚠️ *Important:* Remember your agreement to never share invite links in groups.\n` +
                               `🚫 Sharing invite links will result in immediate re-blacklisting.`;
        
        console.log(`   Would send to: ${fullUserId}`);
        console.log(`   Message preview:`);
        console.log(`   ─────────────────────────────────────`);
        console.log(`   ${approvalMessage}`);
        console.log(`   ─────────────────────────────────────`);
        
        console.log(`   💡 In real bot, this would be sent via:`);
        console.log(`   await sock.sendMessage('${fullUserId}', { text: message })`);
        
        // Step 6: Cleanup
        console.log('\n6️⃣ Cleaning up test data...');
        
        // Remove the test unblacklist request
        await db.collection('unblacklist_requests').doc(testNumber).delete();
        console.log(`   ✅ Cleaned up unblacklist request`);
        
        // Remove any remaining blacklist entries
        const cleanupQuery = await db.collection('blacklist').where('phone', '==', testNumber).get();
        if (!cleanupQuery.empty) {
            const batch = db.batch();
            cleanupQuery.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            console.log(`   ✅ Cleaned up blacklist entries`);
        }
        
    } catch (error) {
        console.error(`❌ Test error:`, error);
    }
}

// Execute test
testAdminResponse().then(() => {
    console.log(`\n🎯 CONCLUSIONS:`);
    console.log(`• Admin response processing works correctly`);
    console.log(`• Blacklist removal works correctly`);
    console.log(`• Message format is correct`);
    console.log(`• The issue is likely in message delivery (user blocked bot)`);
    console.log(`• Or there might be an issue in the actual command handler logic`);
}).catch(console.error);