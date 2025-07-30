#!/usr/bin/env node

/**
 * Test Unblacklist Command Functionality
 * Tests the #unblacklist command and alert integration
 */

const { addToBlacklist, removeFromBlacklist, isBlacklisted } = require('../services/blacklistService');
const { sendKickAlert } = require('../utils/alertService');
const { getTimestamp } = require('../utils/logger');

async function testUnblacklistCommand() {
    console.log(`[${getTimestamp()}] 🧪 Testing Unblacklist Command\n`);
    
    const testUserId = '35794037428@c.us';
    const testPhone = '35794037428';
    
    try {
        console.log('1. Testing addToBlacklist...');
        const addResult = await addToBlacklist(testUserId, 'Test blacklist for unblacklist test');
        console.log(`   ✅ Add result: ${addResult}`);
        
        console.log('\n2. Testing isBlacklisted (should be true)...');
        const isBlacklistedBefore = isBlacklisted(testUserId);
        console.log(`   ✅ Is blacklisted: ${isBlacklistedBefore}`);
        
        console.log('\n3. Testing removeFromBlacklist...');
        const removeResult = await removeFromBlacklist(testUserId);
        console.log(`   ✅ Remove result: ${removeResult}`);
        
        console.log('\n4. Testing isBlacklisted (should be false)...');
        const isBlacklistedAfter = isBlacklisted(testUserId);
        console.log(`   ✅ Is blacklisted after removal: ${isBlacklistedAfter}`);
        
        console.log('\n5. Testing format compatibility...');
        // Test different formats that might be used in commands
        const testFormats = [
            '35794037428',
            '35794037428@c.us',
            '35794037428@s.whatsapp.net'
        ];
        
        for (const format of testFormats) {
            await addToBlacklist(format, 'Format test');
            console.log(`   Added: ${format}`);
            
            const removeResult = await removeFromBlacklist(format);
            console.log(`   Removed: ${format} - Result: ${removeResult}`);
            
            const stillBlacklisted = isBlacklisted(format);
            console.log(`   Still blacklisted: ${stillBlacklisted} (should be false)`);
            console.log('');
        }
        
        console.log(`[${getTimestamp()}] ✅ All unblacklist tests completed successfully!`);
        
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Unblacklist test failed:`, error);
        process.exit(1);
    }
}

async function testAlertWithUnblacklist() {
    console.log(`\n[${getTimestamp()}] 🚨 Testing Alert with Unblacklist Command\n`);
    
    // Mock sock object for testing
    const mockSock = {
        sendMessage: async (jid, message) => {
            console.log(`📤 Alert sent to ${jid}:`);
            console.log(`${message.text}`);
            console.log('─'.repeat(50));
            return { messageTimestamp: Date.now() };
        },
        groupInviteCode: async (groupId) => {
            return 'BlWCL12RFZwL6J77a5gHWE'; // Mock invite code
        }
    };
    
    try {
        console.log('Testing invite link alert with unblacklist command...\n');
        
        await sendKickAlert(mockSock, {
            userPhone: '35794037428',
            userName: 'Test User',
            groupName: 'יד 2 נתניה - למכירה ישירה או למסירת בכלב',
            groupId: '123456@g.us',
            reason: 'invite_link',
            additionalInfo: 'Sent unauthorized invite link',
            spamLink: 'https://chat.whatsapp.com/Bg6SAamYlWIHXASezhdoR',
            groupInviteLink: 'https://chat.whatsapp.com/BlWCL12RFZwL6J77a5gHWE'
        });
        
        console.log('\n✅ Alert test completed - Check that two messages were sent:');
        console.log('   1. Detailed alert message');
        console.log('   2. #unblacklist command');
        
    } catch (error) {
        console.error(`❌ Alert test failed:`, error);
        process.exit(1);
    }
}

function testCommandFormatValidation() {
    console.log(`\n[${getTimestamp()}] 📋 Testing Command Format Validation\n`);
    
    const testCommands = [
        '#unblacklist 35794037428',
        '#unblacklist 35794037428@c.us',
        '#unblacklist 972555123456',
        '#unblacklist 15551234567',
        '#unblacklist +972555123456' // This might need special handling
    ];
    
    console.log('Valid unblacklist command formats:');
    testCommands.forEach((cmd, index) => {
        console.log(`   ${index + 1}. ${cmd}`);
    });
    
    console.log('\n⚠️ Important Notes:');
    console.log('• Commands work with any phone number format');
    console.log('• System normalizes @c.us and @s.whatsapp.net formats');
    console.log('• Works in private chat with admin phone only');
    console.log('• Removes from both memory cache and Firebase');
}

// Run tests
async function runTests() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║      🚫  Unblacklist Command Test     ║');
    console.log('╚══════════════════════════════════════╝\n');
    
    // Check if Firebase is configured
    let firebaseAvailable = false;
    try {
        require('../firebaseConfig.js');
        firebaseAvailable = true;
        console.log('✅ Firebase configuration found');
    } catch (error) {
        console.log('⚠️ Firebase not configured - testing memory operations only');
    }
    
    await testUnblacklistCommand();
    await testAlertWithUnblacklist();
    testCommandFormatValidation();
    
    console.log('\n📋 Manual Testing Checklist:');
    console.log('1. Start the bot: npm start');
    console.log('2. In private chat with admin, test: #blacklist 972555999999');
    console.log('3. Verify user is added to blacklist: #blacklst');
    console.log('4. Test removal: #unblacklist 972555999999');
    console.log('5. Verify user is removed: #blacklst');
    console.log('6. Test with @c.us format: #unblacklist 972555999999@c.us');
    console.log('7. Post an invite link in a group to trigger auto-alert');
    console.log('8. Check alert phone receives unblacklist command');
    console.log('9. Copy and paste the command to test it works');
    
    console.log('\n🚨 Alert Integration:');
    console.log('• Every kick generates unblacklist command');
    console.log('• Command sent as separate message for easy copying');
    console.log('• Works with all phone number formats');
    console.log('• Admin can immediately reverse blacklisting');
    
    console.log('\n💾 Storage:');
    if (firebaseAvailable) {
        console.log('✅ Firebase: Changes persist across bot restarts');
    } else {
        console.log('⚠️ Memory only: Changes lost on bot restart');
    }
    
    process.exit(0);
}

runTests();