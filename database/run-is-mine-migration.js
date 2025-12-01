#!/usr/bin/env node
// Script to run the is_mine column migration

require('dotenv').config();
const { initDatabase, query, closeDatabase } = require('./connection');
const { getTimestamp } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    console.log(`[${getTimestamp()}] 🚀 Starting is_mine migration...`);

    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL) {
        console.error('❌ DATABASE_URL not found in .env');
        process.exit(1);
    }

    try {
        // Initialize database connection
        initDatabase(DATABASE_URL);

        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log(`[${getTimestamp()}] 📊 Connected to PostgreSQL`);

        // Read and execute migration
        const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'add-is-mine-column.sql'),
            'utf8'
        );

        // Split by semicolons and execute each statement
        const statements = migrationSQL
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
            if (statement.toLowerCase().includes('comment on')) {
                // Skip comment statements (they might not work on all PostgreSQL versions)
                console.log(`[${getTimestamp()}] ⏭️  Skipping COMMENT statement`);
                continue;
            }

            try {
                await query(statement);
                console.log(`[${getTimestamp()}] ✅ Executed: ${statement.substring(0, 50)}...`);
            } catch (error) {
                if (error.message.includes('already exists')) {
                    console.log(`[${getTimestamp()}] ⚠️  Already exists (skipping): ${statement.substring(0, 50)}...`);
                } else {
                    throw error;
                }
            }
        }

        // Verify the column was added
        const result = await query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'groups' AND column_name = 'is_mine'
        `);

        if (result.rows.length > 0) {
            console.log(`[${getTimestamp()}] ✅ Migration successful!`);
            console.log(`[${getTimestamp()}] 📋 Column info:`, result.rows[0]);
        } else {
            console.log(`[${getTimestamp()}] ❌ Column not found after migration!`);
        }

        // Close connection
        await closeDatabase();
        console.log(`[${getTimestamp()}] 🏁 Migration complete!`);

    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Migration failed:`, error);
        await closeDatabase();
        process.exit(1);
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Migration error:', err);
            process.exit(1);
        });
}

module.exports = { runMigration };
