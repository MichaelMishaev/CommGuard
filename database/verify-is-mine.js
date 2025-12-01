#!/usr/bin/env node
// Quick script to verify is_mine column

require('dotenv').config();
const { initDatabase, query, closeDatabase } = require('./connection');
const { getTimestamp } = require('../utils/logger');

async function verify() {
    console.log(`[${getTimestamp()}] 🔍 Verifying is_mine column...`);

    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    try {
        initDatabase(DATABASE_URL);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Try to add the column
        console.log(`[${getTimestamp()}] 📝 Attempting to add is_mine column...`);
        try {
            await query(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_mine BOOLEAN DEFAULT false`);
            console.log(`[${getTimestamp()}] ✅ Column added (or already exists)`);
        } catch (err) {
            console.log(`[${getTimestamp()}] ⚠️  ALTER TABLE result:`, err.message);
        }

        // Try to add the index
        console.log(`[${getTimestamp()}] 📝 Attempting to create index...`);
        try {
            await query(`CREATE INDEX IF NOT EXISTS idx_groups_is_mine ON groups(is_mine) WHERE is_mine = true`);
            console.log(`[${getTimestamp()}] ✅ Index created (or already exists)`);
        } catch (err) {
            console.log(`[${getTimestamp()}] ⚠️  CREATE INDEX result:`, err.message);
        }

        // Check if column exists
        const checkColumn = await query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'groups' AND column_name = 'is_mine'
        `);

        if (checkColumn.rows.length > 0) {
            console.log(`[${getTimestamp()}] ✅ is_mine column EXISTS!`);
            console.log(`[${getTimestamp()}] 📋 Details:`, checkColumn.rows[0]);
        } else {
            console.log(`[${getTimestamp()}] ❌ is_mine column NOT FOUND`);
        }

        // Check if index exists
        const checkIndex = await query(`
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'groups' AND indexname = 'idx_groups_is_mine'
        `);

        if (checkIndex.rows.length > 0) {
            console.log(`[${getTimestamp()}] ✅ Index EXISTS!`);
        } else {
            console.log(`[${getTimestamp()}] ⚠️  Index NOT FOUND (optional)`);
        }

        // Test query
        console.log(`[${getTimestamp()}] 🧪 Testing query...`);
        const testQuery = await query(`SELECT name, is_mine FROM groups LIMIT 5`);
        console.log(`[${getTimestamp()}] ✅ Query successful! Found ${testQuery.rows.length} groups`);
        testQuery.rows.forEach(row => {
            console.log(`   - ${row.name}: is_mine = ${row.is_mine}`);
        });

        await closeDatabase();
        console.log(`[${getTimestamp()}] 🎉 Verification complete!`);

    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Error:`, error);
        await closeDatabase();
        process.exit(1);
    }
}

verify().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
