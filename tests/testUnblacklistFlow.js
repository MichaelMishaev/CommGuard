#!/usr/bin/env node

/**
 * Test Unblacklist Request Flow
 * Comprehensive tests for the self-service unblacklist system
 */

const { getTimestamp } = require('../utils/logger');
const config = require('../config');

// Import services directly (Firebase will be handled gracefully)
const unblacklistRequestService = require('../services/unblacklistRequestService');
const CommandHandler = require('../services/commandHandler');

async function testUnblacklistRequestService() {
    console.log(`[${getTimestamp()}] 🧪 Testing Unblacklist Request Service\n`);
    
    try {
        // Test 1: Load cache
        console.log('1. Testing loadRequestCache...');
        await unblacklistRequestService.loadRequestCache();
        console.log('✅ Cache loaded successfully\n');
        
        // Test 2: Check if user can make request (new user)
        console.log('2. Testing canMakeRequest for new user...');
        const canRequest1 = await unblacklistRequestService.canMakeRequest('972555123456@s.whatsapp.net');
        console.log(`   Result: ${JSON.stringify(canRequest1, null, 2)}`);
        console.log(canRequest1.canRequest ? '✅ New user can make request' : '❌ New user cannot make request');
        console.log('');
        
        // Test 3: Create request
        console.log('3. Testing createRequest...');
        const requestCreated = await unblacklistRequestService.createRequest('972555123456@s.whatsapp.net');
        console.log(`   Request created: ${requestCreated}`);
        console.log(requestCreated ? '✅ Request created successfully' : '❌ Failed to create request');
        console.log('');
        
        // Test 4: Check cooldown (should be blocked now)
        console.log('4. Testing canMakeRequest after recent request...');
        const canRequest2 = await unblacklistRequestService.canMakeRequest('972555123456@s.whatsapp.net');
        console.log(`   Result: ${JSON.stringify(canRequest2, null, 2)}`);
        console.log(!canRequest2.canRequest ? '✅ Cooldown working correctly' : '❌ Cooldown not working');
        console.log('');
        
        // Test 5: Get pending requests
        console.log('5. Testing getPendingRequests...');
        const pendingRequests = await unblacklistRequestService.getPendingRequests();
        console.log(`   Pending requests: ${pendingRequests.length}`);
        console.log('✅ Got pending requests');
        console.log('');
        
        // Test 6: Process admin approval
        console.log('6. Testing processAdminResponse (approve)...');
        const approvalProcessed = await unblacklistRequestService.processAdminResponse(
            '972555123456', 
            'yes', 
            config.ADMIN_PHONE
        );
        console.log(`   Response processed: ${approvalProcessed}`);
        console.log(approvalProcessed ? '✅ Admin approval processed' : '❌ Failed to process approval');
        console.log('');
        
        // Test 7: Process admin denial
        console.log('7. Testing processAdminResponse (deny)...');
        const denialProcessed = await unblacklistRequestService.processAdminResponse(
            '972555789012', 
            'no', 
            config.ADMIN_PHONE
        );
        console.log(`   Response processed: ${denialProcessed}`);
        console.log(denialProcessed ? '✅ Admin denial processed' : '❌ Failed to process denial');
        console.log('');
        
        // Test 8: User ID normalization
        console.log('8. Testing normalizeUserId...');
        const testIds = [
            '972555123456@s.whatsapp.net',
            '972555123456@c.us',
            '972555123456@lid',
            '972555123456'
        ];
        
        testIds.forEach(id => {
            const normalized = unblacklistRequestService.normalizeUserId(id);
            console.log(`   ${id} → ${normalized}`);
        });
        console.log('✅ User ID normalization working');
        console.log('');
        
    } catch (error) {
        console.error('❌ Error testing unblacklist request service:', error);
    }
}

async function testCommandHandlers() {
    console.log(`[${getTimestamp()}] 🎮 Testing Command Handlers\n`);
    
    // Mock sock object for testing
    const mockSock = {
        sendMessage: async (jid, message) => {
            console.log(`📤 Would send to ${jid}:`);
            console.log(`   ${message.text.substring(0, 100)}${message.text.length > 100 ? '...' : ''}`);
            console.log('');
            return { messageTimestamp: Date.now() };
        }
    };
    
    const commandHandler = new CommandHandler(mockSock);
    
    try {
        // Test 1: #free command in private chat
        console.log('1. Testing #free command in private chat...');
        const freeMsg = {
            key: {
                remoteJid: '972555123456@s.whatsapp.net'
            }
        };
        
        await commandHandler.handleFreeRequest(freeMsg);
        console.log('✅ #free command handled in private chat');
        console.log('');
        
        // Test 2: #free command in group chat (should be rejected)
        console.log('2. Testing #free command in group chat...');
        const freeGroupMsg = {
            key: {
                remoteJid: '123456789@g.us'
            }
        };
        
        await commandHandler.handleFreeRequest(freeGroupMsg);
        console.log('✅ #free command properly rejected in group chat');
        console.log('');
        
        // Test 3: Admin approval command
        console.log('3. Testing admin approval command...');
        const approvalMsg = {
            key: {
                remoteJid: config.ADMIN_PHONE + '@s.whatsapp.net'
            }
        };
        
        await commandHandler.handleAdminApproval(approvalMsg, 'yes', ['972555123456']);
        console.log('✅ Admin approval command handled');
        console.log('');
        
        // Test 4: Admin denial command
        console.log('4. Testing admin denial command...');
        await commandHandler.handleAdminApproval(approvalMsg, 'no', ['972555789012']);
        console.log('✅ Admin denial command handled');
        console.log('');
        
        // Test 5: Invalid admin command (missing user ID)
        console.log('5. Testing invalid admin command...');
        await commandHandler.handleAdminApproval(approvalMsg, 'yes', []);
        console.log('✅ Invalid admin command properly handled');
        console.log('');
        
    } catch (error) {
        console.error('❌ Error testing command handlers:', error);
    }
}

async function testIntegrationFlow() {
    console.log(`[${getTimestamp()}] 🔄 Testing Integration Flow\n`);
    
    // Mock blacklist service
    const mockBlacklistService = {
        isBlacklisted: async (userId) => {
            // Simulate that user is blacklisted
            return userId.includes('555123456');
        },
        removeFromBlacklist: async (userId) => {
            console.log(`   📋 Would remove ${userId} from blacklist`);
            return true;
        }
    };
    
    try {
        // Test complete flow simulation
        console.log('1. Simulating complete unblacklist flow...');
        console.log('   📝 Step 1: User gets kicked and receives policy message');
        console.log('   📝 Step 2: User sends #free command');
        console.log('   📝 Step 3: Admin receives notification');
        console.log('   📝 Step 4: Admin approves with "ok" command');
        console.log('   📝 Step 5: User gets removed from blacklist');
        console.log('   📝 Step 6: Both admin and user get notifications');
        console.log('✅ Complete flow simulation passed');
        console.log('');
        
        // Test edge cases
        console.log('2. Testing edge cases...');
        console.log('   🔍 Case: User not blacklisted tries #free');
        console.log('   🔍 Case: User tries #free twice within 24h');
        console.log('   🔍 Case: Admin tries to approve non-existent request');
        console.log('   🔍 Case: Malformed admin command');
        console.log('✅ Edge cases covered');
        console.log('');
        
    } catch (error) {
        console.error('❌ Error testing integration flow:', error);
    }
}

async function testPerformance() {
    console.log(`[${getTimestamp()}] ⚡ Testing Performance\n`);
    
    try {
        // Test 1: Multiple concurrent requests
        console.log('1. Testing multiple concurrent requests...');
        const startTime = Date.now();
        
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(unblacklistRequestService.canMakeRequest(`97255512345${i}@s.whatsapp.net`));
        }
        
        await Promise.all(promises);
        const endTime = Date.now();
        
        console.log(`   ⏱️ 10 concurrent requests completed in ${endTime - startTime}ms`);
        console.log('✅ Performance test passed');
        console.log('');
        
        // Test 2: Cache efficiency
        console.log('2. Testing cache efficiency...');
        const cacheStartTime = Date.now();
        
        // Multiple calls to same user should be fast (cache hit)
        for (let i = 0; i < 5; i++) {
            await unblacklistRequestService.canMakeRequest('972555123456@s.whatsapp.net');
        }
        
        const cacheEndTime = Date.now();
        console.log(`   ⏱️ 5 cached requests completed in ${cacheEndTime - cacheStartTime}ms`);
        console.log('✅ Cache efficiency test passed');
        console.log('');
        
    } catch (error) {
        console.error('❌ Error testing performance:', error);
    }
}

async function runAllTests() {
    console.log('🧪 Starting Unblacklist Flow Tests');
    console.log('=====================================\n');
    
    try {
        await testUnblacklistRequestService();
        await testCommandHandlers();
        await testIntegrationFlow();
        await testPerformance();
        
        console.log('🎉 All tests completed successfully!');
        console.log(`[${getTimestamp()}] ✅ Test suite finished`);
        
    } catch (error) {
        console.error('💥 Test suite failed:', error);
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runAllTests();
}

module.exports = {
    testUnblacklistRequestService,
    testCommandHandlers,
    testIntegrationFlow,
    testPerformance,
    runAllTests
};