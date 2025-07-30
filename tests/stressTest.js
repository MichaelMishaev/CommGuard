// Stress test for bCommGuard bot - tests performance under load

const config = require('../config');

console.log(`
╔════════════════════════════════════════════╗
║        🔥 Stress Test for bCommGuard        ║
╚════════════════════════════════════════════╝
`);

// Simulate various message patterns
const testMessages = [
    'Join my group: https://chat.whatsapp.com/ABCDEFGHIJK123',
    'Check out https://whatsapp.com/chat/XYZ789ABCDEF',
    'Multiple links: https://chat.whatsapp.com/AAA111 and https://chat.whatsapp.com/BBB222',
    'This is a normal message without any links',
    'Visit our website at https://example.com',
    'Contact me on WhatsApp',
    'https://chat.whatsapp.com/CCC333 - join now!',
    'Hey everyone, how are you today?',
    'Don\'t forget to join https://whatsapp.com/chat/DDD444',
];

// Performance metrics
const metrics = {
    totalMessages: 0,
    inviteLinksDetected: 0,
    processingTimes: [],
    startTime: Date.now(),
};

// Function to process a message and measure performance
function processMessage(message) {
    const start = performance.now();
    
    // Check for invite links
    const matches = message.match(config.PATTERNS.INVITE_LINK);
    const hasInviteLink = matches && matches.length > 0;
    
    const end = performance.now();
    const processingTime = end - start;
    
    metrics.totalMessages++;
    metrics.processingTimes.push(processingTime);
    
    if (hasInviteLink) {
        metrics.inviteLinksDetected++;
    }
    
    return { hasInviteLink, processingTime, matches };
}

// Run stress test
async function runStressTest(messageCount = 10000) {
    console.log(`\n📊 Running stress test with ${messageCount} messages...\n`);
    
    const batchSize = 1000;
    const batches = Math.ceil(messageCount / batchSize);
    
    for (let batch = 0; batch < batches; batch++) {
        const batchStart = batch * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, messageCount);
        
        console.log(`Processing batch ${batch + 1}/${batches} (messages ${batchStart + 1}-${batchEnd})...`);
        
        for (let i = batchStart; i < batchEnd; i++) {
            // Pick a random test message
            const message = testMessages[Math.floor(Math.random() * testMessages.length)];
            processMessage(message);
        }
        
        // Small delay between batches to simulate real-world conditions
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Calculate statistics
    const totalTime = Date.now() - metrics.startTime;
    const avgProcessingTime = metrics.processingTimes.reduce((a, b) => a + b, 0) / metrics.processingTimes.length;
    const maxProcessingTime = Math.max(...metrics.processingTimes);
    const minProcessingTime = Math.min(...metrics.processingTimes);
    const messagesPerSecond = (metrics.totalMessages / totalTime) * 1000;
    
    // Display results
    console.log(`
╔════════════════════════════════════════════╗
║           📈 Stress Test Results            ║
╚════════════════════════════════════════════╝

📊 Performance Metrics:
   Total Messages Processed: ${metrics.totalMessages.toLocaleString()}
   Invite Links Detected: ${metrics.inviteLinksDetected.toLocaleString()}
   Detection Rate: ${((metrics.inviteLinksDetected / metrics.totalMessages) * 100).toFixed(2)}%
   
⏱️  Timing Statistics:
   Total Test Duration: ${(totalTime / 1000).toFixed(2)} seconds
   Messages Per Second: ${messagesPerSecond.toFixed(2)}
   
   Average Processing Time: ${avgProcessingTime.toFixed(4)} ms
   Min Processing Time: ${minProcessingTime.toFixed(4)} ms
   Max Processing Time: ${maxProcessingTime.toFixed(4)} ms
   
💾 Memory Usage:
   Heap Used: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
   RSS: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB
`);
    
    // Performance assessment
    console.log('🎯 Performance Assessment:');
    if (messagesPerSecond > 10000) {
        console.log('   ✅ EXCELLENT - Can handle high-volume groups');
    } else if (messagesPerSecond > 5000) {
        console.log('   ✅ GOOD - Suitable for most use cases');
    } else if (messagesPerSecond > 1000) {
        console.log('   ⚠️  ACCEPTABLE - May struggle with very active groups');
    } else {
        console.log('   ❌ POOR - Performance optimization needed');
    }
    
    if (avgProcessingTime < 0.1) {
        console.log('   ✅ Processing time is excellent');
    } else if (avgProcessingTime < 1) {
        console.log('   ✅ Processing time is good');
    } else {
        console.log('   ⚠️  Processing time could be improved');
    }
    
    console.log('\n✅ Stress test completed!\n');
}

// Memory leak detection
function checkMemoryUsage() {
    const used = process.memoryUsage();
    console.log('\n💾 Current Memory Usage:');
    for (let key in used) {
        console.log(`   ${key}: ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
    }
}

// Run different stress test scenarios
async function main() {
    console.log('Starting stress tests...\n');
    
    // Test 1: Small load
    console.log('Test 1: Small Load (1,000 messages)');
    await runStressTest(1000);
    checkMemoryUsage();
    
    // Test 2: Medium load
    console.log('\nTest 2: Medium Load (10,000 messages)');
    await runStressTest(10000);
    checkMemoryUsage();
    
    // Test 3: High load
    console.log('\nTest 3: High Load (100,000 messages)');
    await runStressTest(100000);
    checkMemoryUsage();
    
    console.log('\n🏁 All stress tests completed!');
}

// Run tests
main().catch(console.error);