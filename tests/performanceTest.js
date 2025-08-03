#!/usr/bin/env node

/**
 * Performance Testing Suite
 * Load testing and stress testing for the unblacklist system
 */

const { getTimestamp } = require('../utils/logger');

async function testConcurrentRequests() {
    console.log('⚡ PERFORMANCE TESTING SUITE');
    console.log('===========================\n');

    const service = require('../services/unblacklistRequestService');

    console.log('1. TESTING CONCURRENT API CALLS');
    console.log('-------------------------------');

    const startTime = Date.now();
    
    // Test 50 concurrent canMakeRequest calls
    const promises = [];
    for (let i = 0; i < 50; i++) {
        promises.push(service.canMakeRequest(`97255512345${i.toString().padStart(2, '0')}@s.whatsapp.net`));
    }
    
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    const duration = endTime - startTime;
    const avgPerCall = duration / 50;
    
    console.log(`📊 Results:`);
    console.log(`   Total time: ${duration}ms`);
    console.log(`   Average per call: ${avgPerCall.toFixed(2)}ms`);
    console.log(`   Calls per second: ${Math.round(1000 / avgPerCall)}`);
    console.log(`   All calls successful: ${results.every(r => r.canRequest === true)}`);
    
    const performanceGood = avgPerCall < 100; // Should be under 100ms per call
    console.log(`${performanceGood ? '✅' : '❌'} Performance: ${performanceGood ? 'GOOD' : 'NEEDS IMPROVEMENT'}`);
    
    return performanceGood;
}

async function testMemoryUsage() {
    console.log('\n2. TESTING MEMORY USAGE');
    console.log('-----------------------');

    const service = require('../services/unblacklistRequestService');
    
    // Get initial memory usage
    const initialMemory = process.memoryUsage();
    console.log(`📊 Initial memory usage: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);
    
    // Create many requests to test memory usage
    const requests = [];
    for (let i = 0; i < 1000; i++) {
        requests.push(service.canMakeRequest(`972555${i.toString().padStart(6, '0')}@s.whatsapp.net`));
    }
    
    await Promise.all(requests);
    
    // Check memory after operations
    const afterMemory = process.memoryUsage();
    const memoryIncrease = (afterMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
    
    console.log(`📊 Memory after 1000 operations: ${Math.round(afterMemory.heapUsed / 1024 / 1024)}MB`);
    console.log(`📊 Memory increase: ${memoryIncrease.toFixed(2)}MB`);
    
    const memoryGood = memoryIncrease < 50; // Should not increase by more than 50MB
    console.log(`${memoryGood ? '✅' : '❌'} Memory usage: ${memoryGood ? 'EFFICIENT' : 'HIGH'}`);
    
    return memoryGood;
}

async function testCommandHandlerPerformance() {
    console.log('\n3. TESTING COMMAND HANDLER PERFORMANCE');
    console.log('--------------------------------------');

    const CommandHandler = require('../services/commandHandler');
    
    // Mock socket that doesn't actually send messages
    const mockSock = {
        sendMessage: async () => ({ messageTimestamp: Date.now() })
    };
    
    const handler = new CommandHandler(mockSock);
    
    const startTime = Date.now();
    
    // Test 100 command processing calls
    const promises = [];
    for (let i = 0; i < 100; i++) {
        const msg = {
            key: { remoteJid: `97255512345${i.toString().padStart(2, '0')}@s.whatsapp.net` }
        };
        promises.push(handler.handleFreeRequest(msg));
    }
    
    await Promise.all(promises);
    const endTime = Date.now();
    
    const duration = endTime - startTime;
    const avgPerCommand = duration / 100;
    
    console.log(`📊 Results:`);
    console.log(`   Total time: ${duration}ms`);
    console.log(`   Average per command: ${avgPerCommand.toFixed(2)}ms`);
    console.log(`   Commands per second: ${Math.round(1000 / avgPerCommand)}`);
    
    const commandPerformanceGood = avgPerCommand < 200; // Should be under 200ms per command
    console.log(`${commandPerformanceGood ? '✅' : '❌'} Command performance: ${commandPerformanceGood ? 'GOOD' : 'NEEDS IMPROVEMENT'}`);
    
    return commandPerformanceGood;
}

async function testFirebaseLoadHandling() {
    console.log('\n4. TESTING FIREBASE LOAD HANDLING');
    console.log('---------------------------------');

    const service = require('../services/unblacklistRequestService');
    
    // Test creating multiple requests in sequence to stress Firebase
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < 20; i++) {
        try {
            const result = await service.createRequest(`972555777${i.toString().padStart(3, '0')}@s.whatsapp.net`);
            if (result) successCount++;
        } catch (error) {
            errorCount++;
        }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`📊 Results:`);
    console.log(`   Total time: ${duration}ms`);
    console.log(`   Successful creates: ${successCount}/20`);
    console.log(`   Errors: ${errorCount}/20`);
    console.log(`   Average per create: ${(duration / 20).toFixed(2)}ms`);
    
    const firebasePerformanceGood = successCount >= 18 && duration < 10000; // At least 90% success, under 10s total
    console.log(`${firebasePerformanceGood ? '✅' : '❌'} Firebase performance: ${firebasePerformanceGood ? 'GOOD' : 'NEEDS IMPROVEMENT'}`);
    
    return firebasePerformanceGood;
}

async function testStressScenarios() {
    console.log('\n5. TESTING STRESS SCENARIOS');
    console.log('---------------------------');

    const service = require('../services/unblacklistRequestService');
    
    console.log('Testing rapid repeated calls from same user...');
    const sameUserStartTime = Date.now();
    
    // Simulate user spamming #free command
    const sameUserPromises = [];
    for (let i = 0; i < 10; i++) {
        sameUserPromises.push(service.canMakeRequest('972555123456@s.whatsapp.net'));
    }
    
    const sameUserResults = await Promise.all(sameUserPromises);
    const sameUserEndTime = Date.now();
    
    // Should handle gracefully (all should return same result)
    const consistentResponse = sameUserResults.every(r => r.canRequest === sameUserResults[0].canRequest);
    
    console.log(`📊 Same user rapid calls:`);
    console.log(`   Time: ${sameUserEndTime - sameUserStartTime}ms`);
    console.log(`   Consistent responses: ${consistentResponse}`);
    console.log(`${consistentResponse ? '✅' : '❌'} Stress handling: ${consistentResponse ? 'ROBUST' : 'INCONSISTENT'}`);
    
    return consistentResponse;
}

async function runPerformanceTests() {
    console.log(`[${getTimestamp()}] 🚀 STARTING PERFORMANCE TEST SUITE\n`);

    const results = {
        concurrent: false,
        memory: false,
        commands: false,
        firebase: false,
        stress: false
    };

    try {
        results.concurrent = await testConcurrentRequests();
        results.memory = await testMemoryUsage();
        results.commands = await testCommandHandlerPerformance();
        results.firebase = await testFirebaseLoadHandling();
        results.stress = await testStressScenarios();

        console.log('\n🎯 PERFORMANCE TEST SUMMARY');
        console.log('===========================');
        console.log(`⚡ Concurrent Requests: ${results.concurrent ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`💾 Memory Usage: ${results.memory ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`🎮 Command Performance: ${results.commands ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`🔥 Firebase Load: ${results.firebase ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`💪 Stress Handling: ${results.stress ? '✅ PASSED' : '❌ FAILED'}`);

        const passedTests = Object.values(results).filter(r => r).length;
        const totalTests = Object.values(results).length;

        console.log(`\n📊 PERFORMANCE SCORE: ${passedTests}/${totalTests} (${Math.round(passedTests/totalTests*100)}%)`);

        if (passedTests >= 4) { // Allow 1 failure
            console.log('\n🎉 PERFORMANCE TESTS PASSED - SYSTEM PERFORMS WELL UNDER LOAD!');
        } else {
            console.log('\n⚠️  PERFORMANCE ISSUES DETECTED - OPTIMIZATION NEEDED');
        }

        console.log(`\n[${getTimestamp()}] 🏁 PERFORMANCE TESTING COMPLETED`);

    } catch (error) {
        console.error('💥 Performance testing failed:', error);
        return false;
    }

    return true;
}

// Run performance tests if this file is executed directly
if (require.main === module) {
    runPerformanceTests();
}

module.exports = {
    testConcurrentRequests,
    testMemoryUsage,
    testCommandHandlerPerformance,
    testFirebaseLoadHandling,
    testStressScenarios,
    runPerformanceTests
};