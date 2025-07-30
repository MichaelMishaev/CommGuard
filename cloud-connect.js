const { makeWASocket, DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

console.log(`
╔═══════════════════════════════════════════╗
║      🌐 Cloud Connection Helper 🌐         ║
╚═══════════════════════════════════════════╝
`);

async function generatePairingCode() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    
    let version;
    try {
        const versionInfo = await fetchLatestBaileysVersion();
        version = versionInfo.version;
    } catch (error) {
        version = [2, 2413, 1];
    }
    
    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, console),
        },
        printQRInTerminal: false,
        mobile: false,
        logger: console,
    });
    
    // Request pairing code
    if (!sock.authState.creds.registered) {
        console.log('\n📱 To connect your WhatsApp:');
        console.log('1. Open WhatsApp on your phone');
        console.log('2. Go to Settings → Linked Devices');
        console.log('3. Tap "Link a Device"');
        console.log('4. Choose "Link with phone number instead"');
        console.log('\nEnter your phone number (with country code, e.g., 972544345287):');
        
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question('Phone number: ', async (phoneNumber) => {
            try {
                // Remove any non-numeric characters
                phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
                
                console.log(`\n🔄 Requesting pairing code for +${phoneNumber}...`);
                
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n✅ Your pairing code is: ${code}`);
                console.log('\nEnter this code in WhatsApp to link the device.');
                console.log('The code will expire in 60 seconds.\n');
                
            } catch (error) {
                console.error('❌ Error requesting pairing code:', error);
                process.exit(1);
            }
        });
    }
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Connection closed:', lastDisconnect?.error);
            if (!shouldReconnect) {
                process.exit(0);
            }
        } else if (connection === 'open') {
            console.log('\n✅ Successfully connected!');
            console.log(`Bot ID: ${sock.user.id}`);
            console.log(`Bot Name: ${sock.user.name}`);
            console.log('\nYou can now run: npm start');
            
            // Save a success flag
            fs.writeFileSync('.cloud-connected', 'true');
            
            setTimeout(() => {
                process.exit(0);
            }, 3000);
        }
    });
}

// Check if already connected
if (fs.existsSync('baileys_auth_info/creds.json')) {
    console.log('⚠️  Auth data already exists!');
    console.log('If you want to connect a new account, first run:');
    console.log('rm -rf baileys_auth_info\n');
    console.log('Otherwise, just run: npm start');
    process.exit(0);
}

generatePairingCode().catch(console.error);