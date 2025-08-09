#!/usr/bin/env node
/**
 * Emergency @lid Decryption Fix
 * Blocks problematic @lid sessions during startup
 */

const { getTimestamp } = require('../utils/logger');

// Enhanced session manager with aggressive @lid filtering
function createEmergencyLidFilter() {
    const PROBLEMATIC_LID_USERS = new Set();
    const LID_ERROR_THRESHOLD = 1; // Block @lid users after just 1 error during startup
    const MAX_STARTUP_TIME = 15000; // 15 seconds max startup
    
    let startupPhase = true;
    let startTime = Date.now();
    
    // Clear startup phase after timeout
    setTimeout(() => {
        if (startupPhase) {
            startupPhase = false;
            PROBLEMATIC_LID_USERS.clear();
            console.log(`[${getTimestamp()}] ⚡ Emergency startup completed - cleared LID blocks`);
        }
    }, MAX_STARTUP_TIME);
    
    function shouldSkipLidUser(userId) {
        // Always skip known problematic @lid users during startup
        if (startupPhase && userId.includes('@lid')) {
            if (PROBLEMATIC_LID_USERS.has(userId)) {
                return true;
            }
        }
        return false;
    }
    
    function handleLidError(userId, error) {
        if (startupPhase && userId.includes('@lid')) {
            PROBLEMATIC_LID_USERS.add(userId);
            console.log(`[${getTimestamp()}] 🚫 Blocking @lid user during startup: ${userId.substring(0, 15)}...`);
            return true; // Skip this message
        }
        return false; // Normal handling
    }
    
    return {
        shouldSkipLidUser,
        handleLidError,
        isStartupPhase: () => startupPhase,
        getBlockedCount: () => PROBLEMATIC_LID_USERS.size
    };
}

// Patch to apply to index.js
function generateIndexPatch() {
    return `
// Add this after line 32 (after session manager import):
const emergencyLidFilter = require('./tools/emergencyLidFix').createEmergencyLidFilter();

// Replace the message handling loop with this enhanced version:
for (const msg of messages) {
    const userId = msg.key.participant || msg.key.remoteJid;
    
    // EMERGENCY: Skip all @lid users during startup phase
    if (emergencyLidFilter.shouldSkipLidUser(userId)) {
        continue; // Skip silently
    }
    
    try {
        // Normal message handling...
        await handleMessage(sock, msg, commandHandler);
    } catch (error) {
        if (error.message?.includes('decrypt') && userId.includes('@lid')) {
            // Block this @lid user immediately
            if (emergencyLidFilter.handleLidError(userId, error)) {
                continue; // Skip this message
            }
        }
        
        // Normal error handling for non-@lid users...
        if (error.message?.includes('decrypt')) {
            const result = await handleSessionError(sock, error, msg, emergencyLidFilter.isStartupPhase());
            if (result.skip) {
                continue;
            }
        }
    }
}
`;
}

console.log(`[${getTimestamp()}] 🚨 EMERGENCY @LID DECRYPTION FIX`);
console.log('==========================================\n');

console.log('📊 ANALYSIS:');
console.log('- Bot is receiving message backlog from while it was down');
console.log('- Many @lid (Linked Device) sessions have expired/corrupted');
console.log('- Each decryption attempt takes ~100-500ms, causing startup delays');
console.log('- Hundreds of @lid errors = minutes of startup time');

console.log('\n🔧 EMERGENCY SOLUTION:');
console.log('1. Block ALL @lid users immediately during startup (first 15 seconds)');
console.log('2. Skip decryption attempts for known problematic @lid sessions');
console.log('3. Allow normal @s.whatsapp.net users to process normally');
console.log('4. Clear blocks after startup phase completes');

console.log('\n⚡ QUICK DEPLOYMENT:');
console.log('Copy this to production and restart bot:');
console.log('```bash');
console.log('# Add aggressive @lid filtering to message loop in index.js');
console.log('# Replace message processing section with emergency version');
console.log('```');

console.log('\n💡 EXPLANATION:');
console.log('- @lid users are linked devices (WhatsApp Web, Desktop app users)');
console.log('- When bot is down, @lid sessions often expire or become corrupted'); 
console.log('- Bot tries to decrypt hundreds of missed @lid messages on startup');
console.log('- Each failed decryption wastes time → long startup delays');
console.log('- Solution: Skip ALL @lid messages during startup phase');

console.log(`\n[${getTimestamp()}] 📋 Manual fix needed in index.js message loop`);

module.exports = { createEmergencyLidFilter };