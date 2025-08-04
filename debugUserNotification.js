#!/usr/bin/env node

/**
 * Debug User Notification Issue
 * Investigates why user 972555030746 didn't receive approval message
 */

const { getTimestamp } = require('./utils/logger');
const db = require('./firebaseConfig.js');

console.log(`
╔════════════════════════════════════════════════════╗
║        🔍 Debug User Notification Issue             ║
║                                                    ║
║  Investigating why 972555030746 didn't get         ║
║  approval message from admin                       ║
╚════════════════════════════════════════════════════╝
`);

async function debugUserNotification() {
    const testNumber = '972555030746';
    console.log(`[${getTimestamp()}] 🔍 Debugging notification for ${testNumber}\n`);
    
    try {
        // Step 1: Check if there's an unblacklist request record
        console.log('1️⃣ Checking unblacklist request records...');
        
        const docRef = db.collection('unblacklist_requests').doc(testNumber);
        const doc = await docRef.get();
        
        if (doc.exists) {
            const data = doc.data();
            console.log(`   ✅ Found unblacklist request record:`);
            console.log(`      Status: ${data.status}`);
            console.log(`      Requested at: ${data.requestedAt}`);
            console.log(`      Admin response: ${data.adminResponse || 'None'}`);
            console.log(`      Responded at: ${data.respondedAt || 'None'}`);
            console.log(`      Responded by: ${data.respondedBy || 'None'}`);
            
            if (data.status === 'approved') {
                console.log(`   ✅ Status shows APPROVED - admin response was processed`);
            } else if (data.status === 'pending') {
                console.log(`   ⚠️  Status still PENDING - admin response may not have been processed`);
            } else {
                console.log(`   ❓ Unexpected status: ${data.status}`);
            }
        } else {
            console.log(`   ❌ No unblacklist request record found for ${testNumber}`);
            console.log(`   🔍 This could mean the user never sent #free or the record was deleted`);
        }
        
        // Step 2: Check if user is currently blacklisted
        console.log('\n2️⃣ Checking blacklist status...');
        
        const blacklistCollection = db.collection('blacklist');
        const blacklistQuery = await blacklistCollection.where('phone', '==', testNumber).get();
        
        if (!blacklistQuery.empty) {
            console.log(`   ❌ User ${testNumber} is STILL BLACKLISTED`);
            blacklistQuery.forEach(doc => {
                const data = doc.data();
                console.log(`      Reason: ${data.reason || 'Unknown'}`);
                console.log(`      Added at: ${data.addedAt || 'Unknown'}`);
            });
        } else {
            console.log(`   ✅ User ${testNumber} is NOT blacklisted (was removed)`);
        }
        
        // Step 3: Test the notification message format
        console.log('\n3️⃣ Testing notification message format...');
        
        const normalizedUserId = testNumber;
        const fullUserId = normalizedUserId + '@s.whatsapp.net';
        
        console.log(`   Normalized User ID: ${normalizedUserId}`);
        console.log(`   Full WhatsApp ID: ${fullUserId}`);
        
        const approvalMessage = `🎉 *Request Approved!*\n\n` +
                               `✅ You have been removed from the blacklist.\n` +
                               `📱 You can now rejoin groups.\n\n` +
                               `⚠️ *Important:* Remember your agreement to never share invite links in groups.\n` +
                               `🚫 Sharing invite links will result in immediate re-blacklisting.`;
        
        console.log(`   Expected message to user:`);
        console.log(`   ═══════════════════════════════════════════════════`);
        console.log(`   ${approvalMessage}`);
        console.log(`   ═══════════════════════════════════════════════════`);
        
        // Step 4: Check possible issues
        console.log('\n4️⃣ Checking possible issues...');
        
        console.log(`   📱 WhatsApp ID format: ${fullUserId}`);
        console.log(`   🔍 Possible issues:`);
        console.log(`      - User blocked the bot (most common)`);
        console.log(`      - User's WhatsApp is offline`);
        console.log(`      - Network/connection issue`);
        console.log(`      - ID format mismatch (LID vs standard)`);
        console.log(`      - Message was caught in WhatsApp spam filter`);
        
        // Step 5: Test unblacklist service directly
        console.log('\n5️⃣ Testing unblacklist service response handling...');
        
        try {
            const unblacklistService = require('./services/unblacklistRequestService');
            
            // Test if service thinks there's a valid request to process
            const testResponse = await unblacklistService.processAdminResponse(
                testNumber,
                'yes',
                'testAdminPhone'
            );
            
            console.log(`   Service response: ${testResponse}`);
            
            if (testResponse) {
                console.log(`   ✅ Service says response can be processed`);
            } else {
                console.log(`   ❌ Service says response cannot be processed`);
                console.log(`   💡 This means no pending request exists for this user`);
            }
            
        } catch (error) {
            console.log(`   ❌ Error testing service: ${error.message}`);
        }
        
        // Step 6: Check all unblacklist requests to see if there are any for this user
        console.log('\n6️⃣ Searching all unblacklist requests...');
        
        const allRequests = await db.collection('unblacklist_requests').get();
        console.log(`   Total requests in database: ${allRequests.size}`);
        
        let foundUserRequest = false;
        allRequests.forEach(doc => {
            const data = doc.data();
            const docId = doc.id;
            
            // Check if this could be our user (different formats)
            if (docId.includes('555030746') || 
                (data.originalId && data.originalId.includes('555030746')) ||
                (data.userId && data.userId.includes('555030746'))) {
                
                console.log(`   🎯 FOUND REQUEST for user:`);
                console.log(`      Document ID: ${docId}`);
                console.log(`      User ID: ${data.userId}`);
                console.log(`      Original ID: ${data.originalId}`);
                console.log(`      Status: ${data.status}`);
                console.log(`      Admin response: ${data.adminResponse || 'None'}`);
                foundUserRequest = true;
            }
        });
        
        if (!foundUserRequest) {
            console.log(`   ❌ No requests found for user 555030746 in any format`);
        }
        
    } catch (error) {
        console.error(`❌ Debug error:`, error);
    }
}

// Execute debug
debugUserNotification().then(() => {
    console.log(`\n📋 SUMMARY:`);
    console.log(`• Check if unblacklist request exists and is approved`);
    console.log(`• Check if user was actually removed from blacklist`);
    console.log(`• Check if message format and ID are correct`);
    console.log(`• Most likely cause: User blocked the bot`);
}).catch(console.error);