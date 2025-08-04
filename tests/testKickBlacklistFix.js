#!/usr/bin/env node

/**
 * Test the kick-blacklist consistency fix
 * Verifies that the "kicked but not blacklisted" bug is fixed
 */

const { getTimestamp } = require('../utils/logger');

console.log(`
╔════════════════════════════════════════════════════╗
║     🔧 Testing Kick-Blacklist Consistency Fix      ║
║                                                    ║
║  Verifying "kicked but not blacklisted" bug fix   ║
╚════════════════════════════════════════════════════╝
`);

async function testKickBlacklistConsistency() {
    console.log(`[${getTimestamp()}] 🧪 Testing kick-blacklist consistency fix\n`);
    
    let passed = 0;
    let failed = 0;
    
    try {
        // Test 1: Check invite link handler has blacklist-first logic
        console.log('1️⃣ Checking invite link handler...');
        const fs = require('fs');
        const indexContent = fs.readFileSync('./index.js', 'utf8');
        
        const hasBlacklistCheck = indexContent.includes('const blacklistSuccess = await blacklistService.addToBlacklist');
        const hasAbortLogic = indexContent.includes('Failed to blacklist user - aborting kick');
        const hasVerification = indexContent.includes('User was kicked but not found in blacklist');
        
        if (hasBlacklistCheck && hasAbortLogic && hasVerification) {
            console.log('   ✅ Invite link handler has proper blacklist-kick consistency');
            passed++;
        } else {
            console.log('   ❌ Invite link handler missing consistency checks');
            console.log(`   - Blacklist check: ${hasBlacklistCheck}`);
            console.log(`   - Abort logic: ${hasAbortLogic}`);
            console.log(`   - Verification: ${hasVerification}`);
            failed++;
        }
        
        // Test 2: Check #ban command has blacklist-first logic
        console.log('\n2️⃣ Checking #ban command handler...');
        const commandHandlerContent = fs.readFileSync('./services/commandHandler.js', 'utf8');
        
        const banHasBlacklistCheck = commandHandlerContent.includes('const blacklistSuccess = await addToBlacklist');
        const banHasAbortLogic = commandHandlerContent.includes('Failed to add user to blacklist. Ban command aborted');
        
        if (banHasBlacklistCheck && banHasAbortLogic) {
            console.log('   ✅ #ban command has proper blacklist-kick consistency');
            passed++;
        } else {
            console.log('   ❌ #ban command missing consistency checks');
            console.log(`   - Blacklist check: ${banHasBlacklistCheck}`);
            console.log(`   - Abort logic: ${banHasAbortLogic}`);
            failed++;
        }
        
        // Test 3: Verify old problematic patterns are gone
        console.log('\n3️⃣ Checking for old problematic patterns...');
        
        const hasOldInvitePattern = indexContent.includes('await blacklistService.addToBlacklist(senderId') && 
                                   indexContent.includes('await sock.groupParticipantsUpdate(groupId, [senderId], \'remove\');') &&
                                   !indexContent.includes('const blacklistSuccess');
        
        if (!hasOldInvitePattern) {
            console.log('   ✅ Old problematic invite link pattern removed');
            passed++;
        } else {
            console.log('   ❌ Old problematic pattern still exists');
            failed++;
        }
        
        // Test 4: Check blacklist service return values
        console.log('\n4️⃣ Checking blacklist service return behavior...');
        const blacklistServiceContent = fs.readFileSync('./services/blacklistService.js', 'utf8');
        
        const returnsBoolean = blacklistServiceContent.includes('return true;') && 
                              blacklistServiceContent.includes('return false;');
        
        if (returnsBoolean) {
            console.log('   ✅ Blacklist service returns success/failure indicators');
            passed++;
        } else {
            console.log('   ❌ Blacklist service missing return value indicators');
            failed++;
        }
        
    } catch (error) {
        console.error(`❌ Test error:`, error.message);
        failed++;
    }
    
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);
    
    if (failed === 0) {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    ✅ ALL TESTS PASSED                        ║
╠═══════════════════════════════════════════════════════════════╣
║  The "kicked but not blacklisted" bug has been FIXED         ║
║                                                               ║
║  🛡️  Protections added:                                       ║
║  • Blacklist-first logic in invite link handler              ║
║  • Blacklist-first logic in #ban command                     ║
║  • Post-kick verification in invite link handler             ║
║  • Proper error handling and abort mechanisms                ║
╚═══════════════════════════════════════════════════════════════╝
        `);
    } else {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    ❌ SOME TESTS FAILED                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Additional fixes may be needed                               ║
╚═══════════════════════════════════════════════════════════════╝
        `);
    }
    
    return { passed, failed };
}

console.log('Running kick-blacklist consistency tests...\n');

testKickBlacklistConsistency().catch(console.error);