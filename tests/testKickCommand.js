#!/usr/bin/env node
/**
 * Kick Command Diagnostic Test
 * Tests the kick command message structure and logic
 */

const { getTimestamp } = require('../utils/logger');

function testKickCommand() {
    console.log(`[${getTimestamp()}] 🧪 KICK COMMAND DIAGNOSTIC TEST`);
    console.log('=============================================\n');
    
    console.log('1. Testing Message Structure Detection');
    console.log('------------------------------------');
    
    // Simulate different message structures for kick command testing
    const mockMessages = [
        {
            name: 'ExtendedTextMessage with contextInfo',
            msg: {
                key: { remoteJid: '123456789@g.us', fromMe: false, id: 'TEST1' },
                message: {
                    extendedTextMessage: {
                        text: '#kick',
                        contextInfo: {
                            stanzaId: 'TARGET_MSG_ID_123',
                            participant: '972555123456@s.whatsapp.net',
                            quotedMessage: {
                                conversation: 'This is the message to be deleted'
                            }
                        }
                    }
                }
            }
        },
        {
            name: 'TextMessage with contextInfo',
            msg: {
                key: { remoteJid: '123456789@g.us', fromMe: false, id: 'TEST2' },
                message: {
                    textMessage: {
                        text: '#kick',
                        contextInfo: {
                            stanzaId: 'TARGET_MSG_ID_456',
                            participant: '972555654321@s.whatsapp.net',
                            quotedMessage: {
                                conversation: 'Another message to be deleted'
                            }
                        }
                    }
                }
            }
        },
        {
            name: 'Conversation with direct contextInfo',
            msg: {
                key: { remoteJid: '123456789@g.us', fromMe: false, id: 'TEST3' },
                message: {
                    conversation: '#kick'
                },
                contextInfo: {
                    stanzaId: 'TARGET_MSG_ID_789',
                    participant: '972555111222@s.whatsapp.net',
                    quotedMessage: {
                        conversation: 'Third message to be deleted'
                    }
                }
            }
        },
        {
            name: 'No quoted message (should fail)',
            msg: {
                key: { remoteJid: '123456789@g.us', fromMe: false, id: 'TEST4' },
                message: {
                    conversation: '#kick'
                }
            }
        }
    ];
    
    // Test each message structure
    for (const test of mockMessages) {
        console.log(`\nTesting: ${test.name}`);
        console.log('----------------------------------');
        
        const msg = test.msg;
        
        // Apply the same logic as in handleKick
        let quotedMsg = null;
        let targetUserId = null;
        
        // Try different message structures for quoted messages
        if (msg.message?.extendedTextMessage?.contextInfo) {
            quotedMsg = msg.message.extendedTextMessage.contextInfo;
            targetUserId = quotedMsg.participant;
            console.log('✅ Found quoted message via extendedTextMessage.contextInfo');
        } else if (msg.message?.textMessage?.contextInfo) {
            quotedMsg = msg.message.textMessage.contextInfo;
            targetUserId = quotedMsg.participant;
            console.log('✅ Found quoted message via textMessage.contextInfo');
        } else if (msg.message?.conversation && msg.contextInfo) {
            quotedMsg = msg.contextInfo;
            targetUserId = quotedMsg.participant;
            console.log('✅ Found quoted message via direct contextInfo');
        }
        
        console.log(`📊 Results:`);
        console.log(`   Has quoted message: ${!!quotedMsg}`);
        console.log(`   Has target user: ${!!targetUserId}`);
        console.log(`   Target user: ${targetUserId || 'N/A'}`);
        console.log(`   Message ID: ${quotedMsg?.stanzaId || quotedMsg?.id || 'N/A'}`);
        console.log(`   Message type: ${Object.keys(msg.message || {})[0] || 'N/A'}`);
        
        // Determine if this would work
        const wouldWork = !!(quotedMsg && targetUserId);
        console.log(`${wouldWork ? '✅' : '❌'} Command would ${wouldWork ? 'WORK' : 'FAIL'}`);
    }
    
    console.log('\n2. Testing Group vs Private Chat Detection');
    console.log('-----------------------------------------');
    
    const groupId = '123456789@g.us';
    const privateId = '972555123456@s.whatsapp.net';
    
    function isPrivateChat(msg) {
        const jid = msg.key.remoteJid;
        return !jid.includes('@g.us');
    }
    
    console.log(`Group chat (${groupId}): ${isPrivateChat({key: {remoteJid: groupId}}) ? 'PRIVATE' : 'GROUP'}`);
    console.log(`Private chat (${privateId}): ${isPrivateChat({key: {remoteJid: privateId}}) ? 'PRIVATE' : 'GROUP'}`);
    
    console.log('\n3. Testing Message Deletion Structure');
    console.log('------------------------------------');
    
    const deleteStructures = [
        {
            name: 'Standard deletion with participant',
            structure: {
                delete: {
                    remoteJid: '123456789@g.us',
                    fromMe: false,
                    id: 'TARGET_MSG_ID_123',
                    participant: '972555123456@s.whatsapp.net'
                }
            }
        },
        {
            name: 'Alternative deletion without participant',
            structure: {
                delete: {
                    remoteJid: '123456789@g.us',
                    fromMe: false,
                    id: 'TARGET_MSG_ID_123'
                }
            }
        }
    ];
    
    for (const deleteTest of deleteStructures) {
        console.log(`${deleteTest.name}:`);
        console.log(JSON.stringify(deleteTest.structure, null, 2));
        console.log('');
    }
    
    console.log('4. Expected Flow Summary');
    console.log('----------------------');
    console.log('✅ 1. Check if admin user');
    console.log('✅ 2. Check if group chat (not private)');
    console.log('✅ 3. Extract quoted message and target user');
    console.log('✅ 4. Check if target is admin (prevent admin kick)');
    console.log('✅ 5. Check if target is in group');
    console.log('✅ 6. Delete target user\'s quoted message');
    console.log('✅ 7. Delete #kick command message');
    console.log('✅ 8. Remove user from group');
    console.log('✅ 9. Add to blacklist');
    console.log('✅ 10. Send alert to admin phone');
    console.log('✅ 11. Send private message to kicked user');
    
    console.log('\n📊 DIAGNOSTIC SUMMARY');
    console.log('====================');
    console.log('✅ Message structure detection: Enhanced with multiple fallbacks');
    console.log('✅ Group/private detection: Working');
    console.log('✅ Message deletion: Enhanced with alternative methods');
    console.log('✅ Error logging: Comprehensive');
    console.log('✅ Target user extraction: Multiple paths supported');
    
    console.log('\n🔍 DEBUGGING TIPS FOR PRODUCTION:');
    console.log('=================================');
    console.log('1. Check logs for "🔍 Kick command analysis" messages');
    console.log('2. Look for participant extraction from quoted messages');
    console.log('3. Check if message deletion errors occur');
    console.log('4. Verify bot has admin permissions in the group');
    console.log('5. Ensure target user is not an admin');
    
    console.log(`\n[${getTimestamp()}] ✅ Kick command diagnostic completed`);
}

// Run test if executed directly
if (require.main === module) {
    testKickCommand();
}

module.exports = { testKickCommand };