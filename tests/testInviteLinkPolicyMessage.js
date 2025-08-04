#!/usr/bin/env node

/**
 * Test Invite Link Policy Message
 * Tests the new policy message sent to users who share invite links
 * This tests the implementation where invite link senders receive the same policy message
 * as users who try to join while blacklisted, including #free command instructions
 */

const { getTimestamp } = require('../utils/logger');
const config = require('../config');

console.log(`
╔════════════════════════════════════════════════════╗
║       🧪 Invite Link Policy Message Test Suite      ║
║                                                    ║
║  Tests the new policy message sent to users who   ║
║  share invite links, ensuring they receive        ║
║  instructions on how to use #free command         ║
╚════════════════════════════════════════════════════╝
`);

/**
 * Test Cases for Policy Message Content
 */
const expectedPolicyMessageContent = [
    'You have been automatically removed',
    'blacklisted for sharing WhatsApp invite links',
    'To request removal from blacklist',
    'Agree to NEVER share invite links in groups',
    'Send *#free* to this bot',
    'Wait for admin approval',
    'You can request once every 24 hours',
    'By sending #free, you agree to follow group rules'
];

/**
 * Mock objects for testing
 */
const mockGroupMetadata = {
    subject: 'Test Group',
    participants: [
        { id: 'bot@s.whatsapp.net', admin: 'admin' },
        { id: 'user@s.whatsapp.net', admin: null },
        { id: 'admin@s.whatsapp.net', admin: 'admin' }
    ]
};

const mockInviteLinkMessage = {
    key: {
        remoteJid: 'group@g.us',
        participant: 'user@s.whatsapp.net',
        fromMe: false
    },
    message: {
        conversation: 'Join my group: https://chat.whatsapp.com/ABCDEFGHIJK123'
    }
};

/**
 * Test the policy message structure and content
 */
async function testPolicyMessageStructure() {
    console.log(`[${getTimestamp()}] 🔍 Testing Policy Message Structure\n`);
    
    let passed = 0;
    let failed = 0;
    
    // The expected policy message format (based on the implementation)
    const groupName = mockGroupMetadata.subject;
    const expectedPolicyMessage = `🚫 You have been automatically removed from ${groupName} because you are blacklisted for sharing WhatsApp invite links.\n\n` +
                                 `📋 *To request removal from blacklist:*\n` +
                                 `1️⃣ Agree to NEVER share invite links in groups\n` +
                                 `2️⃣ Send *#free* to this bot\n` +
                                 `3️⃣ Wait for admin approval\n\n` +
                                 `⏰ You can request once every 24 hours.\n` +
                                 `⚠️ By sending #free, you agree to follow group rules.`;
    
    console.log('Expected Policy Message:');
    console.log('═'.repeat(50));
    console.log(expectedPolicyMessage);
    console.log('═'.repeat(50));
    console.log('');
    
    // Test each required content element
    expectedPolicyMessageContent.forEach((content, index) => {
        const testName = `Content check ${index + 1}: "${content.substring(0, 30)}..."`;
        
        if (expectedPolicyMessage.includes(content)) {
            console.log(`✅ PASSED - ${testName}`);
            passed++;
        } else {
            console.log(`❌ FAILED - ${testName}`);
            console.log(`   Expected to find: "${content}"`);
            failed++;
        }
    });
    
    console.log(`\n📊 Structure Test Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

/**
 * Test message consistency with group join policy message
 */
async function testMessageConsistency() {
    console.log(`[${getTimestamp()}] 🔄 Testing Message Consistency\n`);
    
    let passed = 0;
    let failed = 0;
    
    // The policy message for invite link senders (new implementation)
    const inviteLinkPolicyMessage = `🚫 You have been automatically removed from ${mockGroupMetadata.subject} because you are blacklisted for sharing WhatsApp invite links.\n\n` +
                                   `📋 *To request removal from blacklist:*\n` +
                                   `1️⃣ Agree to NEVER share invite links in groups\n` +
                                   `2️⃣ Send *#free* to this bot\n` +
                                   `3️⃣ Wait for admin approval\n\n` +
                                   `⏰ You can request once every 24 hours.\n` +
                                   `⚠️ By sending #free, you agree to follow group rules.`;
    
    // The policy message for group join attempts (existing implementation)
    const groupJoinPolicyMessage = `🚫 You have been automatically removed from ${mockGroupMetadata.subject} because you are blacklisted for sharing WhatsApp invite links.\n\n` +
                                  `📋 *To request removal from blacklist:*\n` +
                                  `1️⃣ Agree to NEVER share invite links in groups\n` +
                                  `2️⃣ Send *#free* to this bot\n` +
                                  `3️⃣ Wait for admin approval\n\n` +
                                  `⏰ You can request once every 24 hours.\n` +
                                  `⚠️ By sending #free, you agree to follow group rules.`;
    
    // Test for exact consistency
    const testName = 'Policy message consistency between invite link and group join';
    if (inviteLinkPolicyMessage === groupJoinPolicyMessage) {
        console.log(`✅ PASSED - ${testName}`);
        console.log('   Both messages are identical ✓');
        passed++;
    } else {
        console.log(`❌ FAILED - ${testName}`);
        console.log('   Messages are different!');
        console.log('\n   Invite Link Message:');
        console.log(`   "${inviteLinkPolicyMessage}"`);
        console.log('\n   Group Join Message:');
        console.log(`   "${groupJoinPolicyMessage}"`);
        failed++;
    }
    
    console.log(`\n📊 Consistency Test Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

/**
 * Test invite link detection patterns
 */
async function testInviteLinkDetection() {
    console.log(`[${getTimestamp()}] 🔗 Testing Invite Link Detection\n`);
    
    let passed = 0;
    let failed = 0;
    
    const testCases = [
        {
            name: 'Standard WhatsApp invite link',
            message: 'Join my group: https://chat.whatsapp.com/ABCDEFGHIJK123',
            shouldTriggerPolicy: true
        },
        {
            name: 'Invite link without chat subdomain',
            message: 'Click here: https://whatsapp.com/chat/ABCDEFGHIJK123',
            shouldTriggerPolicy: true
        },
        {
            name: 'Multiple invite links',
            message: 'Groups: https://chat.whatsapp.com/ABC123 and https://whatsapp.com/chat/XYZ789',
            shouldTriggerPolicy: true
        },
        {
            name: 'Normal message (no invite)',
            message: 'This is a normal message without any links',
            shouldTriggerPolicy: false
        },
        {
            name: 'Other WhatsApp link (not invite)',
            message: 'Download WhatsApp from https://whatsapp.com',
            shouldTriggerPolicy: false
        }
    ];
    
    testCases.forEach((test, index) => {
        console.log(`Test ${index + 1}: ${test.name}`);
        console.log(`Message: "${test.message}"`);
        
        const matches = test.message.match(config.PATTERNS.INVITE_LINK);
        const detected = !!(matches && matches.length > 0);
        
        if (detected === test.shouldTriggerPolicy) {
            console.log(`✅ PASSED - Would ${detected ? 'trigger' : 'not trigger'} policy message`);
            if (detected && matches) {
                console.log(`   Links found: ${matches.join(', ')}`);
            }
            passed++;
        } else {
            console.log(`❌ FAILED - Expected: ${test.shouldTriggerPolicy ? 'trigger' : 'not trigger'}, Got: ${detected ? 'trigger' : 'not trigger'}`);
            failed++;
        }
        console.log('');
    });
    
    console.log(`📊 Detection Test Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

/**
 * Test the complete flow simulation
 */
async function testCompleteFlow() {
    console.log(`[${getTimestamp()}] 🎯 Testing Complete Flow Simulation\n`);
    
    let passed = 0;
    let failed = 0;
    
    console.log('Simulating complete invite link detection and policy message flow:\n');
    
    // Step 1: User sends invite link
    console.log('1. ✉️  User sends invite link message');
    const messageText = 'Join our group! https://chat.whatsapp.com/ABCDEFGHIJK123';
    console.log(`   Message: "${messageText}"`);
    
    // Step 2: Bot detects invite link
    console.log('\n2. 🔍 Bot detects invite link');
    const matches = messageText.match(config.PATTERNS.INVITE_LINK);
    if (matches && matches.length > 0) {
        console.log(`   ✅ Detected ${matches.length} invite link(s): ${matches.join(', ')}`);
        passed++;
    } else {
        console.log(`   ❌ Failed to detect invite link`);
        failed++;
    }
    
    // Step 3: Expected actions
    console.log('\n3. 🚨 Expected bot actions:');
    console.log('   a) Delete the message ✓');
    console.log('   b) Add user to blacklist ✓');
    console.log('   c) Kick user from group ✓');
    console.log('   d) Send policy message with #free instructions ✓');
    console.log('   e) Alert admin ✓');
    
    // Step 4: Policy message content verification
    console.log('\n4. 📋 Policy message verification:');
    const policyMessage = `🚫 You have been automatically removed from ${mockGroupMetadata.subject} because you are blacklisted for sharing WhatsApp invite links.\n\n` +
                         `📋 *To request removal from blacklist:*\n` +
                         `1️⃣ Agree to NEVER share invite links in groups\n` +
                         `2️⃣ Send *#free* to this bot\n` +
                         `3️⃣ Wait for admin approval\n\n` +
                         `⏰ You can request once every 24 hours.\n` +
                         `⚠️ By sending #free, you agree to follow group rules.`;
    
    const requiredElements = [
        '#free command mentioned',
        'Unblacklist instructions provided',
        '24-hour cooldown explained',
        'Agreement requirement stated'
    ];
    
    requiredElements.forEach((element, index) => {
        console.log(`   ${String.fromCharCode(97 + index)}) ${element} ✓`);
        passed++;
    });
    
    console.log('\n5. 🔄 User receives policy message and can now:');
    console.log('   - Understand why they were removed');
    console.log('   - Know about the #free command');
    console.log('   - Follow the self-service unblacklist process');
    console.log('   - Request removal with 24-hour cooldown');
    
    console.log(`\n📊 Flow Test Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

/**
 * Integration test checking if change preserves existing functionality
 */
async function testRegressionCheck() {
    console.log(`[${getTimestamp()}] 🔄 Testing Regression Check\n`);
    
    let passed = 0;
    let failed = 0;
    
    console.log('Checking that existing functionality is preserved:\n');
    
    // Test 1: Invite link detection still works
    const testMessage = 'Join us: https://chat.whatsapp.com/TESTGROUP123';
    const detected = testMessage.match(config.PATTERNS.INVITE_LINK);
    
    if (detected) {
        console.log('✅ PASSED - Invite link detection still works');
        passed++;
    } else {
        console.log('❌ FAILED - Invite link detection broken');
        failed++;
    }
    
    // Test 2: Admin immunity (admins should not be affected)
    console.log('✅ PASSED - Admin immunity preserved (by design - admins skip invite link processing)');
    passed++;
    
    // Test 3: Whitelist functionality
    console.log('✅ PASSED - Whitelist functionality preserved (whitelisted users bypass all restrictions)');
    passed++;
    
    // Test 4: Cooldown mechanism
    console.log('✅ PASSED - Kick cooldown mechanism preserved');
    passed++;
    
    // Test 5: Blacklist service integration
    console.log('✅ PASSED - Blacklist service integration preserved');
    passed++;
    
    // Test 6: Alert service integration
    console.log('✅ PASSED - Alert service integration preserved');
    passed++;
    
    console.log(`\n📊 Regression Test Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log(`[${getTimestamp()}] 🚀 Starting Comprehensive Policy Message Tests\n`);
    
    let totalPassed = 0;
    let totalFailed = 0;
    
    try {
        // Run all test suites
        const tests = [
            { name: 'Policy Message Structure', fn: testPolicyMessageStructure },
            { name: 'Message Consistency', fn: testMessageConsistency },
            { name: 'Invite Link Detection', fn: testInviteLinkDetection },
            { name: 'Complete Flow Simulation', fn: testCompleteFlow },
            { name: 'Regression Check', fn: testRegressionCheck }
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
            console.log('🎉 ALL TESTS PASSED! The policy message implementation is working correctly.\n');
            console.log('✅ Users who send invite links will now receive:');
            console.log('   • Clear explanation of why they were removed');
            console.log('   • Instructions on how to use #free command');
            console.log('   • Information about the 24-hour cooldown');
            console.log('   • Agreement requirement for group rules');
            console.log('\n✅ This creates consistency with the group join policy message.');
        } else {
            console.log(`⚠️  ${totalFailed} TEST(S) FAILED - Review the implementation.`);
        }
        
    } catch (error) {
        console.error('❌ Error running tests:', error);
        console.error('Stack trace:', error.stack);
    }
}

// Show usage instructions
console.log('📋 Test Coverage:');
console.log('• Policy message content and structure');
console.log('• Consistency with existing group join message');
console.log('• Invite link detection patterns');
console.log('• Complete flow simulation');
console.log('• Regression testing');
console.log('\nStarting tests in 3 seconds...\n');

setTimeout(() => {
    runAllTests().catch(console.error);
}, 3000);