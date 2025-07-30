const { makeWASocket, DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

console.log(`
╔═══════════════════════════════════════════╗
║        🔗 QR Code Connection Helper        ║
╚═══════════════════════════════════════════╝
`);

async function connectWithQR() {
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
        printQRInTerminal: true,
        logger: require('pino')({ level: 'error' }),
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n📱 QR Code generated!');
            
            // Save QR as image
            try {
                await QRCode.toFile('qr-code.png', qr, {
                    width: 300,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                console.log('✅ QR code saved as: qr-code.png');
                console.log('\nOptions to scan:');
                console.log('1. Download qr-code.png and open it on your computer');
                console.log('2. If using SSH, run: scp user@server:~/bCommGuard/qr-code.png .');
                console.log('3. Use a web server to view it');
                console.log('\nThe QR code will refresh every 20 seconds until scanned.');
            } catch (err) {
                console.error('Failed to save QR code:', err);
            }
            
            // Also save as text file with URL
            const qrText = `WhatsApp Web QR Code\n\nGenerated at: ${new Date().toISOString()}\n\nQR Data:\n${qr}\n\nTo scan:\n1. Open WhatsApp on your phone\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Scan the QR code`;
            fs.writeFileSync('qr-code.txt', qrText);
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Connection closed:', lastDisconnect?.error?.message || 'Unknown error');
            
            if (shouldReconnect) {
                console.log('🔄 Reconnecting...');
                setTimeout(() => connectWithQR(), 5000);
            } else {
                // Clean up QR files
                try {
                    fs.unlinkSync('qr-code.png');
                    fs.unlinkSync('qr-code.txt');
                } catch (e) {}
                process.exit(0);
            }
        } else if (connection === 'open') {
            console.log('\n✅ Successfully connected!');
            console.log(`Bot ID: ${sock.user.id}`);
            console.log(`Bot Name: ${sock.user.name}`);
            
            // Clean up QR files
            try {
                fs.unlinkSync('qr-code.png');
                fs.unlinkSync('qr-code.txt');
            } catch (e) {}
            
            console.log('\n✅ Connection successful! You can now run:');
            console.log('npm start\n');
            
            setTimeout(() => {
                process.exit(0);
            }, 3000);
        }
    });
}

// Check for required module
try {
    require('qrcode');
} catch (e) {
    console.log('📦 Installing qrcode package...');
    require('child_process').execSync('npm install qrcode', { stdio: 'inherit' });
}

// Check if already connected
if (fs.existsSync('baileys_auth_info/creds.json')) {
    console.log('⚠️  Auth data already exists!');
    console.log('The bot seems to be already connected.');
    console.log('\nOptions:');
    console.log('1. Run "npm start" to start the bot');
    console.log('2. Run "rm -rf baileys_auth_info" to reset and connect a new account');
    process.exit(0);
}

connectWithQR().catch(console.error);