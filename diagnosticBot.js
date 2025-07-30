// Diagnostic script to check bot status and fix common issues

const { getTimestamp } = require('./utils/logger');

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Bot Diagnostic Tool                       ║
╚══════════════════════════════════════════════════════════════╝

${getTimestamp()} - Diagnostics Started

🔍 ANALYZING YOUR ISSUES:

1. ❌ "Bot is not admin, cannot check blacklist"
   📋 CAUSE: Bot doesn't have admin privileges in the group
   🔧 FIX: Make the bot admin in WhatsApp group settings

2. ⚠️ "Bad MAC Error" / "Session Error"  
   📋 CAUSE: WhatsApp encryption session corruption
   🔧 FIX: Clear authentication data and reconnect

🚀 IMMEDIATE SOLUTIONS:

A. FIX BOT ADMIN ISSUE:
   1. Open the WhatsApp group where you got the error
   2. Tap group name → Group info  
   3. Find the bot account in participants
   4. Tap and hold → "Make group admin"
   5. Test with: #status command in group

B. FIX SESSION ERRORS:
   1. Stop the bot (Ctrl+C)
   2. Run: rm -rf baileys_auth_info
   3. Restart: npm start
   4. Scan QR code again

📊 CURRENT STATUS CHECK:
`);

// Check if auth folder exists
const fs = require('fs');
if (fs.existsSync('baileys_auth_info')) {
    console.log('✅ Authentication folder exists');
    
    // Check folder contents
    try {
        const files = fs.readdirSync('baileys_auth_info');
        console.log(`   📁 Contains ${files.length} files`);
        
        // Check for session corruption indicators
        if (files.some(f => f.includes('session'))) {
            console.log('⚠️ Session files detected - may be corrupted if getting MAC errors');
        }
    } catch (err) {
        console.log('❌ Cannot read auth folder contents');
    }
} else {
    console.log('❌ Authentication folder missing - bot needs to reconnect');
}

// Check Firebase connection
console.log('\n🔥 FIREBASE STATUS:');
try {
    const db = require('./firebaseConfig');
    if (db && db.collection) {
        console.log('✅ Firebase connected');
    } else {
        console.log('❌ Firebase not connected');
    }
} catch (err) {
    console.log('❌ Firebase error:', err.message);
}

// Check blacklist cache
console.log('\n🚫 BLACKLIST STATUS:');
try {
    const { blacklistCache } = require('./services/blacklistService');
    console.log(`✅ Blacklist cache: ${blacklistCache.size} users loaded`);
} catch (err) {
    console.log('❌ Blacklist service error:', err.message);
}

console.log(`
🎯 RECOMMENDED ACTION PLAN:

STEP 1: Fix Admin Issue
   → Make bot admin in ALL groups where you want protection
   → Test with #status command in each group

STEP 2: Fix Session Issues (if errors persist)
   → Stop bot completely
   → Delete baileys_auth_info folder  
   → Restart and scan QR code

STEP 3: Verify Everything Works
   → Send #help in private message to bot
   → Send #status in group chat
   → Test #botkick in a group (as admin)

🆘 IF STILL HAVING ISSUES:

1. Check bot is actually online and connected
2. Verify your phone number matches config (${require('./config').ADMIN_PHONE})
3. Make sure you're using commands in right context:
   - #help: Private messages only
   - #botkick: Group messages only (as admin)

⚡ QUICK TEST COMMANDS:

Private to bot: #help
Group chat: #status  
Group admin: #botkick

${getTimestamp()} - Diagnostics Complete

✅ Follow the steps above and your bot should work perfectly!
`);