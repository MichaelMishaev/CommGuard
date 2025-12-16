// Check if user 972527332312 is actually a member of "נתניה צפון העיר"
require('dotenv').config();
const makeWASocket = require('baileys').default;
const { useMultiFileAuthState } = require('baileys');
const { jidKey } = require('./utils/jidUtils');

async function checkUserInGroup() {
    const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    await new Promise(resolve => {
        sock.ev.on('connection.update', (update) => {
            if (update.connection === 'open') {
                console.log('✅ Connected!');
                resolve();
            }
        });
    });

    const targetGroupName = 'נתניה צפון העיר';
    const targetPhone = '972527332312';
    const targetLid = '77709346664559';

    console.log(`\n🔍 Searching for group: "${targetGroupName}"`);
    console.log(`   Looking for user: ${targetPhone} or LID: ${targetLid}\n`);

    const groups = await sock.groupFetchAllParticipating();

    for (const [groupId, group] of Object.entries(groups)) {
        if (group.subject.includes(targetGroupName)) {
            console.log(`\n📍 FOUND GROUP: ${group.subject}`);
            console.log(`   Group ID: ${groupId}`);

            const metadata = await sock.groupMetadata(groupId);
            console.log(`   Total participants: ${metadata.participants.length}\n`);

            console.log('   👥 All participants:');
            let foundTarget = false;

            for (const p of metadata.participants) {
                const pid = p.id;
                const normalized = jidKey(pid);

                // Check if this is our target
                const isTarget = pid.includes(targetPhone) ||
                                pid.includes(targetLid) ||
                                normalized.includes(targetPhone) ||
                                normalized.includes(targetLid) ||
                                pid.includes('527332312') ||
                                normalized.includes('527332312');

                if (isTarget) {
                    console.log(`\n   ✅✅✅ FOUND TARGET USER! ✅✅✅`);
                    console.log(`      Raw ID: ${pid}`);
                    console.log(`      Normalized: ${normalized}`);
                    console.log(`      Admin: ${p.admin || 'no'}\n`);
                    foundTarget = true;
                }

                // Print all participants for debugging
                console.log(`      ${pid} → ${normalized}${p.admin ? ' (admin)' : ''}`);
            }

            if (!foundTarget) {
                console.log(`\n   ❌ Target user NOT found in this group!`);
            }

            break; // Only check the first matching group
        }
    }

    process.exit(0);
}

checkUserInGroup().catch(console.error);
