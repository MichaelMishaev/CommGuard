const { makeWASocket, DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, delay, makeInMemoryStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');

console.log(`
╔═══════════════════════════════════════════╗
║      📱 Mobile Connection Mode             ║
║                                           ║
║  Using mobile API for better stability     ║
╚═══════════════════════════════════════════╝
`);

// Create store
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

async function connectMobile() {
    // Clear any existing auth
    if (fs.existsSync('baileys_auth_info')) {
        console.log('🗑️ Clearing old auth data...');
        fs.rmSync('baileys_auth_info', { recursive: true, force: true });
    }
    
    console.log('⏳ Initializing mobile connection...');
    await delay(5000);
    
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        mobile: true, // Use mobile API
        logger: pino({ level: 'silent' }),
        browser: ['CommGuard', 'Chrome', '10.15.7'], // macOS Chrome
        // Minimal config for mobile mode
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        getMessage: async () => null,
    });
    
    // Bind to store
    store.bind(sock.ev);
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n📱 Scan this QR code with WhatsApp:\n');
            console.log('1. Open WhatsApp on your phone');
            console.log('2. Tap Menu or Settings and select "Linked Devices"');
            console.log('3. Tap "Link a Device"');
            console.log('4. Point your phone at this QR code\n');
        }
        
        if (connection === 'close') {
            const disconnectReason = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message || 'Unknown error';
            
            console.error(`\n❌ Connection closed: ${errorMessage}`);
            
            if (disconnectReason !== DisconnectReason.loggedOut) {
                console.log('⏳ Waiting 20 seconds before retry...');
                await delay(20000);
                connectMobile();
            }
        } else if (connection === 'open') {
            console.log('\n✅ Successfully connected!');
            console.log(`Bot ID: ${sock.user.id}`);
            console.log(`Bot Name: ${sock.user.name || 'Unknown'}`);
            console.log('\n🎉 Connection successful! The auth is saved.');
            console.log('You can now run: npm start\n');
            process.exit(0);
        } else if (connection === 'connecting') {
            console.log('🔄 Connecting...');
        }
    });
    
    // Handle any errors
    sock.ev.on('error', (err) => {
        console.error('Socket error:', err);
    });
}

// Add process handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    if (!err.message?.includes('Connection Closed')) {
        process.exit(1);
    }
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

// Run
connectMobile().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});