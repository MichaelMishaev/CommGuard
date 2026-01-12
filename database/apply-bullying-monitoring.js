// database/apply-bullying-monitoring.js
// Migration runner for adding bullying_monitoring column to groups table

const fs = require('fs');
const path = require('path');
const { initDatabase, query, closeDatabase } = require('./connection');
const { getTimestamp } = require('../utils/logger');
require('dotenv').config();

async function applyMigration() {
    console.log('[' + getTimestamp() + '] 🔄 Starting bullying_monitoring migration...\n');

    try {
        // Initialize database connection
        console.log('[' + getTimestamp() + '] 📊 Connecting to PostgreSQL...');
        initDatabase(process.env.DATABASE_URL);

        // Wait for connection to establish
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Read SQL file
        const sqlFile = path.join(__dirname, 'add-bullying-monitoring-column.sql');
        const sql = fs.readFileSync(sqlFile, 'utf8');

        console.log('[' + getTimestamp() + '] 📄 Loaded SQL migration file');
        console.log('[' + getTimestamp() + '] 🔧 Executing migration...\n');

        // Execute migration
        await query(sql);

        console.log('[' + getTimestamp() + '] ✅ Migration executed successfully');

        // Verify column was added
        console.log('[' + getTimestamp() + '] 🔍 Verifying column exists...');

        const verifyQuery = `
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'groups'
            AND column_name = 'bullying_monitoring';
        `;

        const result = await query(verifyQuery);

        if (result.rows.length > 0) {
            const col = result.rows[0];
            console.log('[' + getTimestamp() + '] ✅ Column verified:');
            console.log('   Name:', col.column_name);
            console.log('   Type:', col.data_type);
            console.log('   Default:', col.column_default);
        } else {
            console.log('[' + getTimestamp() + '] ❌ Column not found after migration!');
            process.exit(1);
        }

        // Check if index was created
        const indexQuery = `
            SELECT indexname
            FROM pg_indexes
            WHERE tablename = 'groups'
            AND indexname = 'idx_groups_bullying_monitoring';
        `;

        const indexResult = await query(indexQuery);

        if (indexResult.rows.length > 0) {
            console.log('[' + getTimestamp() + '] ✅ Index created: idx_groups_bullying_monitoring');
        } else {
            console.log('[' + getTimestamp() + '] ⚠️  Index not found (may already exist or failed)');
        }

        // Show current group stats
        console.log('\n[' + getTimestamp() + '] 📊 Current Group Statistics:');

        const statsQuery = `
            SELECT
                COUNT(*) as total_groups,
                SUM(CASE WHEN bullying_monitoring = true THEN 1 ELSE 0 END) as monitored_groups,
                SUM(CASE WHEN bullying_monitoring = false THEN 1 ELSE 0 END) as unmonitored_groups
            FROM groups
            WHERE is_active = true;
        `;

        const stats = await query(statsQuery);
        const groupStats = stats.rows[0];

        console.log('   Total Active Groups:', groupStats.total_groups);
        console.log('   Monitored Groups:', groupStats.monitored_groups);
        console.log('   Unmonitored Groups:', groupStats.unmonitored_groups);

        console.log('\n[' + getTimestamp() + '] ✅ Migration completed successfully!');
        console.log('\n💡 To enable monitoring for a group, send: #bullywatch on');

    } catch (error) {
        console.error('[' + getTimestamp() + '] ❌ Migration failed:', error.message);
        console.error(error);
        await closeDatabase();
        process.exit(1);
    } finally {
        await closeDatabase();
        process.exit(0);
    }
}

// Run migration
applyMigration();
