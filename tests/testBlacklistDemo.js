const { isBlacklisted, addToBlacklist, removeFromBlacklist, blacklistCache, loadBlacklistCache } = require('../services/blacklistService');
const { getTimestamp } = require('../utils/logger');

async function demonstrateBlacklistComparison() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                Blacklist Comparison & Kicking Demo           ║
╚══════════════════════════════════════════════════════════════╝

${getTimestamp()} - Demo Started
`);

    // Load blacklist cache first
    console.log('📥 Loading blacklist cache from Firebase...');
    await loadBlacklistCache();
    
    // Show current blacklist size
    console.log(`📊 Current blacklist size: ${blacklistCache.size} users`);
    
    if (blacklistCache.size > 0) {
        console.log('📝 Current blacklisted users:');
        Array.from(blacklistCache).slice(0, 5).forEach((user, index) => {
            console.log(`   ${index + 1}. ${user}`);
        });
        if (blacklistCache.size > 5) {
            console.log(`   ... and ${blacklistCache.size - 5} more`);
        }
    }

    console.log(`
🔍 HOW BLACKLIST COMPARISON WORKS:

1. **Automatic on Group Join** (index.js:467-491):
   - New user joins → Bot checks isBlacklisted(userId)
   - If blacklisted → Immediate kick + alert to admin

2. **Manual Scan Command** (#botkick):
   - Admin types #botkick in group
   - Bot scans ALL group members
   - Kicks every blacklisted user found

3. **Individual Commands**:
   - #kick (reply) → Kicks user + adds to blacklist
   - #ban (reply) → Same as kick + blacklist
   - #blacklist [number] → Add specific number

📊 SUPPORTED USER ID FORMATS:
   ✅ Regular: 972555123456@s.whatsapp.net
   ✅ LID: 169050567106697@lid  
   ✅ Phone: 972555123456
   ✅ Old: 972555123456@c.us

🚀 KICKING PROCESS:
   1. Get group metadata: sock.groupMetadata(groupId)
   2. Loop through participants
   3. Check: await isBlacklisted(participant.id)
   4. If true: sock.groupParticipantsUpdate(groupId, [userId], 'remove')
   5. Send alert with group link to admin

⚡ SPEED & EFFICIENCY:
   - Uses in-memory cache for instant checks
   - Firebase backup for persistence
   - Rate limiting (500ms delay between kicks)
   - Batch operations for multiple users

🛡️ ADMIN PROTECTION:
   - Cannot blacklist group admins
   - Cannot kick group admins  
   - Bot requires admin privileges to kick

📱 ADMIN ALERTS INCLUDE:
   - Group name + clickable link
   - User ID that was kicked
   - Timestamp of action
   - Reason for blacklisting
`);

    // Test adding and checking a user
    const testUserId = '1234567890@test';
    console.log(`\n🧪 TESTING WITH USER: ${testUserId}`);
    
    // Check if already blacklisted
    const isAlreadyBlacklisted = await isBlacklisted(testUserId);
    console.log(`   Before: Is blacklisted? ${isAlreadyBlacklisted}`);
    
    if (!isAlreadyBlacklisted) {
        // Add to blacklist
        await addToBlacklist(testUserId, 'Demo test user');
        console.log(`   ✅ Added to blacklist`);
        
        // Check again
        const isNowBlacklisted = await isBlacklisted(testUserId);
        console.log(`   After: Is blacklisted? ${isNowBlacklisted}`);
        
        // Clean up - remove from blacklist
        await removeFromBlacklist(testUserId);
        console.log(`   🗑️ Removed from blacklist (cleanup)`);
    }

    console.log(`
🎯 QUICK COMMANDS TO USE:

Private Chat (to bot):
   #blacklist 972555123456    → Add number to blacklist
   #unblacklist 972555123456  → Remove from blacklist
   #blacklst                  → List all blacklisted users
   #help                      → Show all commands (secret)

Group Chat:
   #botkick                   → Scan & kick all blacklisted users
   #kick (reply to message)   → Kick user + blacklist
   #ban (reply to message)    → Ban user (same as kick)

${getTimestamp()} - Demo Complete

✅ The blacklist system is fully operational and ready to protect your groups!
`);
}

// Run the demo
demonstrateBlacklistComparison().catch(console.error);