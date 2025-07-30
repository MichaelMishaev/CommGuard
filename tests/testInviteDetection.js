// Test suite for invite link detection and kicking functionality

const { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const config = require('../config');

console.log(`
╔════════════════════════════════════════════╗
║     🧪 Invite Link Detection Test Suite     ║
╚════════════════════════════════════════════╝
`);

const testCases = [
    {
        name: 'Standard WhatsApp invite link',
        message: 'Join my group: https://chat.whatsapp.com/ABCDEFGHIJK123',
        shouldDetect: true
    },
    {
        name: 'Invite link without chat subdomain',
        message: 'Click here: https://whatsapp.com/chat/ABCDEFGHIJK123',
        shouldDetect: true
    },
    {
        name: 'Multiple invite links',
        message: 'Groups: https://chat.whatsapp.com/ABC123 and https://whatsapp.com/chat/XYZ789',
        shouldDetect: true
    },
    {
        name: 'No invite link',
        message: 'This is a normal message without any links',
        shouldDetect: false
    },
    {
        name: 'Other WhatsApp link (not invite)',
        message: 'Download WhatsApp from https://whatsapp.com',
        shouldDetect: false
    }
];

async function runTests() {
    console.log('Running pattern detection tests...\n');
    
    let passed = 0;
    let failed = 0;
    
    testCases.forEach((test, index) => {
        console.log(`Test ${index + 1}: ${test.name}`);
        console.log(`Message: "${test.message}"`);
        
        const matches = test.message.match(config.PATTERNS.INVITE_LINK);
        const detected = matches && matches.length > 0;
        
        if (detected === test.shouldDetect) {
            console.log(`✅ PASSED - Detection: ${detected ? 'Found ' + matches.length + ' link(s)' : 'No links found'}`);
            passed++;
        } else {
            console.log(`❌ FAILED - Expected: ${test.shouldDetect}, Got: ${detected}`);
            failed++;
        }
        
        if (matches) {
            console.log(`   Links found: ${matches.join(', ')}`);
        }
        console.log('');
    });
    
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);
}

async function liveTest() {
    console.log('\n🔴 Starting LIVE TEST with real WhatsApp connection...\n');
    console.log('Instructions:');
    console.log('1. Scan the QR code to connect');
    console.log('2. Add the bot to a test group as admin');
    console.log('3. Have a non-admin send an invite link');
    console.log('4. Watch the console for results\n');
    
    const { state, saveCreds } = await useMultiFileAuthState('test_auth_info');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, console),
        },
        printQRInTerminal: false,
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        
        if (qr) {
            console.log('📱 Scan this QR code:\n');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log('\n✅ Connected successfully!');
            console.log(`Bot ID: ${sock.user.id}`);
            console.log(`Bot Name: ${sock.user.name}\n`);
            console.log('Now add the bot to a test group and make it admin.\n');
        }
    });
    
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (!msg.key.remoteJid.endsWith('@g.us')) continue;
            if (msg.key.fromMe) continue;
            if (!msg.message) continue;
            
            const text = msg.message?.conversation || 
                        msg.message?.extendedTextMessage?.text || '';
            
            if (!text) continue;
            
            const matches = text.match(config.PATTERNS.INVITE_LINK);
            if (matches) {
                console.log('\n🚨 INVITE LINK DETECTED IN LIVE TEST!');
                console.log('═══════════════════════════════════');
                console.log(`Group: ${msg.key.remoteJid}`);
                console.log(`Sender: ${msg.key.participant || 'Unknown'}`);
                console.log(`Message: ${text}`);
                console.log(`Links: ${matches.join(', ')}`);
                
                try {
                    const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
                    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    const senderId = msg.key.participant || msg.key.remoteJid;
                    
                    // Check bot admin status
                    const botParticipant = groupMetadata.participants.find(p => p.id === botId);
                    console.log(`\nBot is admin: ${botParticipant?.admin ? '✅ YES' : '❌ NO'}`);
                    
                    // Check sender admin status
                    const senderParticipant = groupMetadata.participants.find(p => p.id === senderId);
                    console.log(`Sender is admin: ${senderParticipant?.admin ? '✅ YES' : '❌ NO'}`);
                    
                    if (botParticipant?.admin && !senderParticipant?.admin) {
                        console.log('\n🔄 Attempting to delete message...');
                        try {
                            await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                            console.log('✅ Message deleted successfully!');
                        } catch (e) {
                            console.log(`❌ Failed to delete: ${e.message}`);
                        }
                        
                        console.log('\n🔄 Attempting to kick user...');
                        try {
                            await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderId], 'remove');
                            console.log('✅ User kicked successfully!');
                        } catch (e) {
                            console.log(`❌ Failed to kick: ${e.message}`);
                        }
                    }
                    
                } catch (error) {
                    console.error('Error in live test:', error);
                }
                console.log('═══════════════════════════════════\n');
            }
        }
    });
}

async function main() {
    // Run pattern detection tests
    await runTests();
    
    // Ask if user wants to run live test
    console.log('Do you want to run the LIVE TEST? (requires WhatsApp connection)');
    console.log('Press Ctrl+C to exit, or wait 5 seconds to start live test...\n');
    
    setTimeout(() => {
        liveTest().catch(console.error);
    }, 5000);
}

main().catch(console.error);