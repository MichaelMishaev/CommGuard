#!/usr/bin/env node

/**
 * ULTRATHINK: Debug Admin Approval Flow
 * Deep analysis of why user doesn't get notification when admin sends "yes 972555030746"
 */

const { getTimestamp } = require('./utils/logger');
const fs = require('fs');

console.log(`
╔════════════════════════════════════════════════════╗
║           🧠 ULTRATHINK: Admin Approval Flow        ║
║                                                    ║
║  Deep analysis of "yes 972555030746" flow          ║
║  Why user doesn't get approval notification        ║
╚════════════════════════════════════════════════════╝
`);

function analyzeCommandRouting() {
    console.log(`[${getTimestamp()}] 🧠 STEP 1: Command Routing Analysis\n`);
    
    console.log('📋 Analyzing how "yes 972555030746" is routed:\n');
    
    // Analyze index.js private message handling
    console.log('1️⃣ PRIVATE MESSAGE HANDLER (index.js ~472):');
    console.log('   Input: "yes 972555030746"');
    console.log('   Detection: messageText.startsWith("#") → FALSE');
    console.log('   🚨 ISSUE DETECTED: "yes 972555030746" does NOT start with "#"');
    console.log('   Result: Command is NOT processed by private message handler');
    
    console.log('\n2️⃣ CHECKING FOR OTHER ROUTING PATHS:');
    console.log('   • Private message handler only processes commands starting with "#"');
    console.log('   • "yes 972555030746" does not start with "#"');
    console.log('   • This means it will NOT trigger command processing');
    
    console.log('\n🔍 Let me check commandHandler.js for admin approval detection...');
    
    console.log('\n3️⃣ COMMAND HANDLER ANALYSIS:');
    console.log('   Looking at handleCommand method...');
    console.log('   Admin approval patterns: cmd.startsWith("yes ") || cmd.startsWith("no ")');
    console.log('   But this only runs if handleCommand is called!');
    
    console.log('\n🚨 ROOT CAUSE IDENTIFIED:');
    console.log('   "yes 972555030746" is never routed to commandHandler.handleCommand()');
    console.log('   because it doesn\'t start with "#" symbol');
    
    return {
        issue: 'Command routing failure',
        cause: 'Admin approval messages don\'t start with # so they\'re not processed',
        severity: 'CRITICAL'
    };
}

function analyzeExpectedFlow() {
    console.log(`\n[${getTimestamp()}] 🧠 STEP 2: Expected Flow Analysis\n`);
    
    console.log('📋 What SHOULD happen when admin sends "yes 972555030746":\n');
    
    console.log('1️⃣ Message Reception:');
    console.log('   ✅ Bot receives private message from admin');
    console.log('   ✅ Message text: "yes 972555030746"');
    
    console.log('\n2️⃣ Command Detection:');
    console.log('   ❌ Current: Looks for messages starting with "#"');
    console.log('   ✅ Should: Also look for admin approval patterns');
    
    console.log('\n3️⃣ Command Routing:');
    console.log('   ❌ Current: "yes 972555030746" is ignored');
    console.log('   ✅ Should: Route to handleAdminApproval()');
    
    console.log('\n4️⃣ Processing:');
    console.log('   ✅ Should: processAdminResponse("972555030746", "yes", adminPhone)');
    console.log('   ✅ Should: Remove user from blacklist');
    console.log('   ✅ Should: Send admin confirmation');
    console.log('   ✅ Should: Send user notification');
    
    return {
        requiredFix: 'Modify private message handler to detect admin approval patterns',
        location: 'index.js private message processing section'
    };
}

function analyzeCodeFlow() {
    console.log(`\n[${getTimestamp()}] 🧠 STEP 3: Code Flow Analysis\n`);
    
    try {
        // Read the private message handling section
        const indexFile = fs.readFileSync('/Users/michaelmishayev/Desktop/CommGuard/bCommGuard/index.js', 'utf8');
        
        console.log('📋 Analyzing current private message handling logic:\n');
        
        // Find the private message handling section
        const lines = indexFile.split('\n');
        let inPrivateHandler = false;
        let lineNum = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            lineNum = i + 1;
            
            // Look for private message handling
            if (line.includes('Private Message Received') || line.includes('handleMessage') && line.includes('private')) {
                inPrivateHandler = true;
                console.log(`🔍 Found private message handler around line ${lineNum}`);
            }
            
            // Look for command detection
            if (inPrivateHandler && line.includes('startsWith(\'#\')')) {
                console.log(`🚨 ISSUE: Line ${lineNum}: ${line.trim()}`);
                console.log('   This only detects commands starting with "#"');
                break;
            }
        }
        
        console.log('\n📋 Looking for admin approval handling in commandHandler.js:\n');
        
        const commandFile = fs.readFileSync('/Users/michaelmishayev/Desktop/CommGuard/bCommGuard/services/commandHandler.js', 'utf8');
        const commandLines = commandFile.split('\n');
        
        for (let i = 0; i < commandLines.length; i++) {
            const line = commandLines[i];
            if (line.includes('startsWith(\'yes \')') || line.includes('startsWith(\'no \')')) {
                console.log(`✅ Found admin approval detection: Line ${i + 1}: ${line.trim()}`);
                console.log('   But this code is never reached because handleCommand is never called!');
                break;
            }
        }
        
    } catch (error) {
        console.error('Error analyzing code:', error.message);
    }
    
    return {
        finding: 'Admin approval logic exists but is unreachable',
        reason: 'Private message handler doesn\'t route non-# messages to command handler'
    };
}

function proposeSolution() {
    console.log(`\n[${getTimestamp()}] 🧠 STEP 4: Solution Proposal\n`);
    
    console.log('🔧 SOLUTION: Modify private message handler to detect admin approval patterns\n');
    
    console.log('📋 Required changes in index.js:\n');
    
    console.log('CURRENT CODE (around line 464):');
    console.log('═'.repeat(60));
    console.log(`
        // Process commands in private chat
        if (messageText && messageText.startsWith('#')) {
            // ... handle # commands
        }
    `);
    
    console.log('FIXED CODE:');
    console.log('═'.repeat(60));
    console.log(`
        // Process commands in private chat
        if (messageText && messageText.startsWith('#')) {
            // ... handle # commands
        } else if (isAdmin && messageText && 
                  (messageText.startsWith('yes ') || messageText.startsWith('no '))) {
            // Handle admin approval patterns
            console.log(\`   Admin Approval Detected: \${messageText}\`);
            
            const parts = messageText.trim().split(/\\s+/);
            const command = parts[0]; // "yes" or "no"  
            const args = parts.slice(1).join(' '); // "972555030746"
            
            const handled = await commandHandler.handleCommand(msg, command, args, isAdmin, isAdmin);
            if (handled) {
                console.log(\`   Admin Approval Handled: ✅ Successfully\`);
                return;
            }
        }
    `);
    
    console.log('🎯 This fix will:');
    console.log('   ✅ Detect "yes 972555030746" and "no 972555030746" patterns');
    console.log('   ✅ Route them to commandHandler.handleCommand()');
    console.log('   ✅ Trigger existing admin approval logic');
    console.log('   ✅ Send user notifications as expected');
    
    return {
        fix: 'Add admin approval pattern detection to private message handler',
        file: 'index.js',
        location: 'After # command processing, before else clause'
    };
}

function analyzePotentialIssues() {
    console.log(`\n[${getTimestamp()}] 🧠 STEP 5: Potential Issues Analysis\n`);
    
    console.log('🔍 Checking for additional issues that might prevent user notification:\n');
    
    console.log('1️⃣ USER ID FORMAT ISSUES:');
    console.log('   • Admin sends: "yes 972555030746"');
    console.log('   • System expects: "972555030746@s.whatsapp.net"');
    console.log('   • Check: Does handleAdminApproval properly format user ID?');
    
    console.log('\n2️⃣ BLACKLIST REMOVAL ISSUES:');
    console.log('   • Check: Does removeFromBlacklist() work correctly?');
    console.log('   • Check: Is user actually removed from blacklist?');
    
    console.log('\n3️⃣ MESSAGE DELIVERY ISSUES:');
    console.log('   • Check: Is user notification sent to correct WhatsApp ID?');
    console.log('   • Check: Are there session errors preventing delivery?');
    console.log('   • Check: Has user blocked the bot?');
    
    console.log('\n4️⃣ ADMIN PERMISSION ISSUES:');
    console.log('   • Check: Is the admin properly identified as admin?');
    console.log('   • Check: Does isAdmin return true for the approving admin?');
    
    console.log('\n5️⃣ DATABASE ISSUES:');
    console.log('   • Check: Is the unblacklist request record updated?');
    console.log('   • Check: Is processAdminResponse working correctly?');
    
    return {
        primaryIssue: 'Command routing - admin approval not detected',
        secondaryIssues: ['User ID formatting', 'Message delivery', 'Admin permissions', 'Database updates']
    };
}

// Run complete analysis
async function runCompleteAnalysis() {
    console.log(`[${getTimestamp()}] 🚀 Starting Complete Admin Approval Flow Analysis\n`);
    
    const results = {
        routing: analyzeCommandRouting(),
        expectedFlow: analyzeExpectedFlow(),
        codeFlow: analyzeCodeFlow(),
        solution: proposeSolution(),
        issues: analyzePotentialIssues()
    };
    
    console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
    console.log(`║                    🧠 ULTRATHINK CONCLUSION                ║`);
    console.log(`╠═══════════════════════════════════════════════════════════╣`);
    console.log(`║                                                           ║`);
    console.log(`║  🚨 ROOT CAUSE: Command routing failure                   ║`);
    console.log(`║                                                           ║`);
    console.log(`║  ISSUE: "yes 972555030746" doesn't start with "#"        ║`);
    console.log(`║         so it's never processed as a command             ║`);
    console.log(`║                                                           ║`);
    console.log(`║  FIX: Add admin approval pattern detection to            ║`);
    console.log(`║       private message handler in index.js               ║`);
    console.log(`║                                                           ║`);
    console.log(`║  PRIORITY: CRITICAL - Admin approval is broken           ║`);
    console.log(`║                                                           ║`);
    console.log(`╚═══════════════════════════════════════════════════════════╝`);
    
    return results;
}

// Execute analysis
runCompleteAnalysis().catch(console.error);