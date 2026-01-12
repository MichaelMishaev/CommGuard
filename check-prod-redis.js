/**
 * Check Production Redis - See if bot has any data
 * Connects to Railway Redis
 */

const Redis = require('ioredis');
require('dotenv').config();

async function checkProdRedis() {
    let redis;
    try {
        console.log('🔌 Connecting to production Redis...');
        redis = new Redis(process.env.REDIS_URL);

        await redis.ping();
        console.log('✅ Connected to production Redis\n');

        // Check all keys
        console.log('📋 Scanning Redis keys...\n');
        const keys = await redis.keys('*');
        console.log(`Total keys found: ${keys.length}\n`);

        if (keys.length === 0) {
            console.log('❌ No data in Redis. Bot might not be running or never connected.');
            return;
        }

        // Group keys by pattern
        const keysByPattern = {};
        for (const key of keys) {
            const pattern = key.split(':')[0] || 'unknown';
            if (!keysByPattern[pattern]) {
                keysByPattern[pattern] = [];
            }
            keysByPattern[pattern].push(key);
        }

        // Display keys by category
        console.log('📊 Keys by category:');
        console.log('===================\n');
        for (const [pattern, patternKeys] of Object.entries(keysByPattern)) {
            console.log(`${pattern}: ${patternKeys.length} keys`);
            if (patternKeys.length <= 10) {
                for (const key of patternKeys) {
                    console.log(`  - ${key}`);
                }
            } else {
                console.log(`  - (showing first 10)`);
                for (let i = 0; i < 10; i++) {
                    console.log(`  - ${patternKeys[i]}`);
                }
            }
            console.log('');
        }

        // Check for user messages (bug reports)
        if (keys.includes('user_messages')) {
            console.log('📝 Checking user_messages for bug reports...\n');
            const messages = await redis.lrange('user_messages', 0, -1);
            console.log(`Total messages: ${messages.length}`);

            const bugReports = messages
                .map(msg => {
                    try {
                        return JSON.parse(msg);
                    } catch {
                        return null;
                    }
                })
                .filter(msg => msg && msg.messageText && msg.messageText.startsWith('#'))
                .filter(msg => msg.status === 'pending');

            console.log(`Pending bug reports: ${bugReports.length}\n`);

            if (bugReports.length > 0) {
                console.log('🐛 Pending Bug Reports:');
                console.log('======================\n');
                for (const bug of bugReports) {
                    console.log(`• ${bug.messageText}`);
                    console.log(`  Time: ${bug.timestamp}`);
                    console.log(`  Phone: ${bug.phone || bug.userId}`);
                    console.log('');
                }
            }
        }

        // Check for bot connection status
        if (keys.includes('bot:status')) {
            console.log('🤖 Bot Status:\n');
            const status = await redis.get('bot:status');
            console.log(status);
        }

        // Check admin cache
        const adminCacheKeys = keys.filter(k => k.startsWith('admin:cache:'));
        if (adminCacheKeys.length > 0) {
            console.log(`\n👤 Admin cache entries: ${adminCacheKeys.length}`);
        }

        // Check group cache
        const groupCacheKeys = keys.filter(k => k.startsWith('group:'));
        if (groupCacheKeys.length > 0) {
            console.log(`📱 Group cache entries: ${groupCacheKeys.length}`);
            console.log('\nGroups in cache:');
            for (const key of groupCacheKeys.slice(0, 10)) {
                const data = await redis.get(key);
                if (data) {
                    try {
                        const parsed = JSON.parse(data);
                        console.log(`  - ${key}: ${parsed.name || parsed.subject || 'Unknown'}`);
                    } catch {
                        console.log(`  - ${key}: (raw data)`);
                    }
                }
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        if (redis) {
            await redis.quit();
            console.log('\n🔌 Disconnected from Redis');
        }
    }
}

// Run the check
checkProdRedis();
