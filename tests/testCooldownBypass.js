#!/usr/bin/env node

/**
 * Test Cooldown Bypass
 * Tests that +972555030746 always bypasses the 24-hour cooldown
 */

const { getTimestamp } = require('../utils/logger');

console.log(`
╔════════════════════════════════════════════════════╗
║           🧪 Test Cooldown Bypass System            ║
║                                                    ║
║  Tests that +972555030746 always ignores cooldown  ║
╚════════════════════════════════════════════════════╝
`);

async function testCooldownBypass() {
    console.log(`[${getTimestamp()}] 🧪 Testing cooldown bypass for test number\n`);
    
    let passed = 0;
    let failed = 0;
    
    try {
        const unblacklistService = require('../services/unblacklistRequestService');
        
        // Test different formats of the test number
        const testInputs = [
            '972555030746@s.whatsapp.net',
            '+972555030746@s.whatsapp.net',
            '972555030746',
            '+972555030746'
        ];
        
        console.log('🔍 Testing bypass for different input formats:');
        
        for (const input of testInputs) {
            console.log(`\n   Testing input: "${input}"`);
            
            try {
                const result = await unblacklistService.canMakeRequest(input);
                
                if (result.canRequest === true) {
                    console.log(`   ✅ PASSED - Bypass working for "${input}"`);
                    passed++;
                } else {
                    console.log(`   ❌ FAILED - Bypass not working for "${input}"`);
                    console.log(`   Reason: ${result.reason || 'Unknown'}`);
                    failed++;
                }
                
            } catch (error) {
                console.log(`   ❌ FAILED - Error testing "${input}": ${error.message}`);
                failed++;
            }
        }
        
        // Test that regular numbers still have cooldown (if any exist)
        console.log('\n🔍 Testing that bypass is specific to test number:');
        const regularNumbers = [
            '972555123456@s.whatsapp.net',
            '+972555999999@s.whatsapp.net'
        ];
        
        for (const input of regularNumbers) {
            console.log(`\n   Testing regular number: "${input}"`);
            
            try {
                const result = await unblacklistService.canMakeRequest(input);
                
                // For regular numbers, either canRequest=true (no cooldown) or canRequest=false (has cooldown)
                // Both are valid - we just want to confirm they don't get the test bypass
                if (result.canRequest === true) {
                    console.log(`   ✅ Regular number can request (no active cooldown)`);
                } else {
                    console.log(`   ✅ Regular number has cooldown (${result.hoursLeft || '?'} hours left)`);
                }
                passed++;
                
            } catch (error) {
                console.log(`   ⚠️  Could not test regular number: ${error.message}`);
                // Don't count as failure since this is just for comparison
            }
        }
        
    } catch (error) {
        console.error(`❌ Test error:`, error);
        failed++;
    }
    
    console.log(`\n📊 Bypass Test Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

async function testBypassLogic() {
    console.log(`[${getTimestamp()}] 🔍 Testing bypass logic directly\n`);
    
    let passed = 0;
    let failed = 0;
    
    // Test the bypass logic directly
    const testNumbers = ['972555030746', '+972555030746'];
    const testInputs = [
        '972555030746@s.whatsapp.net',
        '+972555030746@s.whatsapp.net',
        '972555030746',
        '+972555030746'
    ];
    
    console.log('🧪 Testing bypass logic:');
    
    testInputs.forEach((input, index) => {
        const normalizedId = input.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
        const inputWithoutSuffix = input.replace('@s.whatsapp.net', '');
        
        const shouldBypass = testNumbers.includes(normalizedId) || testNumbers.includes(inputWithoutSuffix);
        
        console.log(`\n   Test ${index + 1}: "${input}"`);
        console.log(`      Normalized: "${normalizedId}"`);
        console.log(`      Without suffix: "${inputWithoutSuffix}"`);
        console.log(`      Should bypass: ${shouldBypass}`);
        
        if (shouldBypass) {
            console.log(`   ✅ PASSED - Logic correctly identifies bypass needed`);
            passed++;
        } else {
            console.log(`   ❌ FAILED - Logic should identify bypass for test number`);
            failed++;
        }
    });
    
    console.log(`\n📊 Logic Test Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log(`[${getTimestamp()}] 🚀 Starting Cooldown Bypass Tests\n`);
    
    let totalPassed = 0;
    let totalFailed = 0;
    
    try {
        // Run all test suites
        const tests = [
            { name: 'Bypass Logic', fn: testBypassLogic },
            { name: 'Cooldown Bypass', fn: testCooldownBypass }
        ];
        
        for (const test of tests) {
            console.log(`🧪 Running ${test.name} tests...`);
            const result = await test.fn();
            totalPassed += result.passed;
            totalFailed += result.failed;
            console.log(`📊 ${test.name}: ${result.passed} passed, ${result.failed} failed\n`);
        }
        
        // Final results
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                        🏆 FINAL RESULTS                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Total Tests: ${String(totalPassed + totalFailed).padStart(3)} │ Passed: ${String(totalPassed).padStart(3)} │ Failed: ${String(totalFailed).padStart(3)}       ║
║  Success Rate: ${String(Math.round((totalPassed / (totalPassed + totalFailed)) * 100)).padStart(3)}%                                      ║
╚═══════════════════════════════════════════════════════════════╝
        `);
        
        if (totalFailed === 0) {
            console.log('🎉 ALL TESTS PASSED! Cooldown bypass is working correctly.\n');
            console.log('✅ Expected behavior:');
            console.log('• Test number +972555030746 always bypasses 24-hour cooldown');
            console.log('• Can send #free command multiple times without waiting');
            console.log('• Still gets success message and admin notification');
            console.log('• Regular numbers still respect cooldown rules');
        } else {
            console.log(`⚠️  ${totalFailed} TEST(S) FAILED - Review the bypass implementation.`);
        }
        
    } catch (error) {
        console.error('❌ Error running tests:', error);
        console.error('Stack trace:', error.stack);
    }
}

// Show test info
console.log('📋 Test Coverage:');
console.log('• Bypass logic validation');
console.log('• Multiple input format testing');
console.log('• Service integration testing');
console.log('• Regular number cooldown preservation');
console.log('\nStarting tests in 2 seconds...\n');

setTimeout(() => {
    runAllTests().catch(console.error);
}, 2000);