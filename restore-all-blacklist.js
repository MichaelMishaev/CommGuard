#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const { initDatabase, query } = require('./database/connection');
const { getTimestamp } = require('./utils/logger');

async function restoreAll() {
    console.log(`[${getTimestamp()}] 🔄 Restoring ALL original blacklist entries...\n`);

    if (!process.env.DATABASE_URL) {
        console.log('⚠️  DATABASE_URL not set - only JSON cache restored');
        process.exit(0);
    }

    try {
        initDatabase(process.env.DATABASE_URL);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Read blacklist from cache
        const cacheData = JSON.parse(fs.readFileSync('blacklist_cache.json', 'utf8'));
        const blacklist = cacheData.blacklist || [];

        console.log(`[${getTimestamp()}] 📋 Found ${blacklist.length} entries to restore\n`);

        let restored = 0;
        let skipped = 0;

        for (let i = 0; i < blacklist.length; i++) {
            const entry = blacklist[i];
            const phone = entry.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '').replace('@g.us', '');

            // Skip group IDs
            if (entry.includes('@g.us')) {
                skipped++;
                continue;
            }

            try {
                // Extract country code
                let countryCode = null;
                if (phone.startsWith('972')) countryCode = '+972';
                else if (phone.startsWith('1')) countryCode = '+1';
                else if (phone.startsWith('44')) countryCode = '+44';
                else if (phone.startsWith('6')) countryCode = '+6';

                await query(`
                    INSERT INTO users (phone_number, country_code, is_blacklisted, blacklisted_at)
                    VALUES ($1, $2, true, NOW())
                    ON CONFLICT (phone_number)
                    DO UPDATE SET
                        is_blacklisted = true,
                        blacklisted_at = NOW()
                `, [phone, countryCode]);

                restored++;

                if (i % 100 === 0 && i > 0) {
                    console.log(`[${getTimestamp()}]    Progress: ${i}/${blacklist.length} (${restored} restored, ${skipped} skipped)`);
                }
            } catch (error) {
                console.error(`[${getTimestamp()}] ⚠️  Error restoring ${phone}:`, error.message);
            }
        }

        console.log(`\n[${getTimestamp()}] ✅ Restored ${restored} entries to PostgreSQL!`);
        console.log(`[${getTimestamp()}]    Skipped: ${skipped} (group IDs)\n`);
        process.exit(0);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error:`, error.message);
        process.exit(1);
    }
}

restoreAll();
