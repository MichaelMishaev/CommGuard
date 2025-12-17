#!/usr/bin/env node
require('dotenv').config();

const { initDatabase, query } = require('./database/connection');
const { getTimestamp } = require('./utils/logger');

const validBlacklist = [
    { phone: '14904106991855', reason: 'invite_link violation (1)' },
    { phone: '170485069389990', reason: 'invite_link violation (1)' },
    { phone: '175372742205486', reason: 'invite_link violations (5)' },
    { phone: '244194845134925', reason: 'invite_link violation (1)' },
    { phone: '262182587633905', reason: 'invite_link violation (1)' },
    { phone: '38638264000675', reason: 'invite_link violation (1)' },
    { phone: '98613002825758', reason: 'invite_link violation (1)' }
];

async function restoreBlacklist() {
    console.log(`[${getTimestamp()}] 🔄 Restoring legitimate blacklist entries...\n`);

    if (!process.env.DATABASE_URL) {
        console.log('⚠️  DATABASE_URL not set - only JSON cache restored');
        process.exit(0);
    }

    try {
        initDatabase(process.env.DATABASE_URL);
        await new Promise(resolve => setTimeout(resolve, 2000));

        for (const user of validBlacklist) {
            await query(`
                UPDATE users
                SET is_blacklisted = true,
                    blacklisted_at = NOW()
                WHERE phone_number = $1
            `, [user.phone]);
            console.log(`[${getTimestamp()}] ✅ Restored: ${user.phone} - ${user.reason}`);
        }

        console.log(`\n[${getTimestamp()}] ✅ Restored ${validBlacklist.length} legitimate blacklist entries!\n`);
        process.exit(0);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error:`, error.message);
        process.exit(1);
    }
}

restoreBlacklist();
