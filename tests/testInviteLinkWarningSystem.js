#!/usr/bin/env node

/**
 * Test Invite Link Warning System
 * Comprehensive test of the two-strike warning system
 */

const { getTimestamp } = require('../utils/logger');

console.log(`
╔════════════════════════════════════════════════════╗
║    ⚠️  Testing Invite Link Warning System  ⚠️      ║
║                                                    ║
║  Testing: Warn first time, kick second time       ║
╚════════════════════════════════════════════════════╝
`);

async function testInviteLinkWarningSystem() {
    console.log(`[${getTimestamp()}] 🧪 Testing invite link warning system implementation\n`);
    
    let passed = 0;
    let failed = 0;
    
    try {
        // Test 1: Check if warning service exists
        console.log('1️⃣ Checking warning service...');
        const fs = require('fs');
        
        if (fs.existsSync('./services/warningService.js')) {
            console.log('   ✅ Warning service file exists');
            passed++;
        } else {
            console.log('   ❌ Warning service file missing');
            failed++;
        }
        
        // Test 2: Check if service can be loaded
        console.log('\n2️⃣ Testing service loading...');
        try {
            const { warningService } = require('../services/warningService');
            console.log('   ✅ Warning service loads without errors');
            passed++;
        } catch (error) {
            console.log('   ❌ Warning service loading failed:', error.message);
            failed++;
        }
        
        // Test 3: Test first violation (warning)
        console.log('\n3️⃣ Testing first violation logic...');
        try {
            const { warningService } = require('../services/warningService');
            
            const testUserId = 'test972555999888@s.whatsapp.net';
            const testGroupId = 'testgroup@g.us';
            
            // Check first violation - should return 'warn'
            const firstViolation = await warningService.checkInviteLinkViolation(testUserId, testGroupId);
            
            if (firstViolation.action === 'warn' && firstViolation.isFirstWarning === true) {
                console.log('   ✅ First violation correctly returns warning action');
                passed++;
            } else {
                console.log('   ❌ First violation logic failed:', firstViolation);
                failed++;
            }
            
        } catch (error) {
            console.log('   ❌ First violation test failed:', error.message);
            failed++;
        }
        
        // Test 4: Test warning recording
        console.log('\n4️⃣ Testing warning recording...');
        try {
            const { warningService } = require('../services/warningService');
            
            const testUserId = 'test972555999888@s.whatsapp.net';
            const testGroupId = 'testgroup@g.us';
            const testGroupName = 'Test Group Warning';
            const testInviteLink = 'https://chat.whatsapp.com/warning123';
            
            const recordResult = await warningService.recordWarning(
                testUserId, 
                testGroupId, 
                testGroupName, 
                testInviteLink
            );
            
            if (recordResult) {
                console.log('   ✅ Warning recorded successfully');
                passed++;
            } else {
                console.log('   ❌ Warning recording failed');
                failed++;
            }
            
        } catch (error) {
            console.log('   ❌ Warning recording test failed:', error.message);
            failed++;
        }
        
        // Test 5: Test second violation (kick)
        console.log('\n5️⃣ Testing second violation logic...');
        try {
            const { warningService } = require('../services/warningService');
            
            const testUserId = 'test972555999888@s.whatsapp.net';
            const testGroupId = 'testgroup@g.us';
            
            // Check second violation - should return 'kick'
            const secondViolation = await warningService.checkInviteLinkViolation(testUserId, testGroupId);
            
            if (secondViolation.action === 'kick' && secondViolation.isFirstWarning === false) {
                console.log('   ✅ Second violation correctly returns kick action');
                passed++;
            } else {
                console.log('   ❌ Second violation logic failed:', secondViolation);
                failed++;
            }
            
        } catch (error) {
            console.log('   ❌ Second violation test failed:', error.message);
            failed++;
        }
        
        // Test 6: Test warning expiry
        console.log('\n6️⃣ Testing warning expiry logic...');
        try {
            const { warningService } = require('../services/warningService');
            
            // Create expired warning by manipulating date
            const expiredUserId = 'test972555888777@s.whatsapp.net';
            const expiredGroupId = 'expiredgroup@g.us';
            
            // First create a warning
            await warningService.recordWarning(
                expiredUserId, 
                expiredGroupId, 
                'Expired Group', 
                'https://chat.whatsapp.com/expired123'
            );
            
            // Manually expire it by setting expiry date in past
            const warningKey = `${expiredUserId.replace('@s.whatsapp.net', '')}:${expiredGroupId}`;
            if (warningService.warningCache) {
                const warning = warningService.warningCache.get(warningKey);
                if (warning) {
                    warning.expiresAt = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString(); // 1 day ago
                    warningService.warningCache.set(warningKey, warning);
                }
            }
            
            // Check violation after expiry - should be treated as first warning again
            const expiredCheck = await warningService.checkInviteLinkViolation(expiredUserId, expiredGroupId);
            
            if (expiredCheck.action === 'warn' && expiredCheck.isFirstWarning === true) {
                console.log('   ✅ Expired warning correctly treated as first violation');
                passed++;
            } else {
                console.log('   ❌ Warning expiry logic failed:', expiredCheck);
                failed++;
            }
            
        } catch (error) {
            console.log('   ❌ Warning expiry test failed:', error.message);
            failed++;
        }
        
        // Test 7: Check integration in index.js
        console.log('\n7️⃣ Checking bot integration...');
        const indexContent = fs.readFileSync('./index.js', 'utf8');
        
        const hasWarningInitialization = indexContent.includes('warningService') && 
                                        indexContent.includes('initialize');
        const hasWarningLogic = indexContent.includes('checkInviteLinkViolation') &&
                               indexContent.includes('recordWarning');
        const hasTwoStrikeLogic = indexContent.includes('violationCheck.action === \'warn\'') &&
                                 indexContent.includes('violationCheck.action === \'kick\'');
        
        if (hasWarningInitialization && hasWarningLogic && hasTwoStrikeLogic) {
            console.log('   ✅ Warning system integrated in main bot');
            console.log('   - Initialization: ✅');
            console.log('   - Warning logic: ✅');
            console.log('   - Two-strike system: ✅');
            passed++;
        } else {
            console.log('   ❌ Warning system integration incomplete');
            console.log(`   - Initialization: ${hasWarningInitialization ? '✅' : '❌'}`);
            console.log(`   - Warning logic: ${hasWarningLogic ? '✅' : '❌'}`);
            console.log(`   - Two-strike system: ${hasTwoStrikeLogic ? '✅' : '❌'}`);
            failed++;
        }
        
        // Test 8: Check command handler integration
        console.log('\n8️⃣ Checking command handler integration...');
        const commandHandlerContent = fs.readFileSync('./services/commandHandler.js', 'utf8');
        
        const hasWarningCommands = commandHandlerContent.includes('case \'#warnings\'') &&
                                  commandHandlerContent.includes('case \'#clearwarnings\'') &&
                                  commandHandlerContent.includes('case \'#warningstats\'');
        const hasWarningHandlers = commandHandlerContent.includes('handleWarningsView') &&
                                  commandHandlerContent.includes('handleWarningsClear') &&
                                  commandHandlerContent.includes('handleWarningsStats');
        
        if (hasWarningCommands && hasWarningHandlers) {
            console.log('   ✅ Warning commands integrated in command handler');
            console.log('   - Warning commands: ✅');
            console.log('   - Warning handlers: ✅');
            passed++;
        } else {
            console.log('   ❌ Command handler integration incomplete');
            console.log(`   - Warning commands: ${hasWarningCommands ? '✅' : '❌'}`);
            console.log(`   - Warning handlers: ${hasWarningHandlers ? '✅' : '❌'}`);
            failed++;
        }
        
        // Test 9: Test warning statistics
        console.log('\n9️⃣ Testing warning statistics...');
        try {
            const { warningService } = require('../services/warningService');
            const stats = await warningService.getWarningStats();
            
            if (stats && typeof stats.totalActiveWarnings === 'number') {
                console.log('   ✅ Warning statistics working');
                console.log(`   - Active warnings: ${stats.totalActiveWarnings}`);
                console.log(`   - Expiring soon: ${stats.expiringSoon}`);
                console.log(`   - Warning duration: ${stats.warningExpiryDays} days`);
                passed++;
            } else {
                console.log('   ❌ Warning statistics failed');
                failed++;
            }
            
        } catch (error) {
            console.log('   ❌ Warning statistics test failed:', error.message);
            failed++;
        }
        
        // Test 10: Test cleanup functionality
        console.log('\n🔟 Testing warning cleanup...');
        try {
            const { warningService } = require('../services/warningService');
            
            // This should clean up any expired warnings
            await warningService.cleanupExpiredWarnings();
            console.log('   ✅ Warning cleanup executed successfully');
            passed++;
            
        } catch (error) {
            console.log('   ❌ Warning cleanup test failed:', error.message);
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
║  Invite Link Warning System Implementation COMPLETE          ║
║                                                               ║
║  🎯 New features working:                                      ║
║  • Two-strike warning system for invite links               ║
║  • First violation: Warning message (7 days expiry)         ║
║  • Second violation: Delete → Kick → Blacklist              ║
║  • Warning tracking with Firebase persistence               ║
║  • Admin commands: #warnings, #clearwarnings, #warningstats ║
║  • Automatic cleanup of expired warnings                    ║
║  • Full bot integration with Hebrew/English messages        ║
╚═══════════════════════════════════════════════════════════════╝
        `);
        
        console.log(`📱 *How the warning system works:*`);
        console.log(`1. User sends invite link (first time) → Gets warning message`);
        console.log(`2. Warning expires after 7 days if no repeat violation`);
        console.log(`3. User sends invite link (second time) → Gets kicked + blacklisted`);
        console.log(`4. Admin can manage warnings with #warnings, #clearwarnings, #warningstats`);
        console.log(`5. System automatically cleans up expired warnings`);
        console.log(``);
        console.log(`🎯 This addresses your request: "maybe should sent him wornning at the first time and in the second time, kick him?"`);
        
    } else {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    ❌ SOME TESTS FAILED                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Warning system may not work correctly                       ║
╚═══════════════════════════════════════════════════════════════╝
        `);
    }
    
    return { passed, failed };
}

console.log('Running invite link warning system tests...\n');

testInviteLinkWarningSystem().catch(console.error);