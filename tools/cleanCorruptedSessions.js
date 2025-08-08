#!/usr/bin/env node
/**
 * Clean Corrupted Sessions Tool
 * Identifies and removes corrupted session files that cause decryption errors
 */

const fs = require('fs').promises;
const path = require('path');

const SESSION_DIR = 'baileys_auth_info';
const BACKUP_DIR = 'session_backup_' + Date.now();

// Users with known session issues (from logs)
const PROBLEMATIC_USERS = [
    '972555069915',
    '49087634247869',
    '972507023400',
    '220955062321301',
    '972547671719'
];

async function cleanCorruptedSessions() {
    console.log('🧹 Starting Corrupted Session Cleanup...\n');

    try {
        // Check if session directory exists
        const sessionDirExists = await fs.access(SESSION_DIR).then(() => true).catch(() => false);
        if (!sessionDirExists) {
            console.log('❌ Session directory not found:', SESSION_DIR);
            return;
        }

        // Create backup directory
        console.log('📦 Creating backup directory...');
        await fs.mkdir(BACKUP_DIR, { recursive: true });

        // List all session files
        const files = await fs.readdir(SESSION_DIR);
        const sessionFiles = files.filter(file => file.startsWith('session-') && file.endsWith('.json'));
        
        console.log(`📊 Found ${sessionFiles.length} session files`);
        console.log(`🎯 Targeting ${PROBLEMATIC_USERS.length} known problematic users\n`);

        let removedCount = 0;
        let backedUpCount = 0;

        for (const user of PROBLEMATIC_USERS) {
            const sessionFile = `session-${user}.0.json`;
            const sessionPath = path.join(SESSION_DIR, sessionFile);
            
            // Check if this session file exists
            const exists = await fs.access(sessionPath).then(() => true).catch(() => false);
            
            if (exists) {
                console.log(`🔍 Found session for problematic user: ${user}`);
                
                try {
                    // Backup the session file first
                    const backupPath = path.join(BACKUP_DIR, sessionFile);
                    await fs.copyFile(sessionPath, backupPath);
                    backedUpCount++;
                    console.log(`   📦 Backed up to: ${backupPath}`);
                    
                    // Remove the corrupted session
                    await fs.unlink(sessionPath);
                    removedCount++;
                    console.log(`   🗑️ Removed corrupted session: ${sessionFile}`);
                    
                } catch (error) {
                    console.error(`   ❌ Error processing ${sessionFile}:`, error.message);
                }
            } else {
                console.log(`⚪ No session found for user: ${user} (already clean)`);
            }
        }

        console.log('\n📋 Cleanup Summary:');
        console.log(`   📦 Sessions backed up: ${backedUpCount}`);
        console.log(`   🗑️ Sessions removed: ${removedCount}`);
        console.log(`   📁 Backup location: ${BACKUP_DIR}`);

        if (removedCount > 0) {
            console.log('\n✅ Cleanup completed! Benefits:');
            console.log('   • Eliminated decryption errors for cleaned users');
            console.log('   • Faster bot startup (no more stuck decryption loops)');
            console.log('   • משעמם and invite detection will work for cleaned users');
            console.log('\n⚠️ Note: Affected users will need to send a new message to re-establish sessions');
        } else {
            console.log('\n✅ No corrupted sessions found - all clean!');
        }

        console.log('\n🔄 Next steps:');
        console.log('   1. Restart the bot: pm2 restart commguard');
        console.log('   2. Monitor logs for session errors');
        console.log('   3. Test משעמם and invite link detection');

    } catch (error) {
        console.error('\n❌ Cleanup failed:', error.message);
        process.exit(1);
    }
}

// Additional cleanup functions
async function cleanAllSessions() {
    console.log('🚨 DANGEROUS: This will remove ALL sessions!');
    console.log('⚠️ Bot will need to re-scan QR code and re-establish ALL user sessions');
    
    // This is commented out to prevent accidental use
    // await fs.rm(SESSION_DIR, { recursive: true, force: true });
    console.log('❌ Full session reset disabled for safety. Uncomment if really needed.');
}

async function findLargeSessions() {
    console.log('🔍 Finding unusually large session files...\n');
    
    try {
        const files = await fs.readdir(SESSION_DIR);
        const sessionFiles = files.filter(file => file.startsWith('session-') && file.endsWith('.json'));
        
        const fileSizes = [];
        
        for (const file of sessionFiles) {
            const filePath = path.join(SESSION_DIR, file);
            const stats = await fs.stat(filePath);
            fileSizes.push({ file, size: stats.size });
        }
        
        // Sort by size (largest first)
        fileSizes.sort((a, b) => b.size - a.size);
        
        console.log('📊 Top 10 largest session files:');
        fileSizes.slice(0, 10).forEach((item, index) => {
            const sizeKB = (item.size / 1024).toFixed(1);
            console.log(`   ${index + 1}. ${item.file}: ${sizeKB} KB`);
        });
        
        // Flag unusually large sessions (>50KB is suspicious)
        const largeSessions = fileSizes.filter(item => item.size > 50 * 1024);
        if (largeSessions.length > 0) {
            console.log('\n⚠️ Unusually large sessions (may be corrupted):');
            largeSessions.forEach(item => {
                const sizeKB = (item.size / 1024).toFixed(1);
                console.log(`   • ${item.file}: ${sizeKB} KB`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error analyzing session sizes:', error.message);
    }
}

// Main execution
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🧹 CommGuard Session Cleanup Tool

Usage:
  node cleanCorruptedSessions.js [options]

Options:
  --help, -h          Show this help
  --analyze          Analyze session file sizes
  --clean            Clean known corrupted sessions (default)
  
Examples:
  node cleanCorruptedSessions.js            # Clean corrupted sessions
  node cleanCorruptedSessions.js --analyze  # Analyze session sizes
        `);
        process.exit(0);
    }
    
    if (args.includes('--analyze')) {
        findLargeSessions().then(() => process.exit(0));
    } else {
        // Default action: clean corrupted sessions
        cleanCorruptedSessions().then(() => process.exit(0));
    }
}

module.exports = {
    cleanCorruptedSessions,
    findLargeSessions,
    PROBLEMATIC_USERS
};