#!/usr/bin/env node
/**
 * Aggressive Session Cleanup Tool
 * Removes ALL potentially corrupted sessions based on production logs
 */

const fs = require('fs').promises;
const path = require('path');
const { getTimestamp } = require('../utils/logger');

// Known problematic users from production logs
const PROBLEMATIC_USERS = [
    '972547671719',     // Bad MAC errors from status@broadcast
    '227062220615842',  // No matching sessions @lid
    '263939212497086',  // No matching sessions @lid
    '972555069915',     // Previous Bad MAC user
    '49087634247869',   // Previous corrupted session
    '972507023400',     // Previous corrupted session
    '220955062321301'   // Previous corrupted session
];

async function aggressiveSessionCleanup() {
    console.log(`[${getTimestamp()}] 🔥 AGGRESSIVE SESSION CLEANUP`);
    console.log('============================================\n');
    
    const authDir = 'baileys_auth_info';
    let removedCount = 0;
    let totalSize = 0;
    
    try {
        // Check if auth directory exists
        try {
            await fs.access(authDir);
        } catch {
            console.log('❌ Auth directory not found - nothing to clean');
            return;
        }
        
        console.log('🔍 Scanning for problematic session files...\n');
        
        const files = await fs.readdir(authDir);
        const sessionFiles = files.filter(file => file.startsWith('session-') && file.endsWith('.json'));
        
        console.log(`📁 Found ${sessionFiles.length} session files`);
        
        for (const userId of PROBLEMATIC_USERS) {
            const possibleFiles = sessionFiles.filter(file => file.includes(userId));
            
            if (possibleFiles.length > 0) {
                console.log(`\n🚨 Processing problematic user: ${userId}`);
                
                for (const file of possibleFiles) {
                    const filePath = path.join(authDir, file);
                    
                    try {
                        const stats = await fs.stat(filePath);
                        const sizeKB = (stats.size / 1024).toFixed(1);
                        
                        console.log(`   📄 ${file} (${sizeKB} KB)`);
                        
                        // Check if file contains session data
                        const content = await fs.readFile(filePath, 'utf8');
                        const sessionData = JSON.parse(content);
                        
                        if (sessionData._sessions && Object.keys(sessionData._sessions).length > 0) {
                            console.log(`   🔍 Contains ${Object.keys(sessionData._sessions).length} sessions`);
                            
                            // Check for common corruption indicators
                            let corruptionIndicators = 0;
                            for (const session of Object.values(sessionData._sessions)) {
                                if (!session.registrationId) corruptionIndicators++;
                                if (!session.currentRatchet) corruptionIndicators++;
                                if (!session.indexInfo) corruptionIndicators++;
                            }
                            
                            if (corruptionIndicators > 0) {
                                console.log(`   ❌ Corruption indicators: ${corruptionIndicators}`);
                            }
                        }
                        
                        // Create backup before removal
                        const backupFile = `${file}.backup.${Date.now()}`;
                        const backupPath = path.join(authDir, backupFile);
                        await fs.copyFile(filePath, backupPath);
                        
                        // Remove problematic session
                        await fs.unlink(filePath);
                        
                        console.log(`   ✅ Removed ${file}`);
                        console.log(`   💾 Backup: ${backupFile}`);
                        
                        removedCount++;
                        totalSize += stats.size;
                        
                    } catch (error) {
                        console.log(`   ❌ Error processing ${file}: ${error.message}`);
                    }
                }
            } else {
                console.log(`✅ User ${userId}: No session files found`);
            }
        }
        
        console.log('\n🔍 Checking for additional corrupted sessions...');
        
        // Check remaining session files for corruption signs
        const remainingFiles = await fs.readdir(authDir);
        const remainingSessions = remainingFiles.filter(file => 
            file.startsWith('session-') && 
            file.endsWith('.json') && 
            !file.includes('.backup.')
        );
        
        for (const file of remainingSessions) {
            const filePath = path.join(authDir, file);
            
            try {
                const stats = await fs.stat(filePath);
                const content = await fs.readFile(filePath, 'utf8');
                const sessionData = JSON.parse(content);
                
                // Check for small file size (usually corrupted)
                if (stats.size < 1000) {
                    console.log(`⚠️  ${file}: Very small (${stats.size} bytes) - potentially corrupted`);
                }
                
                // Check for missing critical session data
                if (!sessionData._sessions || Object.keys(sessionData._sessions).length === 0) {
                    console.log(`⚠️  ${file}: Empty sessions - consider removing`);
                }
                
            } catch (error) {
                console.log(`❌ ${file}: Parse error - likely corrupted: ${error.message.substring(0, 50)}`);
                
                // Automatically remove unparseable files
                const backupFile = `${file}.backup.corrupted.${Date.now()}`;
                const backupPath = path.join(authDir, backupFile);
                await fs.copyFile(filePath, backupPath);
                await fs.unlink(filePath);
                
                console.log(`   ✅ Removed corrupted ${file}`);
                console.log(`   💾 Backup: ${backupFile}`);
                removedCount++;
            }
        }
        
        console.log('\n📊 CLEANUP SUMMARY');
        console.log('===================');
        console.log(`🗑️  Removed files: ${removedCount}`);
        console.log(`💾 Total size cleaned: ${(totalSize / 1024).toFixed(1)} KB`);
        console.log(`📁 Remaining sessions: ${remainingSessions.length - removedCount + (removedCount > remainingSessions.length ? 0 : 0)}`);
        
        if (removedCount > 0) {
            console.log('\n🚀 PRODUCTION DEPLOYMENT STEPS:');
            console.log('================================');
            console.log('1. Copy this cleanup script to production server');
            console.log('2. Stop the bot: pm2 stop commguard');
            console.log('3. Run: node tools/aggressiveSessionCleanup.js');
            console.log('4. Deploy updated index.js with session manager fixes');
            console.log('5. Start bot: pm2 start commguard');
            console.log('6. Bot should start responding in ~10 seconds instead of 6 minutes');
            console.log('\n⚠️  The bot will need to re-establish sessions with cleaned users (normal behavior)');
        } else {
            console.log('\n✅ No corrupted sessions found - session manager integration issue likely');
        }
        
    } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
    }
}

// Run cleanup
if (require.main === module) {
    aggressiveSessionCleanup();
}

module.exports = { aggressiveSessionCleanup, PROBLEMATIC_USERS };