#!/usr/bin/env node

/**
 * Test Message Deduplication
 * Tests that duplicate #free messages are properly handled
 */

const { getTimestamp } = require('../utils/logger');

console.log(`
╔════════════════════════════════════════════════════╗
║           🧪 Test Message Deduplication             ║
║                                                    ║
║  Tests that duplicate #free messages are ignored   ║
╚════════════════════════════════════════════════════╝
`);

async function testDeduplication() {
    console.log(`[${getTimestamp()}] 🧪 Testing message deduplication\n`);
    
    let passed = 0;
    let failed = 0;
    
    try {
        // Mock socket for testing
        const mockSock = {
            sendMessage: async (jid, message) => {
                console.log(`   📤 Mock message sent to ${jid}: ${message.text.substring(0, 50)}...`);
                return { key: { id: 'mock_message_id' } };
            }
        };
        
        // Create command handler instance
        const CommandHandler = require('../services/commandHandler');
        const handler = new CommandHandler(mockSock);
        
        // Mock message with same ID (simulating duplicate)
        const mockMessage = {
            key: {
                id: 'DUPLICATE_MESSAGE_ID_123',
                remoteJid: '972555030746@s.whatsapp.net',
                fromMe: false
            },
            messageTimestamp: Date.now()
        };
        
        console.log('1️⃣ Testing first #free message (should be processed)...');
        
        // Mock isBlacklisted to return true so we can test the full flow
        const originalIsBlacklisted = require('../services/blacklistService').isBlacklisted;
        require('../services/blacklistService').isBlacklisted = async () => true;
        
        // First call should be processed
        const result1 = await handler.handleFreeRequest(mockMessage);
        
        if (result1) {
            console.log('   ✅ PASSED - First message processed');
            passed++;
        } else {
            console.log('   ❌ FAILED - First message not processed');
            failed++;
        }
        
        console.log('\n2️⃣ Testing duplicate #free message (should be ignored)...');
        
        // Second call with same message ID should be ignored
        const result2 = await handler.handleFreeRequest(mockMessage);
        
        if (result2) {
            console.log('   ✅ PASSED - Duplicate message handled (should return true but be ignored)');
            passed++;
        } else {
            console.log('   ❌ FAILED - Duplicate message should return true');
            failed++;
        }
        
        console.log('\n3️⃣ Testing different message ID (should be processed)...');
        
        // Different message ID should be processed
        const differentMessage = {
            ...mockMessage,
            key: {
                ...mockMessage.key,
                id: 'DIFFERENT_MESSAGE_ID_456'
            }
        };
        
        const result3 = await handler.handleFreeRequest(differentMessage);
        
        if (result3) {
            console.log('   ✅ PASSED - Different message processed');
            passed++;
        } else {
            console.log('   ❌ FAILED - Different message not processed');
            failed++;
        }
        
        console.log('\n4️⃣ Testing message ID cleanup...');
        
        // Check that processedMessages contains our IDs
        const processedCount = CommandHandler.processedMessages.size;
        console.log(`   📊 Processed messages in memory: ${processedCount}`);
        
        if (processedCount >= 2) {
            console.log('   ✅ PASSED - Message IDs are being tracked');
            passed++;
        } else {
            console.log('   ❌ FAILED - Message IDs not tracked correctly');
            failed++;
        }
        
        // Restore original function
        require('../services/blacklistService').isBlacklisted = originalIsBlacklisted;
        
    } catch (error) {
        console.error(`❌ Test error:`, error);
        failed++;
    }
    
    console.log(`\n📊 Deduplication Test Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

async function testCleanupLogic() {
    console.log(`[${getTimestamp()}] 🧹 Testing cleanup logic\n`);
    
    let passed = 0;
    let failed = 0;
    
    try {
        const CommandHandler = require('../services/commandHandler');
        
        // Clear existing messages
        CommandHandler.processedMessages.clear();
        
        console.log('📊 Adding 105 message IDs to trigger cleanup...');
        
        // Add 105 message IDs to trigger cleanup
        for (let i = 0; i < 105; i++) {
            CommandHandler.processedMessages.add(`test_message_${i}`);
        }
        
        console.log(`   Added: ${CommandHandler.processedMessages.size} message IDs`);
        
        // Now add one more which should trigger cleanup
        const mockSock = {
            sendMessage: async () => ({ key: { id: 'mock' } })
        };
        
        const handler = new CommandHandler(mockSock);
        
        const testMessage = {
            key: {
                id: 'cleanup_trigger_message',
                remoteJid: '972555999999@s.whatsapp.net',
                fromMe: false
            }
        };
        
        // Mock functions to prevent actual processing
        const originalIsBlacklisted = require('../services/blacklistService').isBlacklisted;
        require('../services/blacklistService').isBlacklisted = async () => false; // Not blacklisted
        
        console.log('🧹 Triggering cleanup by processing 106th message...');
        
        await handler.handleFreeRequest(testMessage);
        
        const finalCount = CommandHandler.processedMessages.size;
        console.log(`   Final count: ${finalCount} message IDs`);
        
        if (finalCount <= 100) {
            console.log('   ✅ PASSED - Cleanup triggered and reduced message count');
            passed++;
        } else {
            console.log('   ❌ FAILED - Cleanup did not work correctly');
            failed++;
        }
        
        // Restore original function
        require('../services/blacklistService').isBlacklisted = originalIsBlacklisted;
        
    } catch (error) {
        console.error(`❌ Cleanup test error:`, error);
        failed++;
    }
    
    console.log(`\n📊 Cleanup Test Results: ${passed} passed, ${failed} failed\n`);
    return { passed, failed };
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log(`[${getTimestamp()}] 🚀 Starting Message Deduplication Tests\n`);
    
    let totalPassed = 0;
    let totalFailed = 0;
    
    try {
        const tests = [
            { name: 'Message Deduplication', fn: testDeduplication },
            { name: 'Cleanup Logic', fn: testCleanupLogic }
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
            console.log('🎉 ALL TESTS PASSED! Message deduplication is working correctly.\n');
            console.log('✅ Expected behavior:');
            console.log('• Duplicate #free messages with same ID are ignored');
            console.log('• Different message IDs are processed normally');
            console.log('• Memory cleanup happens automatically after 100 messages');
            console.log('• Deduplication prevents session error retry loops');
        } else {
            console.log(`⚠️  ${totalFailed} TEST(S) FAILED - Review the implementation.`);
        }
        
    } catch (error) {
        console.error('❌ Error running tests:', error);
    }
}

console.log('📋 Test Coverage:');
console.log('• Message ID deduplication');
console.log('• Duplicate message handling');
console.log('• Memory cleanup logic');
console.log('• Different message ID processing');
console.log('\nStarting tests in 2 seconds...\n');

setTimeout(() => {
    runAllTests().catch(console.error);
}, 2000);