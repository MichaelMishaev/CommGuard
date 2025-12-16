// Find user in ALL groups - no hardcoded group names
// Uses the EXACT matching logic from globalBanHelper.js
require('dotenv').config();
const makeWASocket = require('baileys').default;
const { useMultiFileAuthState } = require('baileys');
const { jidKey } = require('./utils/jidUtils');

async function findUserInAllGroups() {
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

    // Target user to search for
    const targetUserId = '77709346664559@lid';  // LID format from reply
    const targetPhone = '972527332312';          // Real phone number

    console.log(`\n🔍 Searching for user across ALL groups...`);
    console.log(`   Target LID: ${targetUserId}`);
    console.log(`   Target Phone: ${targetPhone}\n`);

    const groups = await sock.groupFetchAllParticipating();
    const groupIds = Object.keys(groups);

    console.log(`📋 Total groups to scan: ${groupIds.length}\n`);
    console.log('─'.repeat(80));

    const foundInGroups = [];
    let checkedCount = 0;

    for (const groupId of groupIds) {
        checkedCount++;
        const group = groups[groupId];
        const groupName = group.subject || 'Unknown Group';

        try {
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));

            const metadata = await sock.groupMetadata(groupId);

            // Use EXACT matching logic from globalBanHelper.js Method 5
            const userParticipant = metadata.participants.find(p => {
                const userIdPart = targetUserId.split('@')[0];  // "77709346664559"

                // Method 1: Direct ID match
                if (p.id === targetUserId) {
                    return true;
                }

                // Method 2: Direct phoneNumber match
                if (p.phoneNumber && p.phoneNumber === targetUserId) {
                    return true;
                }

                // Method 3: Phone number comparison
                if (targetUserId.includes('@s.whatsapp.net') && p.phoneNumber) {
                    const userPhoneOnly = targetUserId.split('@')[0];
                    const participantPhoneOnly = p.phoneNumber.split('@')[0];
                    if (userPhoneOnly === participantPhoneOnly) {
                        return true;
                    }
                }

                // Method 4: LID comparison
                if (targetUserId.includes('@lid') && p.id.includes('@lid')) {
                    const userLidOnly = targetUserId.split('@')[0];
                    const participantLidOnly = p.id.split('@')[0];
                    if (userLidOnly === participantLidOnly) {
                        return true;
                    }
                }

                // Method 5: Partial phone matching (CRITICAL FIX)
                if (p.phoneNumber) {
                    const last9Digits = userIdPart.slice(-9);  // "346664559"
                    if (p.phoneNumber.includes(last9Digits)) {
                        return true;
                    }
                }

                return false;
            });

            if (userParticipant) {
                foundInGroups.push({
                    groupName,
                    groupId,
                    participantId: userParticipant.id,
                    participantPhone: userParticipant.phoneNumber,
                    isAdmin: userParticipant.admin || 'no'
                });

                console.log(`\n✅ FOUND in group ${checkedCount}/${groupIds.length}:`);
                console.log(`   Group: ${groupName}`);
                console.log(`   Group ID: ${groupId}`);
                console.log(`   Participant ID: ${userParticipant.id}`);
                console.log(`   Participant phoneNumber: ${userParticipant.phoneNumber || 'N/A'}`);
                console.log(`   Admin: ${userParticipant.admin || 'no'}`);
                console.log('─'.repeat(80));
            }

            // Progress update every 20 groups
            if (checkedCount % 20 === 0) {
                console.log(`\n⏳ Progress: ${checkedCount}/${groupIds.length} groups checked...`);
            }

        } catch (error) {
            console.error(`\n❌ Error checking group "${groupName}": ${error.message}`);
        }
    }

    console.log('\n\n🏁 SCAN COMPLETE!\n');
    console.log('═'.repeat(80));
    console.log(`📊 Summary:`);
    console.log(`   Total groups scanned: ${groupIds.length}`);
    console.log(`   User found in: ${foundInGroups.length} groups`);
    console.log('═'.repeat(80));

    if (foundInGroups.length > 0) {
        console.log('\n📋 Complete list of groups where user is a member:\n');
        foundInGroups.forEach((g, index) => {
            console.log(`${index + 1}. ${g.groupName}`);
            console.log(`   ID: ${g.participantId}`);
            console.log(`   Phone: ${g.participantPhone || 'N/A'}`);
            console.log(`   Group ID: ${g.groupId}`);
            console.log('');
        });
    } else {
        console.log('\n❌ User NOT found in any groups!\n');
    }

    process.exit(0);
}

findUserInAllGroups().catch(console.error);
