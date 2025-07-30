#!/usr/bin/env node

/**
 * Test Alert Service Functionality
 * Tests the alert service and kick notifications
 */

const { sendKickAlert, sendSecurityAlert } = require('../utils/alertService');
const { getTimestamp } = require('../utils/logger');
const config = require('../config');

async function testAlertService() {
    console.log(`[${getTimestamp()}] 🚨 Testing Alert Service\n`);
    
    // Mock sock object for testing
    const mockSock = {
        sendMessage: async (jid, message) => {
            console.log(`📤 Would send to ${jid}:`);
            console.log(`   ${message.text}`);
            console.log('');
            return { messageTimestamp: Date.now() };
        }
    };
    
    try {
        console.log('1. Testing Kick Alert (Muted User)...');
        await sendKickAlert(mockSock, {
            userPhone: '972555123456',
            userName: 'Test User',
            groupName: 'Test Group',
            groupId: '123456@g.us',
            reason: 'muted_excessive',
            additionalInfo: 'Sent 10 messages while muted'
        });
        
        console.log('2. Testing Kick Alert (Admin Command)...');
        await sendKickAlert(mockSock, {
            userPhone: '972555789012',
            userName: 'Troublesome User',
            groupName: 'Support Group',
            groupId: '789012@g.us',
            reason: 'admin_command',
            additionalInfo: 'Kicked by admin using #kick command'
        });
        
        console.log('3. Testing Kick Alert (Invite Link)...');
        await sendKickAlert(mockSock, {
            userPhone: '15551234567',
            userName: 'Spammer',
            groupName: 'Main Chat',
            groupId: '345678@g.us',
            reason: 'invite_link',
            additionalInfo: 'Sent unauthorized invite link'
        });
        
        console.log('4. Testing Kick Alert (Country Code)...');
        await sendKickAlert(mockSock, {
            userPhone: '15559876543',
            userName: 'Foreign User',
            groupName: 'Hebrew Only Group',
            groupId: '456789@g.us',
            reason: 'country_code',
            additionalInfo: 'Foreign country code restriction (+1/+6)'
        });
        
        console.log('5. Testing Kick Alert (Blacklisted)...');
        await sendKickAlert(mockSock, {
            userPhone: '972555999888',
            userName: 'Banned User',
            groupName: 'VIP Group',
            groupId: '567890@g.us',
            reason: 'blacklisted',
            additionalInfo: 'User was on blacklist'
        });
        
        console.log('6. Testing Security Alert...');
        await sendSecurityAlert(mockSock, {
            type: 'multiple_violations',
            details: 'User attempted to rejoin after being kicked 3 times',
            groupName: 'Security Test Group',
            groupId: '678901@g.us'
        });
        
        console.log(`[${getTimestamp()}] ✅ All alert tests completed successfully!`);
        
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Alert test failed:`, error);
        process.exit(1);
    }
}

function testBilingualMessages() {
    console.log(`\n[${getTimestamp()}] 🌐 Testing Bilingual Private Messages\n`);
    
    const testMessages = [
        {
            scenario: 'Kicked by Admin',
            english: '👮‍♂️ You have been removed from group "Test Group"\n📱 Reason: Removed by admin\n📞 Contact admin if you have questions',
            hebrew: '👮‍♂️ הוסרת מהקבוצה "קבוצת בדיקה"\n📱 סיבה: הוסר על ידי מנהל\n📞 פנה למנהל אם יש לך שאלות'
        },
        {
            scenario: 'Banned by Admin',
            english: '🚫 You have been BANNED from group "Test Group"\n📱 Reason: Banned by admin\n⚠️ You cannot rejoin until unbanned',
            hebrew: '🚫 נחסמת מהקבוצה "קבוצת בדיקה"\n📱 סיבה: נחסם על ידי מנהל\n⚠️ אתה לא יכול להצטרף שוב עד שתבוטל החסימה'
        },
        {
            scenario: 'Invite Link Spam',
            english: '🔗 You have been removed from group "Test Group" for sending unauthorized invite links\n📱 Reason: Invite link spam is not allowed',
            hebrew: '🔗 הוסרת מהקבוצה "קבוצת בדיקה" בגלל שליחת קישורי הזמנה לא מורשים\n📱 סיבה: ספאם של קישורי הזמנה אסור'
        },
        {
            scenario: 'Muted Excessive Messages',
            english: '🔇 You have been removed from group "Test Group"\n📱 Reason: Sent too many messages while muted (5 minutes remaining)\n⚠️ You sent 10 messages after being muted',
            hebrew: '🔇 הוסרת מהקבוצה "קבוצת בדיקה"\n📱 סיבה: שלחת יותר מדי הודעות בזמן השתקה (נותרו 5 דקות)\n⚠️ שלחת 10 הודעות אחרי שהושתקת'
        }
    ];
    
    testMessages.forEach(msg => {
        console.log(`📨 ${msg.scenario}:`);
        console.log(`   🇺🇸 English: ${msg.english}`);
        console.log(`   🇮🇱 Hebrew: ${msg.hebrew}`);
        console.log('');
    });
}

// Run tests
async function runTests() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║      🚨  Alert Service Test           ║');
    console.log('╚══════════════════════════════════════╝\n');
    
    console.log(`📞 Alert Phone: ${config.ALERT_PHONE}`);
    console.log(`🤖 Bot will send alerts to: ${config.ALERT_PHONE}@s.whatsapp.net\n`);
    
    await testAlertService();
    testBilingualMessages();
    
    console.log('\n📋 Manual Testing Checklist:');
    console.log('1. Start the bot: npm start');
    console.log('2. In a group, kick a user: #kick (reply to message)');
    console.log('3. Check that alert phone receives notification');
    console.log('4. Check that kicked user receives bilingual private message');
    console.log('5. Test mute: #mute 1 (reply to message)');
    console.log('6. Have muted user send 10 messages');
    console.log('7. Verify alert and private message sent on kick');
    console.log('8. Test invite link: post WhatsApp group link');
    console.log('9. Verify alert and private message for invite link kick');
    
    console.log('\n🚨 Alert Types Implemented:');
    console.log('• muted_excessive - User kicked after 10 muted messages');
    console.log('• admin_command - User kicked by #kick or #ban');
    console.log('• invite_link - User kicked for sending invite links');
    console.log('• country_code - User kicked for +1/+6 numbers');
    console.log('• blacklisted - User kicked for being on blacklist');
    
    console.log('\n🌐 Languages Supported:');
    console.log('• English - All removal notifications');
    console.log('• Hebrew - All removal notifications');
    console.log('• Emojis - Visual indicators for all scenarios');
    
    process.exit(0);
}

runTests();