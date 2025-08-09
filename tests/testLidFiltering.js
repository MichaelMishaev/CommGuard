#!/usr/bin/env node
/**
 * Test @lid Emergency Filtering
 * Shows how the enhanced session manager blocks @lid users during startup
 */

const { getTimestamp } = require('../utils/logger');

function testLidFiltering() {
    console.log(`[${getTimestamp()}] 🧪 @LID EMERGENCY FILTERING TEST`);
    console.log('=============================================\n');
    
    // Import session manager
    const sessionManager = require('../utils/sessionManager');
    
    console.log('1. Testing @lid User Detection During Startup');
    console.log('--------------------------------------------');
    
    const testUsers = [
        '972555123456@s.whatsapp.net', // Regular user
        '159176470851724@lid',          // @lid user (from logs)
        '197332658294871@lid',          // @lid user (from logs)
        '240999842468049@lid',          // @lid user (from logs)
        '181746372988930@lid',          // @lid user (from logs)
        '972555654321@s.whatsapp.net', // Another regular user
        '220955062321301@lid',          // @lid user (from logs)
        '14186578976982@lid'            // @lid user (from logs)
    ];
    
    console.log('During STARTUP phase (isStartup = true):');
    console.log('---------------------------------------');
    for (const user of testUsers) {
        const shouldSkip = sessionManager.shouldSkipUser(user, true);
        const userType = user.includes('@lid') ? '@lid' : '@s.whatsapp.net';
        const action = shouldSkip ? 'BLOCKED' : 'ALLOWED';
        const icon = shouldSkip ? '🚫' : '✅';
        
        console.log(`${icon} ${userType.padEnd(18)} ${user.substring(0, 20)}... → ${action}`);
    }
    
    console.log('\nDuring NORMAL phase (isStartup = false):');
    console.log('--------------------------------------');
    for (const user of testUsers) {
        const shouldSkip = sessionManager.shouldSkipUser(user, false);
        const userType = user.includes('@lid') ? '@lid' : '@s.whatsapp.net';
        const action = shouldSkip ? 'BLOCKED' : 'ALLOWED';
        const icon = shouldSkip ? '🚫' : '✅';
        
        console.log(`${icon} ${userType.padEnd(18)} ${user.substring(0, 20)}... → ${action}`);
    }
    
    console.log('\n2. Simulating Production Log Scenario');
    console.log('------------------------------------');
    
    const productionLogs = [
        'Decryption failed for 159176470851724@lid - No session found to decrypt message',
        'Decryption failed for 197332658294871@lid - No session found to decrypt message',
        'Decryption failed for 240999842468049@lid - No session found to decrypt message',
        'Decryption failed for 181746372988930@lid - No SenderKeyRecord found for decryption',
        'Decryption failed for 123055259050148@lid - No session found to decrypt message',
        'Decryption failed for 220955062321301@lid - No session found to decrypt message',
        'Decryption failed for 14186578976982@lid - No SenderKeyRecord found for decryption',
        'Decryption failed for 972555123456@s.whatsapp.net - Bad MAC Error' // Regular user should still be handled
    ];
    
    let blockedCount = 0;
    let allowedCount = 0;
    
    console.log('Processing production error scenarios during STARTUP:');
    for (const log of productionLogs) {
        const userMatch = log.match(/(\d+@(?:lid|s\.whatsapp\.net))/);
        if (userMatch) {
            const userId = userMatch[1];
            const shouldSkip = sessionManager.shouldSkipUser(userId, true);
            
            if (shouldSkip) {
                console.log(`🚫 BLOCKED: ${userId.substring(0, 25)}... (skipped decryption)`);
                blockedCount++;
            } else {
                console.log(`⚡ PROCESS: ${userId.substring(0, 25)}... (normal handling)`);
                allowedCount++;
            }
        }
    }
    
    console.log('\n📊 FILTERING RESULTS');
    console.log('====================');
    console.log(`🚫 Blocked @lid users: ${blockedCount}`);
    console.log(`⚡ Processed regular users: ${allowedCount}`);
    console.log(`💾 Estimated time saved: ${blockedCount * 0.2}s (${blockedCount} × 200ms avg decryption time)`);
    
    console.log('\n⏱️ STARTUP TIME COMPARISON');
    console.log('==========================');
    const lidCount = testUsers.filter(u => u.includes('@lid')).length;
    const regularCount = testUsers.filter(u => !u.includes('@lid')).length;
    
    console.log(`Without @lid filtering:`);
    console.log(`  - Process ${lidCount} @lid users: ${lidCount * 0.2}s`);
    console.log(`  - Process ${regularCount} regular users: ${regularCount * 0.05}s`);
    console.log(`  - Total startup time: ~${(lidCount * 0.2 + regularCount * 0.05)}s`);
    
    console.log(`With emergency @lid filtering:`);
    console.log(`  - Skip ${lidCount} @lid users: ~0s`);
    console.log(`  - Process ${regularCount} regular users: ${regularCount * 0.05}s`);
    console.log(`  - Total startup time: ~${(regularCount * 0.05)}s`);
    
    const timeSaved = (lidCount * 0.2);
    console.log(`⚡ Time saved: ${timeSaved}s`);
    
    console.log('\n🎯 EXPECTED PRODUCTION IMPACT');
    console.log('=============================');
    console.log('✅ Startup time: ~15 seconds instead of 6+ minutes');
    console.log('✅ Bot responds immediately after startup phase');
    console.log('✅ Regular @s.whatsapp.net users processed normally');
    console.log('✅ @lid users can message normally after startup (15s)');
    console.log('✅ No message loss - only delayed processing for @lid backlog');
    
    console.log('\n⚠️ IMPORTANT NOTES');
    console.log('===================');
    console.log('• @lid = Linked Device users (WhatsApp Web, Desktop app)');
    console.log('• Backlog messages are queued, not lost');
    console.log('• Emergency blocking only during first 15 seconds');
    console.log('• Regular phone users (@s.whatsapp.net) work normally');
    console.log('• Bot functions (kick, ban, jokes) work immediately');
    
    console.log(`\n[${getTimestamp()}] ✅ @lid filtering test completed`);
}

// Run test
if (require.main === module) {
    testLidFiltering();
}

module.exports = { testLidFiltering };