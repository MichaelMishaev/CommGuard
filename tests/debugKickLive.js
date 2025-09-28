// Live debugging script to understand #kick command issues
const { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');

async function connectAndDebug() {
    const authDir = path.join(__dirname, '..', 'baileys_auth_info');
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log('🔍 Starting deep debug of #kick command...\n');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        version,
        syncFullHistory: false,
        keepAliveIntervalMs: 30000
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log('✅ Connected to WhatsApp\n');
            console.log('📝 Instructions:');
            console.log('1. Go to any group where the bot is admin');
            console.log('2. Reply to any message with #kick');
            console.log('3. Watch the debug output below\n');
            console.log('=' .repeat(80) + '\n');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                setTimeout(() => connectAndDebug(), 5000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // The main debugging handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            // Skip old messages
            if (msg.key.fromMe) continue;

            // Extract text in all possible ways
            const possibleTexts = [
                msg.message?.conversation,
                msg.message?.extendedTextMessage?.text,
                msg.message?.imageMessage?.caption,
                msg.message?.videoMessage?.caption,
                msg.message?.documentMessage?.caption,
                msg.message?.ephemeralMessage?.message?.conversation,
                msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text,
                msg.message?.viewOnceMessage?.message?.imageMessage?.caption,
                msg.message?.editedMessage?.message?.protocolMessage?.editedMessage?.conversation
            ].filter(Boolean);

            const messageText = possibleTexts[0] || '';

            // Check if this is a #kick command
            if (messageText.toLowerCase().includes('#kick')) {
                console.log('\n' + '🚨'.repeat(20));
                console.log('🔍 DETECTED #kick COMMAND!');
                console.log('🚨'.repeat(20) + '\n');

                // Full message structure
                console.log('📦 FULL MESSAGE STRUCTURE:');
                console.log(JSON.stringify(msg, null, 2));
                console.log('\n' + '='.repeat(80) + '\n');

                // Message keys
                console.log('🔑 MESSAGE KEYS:');
                console.log('- Message type:', Object.keys(msg.message || {}));
                console.log('- Key info:', msg.key);
                console.log('\n' + '='.repeat(80) + '\n');

                // Context info analysis
                if (msg.message?.extendedTextMessage) {
                    console.log('📎 EXTENDED TEXT MESSAGE FOUND:');
                    console.log('- Text:', msg.message.extendedTextMessage.text);

                    const contextInfo = msg.message.extendedTextMessage.contextInfo;
                    if (contextInfo) {
                        console.log('\n✅ CONTEXT INFO FOUND:');
                        console.log('- Has quotedMessage?', !!contextInfo.quotedMessage);
                        console.log('- Participant:', contextInfo.participant);
                        console.log('- StanzaId:', contextInfo.stanzaId);
                        console.log('- QuotedMessageKeys:', contextInfo.quotedMessage ? Object.keys(contextInfo.quotedMessage) : 'N/A');

                        // Full context info
                        console.log('\n📋 FULL CONTEXT INFO:');
                        console.log(JSON.stringify(contextInfo, null, 2));
                    } else {
                        console.log('\n❌ NO CONTEXT INFO - This means no reply/quote detected!');
                        console.log('The #kick command was sent as a regular message, not as a reply.');
                    }
                } else {
                    console.log('❌ NOT AN EXTENDED TEXT MESSAGE');
                    console.log('Message type is:', Object.keys(msg.message || {})[0]);
                }

                console.log('\n' + '='.repeat(80));
                console.log('📊 SUMMARY:');
                console.log('- Can extract text:', !!messageText);
                console.log('- Text extracted:', messageText);
                console.log('- Is reply:', !!(msg.message?.extendedTextMessage?.contextInfo?.participant));
                console.log('- Target user:', msg.message?.extendedTextMessage?.contextInfo?.participant || 'N/A');
                console.log('- Message ID:', msg.message?.extendedTextMessage?.contextInfo?.stanzaId || 'N/A');
                console.log('='.repeat(80) + '\n');
            }
        }
    });
}

connectAndDebug().catch(console.error);