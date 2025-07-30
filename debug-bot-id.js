const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');

async function debugBotID() {
    const { state } = await useMultiFileAuthState('baileys_auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });
    
    sock.ev.on('connection.update', async (update) => {
        if (update.connection === 'open') {
            console.log('\n🔍 BOT ID DEBUG INFO:');
            console.log('Full Bot ID:', sock.user.id);
            console.log('Bot Phone:', sock.user.id.split(':')[0].split('@')[0]);
            console.log('Bot Name:', sock.user.name);
            console.log('Bot Platform:', sock.user.platform);
            
            // Try to get a test group
            try {
                const groups = await sock.groupFetchAllParticipating();
                const firstGroup = Object.values(groups)[0];
                if (firstGroup) {
                    console.log('\n📋 First Group Test:');
                    console.log('Group Name:', firstGroup.subject);
                    const metadata = await sock.groupMetadata(firstGroup.id);
                    
                    // Find bot in participants
                    const botParticipant = metadata.participants.find(p => {
                        console.log('Checking participant:', p.id);
                        return p.id.includes(sock.user.id.split(':')[0].split('@')[0]);
                    });
                    
                    if (botParticipant) {
                        console.log('\n✅ FOUND BOT IN GROUP:');
                        console.log('Bot Participant ID:', botParticipant.id);
                        console.log('Bot Admin Status:', botParticipant.admin);
                    } else {
                        console.log('\n❌ Bot not found in group participants');
                        console.log('All participant IDs:');
                        metadata.participants.forEach(p => console.log(' -', p.id));
                    }
                }
            } catch (error) {
                console.error('Error getting groups:', error.message);
            }
            
            process.exit(0);
        }
    });
}

debugBotID().catch(console.error);