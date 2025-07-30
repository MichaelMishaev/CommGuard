const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { isBotAdmin, getBotGroupStatus } = require('./utils/botAdminChecker');

async function debugBotLID() {
    console.log('🔍 Starting Bot LID Debug...\n');
    
    const { state } = await useMultiFileAuthState('baileys_auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });
    
    sock.ev.on('connection.update', async (update) => {
        if (update.connection === 'open') {
            console.log('✅ Connected successfully!\n');
            console.log('🤖 BOT IDENTITY:');
            console.log('================');
            console.log('Full Bot ID:', sock.user.id);
            console.log('Bot Phone:', sock.user.id.split(':')[0].split('@')[0]);
            console.log('Bot Name:', sock.user.name || 'Unknown');
            console.log('Bot Platform:', sock.user.platform || 'Unknown');
            console.log('ID Format:', sock.user.id.includes('@lid') ? 'LID (Linked Device)' : 'Standard');
            
            // Get all groups
            try {
                const groups = await sock.groupFetchAllParticipating();
                const groupList = Object.values(groups);
                
                console.log(`\n📋 Found ${groupList.length} groups\n`);
                
                // Check first 3 groups
                for (let i = 0; i < Math.min(3, groupList.length); i++) {
                    const group = groupList[i];
                    console.log(`\n🏷️  GROUP ${i + 1}: ${group.subject}`);
                    console.log('=' + '='.repeat(group.subject.length + 12));
                    
                    // Get detailed bot status
                    const status = await getBotGroupStatus(sock, group.id);
                    console.log('Bot Status:', JSON.stringify(status, null, 2));
                    
                    // Manual check
                    const metadata = await sock.groupMetadata(group.id);
                    const botPhone = sock.user.id.split(':')[0].split('@')[0];
                    
                    console.log('\n📍 Manual Participant Search:');
                    console.log('Looking for bot phone:', botPhone);
                    console.log('Looking for bot ID:', sock.user.id);
                    
                    // Find bot by checking different patterns
                    let foundBot = false;
                    for (const p of metadata.participants) {
                        // Check various matching patterns
                        const matches = [
                            p.id === sock.user.id,
                            p.id === '171012763213843@lid',
                            p.id.includes(botPhone),
                            p.id.startsWith(botPhone)
                        ];
                        
                        if (matches.some(m => m)) {
                            console.log('\n✅ FOUND BOT:');
                            console.log('  Participant ID:', p.id);
                            console.log('  Admin Status:', p.admin);
                            console.log('  Is Admin:', p.admin === 'admin' || p.admin === 'superadmin');
                            foundBot = true;
                            break;
                        }
                    }
                    
                    if (!foundBot) {
                        console.log('\n❌ Bot not found using standard patterns');
                        console.log('\n🔍 All Admins in this group:');
                        metadata.participants
                            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                            .forEach(p => {
                                console.log(`  - ${p.id} (${p.admin})`);
                            });
                        
                        // Check if bot name matches any admin
                        if (sock.user.name) {
                            console.log('\n🏷️  Checking by bot name:', sock.user.name);
                            const botNameLower = sock.user.name.toLowerCase();
                            const possibleBot = metadata.participants.find(p => 
                                (p.admin === 'admin' || p.admin === 'superadmin') &&
                                p.id.includes('@lid')
                            );
                            
                            if (possibleBot) {
                                console.log('\n💡 Possible bot candidate (admin with LID):');
                                console.log('  ID:', possibleBot.id);
                                console.log('  Admin:', possibleBot.admin);
                                console.log('\n⚠️  This might be your bot! Add this ID to knownBotLids in botAdminChecker.js');
                            }
                        }
                    }
                    
                    // Test admin check function
                    console.log('\n🧪 Testing isBotAdmin function:');
                    const isAdmin = await isBotAdmin(sock, group.id);
                    console.log('Result:', isAdmin ? '✅ Bot is admin' : '❌ Bot is not admin');
                }
                
            } catch (error) {
                console.error('\n❌ Error:', error.message);
            }
            
            console.log('\n✅ Debug complete. Exiting...');
            process.exit(0);
        }
    });
    
    sock.ev.on('creds.update', state);
}

debugBotLID().catch(console.error);