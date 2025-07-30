const { makeWASocket, DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

console.log(`
╔═══════════════════════════════════════════╗
║     🔧 Connection with Delay Helper        ║
║                                           ║
║  This helper adds delays to prevent 515   ║
╚═══════════════════════════════════════════╝
`);

// Create a minimal logger
const logger = pino({ 
    level: 'error',
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
});

async function connectWithDelay() {
    console.log('⏳ Waiting 10 seconds before connection to avoid rate limiting...');
    await delay(10000);
    
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    
    // Use a specific older version that's known to work
    const version = [2, 2413, 51]; // Specific stable version
    console.log(`📱 Using specific WhatsApp Web version: ${version}`);
    
    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        defaultQueryTimeoutMs: 180000, // 3 minutes
        keepAliveIntervalMs: 60000, // 1 minute
        connectTimeoutMs: 120000, // 2 minutes
        emitOwnEvents: false,
        browser: ['Chrome (Linux)', '', ''], // Simple browser string
        // Simplified options
        retryRequestDelayMs: 10000, // 10 second retry delay
        maxMsgRetryCount: 2,
        auth: state,
    });
    
    let qrCount = 0;
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCount++;
            console.log(`\n📱 QR Code #${qrCount} (refreshes every 20 seconds):\n`);
            qrcode.generate(qr, { small: true });
            
            // Also save as image
            try {
                await require('qrcode').toFile(`qr-${qrCount}.png`, qr);
                console.log(`\n✅ QR saved as qr-${qrCount}.png`);
            } catch (e) {}
        }
        
        if (connection === 'close') {
            const disconnectReason = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message || 'Unknown error';
            
            console.error(`\n❌ Connection closed: ${errorMessage} (${disconnectReason})`);
            
            if (errorMessage.includes('515') || errorMessage.includes('Stream')) {
                console.log('\n🔧 Error 515 detected. Waiting 30 seconds before retry...');
                await delay(30000);
                
                // Try clearing session data
                if (qrCount > 3) {
                    console.log('🗑️ Clearing session after multiple failures...');
                    const fs = require('fs');
                    try {
                        fs.rmSync('baileys_auth_info', { recursive: true, force: true });
                    } catch (e) {}
                }
            }
            
            const shouldReconnect = disconnectReason !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('🔄 Reconnecting...');
                setTimeout(connectWithDelay, 5000);
            } else {
                process.exit(0);
            }
        } else if (connection === 'open') {
            console.log('\n✅ Successfully connected!');
            console.log(`Bot ID: ${sock.user.id}`);
            console.log(`Bot Name: ${sock.user.name}`);
            console.log('\n✅ Connection stable! You can now run: npm start');
            
            // Keep connection alive for a bit to ensure it's stable
            console.log('⏳ Testing connection stability for 30 seconds...');
            await delay(30000);
            console.log('✅ Connection appears stable!');
            
            process.exit(0);
        } else if (connection === 'connecting') {
            console.log('🔄 Connecting to WhatsApp...');
        }
    });
}

// Check if already connected
const fs = require('fs');
if (fs.existsSync('baileys_auth_info/creds.json')) {
    console.log('⚠️  Existing auth found. Clearing for fresh start...');
    try {
        fs.rmSync('baileys_auth_info', { recursive: true, force: true });
        console.log('✅ Cleared old authentication');
    } catch (e) {
        console.error('Failed to clear auth:', e.message);
    }
}

connectWithDelay().catch(console.error);