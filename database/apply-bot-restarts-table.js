// Apply bot_restarts table schema to Railway PostgreSQL
const fs = require('fs');
const path = require('path');
const { initDatabase, query } = require('./connection');
require('dotenv').config();

async function applyBotRestartsTable() {
    console.log('🚀 Applying bot_restarts table schema to Railway...\n');

    try {
        // Initialize database connection
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            throw new Error('DATABASE_URL environment variable not found');
        }

        console.log('📊 Connecting to PostgreSQL...');
        initDatabase(dbUrl);

        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Read SQL file
        const sqlPath = path.join(__dirname, 'add-bot-restarts-table.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('📄 Executing SQL schema...\n');

        // Execute SQL (split by semicolons and execute each statement)
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await query(statement);
                    console.log('✅ Executed:', statement.substring(0, 60) + '...');
                } catch (err) {
                    // Ignore "already exists" errors
                    if (err.message.includes('already exists')) {
                        console.log('⚠️  Skipped (already exists):', statement.substring(0, 60) + '...');
                    } else {
                        throw err;
                    }
                }
            }
        }

        console.log('\n✅ Bot restarts table schema applied successfully!\n');

        // Test the table
        console.log('🧪 Testing bot_restarts table...');
        const result = await query('SELECT COUNT(*) as count FROM bot_restarts');
        console.log(`   Found ${result.rows[0].count} existing restart records\n`);

        // Show available views
        console.log('📊 Created views:');
        console.log('   - v_recent_bot_activity (last 50 restarts)');
        console.log('   - v_bot_health_summary (30-day health stats)\n');

        console.log('🎉 Setup complete! Bot will now track all restarts.\n');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error applying schema:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    applyBotRestartsTable();
}

module.exports = { applyBotRestartsTable };
