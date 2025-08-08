#!/usr/bin/env node
/**
 * Startup Diagnostic Tool
 * Checks session manager and startup logic without full bot initialization
 */

const { getTimestamp } = require('../utils/logger');

async function diagnoseStartup() {
    console.log(`[${getTimestamp()}] 🔍 STARTUP DIAGNOSTIC`);
    console.log('=====================================\n');
    
    // Test 1: Session Manager Loading
    try {
        console.log('1. Testing Session Manager Import...');
        const sessionManager = require('../utils/sessionManager.js');
        
        const requiredFunctions = ['handleSessionError', 'shouldSkipUser', 'clearProblematicUsers', 'STARTUP_TIMEOUT'];
        let loadedFunctions = 0;
        
        for (const func of requiredFunctions) {
            if (sessionManager[func] !== undefined) {
                console.log(`   ✅ ${func} loaded`);
                loadedFunctions++;
            } else {
                console.log(`   ❌ ${func} MISSING`);
            }
        }
        
        console.log(`   📊 Session Manager: ${loadedFunctions}/${requiredFunctions.length} functions loaded`);
        console.log(`   ⏱️  Startup Timeout: ${sessionManager.STARTUP_TIMEOUT}ms`);
        
        // Test startup phase logic
        console.log('\n2. Testing Startup Phase Logic...');
        const startTime = Date.now();
        sessionManager.clearProblematicUsers();
        
        // Simulate problematic users
        console.log('   🧪 Simulating problematic users...');
        const testUsers = ['972547671719@s.whatsapp.net', '227062220615842@lid', '263939212497086@lid'];
        
        for (const user of testUsers) {
            const shouldSkip = sessionManager.shouldSkipUser(user);
            console.log(`   ${shouldSkip ? '⏭️' : '🔄'} ${user}: ${shouldSkip ? 'SKIP' : 'PROCESS'}`);
            
            // Simulate session errors with proper message format
            const mockMsg = { key: { remoteJid: user, participant: null } };
            sessionManager.handleSessionError(null, new Error('Bad MAC'), mockMsg, true);
            sessionManager.handleSessionError(null, new Error('Bad MAC'), mockMsg, true);
            sessionManager.handleSessionError(null, new Error('Bad MAC'), mockMsg, true);
            
            const shouldSkipAfter = sessionManager.shouldSkipUser(user);
            console.log(`   ${shouldSkipAfter ? '⏭️' : '🔄'} ${user} after errors: ${shouldSkipAfter ? 'SKIP' : 'PROCESS'}`);
        }
        
        console.log('\n3. Testing Index.js Session Integration...');
        
        // Check if index.js imports session manager
        const fs = require('fs').promises;
        const indexContent = await fs.readFile('index.js', 'utf8');
        
        const hasImport = indexContent.includes('sessionManager');
        const hasHandleSessionError = indexContent.includes('handleSessionError');
        const hasShouldSkipUser = indexContent.includes('shouldSkipUser');
        const hasStartupPhase = indexContent.includes('startupPhase') || indexContent.includes('STARTUP_TIMEOUT');
        
        console.log(`   ${hasImport ? '✅' : '❌'} Session Manager imported: ${hasImport}`);
        console.log(`   ${hasHandleSessionError ? '✅' : '❌'} handleSessionError used: ${hasHandleSessionError}`);
        console.log(`   ${hasShouldSkipUser ? '✅' : '❌'} shouldSkipUser used: ${hasShouldSkipUser}`);
        console.log(`   ${hasStartupPhase ? '✅' : '❌'} Startup phase logic: ${hasStartupPhase}`);
        
        console.log('\n📊 DIAGNOSTIC RESULTS');
        console.log('=====================');
        
        if (loadedFunctions === requiredFunctions.length && hasImport && hasHandleSessionError && hasShouldSkipUser && hasStartupPhase) {
            console.log('✅ Session manager should be working correctly');
            console.log('🚨 Problem might be in production environment or different corrupted sessions');
            console.log('🔧 Recommended: Check production logs for specific errors during startup');
        } else {
            console.log('❌ Session manager integration incomplete');
            console.log('🔧 Issues found:');
            if (loadedFunctions < requiredFunctions.length) console.log('   - Session manager functions missing');
            if (!hasImport) console.log('   - Session manager not imported in index.js');
            if (!hasHandleSessionError) console.log('   - handleSessionError not called in index.js');
            if (!hasShouldSkipUser) console.log('   - shouldSkipUser not used in index.js');
            if (!hasStartupPhase) console.log('   - Startup phase logic not implemented in index.js');
        }
        
    } catch (error) {
        console.error('❌ Diagnostic failed:', error.message);
        console.log('🚨 This explains the production issue!');
    }
}

// Run diagnostic
if (require.main === module) {
    diagnoseStartup();
}

module.exports = { diagnoseStartup };