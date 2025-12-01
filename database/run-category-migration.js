#!/usr/bin/env node
// Run category and notes column migration

require('dotenv').config();
const { initDatabase, query, closeDatabase } = require('./connection');
const { getTimestamp } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    console.log(`[${getTimestamp()}] 🚀 Starting category migration...`);

    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL) {
        console.error('❌ DATABASE_URL not found in .env');
        process.exit(1);
    }

    try {
        initDatabase(DATABASE_URL);
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log(`[${getTimestamp()}] 📊 Connected to PostgreSQL`);

        const migrationSQL = fs.readFileSync(
            path.join(__dirname, 'add-category-column.sql'),
            'utf8'
        );

        const statements = migrationSQL
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
            try {
                await query(statement);
                console.log(`[${getTimestamp()}] ✅ Executed: ${statement.substring(0, 80)}...`);
            } catch (error) {
                if (error.message.includes('already exists') || error.message.includes('duplicate')) {
                    console.log(`[${getTimestamp()}] ⚠️  Already exists (skipping)`);
                } else {
                    console.error(`[${getTimestamp()}] ❌ Error:`, error.message);
                }
            }
        }

        // Verify columns
        const result = await query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'groups' AND column_name IN ('category', 'notes')
            ORDER BY column_name
        `);

        console.log(`[${getTimestamp()}] 📋 Columns added:`);
        result.rows.forEach(row => {
            console.log(`   - ${row.column_name}: ${row.data_type} (default: ${row.column_default})`);
        });

        await closeDatabase();
        console.log(`[${getTimestamp()}] 🎉 Migration complete!`);

    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Migration failed:`, error);
        await closeDatabase();
        process.exit(1);
    }
}

runMigration()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
