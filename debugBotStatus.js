const { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { getTimestamp } = require('./utils/logger');

async function debugBotStatus() {
    console.log(`[${getTimestamp()}] 🔍 Starting bot status debug...`);
    
    // Use multi-file auth state
    const { state } = await useMultiFileAuthState('baileys_auth_info');
    
    // Create minimal logger
    const logger = pino({ level: 'error' }).child({ module: 'baileys' });
    
    // Create socket connection
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: true,
        logger: logger,
    });
    
    // Wait for connection
    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        
        if (connection === 'open') {
            console.log(`\n[${getTimestamp()}] ✅ Connected successfully!`);
            console.log('\n🤖 BOT IDENTITY:');
            console.log(`   Full ID: ${sock.user.id}`);
            console.log(`   Phone: ${sock.user.id.split(':')[0].split('@')[0]}`);
            console.log(`   Name: ${sock.user.name}`);
            console.log(`   Platform: ${sock.user.platform || 'Unknown'}`);
            
            // Get all groups
            const groups = await sock.groupFetchAllParticipating();
            console.log(`\n📱 Found ${Object.keys(groups).length} groups`);
            
            // Check admin status in each group
            for (const [groupId, groupData] of Object.entries(groups)) {
                console.log(`\n📍 Group: ${groupData.subject}`);
                console.log(`   ID: ${groupId}`);
                
                try {
                    // Get fresh metadata
                    const metadata = await sock.groupMetadata(groupId);
                    const botPhone = sock.user.id.split(':')[0].split('@')[0];
                    
                    // Find bot in participants
                    const botParticipant = metadata.participants.find(p => {
                        const pPhone = p.id.split(':')[0].split('@')[0];
                        return pPhone === botPhone || p.id === sock.user.id;
                    });
                    
                    if (botParticipant) {
                        console.log(`   ✅ Bot found as: ${botParticipant.id}`);
                        console.log(`   Admin status: ${botParticipant.admin || 'participant'}`);
                        console.log(`   Is Admin: ${botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin' ? 'YES' : 'NO'}`);
                    } else {
                        console.log(`   ❌ Bot not found in participants!`);
                        console.log(`   Looking for: ${botPhone}`);
                        console.log(`   First 3 participants:`, metadata.participants.slice(0, 3).map(p => ({
                            id: p.id,
                            phone: p.id.split(':')[0].split('@')[0],
                            admin: p.admin
                        })));
                    }
                } catch (error) {
                    console.log(`   ❌ Error: ${error.message}`);
                }
            }
            
            console.log('\n✅ Debug complete. Press Ctrl+C to exit.');
        }
    });
}

// Run debug
debugBotStatus().catch(console.error);