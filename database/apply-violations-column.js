// database/apply-violations-column.js
// Apply violations column to existing database

require('dotenv').config();
const { initDatabase, query, closeDatabase } = require('./connection');
const { getTimestamp } = require('../utils/logger');

async function applyViolationsColumn() {
    console.log(`[${getTimestamp()}] 📊 Applying violations column to users table...`);

    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL not found in .env');
        process.exit(1);
    }

    try {
        // Initialize database
        initDatabase(process.env.DATABASE_URL);

        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Add violations column
        await query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS violations JSONB DEFAULT '{}';
        `);
        console.log('✅ Added violations column');

        // Add index for violations
        await query(`
            CREATE INDEX IF NOT EXISTS idx_users_violations ON users USING GIN (violations);
        `);
        console.log('✅ Added violations index');

        // Add comment
        await query(`
            COMMENT ON COLUMN users.violations IS 'Tracks violations by type: {"invite_link": 3, "kicked_by_admin": 2}';
        `);
        console.log('✅ Added column comment');

        console.log('\n✅ Schema update completed successfully!');

        await closeDatabase();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error applying schema update:', error.message);
        await closeDatabase();
        process.exit(1);
    }
}

applyViolationsColumn();
