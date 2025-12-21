/**
 * Debug script to test mute functionality
 * Checks if muted users are properly tracked and if bot can delete messages
 */

const muteService = require('../services/muteService');

async function debugMuteIssue() {
    console.log('🔍 Debugging Mute Issue\n');

    // Load muted users from Firebase
    console.log('1️⃣ Loading muted users from Firebase...');
    const mutedUsers = await muteService.loadMutedUsers();
    console.log(`   Found ${mutedUsers.size} muted users`);

    // List all muted users
    if (mutedUsers.size > 0) {
        console.log('\n2️⃣ Current muted users:');
        for (const [userId, muteUntil] of mutedUsers.entries()) {
            const isMuted = muteService.isMuted(userId);
            const remaining = muteService.getRemainingMuteTime(userId);
            const muteDate = new Date(muteUntil).toLocaleString('en-GB');

            console.log(`   User: ${userId}`);
            console.log(`   Muted until: ${muteDate}`);
            console.log(`   Currently muted: ${isMuted}`);
            console.log(`   Remaining time: ${remaining || 'Expired'}`);
            console.log(`   Message count: ${muteService.getMutedMessageCount(userId)}`);
            console.log('');
        }
    } else {
        console.log('\n⚠️ No muted users found in database!');
    }

    // Check if a specific user is muted (example)
    console.log('\n3️⃣ Testing mute check function:');
    console.log('   To test a specific user, call:');
    console.log('   muteService.isMuted("972XXXXXXXXX@s.whatsapp.net")');

    console.log('\n✅ Debug complete');
    process.exit(0);
}

debugMuteIssue().catch(error => {
    console.error('❌ Error during debug:', error);
    process.exit(1);
});
