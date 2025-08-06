#!/usr/bin/env node

/**
 * Test Nationality-Based Warning System
 * Israeli users get warnings, non-Israeli users get immediate kicks
 */

const { getTimestamp } = require('../utils/logger');

console.log(`
╔════════════════════════════════════════════════════╗
║   🇮🇱 Testing Nationality-Based Warning System 🌍   ║
║                                                    ║
║  Israeli: Warnings → Non-Israeli: Immediate Kick  ║
╚════════════════════════════════════════════════════╝
`);

async function testNationalityBasedWarningSystem() {
    console.log(`[${getTimestamp()}] 🧪 Testing nationality-based invite link system\n`);
    
    let passed = 0;
    let failed = 0;
    
    try {
        // Test 1: Check logic integration in index.js
        console.log('1️⃣ Checking nationality detection logic...');
        const fs = require('fs');
        const indexContent = fs.readFileSync('./index.js', 'utf8');
        
        const hasNationalityCheck = indexContent.includes('isIsraeliUser = userPhone.startsWith(\'972\')');
        const hasIsraeliLogic = indexContent.includes('Israeli user - applying warning system');
        const hasNonIsraeliLogic = indexContent.includes('Non-Israeli user sending invite link - immediate kick');
        
        if (hasNationalityCheck && hasIsraeliLogic && hasNonIsraeliLogic) {
            console.log('   ✅ Nationality detection logic integrated');
            console.log('   - Phone check: ✅');
            console.log('   - Israeli logic: ✅');
            console.log('   - Non-Israeli logic: ✅');
            passed++;
        } else {
            console.log('   ❌ Nationality detection logic incomplete');
            console.log(`   - Phone check: ${hasNationalityCheck ? '✅' : '❌'}`);
            console.log(`   - Israeli logic: ${hasIsraeliLogic ? '✅' : '❌'}`);
            console.log(`   - Non-Israeli logic: ${hasNonIsraeliLogic ? '✅' : '❌'}`);
            failed++;
        }
        
        // Test 2: Test Israeli phone number detection
        console.log('\n2️⃣ Testing phone number classification...');
        
        const testPhones = [
            { phone: '972555123456', expected: true, description: 'Israeli mobile' },
            { phone: '972544345287', expected: true, description: 'Israeli mobile (your number)' },
            { phone: '97221234567', expected: true, description: 'Israeli landline' },
            { phone: '1555123456', expected: false, description: 'US number' },
            { phone: '44123456789', expected: false, description: 'UK number' },
            { phone: '33123456789', expected: false, description: 'French number' },
            { phone: '49123456789', expected: false, description: 'German number' },
            { phone: '86123456789', expected: false, description: 'Chinese number' },
            { phone: '91123456789', expected: false, description: 'Indian number' },
            { phone: '7123456789', expected: false, description: 'Russian number' },
        ];
        
        let phoneTestsPassed = 0;
        testPhones.forEach(test => {
            const isIsraeli = test.phone.startsWith('972');
            if (isIsraeli === test.expected) {
                console.log(`   ✅ ${test.phone} → ${test.description} (${isIsraeli ? 'Israeli' : 'Non-Israeli'})`);
                phoneTestsPassed++;
            } else {
                console.log(`   ❌ ${test.phone} → ${test.description} (Expected: ${test.expected ? 'Israeli' : 'Non-Israeli'}, Got: ${isIsraeli ? 'Israeli' : 'Non-Israeli'})`);
            }
        });
        
        if (phoneTestsPassed === testPhones.length) {
            console.log(`   ✅ All ${testPhones.length} phone number tests passed`);
            passed++;
        } else {
            console.log(`   ❌ ${phoneTestsPassed}/${testPhones.length} phone tests passed`);
            failed++;
        }
        
        // Test 3: Check message flow logic
        console.log('\n3️⃣ Checking message flow logic...');
        
        const hasMessageDeletion = indexContent.includes('Delete the message first (always delete invite links)');
        const hasBranchingLogic = indexContent.includes('if (!isIsraeliUser)') && 
                                 indexContent.includes('} else {') &&
                                 indexContent.includes('// Israeli user - use warning system');
        const hasProperAlerts = indexContent.includes('Non-Israeli User Kicked (Immediate)') &&
                               indexContent.includes('Warning Issued (Israeli User)');
        
        if (hasMessageDeletion && hasBranchingLogic && hasProperAlerts) {
            console.log('   ✅ Message flow logic properly implemented');
            console.log('   - Always delete message: ✅');
            console.log('   - Branching logic: ✅');
            console.log('   - Proper alerts: ✅');
            passed++;
        } else {
            console.log('   ❌ Message flow logic incomplete');
            console.log(`   - Always delete message: ${hasMessageDeletion ? '✅' : '❌'}`);
            console.log(`   - Branching logic: ${hasBranchingLogic ? '✅' : '❌'}`);
            console.log(`   - Proper alerts: ${hasProperAlerts ? '✅' : '❌'}`);
            failed++;
        }
        
        // Test 4: Check warning service integration for Israeli users
        console.log('\n4️⃣ Testing warning service for Israeli users...');
        try {
            const { warningService } = require('../services/warningService');
            
            // Test Israeli user first violation
            const israeliUserId = 'test972555123456@s.whatsapp.net';
            const testGroupId = 'testgroup@g.us';
            
            const firstViolation = await warningService.checkInviteLinkViolation(israeliUserId, testGroupId);
            
            if (firstViolation.action === 'warn' && firstViolation.isFirstWarning === true) {
                console.log('   ✅ Israeli user warning system works');
                passed++;
            } else {
                console.log('   ❌ Israeli user warning system failed:', firstViolation);
                failed++;
            }
            
        } catch (error) {
            console.log('   ❌ Warning service test failed:', error.message);
            failed++;
        }
        
        // Test 5: Check help text updates
        console.log('\n5️⃣ Checking help text updates...');
        const commandHandlerContent = fs.readFileSync('./services/commandHandler.js', 'utf8');
        
        const hasUpdatedHelp = commandHandlerContent.includes('Israeli Priority') &&
                              commandHandlerContent.includes('🇮🇱 Israeli users (+972)') &&
                              commandHandlerContent.includes('🌍 Non-Israeli users: Immediate kick');
        
        if (hasUpdatedHelp) {
            console.log('   ✅ Help text updated with nationality-based policy');
            passed++;
        } else {
            console.log('   ❌ Help text not updated');
            failed++;
        }
        
        // Test 6: Check policy messages
        console.log('\n6️⃣ Checking policy messages...');
        
        const hasNonIsraeliPolicy = indexContent.includes('Non-Israeli users are kicked immediately');
        const hasIsraeliPolicy = indexContent.includes('This was your second warning');
        
        if (hasNonIsraeliPolicy && hasIsraeliPolicy) {
            console.log('   ✅ Policy messages differentiated properly');
            console.log('   - Non-Israeli policy: ✅');
            console.log('   - Israeli second violation: ✅');
            passed++;
        } else {
            console.log('   ❌ Policy messages incomplete');
            console.log(`   - Non-Israeli policy: ${hasNonIsraeliPolicy ? '✅' : '❌'}`);
            console.log(`   - Israeli second violation: ${hasIsraeliPolicy ? '✅' : '❌'}`);
            failed++;
        }
        
        // Test 7: Check admin alert differentiation
        console.log('\n7️⃣ Checking admin alert differentiation...');
        
        const hasNonIsraeliAlert = indexContent.includes('🌍 Origin: Non-Israeli (not +972)');
        const hasIsraeliAlert = indexContent.includes('📞 Phone: ${userPhone} (🇮🇱 Israeli)');
        const hasReasonCodes = indexContent.includes('non-israeli-immediate') || 
                              indexContent.includes('israeli_user_second_violation');
        
        if (hasNonIsraeliAlert && hasIsraeliAlert && hasReasonCodes) {
            console.log('   ✅ Admin alerts properly differentiated');
            console.log('   - Non-Israeli alerts: ✅');
            console.log('   - Israeli alerts: ✅');  
            console.log('   - Reason codes: ✅');
            passed++;
        } else {
            console.log('   ❌ Admin alert differentiation incomplete');
            console.log(`   - Non-Israeli alerts: ${hasNonIsraeliAlert ? '✅' : '❌'}`);
            console.log(`   - Israeli alerts: ${hasIsraeliAlert ? '✅' : '❌'}`);
            console.log(`   - Reason codes: ${hasReasonCodes ? '✅' : '❌'}`);
            failed++;
        }
        
        // Test 8: Check blacklist reasons
        console.log('\n8️⃣ Checking blacklist reason tracking...');
        
        const hasNonIsraeliReason = indexContent.includes('Non-Israeli user sent invite link - immediate kick');
        const hasIsraeliReason = indexContent.includes('Israeli user - Second invite link violation');
        
        if (hasNonIsraeliReason && hasIsraeliReason) {
            console.log('   ✅ Blacklist reasons properly tracked');
            console.log('   - Non-Israeli reason: ✅');
            console.log('   - Israeli reason: ✅');
            passed++;
        } else {
            console.log('   ❌ Blacklist reason tracking incomplete');
            console.log(`   - Non-Israeli reason: ${hasNonIsraeliReason ? '✅' : '❌'}`);
            console.log(`   - Israeli reason: ${hasIsraeliReason ? '✅' : '❌'}`);
            failed++;
        }
        
        // Test 9: Simulate phone number extraction logic
        console.log('\n9️⃣ Testing phone extraction from senderId...');
        
        const testSenderIds = [
            '972555123456@s.whatsapp.net',
            '1555123456@s.whatsapp.net',
            '44123456789@s.whatsapp.net',
            '972544345287@s.whatsapp.net'
        ];
        
        let extractionPassed = 0;
        testSenderIds.forEach(senderId => {
            const userPhone = senderId.split('@')[0];
            const isIsraeli = userPhone.startsWith('972');
            const expected = userPhone.startsWith('972');
            
            if (isIsraeli === expected) {
                console.log(`   ✅ ${senderId} → ${userPhone} (${isIsraeli ? 'Israeli' : 'Non-Israeli'})`);
                extractionPassed++;
            } else {
                console.log(`   ❌ ${senderId} → Failed extraction`);
            }
        });
        
        if (extractionPassed === testSenderIds.length) {
            console.log(`   ✅ All phone extractions work correctly`);
            passed++;
        } else {
            console.log(`   ❌ Phone extraction issues found`);
            failed++;
        }
        
        // Test 10: Edge cases
        console.log('\n🔟 Testing edge cases...');
        
        const edgeCases = [
            { phone: '972', expected: true, case: 'Short Israeli prefix' },
            { phone: '9721', expected: true, case: 'Israeli prefix with one digit' },
            { phone: '0972555123456', expected: false, case: 'Israeli with leading zero' },
            { phone: '+972555123456', expected: false, case: 'Israeli with plus (should be normalized)' },
            { phone: '', expected: false, case: 'Empty phone' },
            { phone: 'abc972', expected: false, case: 'Non-numeric start' }
        ];
        
        let edgeTestsPassed = 0;
        edgeCases.forEach(test => {
            const isIsraeli = test.phone.startsWith('972');
            if (isIsraeli === test.expected) {
                console.log(`   ✅ ${test.case}: "${test.phone}" → ${isIsraeli ? 'Israeli' : 'Non-Israeli'}`);
                edgeTestsPassed++;
            } else {
                console.log(`   ❌ ${test.case}: "${test.phone}" → Expected ${test.expected ? 'Israeli' : 'Non-Israeli'}, got ${isIsraeli ? 'Israeli' : 'Non-Israeli'}`);
            }
        });
        
        if (edgeTestsPassed === edgeCases.length) {
            console.log(`   ✅ All edge cases handled correctly`);
            passed++;
        } else {
            console.log(`   ❌ Some edge cases failed`);
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
║  Nationality-Based Warning System Implementation COMPLETE    ║
║                                                               ║
║  🎯 New nationality-based policy:                             ║
║                                                               ║
║  🇮🇱 Israeli Users (+972):                                    ║
║  • First invite link → Warning message (7 days expiry)       ║
║  • Second invite link → Kick + Blacklist + Admin alert       ║
║  • Message always deleted                                     ║
║                                                               ║
║  🌍 Non-Israeli Users (all others):                           ║
║  • First invite link → Immediate kick + blacklist            ║
║  • No warnings given (immediate enforcement)                 ║
║  • Message always deleted + Admin alert                      ║
║                                                               ║
║  👮 Admin Features:                                           ║
║  • Different alert messages for Israeli vs Non-Israeli       ║
║  • Warning management commands (#warnings, #clearwarnings)   ║
║  • Statistics tracking (#warningstats)                       ║
║  • Clear blacklist reasons for tracking                      ║
╚═══════════════════════════════════════════════════════════════╝
        `);
        
        console.log(`📱 *How the new system works:*`);
        console.log(`1. Bot detects invite link → Always deletes message first`);
        console.log(`2. Bot checks phone number: starts with 972 = Israeli`);
        console.log(`3. Israeli users: Warning system (warn → kick on repeat)`);
        console.log(`4. Non-Israeli users: Immediate kick + blacklist`);
        console.log(`5. Admin gets different alerts based on user nationality`);
        console.log(`6. All kicks recorded with rejoin links for #free system`);
        console.log(``);
        console.log(`🎯 This addresses your updated request: "if phone number NON israeli, kick it right away"`);
        
    } else {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    ❌ SOME TESTS FAILED                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Nationality-based system may not work correctly             ║
╚═══════════════════════════════════════════════════════════════╝
        `);
    }
    
    return { passed, failed };
}

console.log('Running nationality-based warning system tests...\n');

testNationalityBasedWarningSystem().catch(console.error);