/**
 * Migration: Create offensive_messages table
 *
 * Run: node database/apply-offensive-messages-table.js
 */

const fs = require('fs');
const path = require('path');
const { pool, query, initDatabase } = require('./connection');

async function applyMigration() {
    console.log('🔧 Creating offensive_messages table...\n');

    // Initialize database connection
    await initDatabase();

    try {
        // Read SQL file
        const sqlPath = path.join(__dirname, 'create-offensive-messages-table.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Execute migration
        await query(sql);

        console.log('✅ Migration completed successfully!\n');

        // Verify table exists
        const result = await query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'offensive_messages'
        `);

        if (result.rows.length > 0) {
            console.log('✅ Table "offensive_messages" verified in database\n');

            // Show table structure
            const columns = await query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = 'offensive_messages'
                ORDER BY ordinal_position
            `);

            console.log('📊 Table structure:');
            console.log('─'.repeat(80));
            columns.rows.forEach(col => {
                console.log(`  ${col.column_name.padEnd(25)} | ${col.data_type.padEnd(20)} | ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
            });
            console.log('─'.repeat(80));
            console.log(`\nTotal columns: ${columns.rows.length}\n`);
        } else {
            console.error('❌ Table verification failed!');
            process.exit(1);
        }

        console.log('🎉 offensive_messages table is ready for use!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

applyMigration();
