#!/usr/bin/env node
/**
 * Test Timestamp-Based Message Filtering
 * Shows how messages from while bot was down are ignored for fast startup
 */

const { getTimestamp } = require('../utils/logger');

function testTimestampFiltering() {
    console.log(`[${getTimestamp()}] 🧪 TIMESTAMP MESSAGE FILTERING TEST`);
    console.log('===============================================\n');
    
    console.log('1. Simulating Bot Startup and Message Processing');
    console.log('-----------------------------------------------');
    
    // Simulate bot startup time
    const BOT_START_TIME = Date.now();
    const MESSAGE_GRACE_PERIOD = 60000; // 60 seconds
    
    console.log(`🚀 Bot startup time: ${new Date(BOT_START_TIME).toLocaleString()}`);
    console.log(`⏰ Message cutoff time: ${new Date(BOT_START_TIME - MESSAGE_GRACE_PERIOD).toLocaleString()}`);
    console.log(`📝 Grace period: ${MESSAGE_GRACE_PERIOD / 1000} seconds\n`);
    
    // Helper function (same as in index.js)
    function shouldIgnoreOldMessage(msg, botStartTime = BOT_START_TIME, gracePeriod = MESSAGE_GRACE_PERIOD) {
        if (!msg.messageTimestamp) {
            return false;
        }
        
        const messageTime = msg.messageTimestamp * 1000;
        const cutoffTime = botStartTime - gracePeriod;
        
        if (messageTime < cutoffTime) {
            const messageAge = Math.floor((botStartTime - messageTime) / 1000);
            return { ignore: true, age: messageAge };
        }
        
        return { ignore: false, age: 0 };
    }
    
    console.log('2. Testing Various Message Scenarios');
    console.log('-----------------------------------');
    
    const now = Date.now();
    const testMessages = [
        {
            name: 'Message from 10 minutes ago (while bot was down)',
            messageTimestamp: Math.floor((now - 600000) / 1000), // 10 minutes ago
            from: '972555123456@s.whatsapp.net'
        },
        {
            name: 'Message from 5 minutes ago (while bot was down)', 
            messageTimestamp: Math.floor((now - 300000) / 1000), // 5 minutes ago
            from: '159176470851724@lid' // @lid user from production logs
        },
        {
            name: 'Message from 2 minutes ago (while bot was down)',
            messageTimestamp: Math.floor((now - 120000) / 1000), // 2 minutes ago
            from: '972555654321@s.whatsapp.net'
        },
        {
            name: 'Message from 30 seconds ago (within grace period)',
            messageTimestamp: Math.floor((now - 30000) / 1000), // 30 seconds ago
            from: '972555111222@s.whatsapp.net'
        },
        {
            name: 'Message from right now (new message)',
            messageTimestamp: Math.floor(now / 1000), // Now
            from: '972555333444@s.whatsapp.net'
        },
        {
            name: 'Message from 1 hour ago (old backlog)',
            messageTimestamp: Math.floor((now - 3600000) / 1000), // 1 hour ago
            from: '240999842468049@lid' // @lid user from production logs
        },
        {
            name: 'Message with no timestamp',
            messageTimestamp: null,
            from: '972555555666@s.whatsapp.net'
        }
    ];
    
    let processedCount = 0;
    let skippedCount = 0;
    let totalProcessingTime = 0;
    
    for (const msg of testMessages) {
        console.log(`\nTesting: ${msg.name}`);
        console.log(`From: ${msg.from}`);
        
        if (msg.messageTimestamp) {
            console.log(`Timestamp: ${new Date(msg.messageTimestamp * 1000).toLocaleString()}`);
        } else {
            console.log(`Timestamp: None`);
        }
        
        const result = shouldIgnoreOldMessage(msg);
        
        if (result.ignore) {
            console.log(`🚫 IGNORED (${result.age}s old) - saves ~200ms decryption time`);
            skippedCount++;
            // No processing time for skipped messages
        } else {
            console.log(`✅ PROCESSED - normal message handling`);
            processedCount++;
            totalProcessingTime += 50; // Estimated 50ms per processed message
        }
    }
    
    console.log('\n📊 FILTERING RESULTS');
    console.log('===================');
    console.log(`✅ Messages processed: ${processedCount}`);
    console.log(`🚫 Old messages skipped: ${skippedCount}`);
    console.log(`⚡ Processing time: ~${totalProcessingTime}ms`);
    console.log(`💾 Time saved: ~${skippedCount * 200}ms (skipped decryption attempts)`);
    
    console.log('\n3. Production Scenario Simulation');
    console.log('--------------------------------');
    
    // Simulate production scenario with many backlog messages
    const productionMessages = [];
    
    // Generate 200 old messages (from while bot was down)
    for (let i = 0; i < 200; i++) {
        const messageAge = Math.random() * 3600; // Random age up to 1 hour
        productionMessages.push({
            messageTimestamp: Math.floor((now - (messageAge * 1000)) / 1000),
            from: Math.random() > 0.7 ? `${Math.floor(Math.random() * 999999999999999)}@lid` : 
                                        `972555${Math.floor(Math.random() * 999999)}@s.whatsapp.net`
        });
    }
    
    // Add 10 new messages (after bot startup)
    for (let i = 0; i < 10; i++) {
        productionMessages.push({
            messageTimestamp: Math.floor((now + (Math.random() * 30000)) / 1000), // Up to 30s in future
            from: `972555${Math.floor(Math.random() * 999999)}@s.whatsapp.net`
        });
    }
    
    let prodProcessed = 0;
    let prodSkipped = 0;
    
    for (const msg of productionMessages) {
        const result = shouldIgnoreOldMessage(msg);
        if (result.ignore) {
            prodSkipped++;
        } else {
            prodProcessed++;
        }
    }
    
    console.log(`📨 Total messages in backlog: ${productionMessages.length}`);
    console.log(`🚫 Old messages skipped: ${prodSkipped}`);
    console.log(`✅ New messages processed: ${prodProcessed}`);
    
    const oldStartupTime = prodSkipped * 0.2 + prodProcessed * 0.05; // 200ms per @lid error, 50ms per normal
    const newStartupTime = prodProcessed * 0.05; // Only process new messages
    const timeSaved = oldStartupTime - newStartupTime;
    
    console.log('\n⏱️ STARTUP TIME COMPARISON');
    console.log('==========================');
    console.log(`Without filtering: ${oldStartupTime.toFixed(1)}s`);
    console.log(`With timestamp filtering: ${newStartupTime.toFixed(1)}s`);
    console.log(`⚡ Time saved: ${timeSaved.toFixed(1)}s (${Math.round(timeSaved/oldStartupTime*100)}% faster)`);
    
    console.log('\n🎯 EXPECTED PRODUCTION BENEFITS');
    console.log('==============================');
    console.log('✅ Startup time: 2-3 seconds instead of 6+ minutes');
    console.log('✅ No session decryption errors for old messages');
    console.log('✅ Bot responds immediately to new messages');
    console.log('✅ Works for both @lid and @s.whatsapp.net users');
    console.log('✅ Simple and reliable - no complex session handling');
    
    console.log('\n⚠️ TRADE-OFFS');
    console.log('==============');
    console.log('• Old messages from downtime are not processed');
    console.log('• Potential missed invite links from while bot was down');  
    console.log('• Groups were unprotected during downtime anyway');
    console.log('• Much faster startup is worth the trade-off');
    
    console.log('\n🔧 IMPLEMENTATION DETAILS');
    console.log('=========================');
    console.log(`• Bot start time: ${new Date(BOT_START_TIME).toISOString()}`);
    console.log(`• Grace period: ${MESSAGE_GRACE_PERIOD / 1000}s (handles clock differences)`);
    console.log(`• Cutoff time: ${new Date(BOT_START_TIME - MESSAGE_GRACE_PERIOD).toISOString()}`);
    console.log(`• Messages older than cutoff: IGNORED`);
    console.log(`• Messages newer than cutoff: PROCESSED`);
    
    console.log(`\n[${getTimestamp()}] ✅ Timestamp filtering test completed`);
}

// Run test
if (require.main === module) {
    testTimestampFiltering();
}

module.exports = { testTimestampFiltering };