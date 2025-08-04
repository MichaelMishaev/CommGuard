#!/usr/bin/env node

/**
 * Debug Duplicate Message Issue
 * Analyzes why user gets success message twice
 */

const { getTimestamp } = require('./utils/logger');

console.log(`
╔════════════════════════════════════════════════════╗
║           🔍 Debug Duplicate Message Issue          ║
║                                                    ║
║  Investigating why user gets success message twice ║
╚════════════════════════════════════════════════════╝
`);

function analyzeMessageFlow() {
    console.log(`[${getTimestamp()}] 🔍 Analyzing message flow\n`);
    
    console.log('📋 Current Message Flow Analysis:');
    
    console.log('\n1️⃣ User sends #free in private chat');
    console.log('   ↓');
    console.log('2️⃣ Private message handler (index.js ~472)');
    console.log('   • Command detected: #free');
    console.log('   • Calls: commandHandler.handleCommand()');
    console.log('   • Routes to: handleFreeRequest()');
    console.log('   ↓');
    console.log('3️⃣ handleFreeRequest() in commandHandler.js');
    console.log('   • Checks if private chat ✓');
    console.log('   • Checks if blacklisted');
    console.log('   • Checks cooldown (bypassed for test number)');
    console.log('   • Calls: unblacklistRequestService.createRequest()');
    console.log('   • Sends success message to user');
    console.log('   • Sends notification to admin');
    console.log('   ↓');
    console.log('4️⃣ User receives message');
    
    console.log('\n🤔 POSSIBLE CAUSES OF DUPLICATION:');
    console.log('   A) handleCommand called twice from different places');
    console.log('   B) handleFreeRequest called twice');
    console.log('   C) Message sending logic duplicated');
    console.log('   D) Session/connection issue causing retry');
    console.log('   E) WhatsApp client receiving message twice');
    
    console.log('\n🕵️ INVESTIGATION STEPS:');
    console.log('   1. Check if private chat detection is working correctly');
    console.log('   2. Look for multiple handleCommand calls');
    console.log('   3. Check if message is being processed in both private and group handlers');
    console.log('   4. Look for async/await issues causing race conditions');
    console.log('   5. Check session errors impact on message delivery');
    
    console.log('\n📊 FROM USER LOGS:');
    console.log('   • User sent #free once');
    console.log('   • Bot logged: "📨 Unblacklist request created for 972555030746"');
    console.log('   • But user received success message twice');
    console.log('   • Session errors occurred around same time');
    
    console.log('\n💡 LIKELY CAUSE:');
    console.log('   The session decryption errors ("Bad MAC", "No matching sessions")');
    console.log('   might be causing WhatsApp to retry message delivery,');
    console.log('   which could trigger duplicate processing.');
    
    console.log('\n🔧 POTENTIAL SOLUTIONS:');
    console.log('   1. Add request deduplication in handleFreeRequest');
    console.log('   2. Fix session errors to prevent retries');
    console.log('   3. Add message ID tracking to prevent duplicate processing');
    console.log('   4. Add cooldown even for test numbers (short cooldown)');
}

function proposeDeduplicationFix() {
    console.log(`\n[${getTimestamp()}] 🔧 Proposing deduplication fix\n`);
    
    console.log('💡 SOLUTION: Add message deduplication to handleFreeRequest');
    console.log('');
    console.log('Add at the beginning of handleFreeRequest():');
    console.log('═══════════════════════════════════════════════════');
    console.log(`
// Track processed messages to prevent duplicates
static processedMessages = new Set();

async handleFreeRequest(msg) {
    const messageId = msg.key.id;
    const userId = msg.key.remoteJid;
    
    // Check if we already processed this exact message
    if (this.processedMessages.has(messageId)) {
        console.log(\`[...] ⚠️ Duplicate #free message ignored: \${messageId}\`);
        return true;
    }
    
    // Mark message as processed
    this.processedMessages.add(messageId);
    
    // Clean up old message IDs (keep only last 100)
    if (this.processedMessages.size > 100) {
        const oldestIds = Array.from(this.processedMessages).slice(0, 50);
        oldestIds.forEach(id => this.processedMessages.delete(id));
    }
    
    // Continue with existing logic...
`);
    console.log('═══════════════════════════════════════════════════');
    
    console.log('\n🎯 This will:');
    console.log('   • Prevent same message from being processed twice');
    console.log('   • Use WhatsApp message ID for deduplication');
    console.log('   • Clean up old IDs to prevent memory leaks');
    console.log('   • Not affect legitimate multiple #free requests');
}

// Run analysis
analyzeMessageFlow();
proposeDeduplicationFix();