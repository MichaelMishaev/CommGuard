const fs = require('fs');
const path = require('path');

const LOCK_FILE = path.join(__dirname, '.commguard.lock');
const INSTANCE_ID = Date.now() + '-' + Math.random().toString(36).substr(2, 9);

class SingleInstance {
    static async acquire() {
        try {
            // Check if lock file exists
            if (fs.existsSync(LOCK_FILE)) {
                const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
                const lockAge = Date.now() - lockData.timestamp;
                
                // If lock is older than 2 minutes, consider it stale
                if (lockAge > 120000) {
                    console.log('🔓 Removing stale lock file (older than 2 minutes)');
                    fs.unlinkSync(LOCK_FILE);
                } else {
                    console.error(`❌ Another instance is already running!`);
                    console.error(`   Started: ${new Date(lockData.timestamp).toLocaleString()}`);
                    console.error(`   PID: ${lockData.pid}`);
                    console.error(`   Instance: ${lockData.instanceId}`);
                    console.error(`\nTo force start, delete: ${LOCK_FILE}`);
                    return false;
                }
            }
            
            // Create lock file
            const lockData = {
                timestamp: Date.now(),
                pid: process.pid,
                instanceId: INSTANCE_ID,
                host: require('os').hostname()
            };
            
            fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2));
            console.log(`🔒 Instance locked (ID: ${INSTANCE_ID})`);
            
            // Set up cleanup on exit
            const cleanup = () => {
                try {
                    const currentLock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
                    if (currentLock.instanceId === INSTANCE_ID) {
                        fs.unlinkSync(LOCK_FILE);
                        console.log('🔓 Instance lock released');
                    }
                } catch (e) {
                    // Lock file might already be deleted
                }
            };
            
            process.on('exit', cleanup);
            process.on('SIGINT', cleanup);
            process.on('SIGTERM', cleanup);
            process.on('uncaughtException', (err) => {
                console.error('Uncaught exception:', err);
                cleanup();
                process.exit(1);
            });
            
            return true;
        } catch (error) {
            console.error('Failed to acquire instance lock:', error);
            return false;
        }
    }
    
    static async checkAuth() {
        const authPath = path.join(__dirname, 'baileys_auth_info', 'creds.json');
        
        if (fs.existsSync(authPath)) {
            try {
                const creds = JSON.parse(fs.readFileSync(authPath, 'utf8'));
                console.log('📱 Found existing WhatsApp session');
                console.log(`   Phone: ${creds.me?.id || 'Unknown'}`);
                console.log(`   Platform: ${creds.platform || 'Unknown'}`);
                
                // Check if auth is being used elsewhere
                const lockExists = fs.existsSync(LOCK_FILE);
                if (lockExists) {
                    const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
                    if (lockData.instanceId !== INSTANCE_ID) {
                        console.warn('⚠️  Auth is being used by another instance!');
                        return false;
                    }
                }
                
                return true;
            } catch (e) {
                console.error('Failed to read auth data:', e.message);
                return true; // Continue anyway
            }
        }
        
        console.log('🆕 No existing auth found - will need QR scan');
        return true;
    }
}

module.exports = SingleInstance;