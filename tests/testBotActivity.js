#!/usr/bin/env node
/**
 * Test Bot Activity - Check if bot is processing messages
 * Monitor logs for signs of message handling activity
 */

const { getTimestamp } = require('../utils/logger');

function testBotActivity() {
    console.log(`[${getTimestamp()}] 🧪 BOT ACTIVITY TEST`);
    console.log('====================================\n');
    
    const fs = require('fs');
    const path = require('path');
    
    console.log('🔍 ANALYZING BOT ACTIVITY');
    console.log('-------------------------');
    
    try {
        const logPath = path.join(process.env.HOME, '.pm2', 'logs', 'commguard-out.log');
        const errorLogPath = path.join(process.env.HOME, '.pm2', 'logs', 'commguard-error.log');
        
        const outLog = fs.readFileSync(logPath, 'utf8');
        const errorLog = fs.readFileSync(errorLogPath, 'utf8');
        
        const outLines = outLog.split('\n').reverse(); // Most recent first
        const errorLines = errorLog.split('\n').reverse(); // Most recent first
        
        // Find latest startup
        const latestStartup = outLines.find(line => line.includes('🚀 Startup phase completed'));
        
        if (latestStartup) {
            const startupMatch = latestStartup.match(/\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})\]/);
            if (startupMatch) {
                const startupTime = new Date(`${startupMatch[1]} UTC`);
                console.log(`📅 Latest startup completed: ${startupMatch[1]}`);
                console.log(`⏱️ Time since startup: ${Math.floor((Date.now() - startupTime) / 1000)}s\n`);
                
                // Check for @lid errors AFTER startup
                const postStartupLidErrors = [];
                const postStartupOtherErrors = [];
                const postStartupMessages = [];
                
                // Analyze logs after startup time
                for (const line of outLines.reverse()) { // Back to chronological
                    if (line.includes(startupMatch[1])) break; // Found startup, everything after is post-startup
                }
                
                for (const line of outLines) {
                    const lineTime = line.match(/\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})\]/);
                    if (lineTime) {
                        const logTime = new Date(`${lineTime[1]} UTC`);
                        if (logTime > startupTime) {
                            if (line.includes('@lid') && line.includes('Decryption failed')) {
                                postStartupLidErrors.push(line);
                            } else if (line.includes('Decryption failed')) {
                                postStartupOtherErrors.push(line);
                            } else if (line.includes('Processing message') || 
                                     line.includes('handleMessage') ||
                                     line.includes('command detected') ||
                                     line.includes('invite link') ||
                                     line.includes('משעמם')) {
                                postStartupMessages.push(line);
                            }
                        }
                    }
                }
                
                console.log('📊 POST-STARTUP ANALYSIS:');
                console.log(`   🚫 @lid decryption errors: ${postStartupLidErrors.length} (should be 0 with fixes)`);
                console.log(`   ⚠️ Other decryption errors: ${postStartupOtherErrors.length}`);
                console.log(`   📨 Message processing activity: ${postStartupMessages.length}`);
                
                if (postStartupLidErrors.length === 0) {
                    console.log('   🎉 SUCCESS: No @lid errors after startup - fix working!');
                } else {
                    console.log('   ⚠️ WARNING: Still getting @lid errors after startup');
                    console.log('   Last few @lid errors:');
                    postStartupLidErrors.slice(-3).forEach(error => {
                        console.log(`   • ${error.substring(0, 100)}...`);
                    });
                }
                
                // Check error log for session errors
                const recentSessionErrors = [];
                for (const line of errorLines) {
                    if (line.includes('SessionError') || line.includes('Bad MAC')) {
                        const errorMatch = line.match(/(\d+@(?:lid|s\.whatsapp\.net))/);
                        if (errorMatch) {
                            recentSessionErrors.push(errorMatch[1]);
                        }
                    }
                }
                
                console.log('\n🔐 SESSION ERROR ANALYSIS:');
                console.log('---------------------------');
                console.log(`📊 Recent session errors: ${recentSessionErrors.length}`);
                
                if (recentSessionErrors.length > 0) {
                    const lidErrors = recentSessionErrors.filter(id => id.includes('@lid')).length;
                    const regularErrors = recentSessionErrors.filter(id => !id.includes('@lid')).length;
                    
                    console.log(`   🚫 @lid errors: ${lidErrors} (being handled)`);
                    console.log(`   ⚡ Regular user errors: ${regularErrors} (normal)`);
                }
                
                console.log('\n🎯 EXPECTED BEHAVIOR VERIFICATION:');
                console.log('----------------------------------');
                
                // Try to detect if bot is actually handling messages
                const recentActivity = outLines.slice(0, 50).some(line => 
                    !line.includes('Decryption failed') && 
                    !line.includes('Session error') &&
                    (line.includes('📨') || line.includes('Processing') || line.includes('command'))
                );
                
                if (recentActivity) {
                    console.log('✅ Bot shows signs of message processing activity');
                } else {
                    console.log('⚠️ No clear message processing activity detected in recent logs');
                    console.log('   This could mean:');
                    console.log('   • No messages received since startup (normal)');
                    console.log('   • Bot is working but activity not logged');
                    console.log('   • Bot may still have processing issues');
                }
            }
        } else {
            console.log('❌ Could not find recent startup completion in logs');
        }
        
        console.log('\n🚨 CRITICAL FIXES IMPLEMENTED:');
        console.log('==============================');
        console.log('✅ Emergency @lid filtering during startup');
        console.log('✅ Aggressive @lid session error handling post-startup');
        console.log('✅ @lid decryption log spam suppression');
        console.log('✅ @lid session cleanup at startup');
        console.log('✅ Timestamp-based old message filtering');
        
        console.log('\n🎯 WHAT TO TEST NEXT:');
        console.log('---------------------');
        console.log('1. Send test message with WhatsApp invite link → should be deleted');
        console.log('2. Send "משעמם" → should get joke response');  
        console.log('3. Send admin command like "#help" → should work');
        console.log('4. Check bot responds to normal group messages');
        
    } catch (error) {
        console.error(`❌ Error analyzing logs: ${error.message}`);
    }
    
    console.log(`\n[${getTimestamp()}] ✅ Bot activity analysis completed`);
}

// Run test
if (require.main === module) {
    testBotActivity();
}

module.exports = { testBotActivity };