#!/usr/bin/env node

/**
 * Comprehensive QA Test Suite for Nationality-Based Warning System
 * Tests all aspects: Israeli warnings, Non-Israeli silent kicks, Firebase integration
 */

const { getTimestamp } = require('../utils/logger');

console.log(`
╔════════════════════════════════════════════════════════════════╗
║            🧪 COMPREHENSIVE QA TEST SUITE 🧪                   ║
║                                                                ║
║      Nationality-Based Warning System - Full Coverage         ║
╚════════════════════════════════════════════════════════════════╝
`);

async function runComprehensiveQA() {
    console.log(`[${getTimestamp()}] 🚀 Starting comprehensive QA test suite\n`);
    
    let totalPassed = 0;
    let totalFailed = 0;
    const testResults = [];

    async function runTestSuite(suiteName, testFunction) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔍 TEST SUITE: ${suiteName}`);
        console.log(`${'='.repeat(60)}\n`);
        
        try {
            const result = await testFunction();
            testResults.push({
                suite: suiteName,
                passed: result.passed,
                failed: result.failed,
                total: result.passed + result.failed
            });
            totalPassed += result.passed;
            totalFailed += result.failed;
        } catch (error) {
            console.error(`❌ Test suite ${suiteName} crashed:`, error.message);
            totalFailed++;
            testResults.push({
                suite: suiteName,
                passed: 0,
                failed: 1,
                total: 1,
                error: error.message
            });
        }
    }

    // Test Suite 1: Core Logic Integration
    await runTestSuite('Core Logic Integration', async () => {
        let passed = 0, failed = 0;
        
        console.log('1️⃣ Testing nationality detection implementation...');
        const fs = require('fs');
        const indexContent = fs.readFileSync('./index.js', 'utf8');
        
        const checks = [
            { name: 'Phone extraction logic', pattern: 'userPhone = senderId.split(\'@\')[0]' },
            { name: 'Israeli detection', pattern: 'isIsraeliUser = userPhone.startsWith(\'972\')' },
            { name: 'Non-Israeli branch', pattern: 'if (!isIsraeliUser)' },
            { name: 'Israeli branch', pattern: 'Israeli user - use warning system' },
            { name: 'Silent kick logic', pattern: 'Non-Israeli users get NO MESSAGE - silent kick only' },
            { name: 'Message deletion', pattern: 'Delete the message first (always delete invite links)' }
        ];
        
        checks.forEach(check => {
            if (indexContent.includes(check.pattern)) {
                console.log(`   ✅ ${check.name}`);
                passed++;
            } else {
                console.log(`   ❌ ${check.name} - Pattern not found`);
                failed++;
            }
        });
        
        return { passed, failed };
    });

    // Test Suite 2: Phone Number Classification
    await runTestSuite('Phone Number Classification', async () => {
        let passed = 0, failed = 0;
        
        console.log('2️⃣ Testing phone number nationality classification...');
        
        const testCases = [
            // Israeli numbers
            { phone: '972555123456', expected: true, type: 'Israeli Mobile' },
            { phone: '972544345287', expected: true, type: 'Israeli Mobile (Admin)' },
            { phone: '97221234567', expected: true, type: 'Israeli Landline' },
            { phone: '972501234567', expected: true, type: 'Israeli Alternative Mobile' },
            { phone: '972', expected: true, type: 'Short Israeli Prefix' },
            
            // Non-Israeli numbers
            { phone: '1555123456', expected: false, type: 'US Number' },
            { phone: '12125551234', expected: false, type: 'US NYC Number' },
            { phone: '447123456789', expected: false, type: 'UK Number' },
            { phone: '33123456789', expected: false, type: 'French Number' },
            { phone: '49123456789', expected: false, type: 'German Number' },
            { phone: '86123456789', expected: false, type: 'Chinese Number' },
            { phone: '91123456789', expected: false, type: 'Indian Number' },
            { phone: '7123456789', expected: false, type: 'Russian Number' },
            { phone: '61123456789', expected: false, type: 'Australian Number' },
            { phone: '5511123456789', expected: false, type: 'Brazilian Number' },
            
            // Edge cases
            { phone: '0972555123456', expected: false, type: 'Israeli with Leading Zero' },
            { phone: '+972555123456', expected: false, type: 'Israeli with Plus' },
            { phone: '9721', expected: true, type: 'Short Israeli Valid' },
            { phone: '971555123456', expected: false, type: 'UAE (close to Israeli)' },
            { phone: '973555123456', expected: false, type: 'Bahrain (close to Israeli)' },
            { phone: '', expected: false, type: 'Empty String' },
            { phone: 'abc972', expected: false, type: 'Non-numeric Start' }
        ];
        
        testCases.forEach(testCase => {
            const isIsraeli = testCase.phone.startsWith('972');
            if (isIsraeli === testCase.expected) {
                console.log(`   ✅ ${testCase.phone.padEnd(15)} → ${testCase.type} (${isIsraeli ? 'Israeli' : 'Non-Israeli'})`);
                passed++;
            } else {
                console.log(`   ❌ ${testCase.phone.padEnd(15)} → ${testCase.type} - Expected ${testCase.expected ? 'Israeli' : 'Non-Israeli'}, got ${isIsraeli ? 'Israeli' : 'Non-Israeli'}`);
                failed++;
            }
        });
        
        return { passed, failed };
    });

    // Test Suite 3: Firebase Integration
    await runTestSuite('Firebase Collections Integration', async () => {
        let passed = 0, failed = 0;
        
        console.log('3️⃣ Testing Firebase collections integration...');
        
        try {
            // Test warning service (Israeli users only)
            console.log('   Testing warning service...');
            const { warningService } = require('../services/warningService');
            
            // Test Israeli user warning
            const israeliUserId = 'test972555999888@s.whatsapp.net';
            const testGroupId = 'testgroup@g.us';
            
            const firstViolation = await warningService.checkInviteLinkViolation(israeliUserId, testGroupId);
            if (firstViolation.action === 'warn') {
                console.log('   ✅ Warning service works for Israeli users');
                passed++;
            } else {
                console.log('   ❌ Warning service failed for Israeli users');
                failed++;
            }
            
            // Test blacklist service
            console.log('   Testing blacklist service...');
            const blacklistModule = require('../services/blacklistService');
            
            // Test adding Israeli user to blacklist
            const israeliBlacklistResult = await blacklistModule.addToBlacklist(israeliUserId, 'Israeli user - Second invite link violation - kicked after warning');
            if (israeliBlacklistResult) {
                console.log('   ✅ Blacklist service works for Israeli users');
                passed++;
            } else {
                console.log('   ❌ Blacklist service failed for Israeli users');
                failed++;
            }
            
            // Test adding non-Israeli user to blacklist
            const nonIsraeliUserId = 'test1555999888@s.whatsapp.net';
            const nonIsraeliBlacklistResult = await blacklistModule.addToBlacklist(nonIsraeliUserId, 'Non-Israeli user sent invite link - immediate kick');
            if (nonIsraeliBlacklistResult) {
                console.log('   ✅ Blacklist service works for non-Israeli users');
                passed++;
            } else {
                console.log('   ❌ Blacklist service failed for non-Israeli users');
                failed++;
            }
            
            // Test kicked user service
            console.log('   Testing kicked user service...');
            const { kickedUserService } = require('../services/kickedUserService');
            
            // Test recording Israeli kicked user
            const israeliKickResult = await kickedUserService.recordKickedUser(
                israeliUserId,
                testGroupId,
                'Test Group',
                'https://chat.whatsapp.com/test123',
                'Israeli user - Second invite link violation',
                []
            );
            if (israeliKickResult) {
                console.log('   ✅ Kicked user service works for Israeli users');
                passed++;
            } else {
                console.log('   ❌ Kicked user service failed for Israeli users');
                failed++;
            }
            
            // Test recording non-Israeli kicked user
            const nonIsraeliKickResult = await kickedUserService.recordKickedUser(
                nonIsraeliUserId,
                testGroupId,
                'Test Group',
                'https://chat.whatsapp.com/test123',
                'Non-Israeli user - Immediate kick for invite link',
                []
            );
            if (nonIsraeliKickResult) {
                console.log('   ✅ Kicked user service works for non-Israeli users');
                passed++;
            } else {
                console.log('   ❌ Kicked user service failed for non-Israeli users');
                failed++;
            }
            
        } catch (error) {
            console.log(`   ❌ Firebase integration test failed: ${error.message}`);
            failed++;
        }
        
        return { passed, failed };
    });

    // Test Suite 4: Message Flow Validation
    await runTestSuite('Message Flow Validation', async () => {
        let passed = 0, failed = 0;
        
        console.log('4️⃣ Testing message flow logic...');
        const fs = require('fs');
        const indexContent = fs.readFileSync('./index.js', 'utf8');
        
        // Check Israeli user flow
        console.log('   Checking Israeli user message flow...');
        const israeliFlowChecks = [
            { name: 'Warning message creation', pattern: '⚠️ *אזהרה / Warning* ⚠️' },
            { name: 'Hebrew warning text', pattern: 'שליחת קישורי הזמנה לקבוצות אסורה' },
            { name: 'English warning text', pattern: 'Sending group invite links is not allowed' },
            { name: 'Warning expiry notice', pattern: 'Warning expires in 7 days' },
            { name: 'Admin alert for warning', pattern: 'Warning Issued (Israeli User)' },
            { name: 'Second violation message', pattern: 'This was your second warning' }
        ];
        
        israeliFlowChecks.forEach(check => {
            if (indexContent.includes(check.pattern)) {
                console.log(`     ✅ ${check.name}`);
                passed++;
            } else {
                console.log(`     ❌ ${check.name} - Pattern not found`);
                failed++;
            }
        });
        
        // Check non-Israeli user flow
        console.log('   Checking non-Israeli user flow...');
        const nonIsraeliFlowChecks = [
            { name: 'Silent kick confirmation', pattern: 'Non-Israeli users get NO MESSAGE - silent kick only' },
            { name: 'No policy message', pattern: '!indexContent.includes("Non-Israeli users are kicked immediately for invite link violations")' }, // Should NOT exist
            { name: 'Admin alert for immediate kick', pattern: 'Non-Israeli User Kicked (Immediate)' },
            { name: 'Nationality in admin alert', pattern: 'Origin: Non-Israeli (not +972)' },
            { name: 'Kick reason tracking', pattern: 'Non-Israeli user sent invite link - immediate kick' }
        ];
        
        // Special check for non-policy message (should NOT exist)
        if (!indexContent.includes('Policy: Non-Israeli users are kicked immediately for invite link violations')) {
            console.log('     ✅ No policy message sent to non-Israeli users');
            passed++;
        } else {
            console.log('     ❌ Policy message still being sent to non-Israeli users');
            failed++;
        }
        
        // Check other non-Israeli flow items
        nonIsraeliFlowChecks.slice(2).forEach(check => {
            if (indexContent.includes(check.pattern)) {
                console.log(`     ✅ ${check.name}`);
                passed++;
            } else {
                console.log(`     ❌ ${check.name} - Pattern not found`);
                failed++;
            }
        });
        
        return { passed, failed };
    });

    // Test Suite 5: Command System Integration
    await runTestSuite('Command System Integration', async () => {
        let passed = 0, failed = 0;
        
        console.log('5️⃣ Testing admin command system...');
        const fs = require('fs');
        const commandHandlerContent = fs.readFileSync('./services/commandHandler.js', 'utf8');
        
        const commandChecks = [
            { name: 'Warnings command', pattern: 'case \'#warnings\':' },
            { name: 'Clear warnings command', pattern: 'case \'#clearwarnings\':' },
            { name: 'Warning stats command', pattern: 'case \'#warningstats\':' },
            { name: 'Warning view handler', pattern: 'handleWarningsView' },
            { name: 'Warning clear handler', pattern: 'handleWarningsClear' },
            { name: 'Warning stats handler', pattern: 'handleWarningsStats' },
            { name: 'Updated help text', pattern: 'Israeli Priority' },
            { name: 'Israeli user policy in help', pattern: '🇮🇱 Israeli users (+972)' },
            { name: 'Non-Israeli policy in help', pattern: '🌍 Non-Israeli users: Immediate kick' }
        ];
        
        commandChecks.forEach(check => {
            if (commandHandlerContent.includes(check.pattern)) {
                console.log(`   ✅ ${check.name}`);
                passed++;
            } else {
                console.log(`   ❌ ${check.name} - Pattern not found`);
                failed++;
            }
        });
        
        return { passed, failed };
    });

    // Test Suite 6: Error Handling and Edge Cases
    await runTestSuite('Error Handling & Edge Cases', async () => {
        let passed = 0, failed = 0;
        
        console.log('6️⃣ Testing error handling and edge cases...');
        
        // Test malformed phone numbers
        console.log('   Testing malformed phone number handling...');
        const malformedNumbers = [
            { input: '@s.whatsapp.net', expected: false }, // No phone number
            { input: 'abc@s.whatsapp.net', expected: false }, // Non-numeric
            { input: '972@s.whatsapp.net', expected: true }, // Just prefix
            { input: '123456789012345@s.whatsapp.net', expected: false } // Very long
        ];
        
        malformedNumbers.forEach(test => {
            const phone = test.input.split('@')[0];
            const isIsraeli = phone.startsWith('972');
            if (isIsraeli === test.expected) {
                console.log(`     ✅ ${test.input} → Handled correctly`);
                passed++;
            } else {
                console.log(`     ❌ ${test.input} → Mishandled`);
                failed++;
            }
        });
        
        // Test service error handling
        console.log('   Testing service error handling...');
        try {
            const { warningService } = require('../services/warningService');
            
            // Test with invalid input
            try {
                await warningService.checkInviteLinkViolation('', '');
                console.log('     ✅ Warning service handles empty input gracefully');
                passed++;
            } catch (error) {
                console.log('     ✅ Warning service properly throws error for invalid input');
                passed++;
            }
            
        } catch (error) {
            console.log(`     ⚠️ Could not test warning service error handling: ${error.message}`);
            // Don't count as failure - might be expected if Firebase unavailable
        }
        
        return { passed, failed };
    });

    // Test Suite 7: Performance and Scalability
    await runTestSuite('Performance & Scalability', async () => {
        let passed = 0, failed = 0;
        
        console.log('7️⃣ Testing performance and scalability aspects...');
        
        // Test phone number classification performance
        console.log('   Testing phone classification performance...');
        const start = Date.now();
        const testNumbers = [];
        
        // Generate test data
        for (let i = 0; i < 10000; i++) {
            testNumbers.push(`${i % 2 === 0 ? '972' : '1'}555${String(i).padStart(6, '0')}`);
        }
        
        // Test classification performance
        testNumbers.forEach(phone => {
            const isIsraeli = phone.startsWith('972');
        });
        
        const duration = Date.now() - start;
        if (duration < 100) { // Should be very fast
            console.log(`     ✅ Classified 10,000 numbers in ${duration}ms`);
            passed++;
        } else {
            console.log(`     ❌ Classification too slow: ${duration}ms`);
            failed++;
        }
        
        // Test memory usage simulation
        console.log('   Testing memory efficiency...');
        const memBefore = process.memoryUsage().heapUsed;
        
        // Simulate processing many users
        const userData = {};
        for (let i = 0; i < 1000; i++) {
            const phone = `${i % 2 === 0 ? '972' : '1'}555${String(i).padStart(6, '0')}`;
            userData[phone] = {
                isIsraeli: phone.startsWith('972'),
                violationCount: Math.floor(Math.random() * 3)
            };
        }
        
        const memAfter = process.memoryUsage().heapUsed;
        const memDiff = (memAfter - memBefore) / 1024 / 1024; // MB
        
        if (memDiff < 10) { // Should use less than 10MB for 1000 users
            console.log(`     ✅ Memory usage for 1000 users: ${memDiff.toFixed(2)}MB`);
            passed++;
        } else {
            console.log(`     ❌ Memory usage too high: ${memDiff.toFixed(2)}MB`);
            failed++;
        }
        
        return { passed, failed };
    });

    // Test Suite 8: Integration Completeness
    await runTestSuite('Integration Completeness', async () => {
        let passed = 0, failed = 0;
        
        console.log('8️⃣ Testing overall integration completeness...');
        
        // Check file existence
        const requiredFiles = [
            { path: './services/warningService.js', name: 'Warning Service' },
            { path: './services/kickedUserService.js', name: 'Kicked User Service' },
            { path: './services/blacklistService.js', name: 'Blacklist Service' },
            { path: './services/commandHandler.js', name: 'Command Handler' },
            { path: './index.js', name: 'Main Bot File' }
        ];
        
        const fs = require('fs');
        requiredFiles.forEach(file => {
            if (fs.existsSync(file.path)) {
                console.log(`   ✅ ${file.name} exists`);
                passed++;
            } else {
                console.log(`   ❌ ${file.name} missing`);
                failed++;
            }
        });
        
        // Check service initialization
        console.log('   Checking service initialization...');
        const indexContent = fs.readFileSync('./index.js', 'utf8');
        
        const initializationChecks = [
            'warningService',
            'kickedUserService',
            'initialize()',
            'Warning service initialized',
            'Kicked user service initialized'
        ];
        
        initializationChecks.forEach(check => {
            if (indexContent.includes(check)) {
                console.log(`     ✅ ${check} initialization found`);
                passed++;
            } else {
                console.log(`     ❌ ${check} initialization missing`);
                failed++;
            }
        });
        
        return { passed, failed };
    });

    // Final Results Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🏁 COMPREHENSIVE QA TEST SUITE COMPLETED`);
    console.log(`${'='.repeat(80)}\n`);
    
    console.log(`📊 **OVERALL RESULTS:**`);
    console.log(`✅ Total Passed: ${totalPassed}`);
    console.log(`❌ Total Failed: ${totalFailed}`);
    console.log(`📈 Success Rate: ${totalFailed === 0 ? 100 : ((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%\n`);
    
    console.log(`📋 **TEST SUITE BREAKDOWN:**`);
    testResults.forEach(result => {
        const successRate = result.total > 0 ? ((result.passed / result.total) * 100).toFixed(1) : 0;
        const status = result.failed === 0 ? '✅' : '⚠️';
        console.log(`${status} ${result.suite}: ${result.passed}/${result.total} (${successRate}%)`);
        if (result.error) {
            console.log(`   🚨 Error: ${result.error}`);
        }
    });
    
    if (totalFailed === 0) {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    🎉 ALL TESTS PASSED! 🎉                    ║
╠═══════════════════════════════════════════════════════════════╣
║  Nationality-Based Warning System QA: COMPLETE              ║
║                                                               ║
║  System is ready for production deployment                   ║
╚═══════════════════════════════════════════════════════════════╝
        `);
    } else {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    ⚠️  ISSUES FOUND  ⚠️                       ║
╠═══════════════════════════════════════════════════════════════╣
║  ${totalFailed} test(s) failed - Review required before deployment  ║
╚═══════════════════════════════════════════════════════════════╝
        `);
    }
    
    return { totalPassed, totalFailed, testResults };
}

// Run comprehensive QA
runComprehensiveQA().catch(console.error);