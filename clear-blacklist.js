#!/usr/bin/env node
require('dotenv').config();

const { initDatabase, query } = require('./database/connection');
const { getTimestamp } = require('./utils/logger');

async function clearBlacklist() {
    console.log(`[${getTimestamp()}] 🧹 Clearing all blacklist entries...\n`);

    if (!process.env.DATABASE_URL) {
        console.log('⚠️  DATABASE_URL not set - only clearing JSON cache');
        process.exit(0);
    }

    try {
        initDatabase(process.env.DATABASE_URL);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Clear PostgreSQL blacklist
        const result = await query(`
            UPDATE users
            SET is_blacklisted = false,
                blacklisted_at = NULL
            WHERE is_blacklisted = true
            RETURNING phone_number
        `);

        console.log(`[${getTimestamp()}] ✅ Cleared ${result.rows.length} users from PostgreSQL blacklist`);
        
        if (result.rows.length > 0) {
            console.log('\nCleared users:');
            result.rows.forEach((row, i) => {
                console.log(`  ${i + 1}. ${row.phone_number}`);
            });
        }

        console.log(`\n[${getTimestamp()}] ✅ Blacklist completely cleared!\n`);
        process.exit(0);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error:`, error.message);
        process.exit(1);
    }
}

clearBlacklist();
