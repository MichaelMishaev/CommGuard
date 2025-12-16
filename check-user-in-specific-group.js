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

    const targetGroups = [
        'נתניה, צפון העיר',
        'יד 2 נתניה'
    ];
    const targetPhone = '972527332312';
    const targetLid = '77709346664559';

    console.log(`\n🔍 Searching for groups: ${targetGroups.join(', ')}`);
    console.log(`   Looking for user: ${targetPhone} or LID: ${targetLid}\n`);

    const groups = await sock.groupFetchAllParticipating();
    let groupsChecked = 0;

    for (const [groupId, group] of Object.entries(groups)) {
        // Check if this is one of our target groups
        const matchesTarget = targetGroups.some(name => group.subject.includes(name));

        if (matchesTarget) {
            groupsChecked++;
            console.log(`\n📍 FOUND GROUP: ${group.subject}`);
            console.log(`   Group ID: ${groupId}`);

            const metadata = await sock.groupMetadata(groupId);
            console.log(`   Total participants: ${metadata.participants.length}\n`);

            console.log('   👥 Checking for target user...');
            let foundTarget = false;

            for (const p of metadata.participants) {
                const pid = p.id;
                const pPhone = p.phoneNumber;  // WhatsApp's native phoneNumber field
                const normalized = jidKey(pid);

                // Check if this is our target
                const isTarget = pid.includes(targetPhone) ||
                                pid.includes(targetLid) ||
                                normalized.includes(targetPhone) ||
                                normalized.includes(targetLid) ||
                                pid.includes('527332312') ||
                                normalized.includes('527332312') ||
                                (pPhone && pPhone.includes(targetPhone)) ||
                                (pPhone && pPhone.includes('527332312'));

                if (isTarget) {
                    console.log(`\n   ✅✅✅ FOUND TARGET USER! ✅✅✅`);
                    console.log(`      Raw ID: ${pid}`);
                    console.log(`      PhoneNumber field: ${pPhone}`);
                    console.log(`      Normalized: ${normalized}`);
                    console.log(`      Admin: ${p.admin || 'no'}\n`);
                    foundTarget = true;
                }
            }

            if (!foundTarget) {
                console.log(`\n   ❌ Target user NOT found in this group!`);
                console.log(`   Showing first 10 participants for debugging:\n`);

                for (let i = 0; i < Math.min(10, metadata.participants.length); i++) {
                    const p = metadata.participants[i];
                    console.log(`      ID: ${p.id}`);
                    console.log(`      phoneNumber: ${p.phoneNumber || 'N/A'}`);
                    console.log(`      normalized: ${jidKey(p.id)}`);
                    console.log(`      ---`);
                }
            }
        }
    }

    if (groupsChecked === 0) {
        console.log(`\n❌ No target groups found!`);
        console.log(`\nAll groups:`);
        Object.values(groups).forEach(g => console.log(`   - ${g.subject}`));
    } else {
        console.log(`\n✅ Checked ${groupsChecked} target groups`);
    }

    process.exit(0);
}

checkUserInGroup().catch(console.error);
